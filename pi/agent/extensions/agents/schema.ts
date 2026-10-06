import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

export const parameters = Type.Object({
  action: StringEnum(["start", "send", "status", "stop"], { description: "start: new; send: message live or saved; status: inspect; stop: abort." }),
  session: Type.Optional(Type.String({ description: "Target Pi session ID; required except for start." })),
  name: Type.Optional(Type.String({ description: "Short tab label; required for start." })),
  message: Type.Optional(Type.String({ description: "Task or message; required for start/send." })),
  cwd: Type.Optional(Type.String({ description: "Start only; defaults to the current directory." })),
  model: Type.Optional(Type.String({ description: "Start only; model ID, model:thinking, or provider/model:thinking. Omitted parts inherit the parent's settings; thinking is clamped to model capabilities." })),
  mode: Type.Optional(StringEnum(["steer", "followUp"], { description: "Send only; defaults to steer. Steer runs at the next boundary." })),
  notify: Type.Optional(StringEnum(["steer", "followUp"], { description: "Start only; final result delivery. Defaults to steer." })),
  run: Type.Optional(Type.String({ description: "Status only; defaults to the latest run." })),
}, { additionalProperties: false });

export const resultSchema = Type.Object({
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
}, { additionalProperties: false });

export type Arguments = Static<typeof parameters>;
export type AgentsResult = Static<typeof resultSchema>;
export const uuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function validateArguments(args: Arguments) {
  if (!Value.Check(parameters, args)) throw new Error("Invalid agents arguments.");
  const fields = {
    start: ["action", "name", "message", "cwd", "model", "notify"],
    send: ["action", "session", "message", "mode"],
    status: ["action", "session", "run"],
    stop: ["action", "session"],
  };
  if (!fields[args.action] || Object.keys(args).some((key) => !fields[args.action].includes(key))) {
    throw new Error("Fields do not match the agents action.");
  }
  if (args.action !== "start" && (!args.session || !uuid.test(args.session))) {
    throw new Error("session must be a full Pi session UUID.");
  }
  if (args.run !== undefined && !uuid.test(args.run)) throw new Error("run must be a full UUID.");
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
