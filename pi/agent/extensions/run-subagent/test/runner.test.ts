import assert from "node:assert/strict";
import test from "node:test";
import { runSpawnSubagent } from "../runner.ts";

test("parent cancellation returns aborted without opening a pane", async () => {
  const result = await runSpawnSubagent({
    instructions: "offline test",
    taskTitle: "cancelled task",
    parentSessionId: "test",
    cwd: process.cwd(),
    currentModel: { provider: "openai", id: "test" },
    thinkingLevel: "high",
    signal: AbortSignal.abort(),
  });
  assert.equal(result.details.stopReason, "aborted");
  assert.match(result.contentText, /Parent request was aborted before the subagent started/);
});
