import { randomUUID } from "node:crypto";
import { chmodSync, unlinkSync } from "node:fs";
import { createConnection, createServer, type Socket } from "node:net";
import { join } from "node:path";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { ControlError, resultSchema, uuid, type AgentsResult } from "./schema";
import { State, hash, processAlive, scheduleDeadline } from "./state";

const identifier = Type.String({ pattern: uuid.source });
const identitySchema = Type.Object({
  session: identifier,
  incarnation: identifier,
  server: Type.String(),
}, { additionalProperties: false });
const requestSchema = Type.Object({
  version: Type.Literal(1),
  id: identifier,
  target: identitySchema,
  operation: Type.Union([Type.Literal("hello"), Type.Literal("submit"), Type.Literal("status"), Type.Literal("abort")]),
  caller: Type.Optional(identitySchema),
  capability: Type.Optional(Type.String()),
  automatic: Type.Optional(Type.Boolean()),
  message: Type.Optional(Type.String({ minLength: 1, maxLength: 262144 })),
  mode: Type.Optional(Type.Union([Type.Literal("steer"), Type.Literal("followUp")])),
  run: Type.Optional(identifier),
}, { additionalProperties: false });

export type Identity = Static<typeof identitySchema>;
export type Request = Static<typeof requestSchema>;
export type Owner = Identity & { capability: string; launch: string };
const endpointSchema = Type.Object({
  ...identitySchema.properties,
  pid: Type.Integer({ minimum: 1 }),
  file: Type.String(),
  cwd: Type.String(),
  socket: Type.String(),
  pane: Type.String(),
  tab: Type.String(),
  workspace: Type.String(),
  worker: Type.Boolean(),
  closing: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
const snapshotSchema = Type.Object({
  endpoint: endpointSchema,
  result: resultSchema,
  selection: Type.Optional(Type.Object({
    provider: Type.String(),
    model: Type.String(),
    thinking: Type.String(),
  }, { additionalProperties: false })),
  owner: Type.Optional(Type.Object({
    ...identitySchema.properties,
    launch: identifier,
  }, { additionalProperties: false })),
}, { additionalProperties: false });
export type Endpoint = Static<typeof endpointSchema>;
export type Snapshot = Static<typeof snapshotSchema>;
export type Reply = AgentsResult | Snapshot;
const maximumFrame = 1024 * 1024;

export function sameIdentity(a: Identity, b: Identity) {
  return a.session === b.session && a.incarnation === b.incarnation && a.server === b.server;
}

function readFrame(socket: Socket, receive: (value: unknown) => void) {
  let buffer = Buffer.alloc(0);
  let received = false;
  socket.on("data", (chunk: Buffer) => {
    if (received) return socket.destroy();
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > maximumFrame) return socket.destroy(new Error("Control frame too large."));
    const newline = buffer.indexOf(10);
    if (newline < 0) return;
    received = true;
    if (newline !== buffer.length - 1) return socket.destroy(new Error("Expected one JSONL request."));
    try {
      receive(JSON.parse(buffer.subarray(0, newline).toString("utf8")));
    } catch {
      socket.destroy(new Error("Invalid control frame."));
    }
  });
}

export function request(
  endpoint: Endpoint,
  payload: Pick<Request, "operation"> & Partial<Request>,
  signal?: AbortSignal,
  deadline = 5000,
): Promise<Reply> {
  const message = { ...payload, version: 1, id: payload.id ?? randomUUID(), target: {
    session: endpoint.session, incarnation: endpoint.incarnation, server: endpoint.server,
  } };
  if (!Value.Check(requestSchema, message)) throw new Error("Invalid bridge request.");
  return new Promise((resolve, reject) => {
    const socket = createConnection(endpoint.socket);
    let settled = false;
    let cancelDeadline: (() => void) | undefined = scheduleDeadline(
      5000, () => finish(new ControlError("bridge_timeout", "Connecting to the control endpoint timed out.")),
    );
    const abort = () => finish(new ControlError("observation_cancelled", "The control call was cancelled; admitted work may still be running."));
    function finish(error?: Error, reply?: Reply) {
      if (settled) return;
      settled = true;
      cancelDeadline?.();
      signal?.removeEventListener("abort", abort);
      socket.destroy();
      if (error) reject(error);
      else resolve(reply!);
    }
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    socket.on("connect", () => {
      cancelDeadline?.();
      cancelDeadline = deadline > 0 ? scheduleDeadline(deadline, () => finish(new ControlError("bridge_timeout", "Control acknowledgement timed out; check status, do not resend."))) : undefined;
      socket.write(`${JSON.stringify(message)}\n`);
    });
    socket.on("error", () => finish(new ControlError("bridge_unavailable", "The session control endpoint is unavailable.")));
    socket.on("close", () => finish(new ControlError("delivery_unknown", "The connection closed before acknowledgement; check status, do not resend.")));
    readFrame(socket, (value) => {
      const reply = value as { version?: number; id?: string; value?: Reply; error?: { code: string; message: string } };
      if (reply.version !== 1 || reply.id !== message.id) return finish(new ControlError("protocol_error", "Unexpected control response."));
      if (reply.error) return finish(new ControlError(reply.error.code, reply.error.message));
      if (payload.operation === "hello") {
        const snapshot = reply.value as Snapshot;
        if (!Value.Check(snapshotSchema, snapshot) || !sameIdentity(snapshot.endpoint, endpoint)) {
          return finish(new ControlError("identity_changed", "Endpoint identity changed."));
        }
      } else if (!Value.Check(resultSchema, reply.value)) {
        return finish(new ControlError("protocol_error", "Invalid control result."));
      }
      finish(undefined, reply.value);
    });
  });
}

export async function listen(
  state: State,
  endpoint: Endpoint,
  handler: (request: Request, signal: AbortSignal) => Promise<Reply>,
) {
  const release = state.lock(`writer:${endpoint.file}`, endpoint.incarnation);
  let releaseIdentity: () => void;
  try {
    releaseIdentity = state.lock(`session:${endpoint.session}`, endpoint.incarnation);
  } catch (error) {
    release();
    throw error;
  }
  endpoint.socket = join(state.runtime, `${hash(endpoint.incarnation)}.sock`);
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    const controller = new AbortController();
    const timer = setTimeout(() => socket.destroy(), 5000);
    socket.on("error", () => {});
    socket.on("close", () => {
      clearTimeout(timer);
      sockets.delete(socket);
      controller.abort();
    });
    readFrame(socket, (value) => {
      clearTimeout(timer);
      if (!Value.Check(requestSchema, value)) return socket.destroy();
      const incoming = value as Request;
      const respond = (body: object) => {
        if (!socket.destroyed) socket.end(`${JSON.stringify({ version: 1, id: incoming.id, ...body })}\n`);
      };
      if (!sameIdentity(incoming.target, endpoint)) {
        respond({ error: { code: "identity_changed", message: "Target session/process/server changed." } });
        return;
      }
      void handler(incoming, controller.signal).then(
        (reply) => respond({ value: reply }),
        (error) => respond({ error: { code: error instanceof ControlError ? error.code : "control_failed", message: error instanceof Error ? error.message : String(error) } }),
      );
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(endpoint.socket, () => {
        server.off("error", reject);
        resolve();
      });
    });
    chmodSync(endpoint.socket, 0o600);
    state.write(`endpoint-${endpoint.incarnation}.json`, endpoint);
  } catch (error) {
    server.close();
    releaseIdentity();
    release();
    throw error;
  }
  return () => {
    for (const socket of sockets) socket.destroy();
    server.close();
    if (!endpoint.closing && state.read<Endpoint>(`endpoint-${endpoint.incarnation}.json`)?.incarnation === endpoint.incarnation) {
      state.remove(`endpoint-${endpoint.incarnation}.json`);
    }
    try { unlinkSync(endpoint.socket); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    release();
    releaseIdentity();
  };
}

export function endpoints(state: State) {
  return state.records<Endpoint>("endpoint-").filter((record) => record.server === state.server && processAlive(record.pid));
}

export async function verifyCaller(state: State, incoming: Request) {
  const caller = incoming.caller && endpoints(state).find((record) => sameIdentity(record, incoming.caller!));
  if (!caller) throw new ControlError("caller_unavailable", "The controlling Pi process is no longer registered.");
  const snapshot = await request(caller, { operation: "hello" }) as Snapshot;
  return snapshot.endpoint;
}
