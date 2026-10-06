import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { sameIdentity, type Endpoint } from "./bridge";
import { ControlError, failure, type AgentsResult } from "./schema";
import { processAlive, State } from "./state";

type Notification = {
  id: string;
  child: Endpoint;
  name?: string;
  run: string;
  mode: "steer" | "followUp";
  created: number;
};

export class Notifications {
  private timer?: ReturnType<typeof setInterval>;
  private pending = new Set<string>();
  private paused = false;
  private recovering = true;
  private warned = false;

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
    return `notification-${this.parent.session}-`;
  }

  private filename(id: string) {
    return `${this.prefix()}${id}.json`;
  }

  track(id: string, child: Endpoint, run: string, mode: Notification["mode"], name: string) {
    const notification: Notification = { id, child, name, run, mode, created: Date.now() };
    this.state.write(this.filename(id), notification);
    this.pi.appendEntry("agents:watch", { id });
  }

  forget(id: string) {
    this.state.remove(this.filename(id));
    this.pending.delete(id);
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
  }

  private result(notification: Notification): AgentsResult | undefined {
    const { child, id } = notification;
    const admission = this.state.read<{ run: string }>(`request-${child.session}-${id}.json`);
    const run = admission?.run ?? notification.run;
    const saved = this.state.read<AgentsResult>(`run-${child.session}-${run}.json`);
    if (saved && !["running", "blocked"].includes(saved.status)) return saved;
    const registered = this.state.read<Endpoint>(`endpoint-${child.incarnation}.json`);
    const alive = registered && sameIdentity(registered, child) &&
      child.server === this.state.server && processAlive(registered.pid);
    if (alive && (admission || Date.now() - notification.created < 10000)) return;
    const final = this.state.read<AgentsResult>(`run-${child.session}-${run}.json`);
    if (final && !["running", "blocked"].includes(final.status)) return final;
    const result = failure(new ControlError(
      admission ? "agent_exited" : "delivery_unknown",
      admission
        ? "The agent exited without a confirmed final result."
        : "Task admission was not confirmed. Check status before resending.",
    ), { session: child.session, run, tab: child.tab });
    this.state.write(`run-${child.session}-${run}.json`, result);
    return result;
  }

  private deliver() {
    if (this.paused) return;
    try {
      if (this.recovering && this.ctx.hasPendingMessages()) return;
      this.recovering = false;
      if (this.ctx.isIdle() && !this.ctx.hasPendingMessages()) this.pending.clear();
      const notifications = this.state.records<Notification>(this.prefix());
      if (!notifications.length) return;
      const branch = this.ctx.sessionManager.getBranch();
      const watches = new Set(branch.flatMap((entry) =>
        entry.type === "custom" && entry.customType === "agents:watch"
          ? [(entry.data as { id: string }).id] : []));
      const delivered = new Set(branch.flatMap((entry) =>
        entry.type === "custom_message" && entry.customType === "agents:result"
          ? [(entry.details as { notificationId: string }).notificationId] : []));
      for (const notification of notifications) {
        if (delivered.has(notification.id)) {
          this.forget(notification.id);
          continue;
        }
        if (!watches.has(notification.id) || this.pending.has(notification.id)) continue;
        const result = this.result(notification);
        if (!result) continue;
        const content = [
          `Agent result: session ${result.session}, run ${result.run}, status ${result.status}.`,
          result.output,
          result.outputPath ? `Full output: ${result.outputPath}` : undefined,
          result.error ? `${result.error.code}: ${result.error.message}` : undefined,
        ].filter(Boolean).join("\n\n");
        this.pi.sendMessage({
          customType: "agents:result", content, display: true,
          details: { notificationId: notification.id, name: notification.name, result },
        }, { triggerTurn: true, deliverAs: notification.mode });
        this.pending.add(notification.id);
        break;
      }
      this.warned = false;
    } catch (error) {
      if (!this.warned) {
        this.ctx.ui.notify(`Agent result delivery failed; retrying: ${error instanceof Error ? error.message : String(error)}`, "warning");
        this.warned = true;
      }
    }
  }
}
