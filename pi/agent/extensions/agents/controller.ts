import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { getAgentDir, SessionManager, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { endpoints, request, sameIdentity, type Endpoint, type Identity, type Owner, type Snapshot } from "./bridge";
import { currentPane, herdr, inventory, type Pane } from "./herdr";
import { ControlError, failure, validateArguments, type AgentsResult, type Arguments } from "./schema";
import { canonical, MutationQueue, readSession, resolveCwd, State } from "./state";

export type Launch = {
  id: string;
  owner: Owner;
  session: string;
  cwd: string;
  file?: string;
  tab?: string;
  pane?: string;
  workspace: string;
  child?: Endpoint;
  cancelled?: boolean;
  outcome?: AgentsResult;
};

export class Controller {
  private generation = 0;
  private admissionOpen = true;
  private closed = false;
  private owned = new Map<string, Launch>();
  private queues = new Map<string, MutationQueue>();
  private observed?: AbortSignal;
  private observer?: () => void;
  private cleanup?: Promise<void>;

  constructor(
    private pi: ExtensionAPI,
    private state: State,
    readonly endpoint: Endpoint,
    private warn: (message: string) => void,
  ) {}

  observe(ctx: ExtensionContext) {
    const signal = ctx.signal;
    if (!signal || signal === this.observed || this.closed) return;
    this.unobserve();
    this.observed = signal;
    const generation = this.generation;
    const listener = () => {
      if (generation === this.generation) void this.cancel();
    };
    this.observer = listener;
    signal.addEventListener("abort", listener, { once: true });
    if (signal.aborted) listener();
  }

  startRun(ctx: ExtensionContext) {
    if (!this.closed) this.admissionOpen = true;
    this.observe(ctx);
  }

  unobserve() {
    if (this.observed && this.observer) this.observed.removeEventListener("abort", this.observer);
    this.observed = undefined;
    this.observer = undefined;
  }

  private checkGeneration(generation: number) {
    if (this.closed || !this.admissionOpen || generation !== this.generation) {
      throw new ControlError("parent_interrupted", "The parent was interrupted before task admission.");
    }
  }

  private save(launch: Launch) {
    this.state.write(`launch-${launch.id}.json`, launch);
  }

  private async stopOwned(launch: Launch) {
    if (!launch.child) return;
    if (this.state.read<Endpoint>(`endpoint-${launch.child.incarnation}.json`)?.closing) {
      this.owned.delete(launch.id);
      return;
    }
    const result = await request(launch.child, {
      operation: "abort", caller: this.identity(), capability: launch.owner.capability, automatic: true,
    }) as AgentsResult;
    launch.outcome = result;
    this.save(launch);
    if (result.error) {
      throw new ControlError(result.error.code, result.error.message, result);
    }
  }

  cancel(): Promise<void> {
    if (!this.admissionOpen) return this.cleanup ?? Promise.resolve();
    this.admissionOpen = false;
    this.generation++;
    const launches = [...this.owned.values()];
    for (const launch of launches) {
      launch.cancelled = true;
      this.save(launch);
    }
    this.cleanup = (async () => {
      const results = await Promise.allSettled(launches.map((launch) => this.stopOwned(launch)));
      const uncertain = results.flatMap((result, index) => {
        if (result.status === "fulfilled") return [];
        const launch = launches[index];
        const error = result.reason;
        launch.outcome = failure(error instanceof ControlError ? error : new ControlError("stop_unconfirmed", String(error)), {
          session: launch.session, tab: launch.tab,
        });
        this.save(launch);
        if (error instanceof ControlError && error.code === "ownership_revoked") {
          this.owned.delete(launch.id);
          return [];
        }
        return [launch.tab ?? launch.session];
      });
      if (uncertain.length && !this.closed) this.warn(`Agent stop unconfirmed: ${uncertain.join(", ")}. Use agents stop to recover.`);
    })();
    return this.cleanup;
  }

  async close() {
    this.unobserve();
    await this.cancel();
    this.closed = true;
  }

  private identity(): Identity {
    return { session: this.endpoint.session, incarnation: this.endpoint.incarnation, server: this.endpoint.server };
  }

  private capability(endpoint: Endpoint) {
    return [...this.owned.values()].find((launch) => launch.child && sameIdentity(launch.child, endpoint))?.owner.capability;
  }

  private async live(session: string, file?: string, deadline = Date.now() + 5000): Promise<Snapshot | undefined> {
    const records = endpoints(this.state).filter((endpoint) => endpoint.session === session || (file && endpoint.file === file));
    const panes = (await inventory()).filter((pane) => {
      const reference = pane.agent_session;
      if (reference?.kind === "id") return reference.value === session;
      if (reference?.kind !== "path") return false;
      const target = canonical(reference.value);
      if (file === target || records.some((record) => record.file === target)) return true;
      if (!existsSync(target)) return false;
      return readSession(target).getHeader()?.id === session;
    });
    if (records.length > 1 || panes.length > 1) throw new ControlError("session_conflict", "Multiple live writers claim this session.", { session });
    const closing = this.state.records<Endpoint>("endpoint-").find((record) =>
      record.server === this.state.server && record.session === session && record.closing &&
      (records.some((live) => sameIdentity(live, record)) || panes.some((pane) => pane.pane_id === record.pane)));
    if (closing) {
      if (Date.now() >= deadline) throw new ControlError("session_closing", "The completed worker has not finished closing. Retry after it exits.", { session });
      await delay(50);
      return this.live(session, file, deadline);
    }
    if (records.length) {
      const endpoint = records[0];
      let snapshot: Snapshot;
      try {
        snapshot = await request(endpoint, { operation: "hello" }) as Snapshot;
      } catch {
        if (this.state.read<Endpoint>(`endpoint-${endpoint.incarnation}.json`)?.closing) {
          return this.live(session, file, deadline);
        }
        throw new ControlError("bridge_unavailable", "A live Pi process has no usable compatible endpoint. Reload/update that session; it will not be opened again.", { session, tab: endpoint.tab });
      }
      if (snapshot.endpoint.closing) return this.live(session, file, deadline);
      if (panes.length && panes[0].pane_id !== snapshot.endpoint.pane) throw new ControlError("session_conflict", "Herdr and the endpoint disagree about the live writer.", { session });
      if (panes[0]?.agent_status === "blocked" && ["running", "idle"].includes(snapshot.result.status)) {
        snapshot.result.status = "blocked";
      }
      return snapshot;
    }
    if (panes.length) throw new ControlError("bridge_unavailable", "This session is already open without a compatible endpoint. Reload/update it before control.", { session, tab: panes[0].tab_id });
    return undefined;
  }

  private async saved(session: string, ctx: ExtensionContext) {
    const directories = new Set([
      ctx.sessionManager.getSessionDir(),
      ...this.state.records<{ directory: string }>("root-").map((record) => record.directory),
      ...(process.env.PI_CODING_AGENT_SESSION_DIR ? [process.env.PI_CODING_AGENT_SESSION_DIR] : []),
    ]);
    const lists = await Promise.all([
      SessionManager.listAll(),
      ...[...directories].map((directory) => SessionManager.listAll(directory)),
    ]);
    const paths = [...new Set(lists.flat().filter((info) => info.id === session).map((info) => canonical(info.path)))];
    if (!paths.length) throw new ControlError("session_not_found", "No exact session ID was found in Pi's default or known custom session directories.");
    if (paths.length !== 1) throw new ControlError("session_conflict", "More than one saved file has this session ID.", { session });
    const manager = readSession(paths[0]);
    if (manager.getHeader()?.id !== session) throw new ControlError("session_changed", "The saved session header changed during lookup.");
    return {
      file: paths[0],
      cwd: manager.getCwd(),
      name: manager.getSessionName() || `Session ${session.slice(0, 8)}`,
    };
  }

  private async launch(
    session: string,
    name: string,
    cwd: string,
    ctx: ExtensionContext,
    generation: number,
    file?: string,
  ): Promise<Endpoint> {
    this.checkGeneration(generation);
    cwd = resolveCwd(cwd, ctx.cwd);
    const parentPane = await currentPane();
    const args: string[] = [];
    let selection: Snapshot["selection"];
    if (file) {
      const saved = readSession(file);
      if (canonical(file) !== file || saved.getHeader()?.id !== session) {
        throw new ControlError("session_changed", "The saved session identity changed before launch.", { session });
      }
      const savedContext = saved.buildSessionContext();
      const model = savedContext.model;
      if (model && !ctx.modelRegistry.getAvailable().some((available) => available.provider === model.provider && available.id === model.modelId)) {
        throw new ControlError("model_unavailable", "The saved session's model is unavailable; refusing to silently replace it.", { session });
      }
      if (model) selection = { provider: model.provider, model: model.modelId, thinking: savedContext.thinkingLevel };
      args.push("--session", file);
      if (selection) args.push("--provider", selection.provider, "--model", selection.model, "--thinking", selection.thinking);
    }
    else {
      if (!ctx.model || !ctx.modelRegistry.getAvailable().some((model) => model.provider === ctx.model!.provider && model.id === ctx.model!.id)) {
        throw new ControlError("model_unavailable", "The parent's current model is unavailable.");
      }
      selection = { provider: ctx.model.provider, model: ctx.model.id, thinking: ctx.thinkingLevel ?? this.pi.getThinkingLevel() };
      args.push("--session-id", session, "--name", name, "--provider", selection.provider, "--model", selection.model,
        "--thinking", selection.thinking);
    }
    const id = randomUUID();
    const launch: Launch = {
      id, session, file, cwd, workspace: parentPane.workspace_id,
      owner: { ...this.identity(), capability: randomUUID(), launch: id },
    };
    this.owned.set(id, launch);
    this.save(launch);
    this.checkGeneration(generation);
    try {
      const created = await herdr<{ tab: { tab_id: string }; root_pane: Pane }>([
        "tab", "create", "--workspace", launch.workspace, "--cwd", cwd, "--label", name, "--no-focus",
        "--env", `PI_AGENTS_LAUNCH=${this.state.path(`launch-${id}.json`)}`,
        "--env", "PI_AGENTS_WORKER=1",
        "--env", `PI_CODING_AGENT_DIR=${getAgentDir()}`,
      ]);
      launch.tab = created.tab?.tab_id;
      launch.pane = created.root_pane?.pane_id;
      this.save(launch);
      if (!launch.tab || !launch.pane || created.root_pane.workspace_id !== launch.workspace) {
        throw new ControlError("launch_uncertain", "Herdr returned an incomplete tab creation response.");
      }
      this.checkGeneration(generation);
      let startupError: unknown;
      try {
        await herdr(["agent", "start", `pa-${id.slice(0, 20)}`, "--kind", "pi", "--pane", launch.pane, "--timeout", "30000", "--", ...args], 32000);
      } catch (error) {
        startupError = error;
      }
      const deadline = Date.now() + (startupError ? 3000 : 30000);
      while (Date.now() < deadline) {
        const matches = endpoints(this.state).filter((endpoint) => endpoint.session === session && endpoint.pane === launch.pane);
        if (matches.length > 1) throw new ControlError("session_conflict", "Multiple children registered for the launch.");
        if (matches.length === 1) {
          const snapshot = await request(matches[0], { operation: "hello" }) as Snapshot;
          if (!snapshot.endpoint.worker || snapshot.owner?.launch !== id ||
            snapshot.owner.incarnation !== this.endpoint.incarnation ||
            snapshot.endpoint.tab !== launch.tab || (file && snapshot.endpoint.file !== file)) {
            throw new ControlError("launch_identity", "The child did not confirm its worker restriction, owner, or location.");
          }
          launch.child = snapshot.endpoint;
          this.save(launch);
          const restoredSelection = snapshot.selection;
          if (canonical(snapshot.endpoint.cwd) !== cwd || (selection && (
            !restoredSelection || restoredSelection.provider !== selection.provider || restoredSelection.model !== selection.model ||
            restoredSelection.thinking !== selection.thinking
          ))) {
            throw new ControlError("selection_changed", "The child did not restore the requested cwd, model, and thinking level. No task was sent.");
          }
          if (launch.cancelled || generation !== this.generation || this.closed) {
            await this.stopOwned(launch);
            throw new ControlError("parent_interrupted", "The launched agent was stopped before task dispatch.");
          }
          return snapshot.endpoint;
        }
        await delay(100);
      }
      throw startupError ?? new ControlError("bridge_unavailable", "The launched Pi TUI did not register its endpoint before the startup deadline.");
    } catch (error) {
      const problem = error instanceof ControlError ? error : new ControlError("launch_failed", String(error));
      launch.outcome = failure(problem, { session, tab: launch.tab });
      this.save(launch);
      if (launch.cancelled && !launch.child && !this.closed && problem.code !== "parent_interrupted") {
        this.warn(`Agent startup unresolved: ${launch.tab ?? session}. No task was sent; inspect the saved launch record and tab.`);
      }
      throw new ControlError(problem.code, problem.message, { session, tab: launch.tab });
    }
  }

  async execute(args: Arguments, ctx: ExtensionContext, signal?: AbortSignal, retryClosing = true): Promise<AgentsResult> {
    validateArguments(args);
    const cwd = args.action === "start" ? resolveCwd(args.cwd ?? ctx.cwd, ctx.cwd) : undefined;
    this.observe(ctx);
    const generation = this.generation;
    let session = args.session;
    let tab: string | undefined;
    let run: string | undefined;
    try {
      if (signal?.aborted) throw new ControlError("observation_cancelled", "The call was cancelled before it began.");
      if (args.action === "start" || args.action === "send") await this.cleanup;
      if (args.action === "start") {
        this.checkGeneration(generation);
        session = randomUUID();
      }
      const key = session!;
      const queue = this.queues.get(key) ?? new MutationQueue();
      this.queues.set(key, queue);
      const target = await queue.run(async () => {
        let live = args.action === "start" ? undefined : await this.live(key);
        if (args.action === "start") {
          live = { endpoint: await this.launch(key, args.name!.trim(), cwd!, ctx, generation) } as Snapshot;
        } else if (!live) {
          const saved = await this.saved(key, ctx);
          if (args.action === "stop") return { result: { session: key, status: "idle" } as AgentsResult };
          if (args.action === "wait") {
            const branch = readSession(saved.file).getBranch();
            const latest = branch.findLast((entry) => entry.type === "custom" && ["agents:admission", "agents:interval"].includes(entry.customType));
            const selected = args.run ?? (latest?.type === "custom" ? (latest.data as { run: string }).run : undefined);
            const result = selected ? this.state.read<AgentsResult>(`run-${key}-${selected}.json`) : undefined;
            if (result && !["running", "blocked"].includes(result.status)) return { result: { ...result, tab: undefined } };
            if (!selected) return { result: { session: key, status: "idle" } as AgentsResult };
            throw new ControlError("delivery_unknown", "No live endpoint or confirmed terminal result exists for this run.", { session: key, run: selected });
          }
          this.checkGeneration(generation);
          const release = this.state.lock(`launch:${saved.file}`, this.endpoint.incarnation);
          try {
            live = await this.live(key, saved.file);
            if (!live) live = { endpoint: await this.launch(key, saved.name, saved.cwd, ctx, generation, saved.file) } as Snapshot;
          } finally {
            release();
          }
        }
        const endpoint = live.endpoint;
        tab = endpoint.tab;
        if (args.action === "wait") {
          run = args.run ?? live.result?.run;
          if (!run || (!args.run && live.result?.status === "blocked")) return { result: live.result };
          return { endpoint };
        }
        if (args.action === "send" && live.result?.status === "blocked") return { result: live.result };
        if (signal?.aborted) throw new ControlError("observation_cancelled", "The call ended before dispatch; no task was submitted.");
        this.checkGeneration(generation);
        if (args.action !== "stop") {
          let snapshot: Snapshot;
          try {
            snapshot = await request(endpoint, { operation: "hello" }) as Snapshot;
          } catch (error) {
            if (this.state.read<Endpoint>(`endpoint-${endpoint.incarnation}.json`)?.closing) {
              throw new ControlError("session_closing", "The completed worker is closing before submission.");
            }
            throw error;
          }
          if (snapshot.endpoint.closing) throw new ControlError("session_closing", "The completed worker is closing before submission.");
          run = snapshot.result.status === "running" ? snapshot.result.run ?? randomUUID() : randomUUID();
          this.checkGeneration(generation);
          const launch = [...this.owned.values()].find((record) => record.child && sameIdentity(record.child, endpoint));
          if (launch?.cancelled) {
            launch.cancelled = false;
            this.save(launch);
          }
        }
        let reply: AgentsResult;
        const requestId = randomUUID();
        try {
          reply = await request(endpoint, {
            id: requestId,
            operation: args.action === "stop" ? "abort" : "submit",
            caller: this.identity(), capability: this.capability(endpoint),
            ...(args.action === "stop" ? {} : { message: args.message, mode: args.mode ?? "followUp", run }),
          }) as AgentsResult;
        } catch (error) {
          if (this.state.read<Endpoint>(`endpoint-${endpoint.incarnation}.json`)?.closing) {
            const admitted = this.state.read<{ run: string }>(`request-${key}-${requestId}.json`);
            if (args.action === "send" && !admitted) {
              throw new ControlError("session_closing", "The worker closed before accepting the message.");
            }
            const saved = admitted && this.state.read<AgentsResult>(`run-${key}-${admitted.run}.json`);
            if (saved && saved.status === "completed") return { result: { ...saved, tab: undefined } };
          }
          if (error instanceof ControlError && ["owned_elsewhere", "run_changed", "parent_interrupted", "admission_pending", "stop_in_progress"].includes(error.code)) run = undefined;
          throw error;
        }
        run = reply.run;
        return { endpoint, result: reply };
      });
      if (args.action === "wait" || (args.wait && target.result?.status === "running")) {
        if (!target.endpoint) return target.result!;
        const selectedRun = args.run ?? run;
        try {
          return await request(target.endpoint, {
            operation: "wait", caller: this.identity(), run: selectedRun, timeout: args.timeout,
          }, signal, args.timeout === undefined ? 0 : args.timeout * 1000 + 5000) as AgentsResult;
        } catch (error) {
          if (signal?.aborted) throw error;
          const saved = selectedRun && this.state.read<AgentsResult>(`run-${key}-${selectedRun}.json`);
          if (saved && !["running", "blocked"].includes(saved.status)) return { ...saved, tab: undefined };
          throw error;
        }
      }
      return target.result!;
    } catch (error) {
      if (!(error instanceof ControlError)) throw error;
      if (error.code === "session_closing" && args.action === "send" && retryClosing && !signal?.aborted) {
        return this.execute(args, ctx, signal, false);
      }
      return failure(error, { session, tab, run });
    }
  }
}
