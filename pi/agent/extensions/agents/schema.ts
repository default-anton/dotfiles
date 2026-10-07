import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

export const parameters = Type.Object({
  action: StringEnum(["start", "send", "status", "wait", "configure", "stop"], { description: "start: assign new worker; send: task or correspondence; status: inspect; wait: receive inbox events; configure: delivery; stop: abort. Only fields documented for the selected action/kind are accepted. Configure requires targets and at least one of delivery or notify." }),
  session: Type.Optional(Type.String({ description: "Required for send/status/stop; forbidden otherwise. Target Pi session UUID." })),
  name: Type.Optional(Type.String({ description: "Required for start only. Short worker tab label." })),
  message: Type.Optional(Type.String({ description: "Required for start/send only. Assignment or correspondence text." })),
  cwd: Type.Optional(Type.String({ description: "Start only; defaults to the current directory." })),
  model: Type.Optional(Type.String({ description: "Start only; model ID, model:thinking, or provider/model:thinking. Omitted parts inherit the parent's settings; thinking is clamped to model capabilities." })),
  mode: Type.Optional(StringEnum(["steer", "followUp"], { description: "Send task only. Instruction scheduling: steer (default, at the next boundary) or followUp. Correspondence follows the recipient's inbox policy." })),
  notify: Type.Optional(StringEnum(["steer", "followUp"], { description: "Start, send task, or configure only. Automatic delivery scheduling: steer or followUp. Start defaults to steer; follow-on tasks inherit. Does not enable automatic delivery." })),
  delivery: Type.Optional(StringEnum(["automatic", "manual"], { description: "Start, send task, or configure only. automatic wakes the parent; manual buffers communication for wait. Start defaults to automatic; follow-on tasks inherit." })),
  lifetime: Type.Optional(StringEnum(["turn", "session"], { description: "Start or send task only. turn stops work on parent-turn abort; session survives it but stops on parent shutdown. Start defaults to turn; follow-on tasks inherit." })),
  kind: Type.Optional(StringEnum(["task", "message", "question", "answer"], { description: "Send only. Parents default to task; workers default to message and cannot assign tasks. Answer requires replyTo. Tasks and answers resuming managed workers watch completion." })),
  replyTo: Type.Optional(Type.String({ description: "Required for send answer; forbidden otherwise. Event UUID of the received question." })),
  run: Type.Optional(Type.String({ description: "Status or send correspondence only; forbidden for tasks. Status selects this exact run or defaults to latest. Correspondence defaults to the sender's current work interval." })),
  targets: Type.Optional(Type.Array(Type.Object({
    session: Type.String(),
    run: Type.String(),
  }, { additionalProperties: false }), { minItems: 1, maxItems: 32, description: "Wait/configure only. Required for configure and wait until any/all. Distinct exact session/run UUID pairs. Omit for wait to receive from the entire inbox." })),
  until: Type.Optional(StringEnum(["any", "all", "message"], { description: "Wait only. any/all require targets. Defaults to all with targets, message otherwise. Questions and UI blocks return early." })),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 3600000, description: "Wait only. Defaults to 60000 milliseconds; zero receives immediately. Timeout does not stop workers." })),
  replay: Type.Optional(Type.Boolean({ description: "Wait only; defaults to false. Include previously received events for recovery after uncertain delivery." })),
  after: Type.Optional(Type.String({ description: "Wait only; requires replay: true. Continue after the cursor returned by the previous replay batch." })),
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
export type Delivery = "automatic" | "manual";
export type Lifetime = "turn" | "session";
export type Arguments = Static<typeof parameters>;
export type AgentsResult = Static<typeof resultSchema>;
export const uuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function validateArguments(args: Arguments) {
  if (!Value.Check(parameters, args)) throw new Error("Invalid agents arguments.");
  const fields = {
    start: ["action", "name", "message", "cwd", "model", "notify", "delivery", "lifetime"],
    send: ["action", "session", "message", "mode", "kind", "replyTo", "run", "notify", "delivery", "lifetime"],
    status: ["action", "session", "run"],
    wait: ["action", "targets", "until", "timeoutMs", "replay", "after"],
    configure: ["action", "targets", "delivery", "notify"],
    stop: ["action", "session"],
  };
  if (!fields[args.action] || Object.keys(args).some((key) => !fields[args.action].includes(key))) {
    throw new Error("Fields do not match the agents action.");
  }
  if (["send", "status", "stop"].includes(args.action) && (!args.session || !uuid.test(args.session))) {
    throw new Error("session must be a full Pi session UUID.");
  }
  if (args.run !== undefined && !uuid.test(args.run)) throw new Error("run must be a full UUID.");
  if (args.targets?.some((target) => !uuid.test(target.session) || !uuid.test(target.run))) throw new Error("targets require full session and run UUIDs.");
  if (args.targets && new Set(args.targets.map((target) => `${target.session}/${target.run}`)).size !== args.targets.length) throw new Error("targets must be distinct.");
  if (args.action === "configure" && (!args.targets || (!args.delivery && !args.notify))) throw new Error("configure requires targets and delivery or notify.");
  if (args.action === "wait" && args.until && args.until !== "message" && !args.targets) throw new Error("Waiting for completion requires exact targets.");
  if (args.replyTo !== undefined && !uuid.test(args.replyTo)) throw new Error("replyTo must be a full event UUID.");
  if (args.after !== undefined && (!args.replay || !uuid.test(args.after))) throw new Error("after requires replay: true and a full event UUID.");
  if (args.action === "send") {
    if (args.kind === "answer" ? !args.replyTo : args.replyTo !== undefined) throw new Error("Only answers require replyTo.");
    if (args.kind && args.kind !== "task" && (args.mode || args.delivery || args.notify || args.lifetime)) throw new Error("Scheduling, delivery, and lifetime options belong to tasks, not correspondence.");
    if (args.kind === "task" && args.run) throw new Error("Tasks join the active run or start a new run; run is for correspondence.");
  }
  if (args.action === "start" && (!args.name?.trim() || args.name.length > 100 || /[\r\n\x00-\x1f]/.test(args.name))) {
    throw new Error("name must be a nonblank, single-line label of at most 100 characters.");
  }
  if (args.model !== undefined && !args.model.trim()) throw new Error("model must not be blank.");
  if (["start", "send"].includes(args.action) && !args.message?.trim()) throw new Error("message must not be blank.");
  if (args.message && Buffer.byteLength(JSON.stringify(args.message), "utf8") > 262144) {
    throw new Error("message exceeds the 256 KiB encoded control limit.");
  }
}

export class ControlError extends Error {
  constructor(public code: string, message: string, public handles: Partial<AgentsResult> = {}) {
    super(message);
  }
}

export function failure(error: ControlError, handles: Partial<AgentsResult> = {}): AgentsResult {
  return { ...handles, ...error.handles, status: "failed", error: { code: error.code, message: error.message } };
}
