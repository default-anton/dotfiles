import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { type ExtensionAPI, type ExtensionContext, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatToolGuidelines } from "../inject-context";
import { Controller, type Launch } from "./controller";
import { endpoints, listen, sameIdentity, verifyCaller, type Endpoint, type Owner, type Request, type Snapshot } from "./bridge";
import { currentPane, herdr, isSolePane } from "./herdr";
import { Runs } from "./runs";
import { ControlError, failure, parameters, resultSchema, validateArguments } from "./schema";
import { canonical, hash, readSession, State } from "./state";

const parentGuidelines = [
  "Use agents only when the user explicitly requests delegation or session control, or AGENTS instructions require it.",
  "Give each agent a bounded task, necessary context, file ownership, and expected validation/reporting. Agents share files; avoid overlapping edits and review results before integrating.",
  "Messages are one-way: agents cannot send progress updates or questions back. Use send for instructions, not status requests; wait returns the final response.",
  "Await every Code Mode call; use wait=false for background work. Keep returned session/run IDs. After a timeout or uncertain delivery, inspect or wait instead of resending.",
];
const childGuideline = "Complete the assigned task without delegating or controlling other agents, including through shell commands. Session history is context, not authorization to resume old work.";

function hasWorkerMarker(ctx: ExtensionContext) {
  let manager = ctx.sessionManager;
  const visited = new Set<string>();
  for (;;) {
    if (manager.getEntries().some((entry) => entry.type === "custom" && entry.customType === "agents:worker")) return true;
    const parent = manager.getHeader()?.parentSession;
    if (!parent || visited.has(parent) || !existsSync(parent)) return false;
    visited.add(parent);
    manager = readSession(parent);
  }
}

export default function agentsExtension(pi: ExtensionAPI) {
  let worker = process.env.PI_AGENTS_WORKER === "1";
  let initialized = false;
  let context: ExtensionContext | undefined;
  let state: State | undefined;
  let endpoint: Endpoint | undefined;
  let owner: Owner | undefined;
  let runs: Runs | undefined;
  let controller: Controller | undefined;
  let dispose: (() => void) | undefined;

  function update(ctx: ExtensionContext) {
    context = ctx;
    runs?.updateContext(ctx);
  }

  const tool: ToolDefinition<typeof parameters> = {
    name: "agents",
    label: "agents",
    description: "Start and control Pi agents in Herdr tabs. Returns session/run IDs; work runs in the background unless wait=true. Successful owned agents close their sole-pane tabs; send reopens saved sessions. Observed parent aborts stop only agents it launched. Stop preserves the tab and session.",
    parameters,
    outputSchema: resultSchema,
    exposure: "hidden",
    executionMode: "parallel",
    async execute(_id, args, signal, _onUpdate, ctx) {
      validateArguments(args);
      let result;
      if (worker || !initialized) {
        result = failure(new ControlError("delegation_disabled", "Delegation is disabled in tool-launched agents and before session initialization."));
      } else if (!controller) {
        result = failure(new ControlError("bridge_unavailable", "Use a persisted Pi TUI in Herdr with a compatible agents endpoint."));
      } else {
        update(ctx);
        result = await controller.execute(args, ctx, signal);
      }
      return {
        content: [{ type: "text", text: result.error ? `${result.error.code}: ${result.error.message}` : `${result.status}${result.session ? ` ${result.session}` : ""}${result.run ? ` / ${result.run}` : ""}` }],
        structuredContent: result,
        details: { session: result.session, run: result.run, tab: result.tab },
        ...(result.error ? { isError: true } : {}),
      };
    },
  };
  pi.registerTool(tool);

  function authorize(incoming: Request) {
    if (incoming.automatic) {
      if (!owner || !incoming.caller || !sameIdentity(owner, incoming.caller) || incoming.capability !== owner.capability) {
        throw new ControlError("ownership_revoked", "This process is no longer owned by that parent.");
      }
    } else if (owner) {
      const parent = endpoints(state!).find((record) => sameIdentity(record, owner!));
      if (!parent) owner = undefined;
      else if (!incoming.caller || !sameIdentity(owner, incoming.caller) || incoming.capability !== owner.capability) {
        throw new ControlError("owned_elsewhere", "Another live parent owns this agent. Direct input in its tab takes ownership back.");
      }
    }
  }

  async function handle(incoming: Request, signal: AbortSignal) {
    if (!runs || !endpoint) throw new ControlError("session_changed", "The endpoint is closing.");
    const activeRuns = runs;
    if (incoming.operation === "hello") {
      const publicOwner = owner && { session: owner.session, incarnation: owner.incarnation, server: owner.server, launch: owner.launch };
      const selection = context?.model && {
        provider: context.model.provider,
        model: context.model.id,
        thinking: context.thinkingLevel ?? pi.getThinkingLevel(),
      };
      return {
        endpoint: { ...endpoint, worker }, result: activeRuns.snapshot(),
        ...(publicOwner ? { owner: publicOwner } : {}),
        ...(selection ? { selection } : {}),
      } satisfies Snapshot;
    }
    const caller = await verifyCaller(state!, incoming);
    if (incoming.operation === "wait") return activeRuns.wait(incoming.run, incoming.timeout, signal);
    if (incoming.automatic && incoming.operation !== "abort") {
      throw new ControlError("invalid_operation", "Automatic control is limited to owned aborts.");
    }
    return activeRuns.queue.run(async () => {
      if (activeRuns !== runs) throw new ControlError("session_changed", "The session changed before mutation.");
      if (caller.worker) throw new ControlError("delegation_disabled", "Workers cannot control agents.");
      authorize(incoming);
      if (incoming.operation === "submit") {
        if (endpoint?.closing) throw new ControlError("session_closing", "The completed worker is closing; resume its saved session.");
        if (!incoming.message?.trim()) throw new ControlError("invalid_message", "A nonblank task is required.");
        if (owner && state!.read<Launch>(`launch-${owner.launch}.json`)?.cancelled) {
          throw new ControlError("parent_interrupted", "The launching parent cancelled this task generation.");
        }
        return { result: activeRuns.submit(incoming) };
      }
      activeRuns.beginStop(() => { void controller?.cancel(); });
      return { stopping: true };
    }).then(async (outcome) => {
      if (outcome.result) return outcome.result;
      await controller?.cancel();
      return activeRuns.confirmStop(signal);
    });
  }

  async function closeCompletedWorker() {
    const activeRuns = runs;
    const activeEndpoint = endpoint;
    const activeOwner = owner;
    if (!worker || !activeRuns || !activeEndpoint || !activeOwner) return;
    const completed = activeRuns.snapshot();
    if (completed.status !== "completed") return;
    try {
      const close = await activeRuns.queue.run(async () => {
        if (activeRuns !== runs || owner !== activeOwner || activeEndpoint.closing ||
          !activeRuns.canClose(completed.run)) return;
        if (!await isSolePane({
          pane_id: activeEndpoint.pane, tab_id: activeEndpoint.tab, workspace_id: activeEndpoint.workspace,
        })) return;
        if (activeRuns !== runs || owner !== activeOwner || !activeRuns.canClose(completed.run)) return;
        activeEndpoint.closing = true;
        state!.write(`endpoint-${activeEndpoint.incarnation}.json`, activeEndpoint);
        return true;
      });
      if (!close) return;
      try {
        await herdr(["pane", "close", activeEndpoint.pane]);
      } catch (error) {
        activeEndpoint.closing = false;
        state!.write(`endpoint-${activeEndpoint.incarnation}.json`, activeEndpoint);
        throw error;
      }
    } catch (error) {
      context?.ui.notify(`Agent tab cleanup failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    update(ctx);
    worker ||= hasWorkerMarker(ctx);
    initialized = true;
    pi.registerTool({ ...tool, exposure: worker ? "hidden" : "codemode" });
    if (ctx.mode !== "tui" || !ctx.sessionManager.getSessionFile() || process.env.HERDR_ENV !== "1") return;
    try {
      state = new State();
      const pane = await currentPane();
      const incarnation = randomUUID();
      endpoint = {
        session: ctx.sessionManager.getSessionId(), incarnation, server: state.server,
        pid: process.pid, file: canonical(ctx.sessionManager.getSessionFile()!), cwd: ctx.cwd,
        socket: "", pane: pane.pane_id, tab: pane.tab_id, workspace: pane.workspace_id, worker,
      };
      const bootstrap = process.env.PI_AGENTS_LAUNCH;
      if (worker && bootstrap && state.path(basename(bootstrap)) === bootstrap) {
        const launch = state.read<Launch>(basename(bootstrap));
        if (launch && launch.session === endpoint.session && launch.pane === endpoint.pane && !launch.child) {
          owner = launch.owner;
        }
      }
      if (worker && !hasWorkerMarker(ctx)) pi.appendEntry("agents:worker", { version: 1 });
      runs = new Runs(pi, ctx, state, endpoint.session, endpoint.tab);
      controller = worker ? undefined : new Controller(pi, state, endpoint, (message) => context?.ui.notify(message, "warning"));
      dispose = await listen(state, endpoint, handle);
      state.write(`root-${hash(ctx.sessionManager.getSessionDir())}.json`, { directory: ctx.sessionManager.getSessionDir() });
      controller?.observe(ctx);
    } catch (error) {
      dispose?.();
      dispose = undefined;
      runs?.close();
      runs = undefined;
      controller = undefined;
      endpoint = undefined;
      ctx.ui.notify(`Agents bridge unavailable: ${error instanceof Error ? error.message : String(error)}`, "warning");
    }
  });

  pi.on("before_agent_start", (event, ctx) => {
    update(ctx);
    const guidelines = worker ? [childGuideline] : initialized ? parentGuidelines : [];
    const options = event.systemPromptOptions;
    options.promptGuidelines = [...new Set([...options.promptGuidelines, ...guidelines])];
    if (options.customPrompt) options.sections.tool_guidelines = formatToolGuidelines(options);
    runs?.beforeStart();
  });

  pi.on("agent_start", (_event, ctx) => {
    update(ctx);
    controller?.startRun(ctx);
    runs?.started();
  });
  pi.on("turn_start", (_event, ctx) => {
    update(ctx);
    controller?.observe(ctx);
  });
  pi.on("context", (_event, ctx) => {
    update(ctx);
    runs?.observe(true);
  });
  pi.on("turn_end", (_event, ctx) => {
    update(ctx);
    runs?.boundary();
  });
  pi.on("agent_before_settle", (_event, ctx) => {
    update(ctx);
    runs?.boundary();
  });
  pi.on("agent_settled", (_event, ctx) => {
    update(ctx);
    runs?.settled();
    controller?.unobserve();
    void closeCompletedWorker();
  });
  pi.on("ui_prompt_start", (_event, ctx) => {
    update(ctx);
    runs?.setBlocked(true);
  });
  pi.on("ui_prompt_end", (_event, ctx) => {
    update(ctx);
    runs?.setBlocked(false);
  });
  pi.on("input", async (event, ctx) => {
    update(ctx);
    const activeRuns = runs;
    return activeRuns?.queue.run(() => {
      if (activeRuns !== runs) return { action: "handled" as const };
      if (endpoint?.closing) return { action: "handled" as const };
      if (event.source === "interactive") owner = undefined;
      return activeRuns.input(event.source);
    });
  });

  async function revoke() {
    const activeRuns = runs;
    await activeRuns?.queue.run(() => {
      if (activeRuns !== runs) return;
      owner = undefined;
      activeRuns.pauseForNavigation();
    });
  }
  pi.on("session_before_switch", revoke);
  pi.on("session_before_fork", revoke);
  pi.on("session_before_tree", revoke);
  pi.on("session_tree", (_event, ctx) => {
    runs?.close();
    update(ctx);
    if (state && endpoint) runs = new Runs(pi, ctx, state, endpoint.session, endpoint.tab);
  });
  pi.on("session_shutdown", async () => {
    await controller?.close();
    runs?.close();
    dispose?.();
    dispose = undefined;
    controller = undefined;
    runs = undefined;
    endpoint = undefined;
    owner = undefined;
    context = undefined;
    initialized = false;
  });

  pi.registerMessageRenderer<{ senderSessionId: string }>("agents:task", (message, _options, theme) => {
    const sender = message.details?.senderSessionId.slice(0, 8) ?? "agent";
    const text = typeof message.content === "string" ? message.content : message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
    return new Text(`${theme.fg("dim", `Agent ${sender}`)}\n${text}`, 1, 0);
  });
}
