import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import childExtension from "../subagent.ts";
import { RESULT_FILE_NAME, SUBAGENT_IPC_DIR_ENV, SUBAGENT_MODEL_ARG_ENV } from "../ipc.ts";

async function runChild(events: string[], auth: () => Promise<unknown>) {
  const directory = mkdtempSync(join(tmpdir(), "subagent-test-"));
  const previous = { ...process.env };
  process.env[SUBAGENT_IPC_DIR_ENV] = directory;
  process.env[SUBAGENT_MODEL_ARG_ENV] = "openai/test";
  const handlers = new Map<string, Function>();
  let shutdown = false;
  try {
    childExtension({ on: (name: string, handler: Function) => handlers.set(name, handler) } as any);
    const ctx = {
      model: { provider: "openai", id: "test" },
      modelRegistry: { getApiKeyAndHeaders: auth },
      sessionManager: { getSessionId: () => "test-session" },
      shutdown: () => { shutdown = true; },
    };
    await handlers.get("session_start")!({}, ctx);
    for (const event of events) {
      await handlers.get(event)!({ message: { role: "assistant", stopReason: "aborted" } }, ctx);
    }
    return { ...JSON.parse(readFileSync(join(directory, RESULT_FILE_NAME), "utf8")), shutdown };
  } finally {
    for (const key of [SUBAGENT_IPC_DIR_ENV, SUBAGENT_MODEL_ARG_ENV]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

test("pre-response authentication failures reach the parent result", async () => {
  const result = await runChild([], async () => ({ ok: false, error: 'No API key found for "openai"' }));
  assert.equal(result.details.stopReason, "error");
  assert.match(result.details.error, /Authentication failed.*openai\/test.*No API key/);
  assert.equal(result.shutdown, true);
});

test("startup exceptions are reported before any model response", async () => {
  const result = await runChild([], async () => { throw new Error("Provider configuration could not load"); });
  assert.equal(result.details.stopReason, "error");
  assert.match(result.details.error, /Provider configuration could not load/);
});

test("unexplained shutdown is a failure, not cancellation", async () => {
  const result = await runChild(["session_shutdown"], async () => ({ ok: true }));
  assert.equal(result.details.stopReason, "error");
  assert.match(result.details.error, /Startup or prompt preparation failed/);
});

test("genuine model cancellation stays aborted", async () => {
  const result = await runChild(["message_end", "agent_end", "session_shutdown"], async () => ({ ok: true }));
  assert.equal(result.details.stopReason, "aborted");
  assert.equal(result.details.error, "Subagent was aborted.");
});
