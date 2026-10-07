import { randomUUID } from "node:crypto";
import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { endpoints, sameIdentity, type Endpoint } from "./bridge";
import { ControlError, failure, type AgentsResult, type Arguments, type Delivery, type InboxEvent, type Target } from "./schema";
import { processAlive, State } from "./state";

type Subscription = {
  id: string;
  child: Endpoint;
  name?: string;
  run: string;
  mode: "steer" | "followUp";
  delivery?: Delivery;
  created: number;
};

export class Inbox {
  private timer?: ReturnType<typeof setInterval>;
  private pending = new Set<string>();
  private paused = false;
  private recovering = true;
  private warned = false;
  private waiting?: Arguments;
  private closed = false;

  constructor(
    private pi: ExtensionAPI,
    private ctx: ExtensionContext,
    private state: State,
    private parent: Endpoint,
  ) {}

  updateContext(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  private prefix() {
    return `inbox-${this.parent.session}-`;
  }

  private subscriptions() {
    const watches = new Set(this.ctx.sessionManager.getBranch().flatMap((entry) =>
      entry.type === "custom" && entry.customType === "agents:watch"
        ? [(entry.data as { id: string }).id] : []));
    return this.state.records<Subscription>(`notification-${this.parent.session}-`)
      .filter((subscription) => watches.has(subscription.id));
  }

  private subscriptionFile(id: string) {
    return `notification-${this.parent.session}-${id}.json`;
  }

  track(id: string, child: Endpoint, run: string, mode: Subscription["mode"], name: string, delivery: Delivery = "automatic") {
    const subscription: Subscription = { id, child, name, run, mode, delivery, created: Date.now() };
    this.state.write(this.subscriptionFile(id), subscription);
    this.pi.appendEntry("agents:watch", { id });
  }

  forget(id: string) {
    this.state.remove(this.subscriptionFile(id));
  }

  policy(session: string, run?: string) {
    return this.subscriptions()
      .filter((subscription) => subscription.child.session === session && (!run || subscription.run === run))
      .sort((a, b) => b.created - a.created)[0];
  }

  configure(args: Arguments): AgentsResult {
    const subscriptions = this.subscriptions();
    const selected = args.targets!.map((target) => {
      const matches = subscriptions.filter((subscription) => subscription.child.session === target.session && subscription.run === target.run);
      if (!matches.length) throw new ControlError("subscription_not_found", "Only delegations tracked by this session can be configured.", target);
      return matches;
    }).flat();
    for (const subscription of selected) {
      if (args.delivery) subscription.delivery = args.delivery;
      if (args.notify) subscription.mode = args.notify;
      this.state.write(this.subscriptionFile(subscription.id), subscription);
    }
    return { status: "idle", reason: "configured" };
  }

  private events() {
    const admitted = new Set(this.ctx.sessionManager.getBranch().flatMap((entry) =>
      entry.type === "custom" && entry.customType === "agents:mail"
        ? [(entry.data as { id: string }).id] : []));
    const subscriptions = this.subscriptions();
    return this.state.records<InboxEvent>(this.prefix())
      .filter((event) => admitted.has(event.id) || subscriptions.some((subscription) =>
        subscription.child.session === event.session && subscription.run === event.run))
      .sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  }

  event(id: string) {
    return this.events().find((event) => event.id === id);
  }

  receive(event: InboxEvent) {
    const existing = this.event(event.id);
    if (existing) return existing;
    this.state.write(`${this.prefix()}${event.id}.json`, event);
    this.pi.appendEntry("agents:mail", { id: event.id });
    return event;
  }

  recordDelivered(event: InboxEvent) {
    this.receive(event);
    this.acknowledge([event]);
  }

  waitingFor(event: InboxEvent) {
    return !this.paused && !this.closed && !!this.waiting && (!this.waiting.targets || this.waiting.targets.some((target) =>
      target.session === event.session && target.run === event.run));
  }

  resolveQuestion(id: string) {
    const event = this.event(id);
    if (!event || event.type !== "needs_input") throw new ControlError("question_not_found", "No received question has that ID.");
    this.state.write(`${this.prefix()}${event.id}.json`, { ...event, resolved: true });
  }

  resolveQuestions(session: string, run?: string) {
    for (const event of this.events()) {
      if (event.session === session && (!run || event.run === run) && event.type === "needs_input" && !event.resolved) {
        this.resolveQuestion(event.id);
      }
    }
  }

  start() {
    this.timer = setInterval(() => this.deliver(), 1000);
    this.timer.unref();
    this.deliver();
  }

  pause() {
    this.paused = true;
  }

  resume(ctx: ExtensionContext) {
    this.ctx = ctx;
    if (!this.paused) return;
    this.paused = false;
    this.pending.clear();
    this.recovering = true;
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.paused = true;
    this.closed = true;
  }

  private snapshot(target: Target, subscription?: Subscription): AgentsResult {
    const saved = this.state.read<AgentsResult>(`run-${target.session}-${target.run}.json`);
    if (saved && !["running", "blocked"].includes(saved.status)) return saved;
    if (!subscription) {
      if (saved) {
        if (endpoints(this.state).some((endpoint) => endpoint.session === target.session)) return saved;
        return failure(new ControlError("delivery_unknown", "No live endpoint or confirmed terminal result exists for this run."), target);
      }
      return failure(new ControlError("run_not_found", "No recorded run matches this target."), target);
    }
    const child = subscription.child;
    const registered = this.state.read<Endpoint>(`endpoint-${child.incarnation}.json`);
    const alive = registered && sameIdentity(registered, child) &&
      child.server === this.state.server && processAlive(registered.pid);
    const admission = this.state.read<{ run: string }>(`request-${child.session}-${subscription.id}.json`);
    if (alive && (saved || admission || Date.now() - subscription.created < 10000)) {
      return saved ?? { ...target, status: "running", tab: child.tab };
    }
    const final = this.state.read<AgentsResult>(`run-${target.session}-${target.run}.json`);
    if (final && !["running", "blocked"].includes(final.status)) return final;
    const result = failure(new ControlError(
      admission ? "agent_exited" : "delivery_unknown",
      admission ? "The agent exited without a confirmed final result." : "Task admission was not confirmed. Check status before resending.",
    ), { ...target, tab: child.tab });
    return result;
  }

  private refresh() {
    for (const subscription of this.subscriptions()) {
      const admission = this.state.read<{ run: string }>(`request-${subscription.child.session}-${subscription.id}.json`);
      if (admission && subscription.run !== admission.run) {
        subscription.run = admission.run;
        this.state.write(this.subscriptionFile(subscription.id), subscription);
      }
      const target = { session: subscription.child.session, run: subscription.run };
      const result = this.snapshot(target, subscription);
      const blockFile = `inbox-block-${this.parent.session}-${target.session}-${target.run}.json`;
      const block = this.state.read<{ event: string }>(blockFile);
      if (result.status === "blocked" && !block) {
        const event: InboxEvent = {
          id: randomUUID(), type: "blocked", ...target, from: target.session, created: Date.now(),
          message: `The worker is waiting for UI input${result.tab ? ` in tab ${result.tab}` : ""}.`,
          result,
        };
        this.state.write(`${this.prefix()}${event.id}.json`, event);
        this.state.write(blockFile, { event: event.id });
      } else if (result.status !== "blocked" && block) {
        const file = `${this.prefix()}${block.event}.json`;
        const event = this.state.read<InboxEvent>(file);
        if (event) this.state.write(file, { ...event, resolved: true });
        this.state.remove(blockFile);
      }
      if (!["completed", "failed", "stopped"].includes(result.status)) continue;
      if (result.status !== "completed") this.resolveQuestions(target.session, target.run);
      const file = `${this.prefix()}result-${target.session}-${target.run}.json`;
      const legacyDelivered = this.ctx.sessionManager.getBranch().some((entry) =>
        entry.type === "custom_message" && entry.customType === "agents:result" &&
        (entry.details as { notificationId?: string })?.notificationId === subscription.id);
      const existing = this.state.read<InboxEvent>(file);
      if (existing) {
        if (legacyDelivered && !this.received().has(existing.id)) this.acknowledge([existing]);
        continue;
      }
      const event: InboxEvent = {
        id: randomUUID(), type: result.status as "completed" | "failed" | "stopped",
        ...target, from: target.session, created: Date.now(), result,
      };
      this.state.write(file, event);
      if (legacyDelivered) this.acknowledge([event]);
    }
  }

  private received() {
    return new Set(this.ctx.sessionManager.getBranch().flatMap((entry) => {
      if (entry.type === "custom" && entry.customType === "agents:received") return (entry.data as { ids: string[] }).ids;
      if (entry.type === "custom_message" && entry.customType === "agents:result") {
        return (entry.details as { eventIds?: string[] })?.eventIds ?? [];
      }
      return [];
    }));
  }

  private acknowledge(events: InboxEvent[]) {
    if (events.length) this.pi.appendEntry("agents:received", { ids: events.map((event) => event.id) });
  }

  private unread(replay = false, includePending = false) {
    const received = this.received();
    for (const id of received) this.pending.delete(id);
    return this.events().filter((event) => (includePending || !this.pending.has(event.id)) && (replay || !received.has(event.id)));
  }

  private deliver() {
    if (this.paused || this.closed) return;
    try {
      this.refresh();
      if (this.recovering && this.ctx.hasPendingMessages()) return;
      this.recovering = false;
      if (this.ctx.isIdle() && !this.ctx.hasPendingMessages()) this.pending.clear();
      const event = this.unread().find((event) =>
        !this.waitingFor(event) && this.policy(event.session, event.run)?.delivery !== "manual");
      if (!event) return;
      const subscription = this.policy(event.session, event.run);
      const result = event.result;
      const content = [
        `Agent event ${event.id}: ${event.type}, from ${event.from}, session ${event.session}${event.run ? `, run ${event.run}` : ""}.`,
        event.replyTo ? `Reply to: ${event.replyTo}` : undefined,
        event.message,
        result?.output,
        result?.outputPath ? `Full output: ${result.outputPath}` : undefined,
        result?.error ? `${result.error.code}: ${result.error.message}` : undefined,
      ].filter(Boolean).join("\n\n");
      this.pi.sendMessage({
        customType: "agents:result", content, display: true,
        details: { eventIds: [event.id], name: subscription?.name, result, event },
      }, { triggerTurn: true, deliverAs: subscription?.mode ?? "steer" });
      this.pending.add(event.id);
      this.warned = false;
    } catch (error) {
      if (!this.warned) {
        this.ctx.ui.notify(`Agent inbox delivery failed; retrying: ${error instanceof Error ? error.message : String(error)}`, "warning");
        this.warned = true;
      }
    }
  }

  async wait(args: Arguments, signal?: AbortSignal): Promise<AgentsResult> {
    if (this.waiting) throw new ControlError("wait_in_progress", "Only one inbox wait may be active per session.");
    this.waiting = args;
    const until = args.until ?? (args.targets ? "all" : "message");
    const deadline = Date.now() + (args.timeoutMs ?? 60000);
    const matches = (event: InboxEvent) => !args.targets || args.targets.some((target) => target.session === event.session && target.run === event.run);
    try {
      return await new Promise<AgentsResult>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let finished = false;
        const finish = (result?: AgentsResult, error?: unknown) => {
          if (finished) return;
          finished = true;
          if (timer) clearTimeout(timer);
          signal?.removeEventListener("abort", cancelled);
          if (error) reject(error);
          else resolve(result!);
        };
        const cancelled = () => finish({ status: "idle", reason: "cancelled", events: [] });
        const check = () => {
          try {
            if (finished) return;
            if (signal?.aborted || this.closed || this.paused) return cancelled();
            this.refresh();
            let unread = this.unread(args.replay, true).filter(matches);
            if (args.after) {
              const index = unread.findIndex((event) => event.id === args.after);
              if (index < 0) throw new ControlError("invalid_cursor", "The replay cursor is not in the selected inbox history.");
              unread = unread.slice(index + 1);
            }
            const unanswered = this.events().filter(matches).filter((event) => event.type === "needs_input" && !event.resolved);
            const candidates = args.replay ? unread : [...new Map([...unanswered, ...unread].map((event) => [event.id, event])).values()];
            const events: InboxEvent[] = [];
            let bytes = 0;
            for (const event of candidates) {
              const size = Buffer.byteLength(JSON.stringify(event), "utf8");
              if (events.length && (events.length === 64 || bytes + size > 262144)) break;
              events.push(event);
              bytes += size;
            }
            const runs = (args.targets ?? []).map((target) => this.snapshot(target, this.policy(target.session, target.run)));
            const questions = unanswered.length > 0;
            const terminal = (run: AgentsResult) => ["completed", "failed", "stopped"].includes(run.status);
            const completed = until === "any" ? runs.some(terminal) : until === "all" && runs.every(terminal);
            const blocked = runs.some((run) => run.status === "blocked") || events.some((event) => event.type === "blocked" && !event.resolved);
            const reason = questions ? "needs_input" : blocked ? "blocked" :
              completed ? "completed" : until === "message" && events.length ? "message" :
              Date.now() >= deadline ? "timeout" : undefined;
            if (reason) {
              this.acknowledge(events);
              const returned = new Set(events.map((event) => event.id));
              finish({
                status: reason === "needs_input" || reason === "blocked" ? "blocked" : completed ? "completed" : "running",
                reason, events, runs, more: unread.some((event) => !returned.has(event.id)),
                ...(args.replay && events.length ? { cursor: events.at(-1)!.id } : {}),
              });
            } else {
              timer = setTimeout(check, Math.min(250, Math.max(1, deadline - Date.now())));
            }
          } catch (error) {
            finish(undefined, error);
          }
        };
        signal?.addEventListener("abort", cancelled, { once: true });
        check();
      });
    } finally {
      this.waiting = undefined;
    }
  }
}
