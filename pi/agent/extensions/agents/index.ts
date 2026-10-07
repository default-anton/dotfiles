import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { getMarkdownTheme, keyHint, type ExtensionAPI, type ExtensionContext, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, MouseRegion, Spacer, Text } from "@earendil-works/pi-tui";
import { formatToolGuidelines } from "../inject-context";
import { Controller, type Launch } from "./controller";
import { endpoints, listen, protocolVersion, sameIdentity, verifyCaller, type Endpoint, type Owner, type Request, type Snapshot } from "./bridge";
import { currentPane, herdr, isSolePane } from "./herdr";
import { Inbox } from "./inbox";
import { Runs } from "./runs";
import { ControlError, failure, parameters, resultSchema, uuid, validateArguments, type AgentsResult, type InboxEvent } from "./schema";
import { canonical, hash, readSession, State } from "./state";

const parentGuidelines = [
  "Use agents only when the user explicitly requests delegation or session control, or AGENTS instructions require it.",
  "Give each agent a bounded task, necessary context, file ownership, and expected validation/reporting. Agents share files; avoid overlapping edits and review results before integrating.",
];
const messagingGuidelines = [
  "Start returns session/run handles. Use delivery: manual for quiet delegation, then wait with exact targets and until: all or any. Wait returns results and inbox messages; questions and UI blocks return early. Never sleep or poll to wait for agents.",
  "Use automatic delivery for background delegation, then do independent work or end your turn. Configure switches delivery explicitly; already queued notifications cannot be recalled. notify controls automatic steer/followUp scheduling, not whether work continues.",
  "Send kind: task assigns follow-on work and watches its result. Use kind: message for updates, question when an answer is needed, and answer with replyTo for replies. Recipient inbox policy controls correspondence; only task mode controls instruction scheduling.",
  "Wait timeouts and observation cancellation leave work running. Parent-turn abort stops turn-lifetime workers; lifetime: session survives turn abort but stops on parent shutdown. stop explicitly cancels work. Wait replay: true recovers previously received events after uncertain delivery.",
  "Await every Code Mode call and keep returned session/run IDs. After uncertain delivery, check status instead of resending.",
];
const childGuideline = "Complete the assigned task. Your final reply is recorded in the parent's inbox; its delivery policy decides when the parent receives it. Send defaults to correspondence; workers cannot assign tasks. Use kind: question when you need a decision, then wait with until: message and no targets for an answer. Answer received questions with kind: answer and replyTo. You may send, wait, and check status, but must not start or stop agents, including through shell commands. Session history is context, not authorization to resume old work.";

function parentSession(ctx: ExtensionContext) {
  const entry = ctx.sessionManager.getBranch().findLast((entry) => entry.type === "custom" && entry.customType === "agents:parent");
  const session = entry?.type === "custom" ? (entry.data as { session?: unknown })?.session : undefined;
  return typeof session === "string" && uuid.test(session) ? session : undefined;
}

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
  let inbox: Inbox | undefined;
  let dispose: (() => void) | undefined;

  function update(ctx: ExtensionContext) {
    context = ctx;
    runs?.updateContext(ctx);
    inbox?.updateContext(ctx);
  }

  const tool: ToolDefinition<typeof parameters> = {
    name: "agents",
    label: "agents",
    description: "Delegate to Pi agents in Herdr tabs. Start/task return session/run handles; manual delivery buffers communication for wait, automatic delivery wakes the parent. Wait receives results/messages for exact runs, returning early for questions or blocks. Configure changes delivery. Send distinguishes tasks, messages, questions, and answers. Session-lifetime work survives parent-turn abort. Workers cannot start/stop agents. Successful tabs close; tasks and answers can resume saved workers.",
    parameters,
    outputSchema: resultSchema,
    exposure: "hidden",
    executionMode: "parallel",
    async execute(_id, args, signal, _onUpdate, ctx) {
      validateArguments(args);
      let result;
      if (!initialized) {
        result = failure(new ControlError("delegation_disabled", "Agents are unavailable before session initialization."));
      } else if (!controller) {
        result = failure(new ControlError("bridge_unavailable", "Use a persisted Pi TUI in Herdr with a compatible agents endpoint."));
      } else {
        update(ctx);
        result = await controller.execute(args, ctx, signal);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
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
    if (incoming.operation === "status") return activeRuns.snapshot(incoming.run);
    if (incoming.automatic && incoming.operation !== "abort") {
      throw new ControlError("invalid_operation", "Automatic control is limited to owned aborts.");
    }
    return activeRuns.queue.run(async () => {
      if (activeRuns !== runs) throw new ControlError("session_changed", "The session changed before mutation.");
      if (incoming.event && (!uuid.test(incoming.event.id) || (incoming.event.run && !uuid.test(incoming.event.run)) ||
        incoming.event.from !== caller.session || incoming.event.session !== caller.session ||
        !["message", "needs_input"].includes(incoming.event.type) || incoming.event.result || !incoming.event.message?.trim())) {
        throw new ControlError("invalid_message", "Correspondence must identify its caller and contain a message, not a worker result.");
      }
      if (incoming.operation === "message") {
        if (!incoming.event || !inbox) throw new ControlError("invalid_message", "An inbox event is required.");
        if (endpoint?.closing) throw new ControlError("session_closing", "The recipient is closing.");
        const subscription = inbox.policy(caller.session, incoming.event.run) ?? inbox.policy(caller.session);
        const event = inbox.receive({
          ...incoming.event,
          run: subscription?.run ?? incoming.event.run,
          created: Date.now(),
          resolved: undefined,
        });
        return { result: { session: endpoint!.session, status: "idle", event: event.id } as AgentsResult };
      }
      if (incoming.operation === "submit") {
        if (caller.worker) throw new ControlError("delegation_disabled", "Workers may send inbox correspondence, not task assignments.");
        if (endpoint?.closing) throw new ControlError("session_closing", "The completed worker is closing; resume its saved session.");
        if (!incoming.message?.trim()) throw new ControlError("invalid_message", "A nonblank task is required.");
        if (owner && sameIdentity(owner, caller) && state!.read<Launch>(`launch-${owner.launch}.json`)?.cancelled) {
          throw new ControlError("parent_interrupted", "The launching parent cancelled this task generation.");
        }
        if (incoming.event && inbox?.waitingFor(incoming.event)) {
          const snapshot = activeRuns.snapshot();
          if (snapshot.status === "running" && snapshot.run === incoming.run) {
            inbox.receive(incoming.event);
            state!.write(`request-${endpoint!.session}-${incoming.id}.json`, { run: snapshot.run });
            return { result: snapshot };
          }
        }
        const result = activeRuns.submit(incoming);
        if (incoming.event && result.status !== "blocked" && !result.error) inbox?.recordDelivered(incoming.event);
        return { result };
      }
      if (caller.worker && !incoming.automatic) {
        throw new ControlError("delegation_disabled", "Tool-launched agents cannot stop agents.");
      }
      authorize(incoming);
      activeRuns.beginStop(() => { void controller?.cancel(true); });
      return { stopping: true };
    }).then(async (outcome) => {
      if (outcome.result) return outcome.result;
      await controller?.cancel(true);
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
    pi.registerTool({ ...tool, exposure: "codemode" });
    if (ctx.mode !== "tui" || !ctx.sessionManager.getSessionFile() || process.env.HERDR_ENV !== "1") return;
    try {
      state = new State();
      const pane = await currentPane();
      const incarnation = randomUUID();
      endpoint = {
        session: ctx.sessionManager.getSessionId(), incarnation, server: state.server, protocol: protocolVersion,
        pid: process.pid, file: canonical(ctx.sessionManager.getSessionFile()!), cwd: ctx.cwd,
        socket: "", pane: pane.pane_id, tab: pane.tab_id, workspace: pane.workspace_id, worker,
      };
      const bootstrap = process.env.PI_AGENTS_LAUNCH;
      if (worker && bootstrap && state.path(basename(bootstrap)) === bootstrap) {
        const launch = state.read<Launch>(basename(bootstrap));
        if (launch && launch.session === endpoint.session && launch.pane === endpoint.pane && !launch.child) {
          owner = launch.owner;
          if (!parentSession(ctx)) pi.appendEntry("agents:parent", { session: owner.session });
        }
      }
      if (worker && !hasWorkerMarker(ctx)) pi.appendEntry("agents:worker", { version: 1 });
      runs = new Runs(pi, ctx, state, endpoint.session, endpoint.tab);
      inbox = new Inbox(pi, ctx, state, endpoint);
      controller = new Controller(pi, state, endpoint, inbox, (message) => context?.ui.notify(message, "warning"));
      dispose = await listen(state, endpoint, handle);
      state.write(`root-${hash(ctx.sessionManager.getSessionDir())}.json`, { directory: ctx.sessionManager.getSessionDir() });
      controller?.observe(ctx);
      inbox.start();
    } catch (error) {
      dispose?.();
      dispose = undefined;
      runs?.close();
      runs = undefined;
      inbox?.close();
      inbox = undefined;
      controller = undefined;
      endpoint = undefined;
      ctx.ui.notify(`Agents bridge unavailable: ${error instanceof Error ? error.message : String(error)}`, "warning");
    }
  });

  pi.on("before_agent_start", (event, ctx) => {
    update(ctx);
    const guidelines = initialized ? [...(worker ? [childGuideline] : parentGuidelines), ...messagingGuidelines] : [];
    const parent = parentSession(ctx);
    if (worker && parent) guidelines.push(`Parent session: ${parent}.`);
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
      if (event.source === "interactive") {
        owner = undefined;
        inbox?.resume(ctx);
      }
      return activeRuns.input(event.source);
    });
  });

  async function revoke() {
    const activeRuns = runs;
    await activeRuns?.queue.run(() => {
      if (activeRuns !== runs) return;
      owner = undefined;
      inbox?.pause();
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
    inbox?.resume(ctx);
  });
  pi.on("session_shutdown", async () => {
    inbox?.close();
    await controller?.close();
    runs?.close();
    dispose?.();
    dispose = undefined;
    controller = undefined;
    inbox = undefined;
    runs = undefined;
    endpoint = undefined;
    owner = undefined;
    context = undefined;
    initialized = false;
  });

  pi.registerMessageRenderer<{ senderSessionId: string }>("agents:task", (message, { outputPad }, theme) => {
    const sender = message.details?.senderSessionId.slice(0, 8) ?? "agent";
    const text = typeof message.content === "string" ? message.content : message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
    const container = new Container();
    container.addChild(new Text(theme.fg("dim", `Agent ${sender}`), outputPad, 0));
    container.addChild(new Markdown(text, outputPad, 0, getMarkdownTheme()));
    return container;
  });
  const resultExpansion = new WeakMap<object, { expanded: boolean; globalExpanded: boolean }>();
  pi.registerMessageRenderer<{ name?: string; result?: AgentsResult; event?: InboxEvent }>("agents:result", (message, { expanded, outputPad }, theme) => {
    let expansion = resultExpansion.get(message);
    if (!expansion || expansion.globalExpanded !== expanded) {
      expansion = { expanded, globalExpanded: expanded };
      resultExpansion.set(message, expansion);
    }
    const state = expansion;
    const result = message.details?.result;
    const name = message.details?.name || result?.session?.slice(0, 8) || message.details?.event?.from.slice(0, 8);
    const label = name ? `Agent ${name}` : "Agent";
    const status = result?.status ?? message.details?.event?.type ?? "result";
    const container = new Container();
    function rebuild() {
      container.clear();
      const indicator = state.expanded ? "▾" : "▸";
      const header = `${theme.fg("muted", `${indicator} ${label}`)} · ${theme.fg(status === "failed" ? "error" : "dim", status)}`;
      const hint = state.expanded ? "" : theme.fg("dim", ` · click or ${keyHint("app.tools.expand", "details")}`);
      container.addChild(new MouseRegion(new Text(header + hint, outputPad, 0), (event) => {
        if (event.type !== "click" || event.button !== "left") return;
        state.expanded = !state.expanded;
        rebuild();
        return { handled: true, render: true };
      }));
      if (!state.expanded) return;
      container.addChild(new Spacer(1));
      const content = typeof message.content === "string" ? message.content : message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
      if (result) {
        const metadata = [
          result.session ? `Session: ${result.session}` : undefined,
          result.run ? `Run: ${result.run}` : undefined,
          result.outputPath ? `Full output: ${result.outputPath}` : undefined,
        ].filter(Boolean).join("\n");
        container.addChild(new Text(theme.fg("dim", metadata), outputPad, 0));
        const body = [message.details?.event?.message, result.output, result.error ? `${result.error.code}: ${result.error.message}` : undefined].filter(Boolean).join("\n\n");
        if (body) {
          container.addChild(new Spacer(1));
          container.addChild(new Markdown(body, outputPad, 0, getMarkdownTheme()));
        }
      } else {
        container.addChild(new Markdown(content, outputPad, 0, getMarkdownTheme()));
      }
    }
    rebuild();
    return container;
  });
}
