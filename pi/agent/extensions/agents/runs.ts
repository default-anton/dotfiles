import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { truncateHead, type ExtensionAPI, type ExtensionContext, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { type AgentsResult, ControlError, failure } from "./schema";
import { type Request } from "./bridge";
import { State, MutationQueue, scheduleDeadline } from "./state";

type Admission = {
  request: string;
  run: string;
  sender: string;
  kind: "user" | "custom";
  entry?: string;
  marker?: string;
  cancelled?: boolean;
};

type Run = {
  id: string;
  admissions: Admission[];
  result: AgentsResult;
  anchor?: string;
};

function isAdmission(entry: SessionEntry): entry is SessionEntry & { data: Admission } {
  return entry.type === "custom" && entry.customType === "agents:admission";
}

export class Runs {
  readonly queue = new MutationQueue();
  private readonly changed = new EventEmitter();
  private current?: Run;
  private pending?: Admission;
  private inputCount = 0;
  private watchdog?: ReturnType<typeof setTimeout>;
  private blocked = 0;
  private stopping = false;
  private changingSession = false;
  private closed = false;

  constructor(
    private pi: ExtensionAPI,
    private ctx: ExtensionContext,
    private state: State,
    readonly session: string,
    readonly tab: string,
  ) {
    this.changed.setMaxListeners(0);
    const branch = ctx.sessionManager.getBranch();
    const last = branch.findLast((entry) => entry.type === "custom" &&
      ["agents:admission", "agents:interval"].includes(entry.customType));
    if (last) {
      const run = (last as SessionEntry & { data: { run: string } }).data.run;
      const result = this.saved(run);
      this.current = {
        id: run,
        admissions: branch.filter(isAdmission).map((entry) => entry.data).filter((data) => data.run === run),
        result: result ?? failure(new ControlError("delivery_unknown", "The previous process did not confirm settlement."), { session, run, tab }),
      };
      if (this.current.result.status === "running" || this.current.result.status === "blocked") {
        this.current.result = failure(new ControlError("delivery_unknown", "The previous process exited before settlement was confirmed."), { session, run, tab });
        this.persist();
      }
    }
  }

  updateContext(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  canClose(run: string | undefined) {
    return !!run && this.current?.id === run && this.current.result.status === "completed" &&
      !this.closed && !this.changingSession && !this.blocked && !this.pending && !this.stopping &&
      this.ctx.isIdle() && !this.ctx.hasPendingMessages();
  }

  private persist() {
    if (this.current) this.state.write(`run-${this.session}-${this.current.id}.json`, this.current.result);
    this.changed.emit("change");
  }

  private saved(run: string) {
    return this.state.read<AgentsResult>(`run-${this.session}-${run}.json`);
  }

  snapshot(run = this.current?.id): AgentsResult {
    const result = run === this.current?.id ? this.current?.result : run ? this.saved(run) : undefined;
    if (run && !result) return failure(new ControlError("run_not_found", "No result is recorded for that run."), { session: this.session, run, tab: this.tab });
    if (run !== this.current?.id && result && ["running", "blocked"].includes(result.status)) {
      return failure(new ControlError("delivery_unknown", "The earlier process never confirmed this run's settlement."), { session: this.session, run, tab: this.tab });
    }
    const snapshot = result ?? { session: this.session, status: "idle" as const, tab: this.tab };
    if (this.blocked && (snapshot.status === "running" || snapshot.status === "idle")) return { ...snapshot, tab: this.tab, status: "blocked" };
    return { ...snapshot, tab: this.tab };
  }

  private fail(code: string, message: string) {
    if (!this.current) return;
    this.current.result = failure(new ControlError(code, message), {
      session: this.session, run: this.current.id, tab: this.tab,
    });
    this.persist();
  }

  private newRun(id: string = randomUUID()) {
    this.current = {
      id,
      admissions: [],
      result: { session: this.session, run: id, status: "running", tab: this.tab },
    };
    this.pi.appendEntry("agents:interval", { run: id });
    this.current.anchor = this.ctx.sessionManager.getLeafId() ?? undefined;
    return this.current;
  }

  submit(incoming: Request): AgentsResult {
    if (this.closed) throw new ControlError("session_changed", "The session has been replaced.");
    if (this.changingSession) throw new ControlError("session_changing", "Session navigation is in progress. Finish it or enter input in the tab before sending.");
    this.observe(true);
    const recorded = this.state.read<{ run: string }>(`request-${this.session}-${incoming.id}.json`);
    if (recorded) return this.snapshot(recorded.run);
    const prior = this.ctx.sessionManager.getBranch().filter(isAdmission).find((entry) => entry.data.request === incoming.id);
    if (prior) return this.snapshot(prior.data.run);
    if (this.blocked) return { ...this.snapshot(), status: "blocked" };
    if (this.stopping) throw new ControlError("stop_in_progress", "Wait for the previous stop to settle.");
    if (this.pending) throw new ControlError("admission_pending", "An idle submission is still being prepared; wait instead of resending.");
    const idle = this.ctx.isIdle();
    if (!incoming.run) throw new ControlError("invalid_run", "A proposed run ID is required.");
    if (idle ? this.saved(incoming.run) : this.current?.result.status === "running" && this.current.id !== incoming.run) {
      throw new ControlError("run_changed", "The work interval changed before submission; inspect before sending again.");
    }
    const run = idle ? this.newRun(incoming.run) : this.current?.result.status === "running" ? this.current : this.newRun(incoming.run);
    const admission: Admission = {
      request: incoming.id, run: run.id, sender: incoming.caller!.session,
      kind: idle ? "user" : "custom",
    };
    run.admissions.push(admission);
    this.state.write(`request-${this.session}-${incoming.id}.json`, { run: run.id });
    this.pi.appendEntry("agents:admission", admission);
    this.persist();
    if (idle) {
      this.pending = admission;
      this.inputCount = 0;
      this.watchdog = setTimeout(() => {
        if (this.pending === admission) {
          this.fail("admission_stalled", "No attributable user message was consumed before the startup deadline; delivery remains uncertain.");
        }
      }, 10000);
      this.pi.sendUserMessage(incoming.message!, { expandPromptTemplates: false });
    } else {
      this.pi.sendMessage({
        customType: "agents:task", content: incoming.message!, display: true,
        details: { requestId: incoming.id, runId: run.id, senderSessionId: incoming.caller!.session },
      }, { triggerTurn: true, deliverAs: incoming.mode ?? "followUp" });
    }
    return this.snapshot(run.id);
  }

  input(source: string) {
    if (source === "interactive") this.changingSession = false;
    if (!this.pending) return;
    if (source === "interactive") {
      this.fail("user_takeover", "Interactive input interrupted task admission.");
      this.pending = undefined;
      this.stopping = false;
      if (this.watchdog) clearTimeout(this.watchdog);
    } else if (this.pending.cancelled) {
      this.pending = undefined;
      this.settled();
      return { action: "handled" as const };
    } else {
      this.inputCount++;
      if (this.inputCount !== 1) this.fail("ambiguous_input", "Interleaved extension input prevents safe task attribution.");
    }
  }

  beforeStart() {
    if (!this.pending || this.current?.result.status !== "running") return;
    if (this.inputCount !== 1 || this.pending.marker) {
      this.fail("ambiguous_input", "The prepared prompt cannot be attributed to this submission.");
      return;
    }
    this.pi.appendEntry("agents:submission", { request: this.pending.request, run: this.pending.run });
    this.pending.marker = this.ctx.sessionManager.getLeafId() ?? undefined;
  }

  observe(persistEntries: boolean) {
    if (!this.current) return;
    const branch = this.ctx.sessionManager.getBranch();
    for (const admission of this.current.admissions) {
      if (admission.entry || admission.cancelled) continue;
      let entry: SessionEntry | undefined;
      if (admission.kind === "custom") {
        entry = branch.find((candidate) => candidate.type === "custom_message" && candidate.customType === "agents:task" &&
          (candidate.details as { requestId?: string })?.requestId === admission.request);
      } else if (admission.marker && this.current.result.status === "running") {
        const markerIndex = branch.findIndex((candidate) => candidate.id === admission.marker);
        if (markerIndex < 0) {
          this.fail("branch_changed", "The submission marker is no longer on the active branch.");
          continue;
        }
        const users = branch.slice(markerIndex + 1).filter((candidate) => candidate.type === "message" && candidate.message.role === "user");
        if (users.length > 1) {
          this.fail("ambiguous_input", "More than one user entry follows the submission marker.");
          continue;
        }
        entry = users[0];
      }
      if (!entry) continue;
      admission.entry = entry.id;
      if (persistEntries) this.pi.appendEntry("agents:consumed", { request: admission.request, run: admission.run, entry: entry.id });
      if (this.pending === admission) {
        this.pending = undefined;
        if (this.watchdog) clearTimeout(this.watchdog);
      }
    }
  }

  boundary() {
    this.observe(true);
    if (this.current) this.pi.appendEntry("agents:checkpoint", {
      run: this.current.id,
      admissions: this.current.admissions,
      leaf: this.ctx.sessionManager.getLeafId(),
    });
  }

  settled() {
    this.observe(false);
    if (this.watchdog) clearTimeout(this.watchdog);
    if (!this.current) {
      this.stopping = false;
      this.changed.emit("change");
      return;
    }
    const run = this.current;
    if (this.stopping) {
      for (const admission of run.admissions) if (!admission.entry) admission.cancelled = true;
      run.result = { session: this.session, run: run.id, status: "stopped", tab: this.tab };
    } else if (run.result.status === "running") {
      const branch = this.ctx.sessionManager.getBranch();
      const consumed = run.admissions.map((admission) => branch.findIndex((entry) => entry.id === admission.entry));
      const anchor = branch.findIndex((entry) => entry.id === run.anchor);
      const lastConsumption = consumed.length ? Math.max(...consumed) : anchor;
      const final = branch.slice(Math.max(lastConsumption, anchor) + 1).findLast((entry) => entry.type === "message" && entry.message.role === "assistant");
      if (anchor >= 0 && final?.type === "message" && final.message.role === "assistant" && final.message.stopReason === "aborted") {
        for (const admission of run.admissions) if (!admission.entry) admission.cancelled = true;
        run.result = { session: this.session, run: run.id, status: "stopped", tab: this.tab };
      } else if (anchor < 0 || lastConsumption < 0 || consumed.some((index) => index < 0)) {
        this.fail("delivery_unknown", "Settlement did not consume every admitted message on the active branch.");
      } else if (!final || final.type !== "message" || final.message.role !== "assistant") {
        this.fail("missing_output", "No assistant response follows the admitted messages.");
      } else {
        const message = final.message;
        const text = message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
        if (message.stopReason !== "stop" || !text.trim()) {
          this.fail(message.stopReason === "stop" ? "missing_output" : message.stopReason, `The run ended without a complete text response (${message.stopReason}).`);
        } else {
          const truncated = truncateHead(text);
          run.result = {
            session: this.session, run: run.id, status: "completed", tab: this.tab,
            output: truncated.truncated ? `${truncated.content}\n[Output truncated; complete text is in outputPath.]` : text,
            ...(truncated.truncated ? { outputPath: this.state.writeText(`output-${this.session}-${run.id}.txt`, text) } : {}),
          };
          this.state.write(`result-ref-${this.session}-${run.id}.json`, {
            session: this.session, run: run.id, entry: final.id, consumed: run.admissions.map((admission) => admission.entry),
          });
        }
      }
    }
    this.pending = undefined;
    this.stopping = false;
    this.persist();
  }

  setBlocked(active: boolean) {
    this.blocked = Math.max(0, this.blocked + (active ? 1 : -1));
    this.changed.emit("change");
  }

  beginStop(beforeAbort: () => void) {
    if (this.ctx.isIdle() && !this.pending && !this.blocked && this.current?.result.status !== "running") {
      this.stopping = false;
      beforeAbort();
      this.changed.emit("change");
      return;
    }
    this.stopping = true;
    if (this.current) {
      for (const admission of this.current.admissions) if (!admission.entry) admission.cancelled = true;
      this.pi.appendEntry("agents:cancelled", { run: this.current.id });
    }
    beforeAbort();
    this.ctx.abort();
    if (this.ctx.isIdle() && !this.pending && !this.blocked) {
      if (this.current?.result.status === "running") this.settled();
      else {
        this.stopping = false;
        this.changed.emit("change");
      }
    }
  }

  started() {
    if (!this.pending && this.current?.result.status !== "running" && !this.stopping) {
      this.newRun();
      this.persist();
    }
    if (this.stopping && !this.closed) this.ctx.abort();
  }

  async confirmStop(signal?: AbortSignal): Promise<AgentsResult> {
    const result = await this.wait(this.current?.id, 3, signal, true);
    if (!this.stopping && this.ctx.isIdle() && !this.blocked) {
      if (result.status === "completed" || result.status === "failed") return { session: this.session, status: "idle", tab: this.tab };
      return result;
    }
    return failure(new ControlError("stop_unconfirmed", "Abort was requested but settlement was not confirmed. Keep the tab and retry stop."), {
      session: this.session, run: this.current?.id, tab: this.tab,
    });
  }

  wait(run = this.current?.id, timeout?: number, signal?: AbortSignal, stopping = false): Promise<AgentsResult> {
    return new Promise((resolve, reject) => {
      let cancelDeadline: (() => void) | undefined;
      let finished = false;
      const finish = (result?: AgentsResult, error?: Error) => {
        if (finished) return;
        finished = true;
        cancelDeadline?.();
        this.changed.off("change", check);
        signal?.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve(result!);
      };
      const check = () => {
        const snapshot = this.snapshot(run);
        if (this.closed || (stopping ? !this.stopping && !this.blocked : snapshot.status !== "running")) finish(snapshot);
      };
      const abort = () => finish(undefined, new ControlError("observation_cancelled", "Waiting was cancelled; the task was not stopped.", { session: this.session, run, tab: this.tab }));
      this.changed.on("change", check);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) return abort();
      if (timeout !== undefined) cancelDeadline = scheduleDeadline(timeout * 1000, () => finish({ ...this.snapshot(run), timedOut: true }));
      check();
    });
  }

  close() {
    this.closed = true;
    if (this.watchdog) clearTimeout(this.watchdog);
    if (this.current?.result.status === "running") this.fail("session_changed", "The target exited, reloaded, or replaced its session before settlement.");
    this.changed.emit("change");
  }

  pauseForNavigation() {
    this.changingSession = true;
  }
}
