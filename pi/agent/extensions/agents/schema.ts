import { arr, bool, compile, int, lit, nullable, num, obj, oneOf, opt, str, union, type Annotations, type Schema, type Static } from "@earendil-works/pi-schema";

function stringEnum<const V extends readonly string[]>(values: V, options?: Annotations<V[number]>): Schema<V[number]> {
  return { type: "string", ...oneOf(values, options) };
}

export const parameters = obj({
  action: stringEnum(["start", "task", "message", "question", "answer", "status", "wait", "configure", "stop"]),
  session: opt(str({ description: "Recipient UUID for task/message/question/answer/stop; status accepts session or run." })),
  name: opt(str({ description: "Required for start. Short tab label." })),
  message: opt(str({ description: "Required for start/task/message/question/answer." })),
  cwd: opt(str({ description: "Start only; defaults to current directory." })),
  model: opt(str({ description: "Start only: model, model:thinking, or provider/model:thinking. Omitted parts inherit." })),
  delivery: opt(stringEnum(["manual", "steer"], { description: "Start/task/configure: buffer for wait or wake parent at next boundary. Start defaults to steer; tasks inherit. Required for configure." })),
  lifetime: opt(stringEnum(["turn", "session"], { description: "Start/task: stop on parent-turn abort (default) or survive until parent shutdown. Tasks inherit." })),
  replyTo: opt(str({ description: "Required for answer: received question event ID." })),
  run: opt(str({ description: "Status: exact run handle. Message/question/answer: sender's run handle; defaults to current run." })),
  targets: opt(arr(str(), { minItems: 1, maxItems: 32, description: "Wait/configure: distinct run handles. Required for configure; omit for wait on entire inbox." })),
  until: opt(stringEnum(["any", "all", "message"], { description: "Wait: any/all require targets. Defaults to all with targets, message otherwise. Questions/blocks return early." })),
  timeoutMs: opt(int({ minimum: 0, maximum: 3600000, description: "Wait: milliseconds, default 60000; zero receives immediately. Never stops workers." })),
  replay: opt(union([{ type: "boolean", ...lit(true) }, str()], { description: "Wait: true replays retained events; a returned cursor continues replay. Omit for unread events." })),
});

const snapshotProperties = {
  session: opt(str()),
  run: opt(str()),
  status: stringEnum(["running", "blocked", "completed", "stopped", "idle", "failed"]),
  tab: opt(str()),
  contextUsage: opt(obj({
    tokens: nullable(num()),
    contextWindow: num(),
    percent: nullable(num()),
  })),
  output: opt(str()),
  outputPath: opt(str()),
  error: opt(obj({
    code: str(),
    message: str(),
  })),
};

export const eventSchema = obj({
  id: str(),
  type: stringEnum(["message", "needs_input", "blocked", "completed", "failed", "stopped"]),
  session: str(),
  run: opt(str()),
  from: str(),
  created: num(),
  message: opt(str()),
  replyTo: opt(str()),
  resolved: opt(bool()),
  result: opt(obj(snapshotProperties)),
});

export const resultSchema = obj({
  ...snapshotProperties,
  event: opt(str()),
  reason: opt(stringEnum(["completed", "message", "needs_input", "blocked", "timeout", "cancelled", "configured"])),
  events: opt(arr(eventSchema)),
  runs: opt(arr(obj(snapshotProperties))),
  more: opt(bool()),
  cursor: opt(str()),
});

export type InboxEvent = Static<typeof eventSchema>;
export type Target = { session: string; run: string };
export type Delivery = "steer" | "manual";
export type Lifetime = "turn" | "session";
export type ToolArguments = Static<typeof parameters>;
export type Arguments = Omit<ToolArguments, "targets"> & { targets?: Target[] };
export type AgentsResult = Static<typeof resultSchema>;
export const uuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function runHandle(session: string, run: string) {
  return "run_" + Buffer.from((session + run).replaceAll("-", ""), "hex").toString("base64url");
}

export function resolveRun(handle: string): Target {
  if (!/^run_[A-Za-z0-9_-]{43}$/.test(handle)) throw new Error("Expected a returned run handle.");
  const bytes = Buffer.from(handle.slice(4), "base64url");
  const ids = bytes.toString("hex").match(/.{32}/g)!;
  const [session, run] = ids.map((id) => id.replace(/^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5"));
  if (runHandle(session, run) !== handle) throw new Error("Invalid run handle.");
  return { session, run };
}

export function publicEvent(event: InboxEvent): InboxEvent {
  return {
    ...event,
    ...(event.run ? { run: runHandle(event.session, event.run) } : {}),
    ...(event.result ? { result: publicResult(event.result) } : {}),
  };
}

export function publicResult(result: AgentsResult): AgentsResult {
  return {
    ...result,
    ...(result.session && result.run ? { run: runHandle(result.session, result.run) } : {}),
    ...(result.events ? { events: result.events.map(publicEvent) } : {}),
    ...(result.runs ? { runs: result.runs.map(publicResult) } : {}),
  };
}

const checkParameters = compile(parameters).check;

export function validateArguments(args: ToolArguments): Arguments {
  if (!checkParameters(args)) throw new Error("Invalid agents arguments.");
  const fields = {
    start: ["action", "name", "message", "cwd", "model", "delivery", "lifetime"],
    task: ["action", "session", "message", "delivery", "lifetime"],
    message: ["action", "session", "message", "run"],
    question: ["action", "session", "message", "run"],
    answer: ["action", "session", "message", "run", "replyTo"],
    status: ["action", "session", "run"],
    wait: ["action", "targets", "until", "timeoutMs", "replay"],
    configure: ["action", "targets", "delivery"],
    stop: ["action", "session"],
  };
  if (Object.keys(args).some((key) => !fields[args.action].includes(key))) {
    throw new Error("Fields do not match the agents action.");
  }
  if (args.session !== undefined && !uuid.test(args.session)) throw new Error("session must be a full Pi session UUID.");
  if (["task", "message", "question", "answer", "stop"].includes(args.action) && !args.session) {
    throw new Error("A recipient session is required.");
  }
  const selected = args.run === undefined ? undefined : resolveRun(args.run);
  if (args.action === "status" && !args.session && !selected) throw new Error("status requires session or run.");
  if (args.action === "status" && selected && args.session && args.session.toLowerCase() !== selected.session) {
    throw new Error("The run belongs to a different session.");
  }
  const targets = args.targets?.map(resolveRun);
  if (args.targets && new Set(args.targets).size !== args.targets.length) throw new Error("targets must be distinct.");
  if (args.action === "configure" && (!targets || !args.delivery)) throw new Error("configure requires targets and delivery.");
  if (args.action === "wait" && args.until && args.until !== "message" && !targets) throw new Error("Waiting for completion requires targets.");
  if (args.action === "answer" && (!args.replyTo || !uuid.test(args.replyTo))) throw new Error("answer requires a question event UUID.");
  if (typeof args.replay === "string" && !uuid.test(args.replay)) throw new Error("replay requires a returned cursor.");
  if (args.action === "start" && (!args.name?.trim() || args.name.length > 100 || /[\r\n\x00-\x1f]/.test(args.name))) {
    throw new Error("name must be a nonblank, single-line label of at most 100 characters.");
  }
  if (args.model !== undefined && !args.model.trim()) throw new Error("model must not be blank.");
  if (["start", "task", "message", "question", "answer"].includes(args.action) && !args.message?.trim()) throw new Error("message must not be blank.");
  if (args.message && Buffer.byteLength(JSON.stringify(args.message), "utf8") > 262144) {
    throw new Error("message exceeds the 256 KiB encoded control limit.");
  }
  const { targets: _targets, ...rest } = args;
  return {
    ...rest,
    ...(args.session ? { session: args.session.toLowerCase() } : {}),
    ...(targets ? { targets } : {}),
    ...(selected && args.action === "status" ? { session: selected.session, run: selected.run } : {}),
  };
}

export class ControlError extends Error {
  constructor(public code: string, message: string, public handles: Partial<AgentsResult> = {}) {
    super(message);
  }
}

export function failure(error: ControlError, handles: Partial<AgentsResult> = {}): AgentsResult {
  return { ...handles, ...error.handles, status: "failed", error: { code: error.code, message: error.message } };
}
