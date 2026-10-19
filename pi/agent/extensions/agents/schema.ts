import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

export const parameters = Type.Object({
  action: StringEnum(["start", "task", "message", "question", "answer", "status", "wait", "configure", "stop"]),
  session: Type.Optional(Type.String({ description: "Recipient UUID for task/message/question/answer/stop; status accepts session or run." })),
  name: Type.Optional(Type.String({ description: "Required for start. Short tab label." })),
  message: Type.Optional(Type.String({ description: "Required for start/task/message/question/answer." })),
  cwd: Type.Optional(Type.String({ description: "Start only; defaults to current directory." })),
  model: Type.Optional(Type.String({ description: "Start only: model, model:thinking, or provider/model:thinking. Omitted parts inherit." })),
  delivery: Type.Optional(StringEnum(["manual", "steer"], { description: "Start/task/configure: buffer for wait or wake parent at next boundary. Start defaults to steer; tasks inherit. Required for configure." })),
  lifetime: Type.Optional(StringEnum(["turn", "session"], { description: "Start/task: stop on parent-turn abort (default) or survive until parent shutdown. Tasks inherit." })),
  replyTo: Type.Optional(Type.String({ description: "Required for answer: received question event ID." })),
  run: Type.Optional(Type.String({ description: "Status: exact run handle. Message/question/answer: sender's run handle; defaults to current run." })),
  targets: Type.Optional(Type.Array(Type.String(), { minItems: 1, maxItems: 32, description: "Wait/configure: distinct run handles. Required for configure; omit for wait on entire inbox." })),
  until: Type.Optional(StringEnum(["any", "all", "message"], { description: "Wait: any/all require targets. Defaults to all with targets, message otherwise. Questions/blocks return early." })),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 3600000, description: "Wait: milliseconds, default 60000; zero receives immediately. Never stops workers." })),
  replay: Type.Optional(Type.Union([Type.Literal(true), Type.String()], { description: "Wait: true replays retained events; a returned cursor continues replay. Omit for unread events." })),
}, { additionalProperties: false });

const snapshotProperties = {
  session: Type.Optional(Type.String()),
  run: Type.Optional(Type.String()),
  status: StringEnum(["running", "blocked", "completed", "stopped", "idle", "failed"]),
  tab: Type.Optional(Type.String()),
  output: Type.Optional(Type.String()),
  outputPath: Type.Optional(Type.String()),
  error: Type.Optional(Type.Object({
    code: Type.String(),
    message: Type.String(),
  }, { additionalProperties: false })),
};

export const eventSchema = Type.Object({
  id: Type.String(),
  type: StringEnum(["message", "needs_input", "blocked", "completed", "failed", "stopped"]),
  session: Type.String(),
  run: Type.Optional(Type.String()),
  from: Type.String(),
  created: Type.Number(),
  message: Type.Optional(Type.String()),
  replyTo: Type.Optional(Type.String()),
  resolved: Type.Optional(Type.Boolean()),
  result: Type.Optional(Type.Object(snapshotProperties, { additionalProperties: false })),
}, { additionalProperties: false });

export const resultSchema = Type.Object({
  ...snapshotProperties,
  event: Type.Optional(Type.String()),
  reason: Type.Optional(StringEnum(["completed", "message", "needs_input", "blocked", "timeout", "cancelled", "configured"])),
  events: Type.Optional(Type.Array(eventSchema)),
  runs: Type.Optional(Type.Array(Type.Object(snapshotProperties, { additionalProperties: false }))),
  more: Type.Optional(Type.Boolean()),
  cursor: Type.Optional(Type.String()),
}, { additionalProperties: false });

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

export function validateArguments(args: ToolArguments): Arguments {
  if (!Value.Check(parameters, args)) throw new Error("Invalid agents arguments.");
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
