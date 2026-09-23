import assert from "node:assert/strict";
import test from "node:test";
import keepNewSessionModel from "../keep-new-session-model.ts";

const selectedModel = { provider: "openai-codex", id: "gpt-6-sol" };

function loadExtension(actions: string[], model = selectedModel) {
  const handlers = new Map<
    string,
    (event: { reason: string }, ctx: unknown) => Promise<void> | void
  >();
  const pi = {
    on: (
      name: string,
      handler: (event: { reason: string }, ctx: unknown) => Promise<void> | void,
    ) => {
      handlers.set(name, handler);
    },
    getThinkingLevel: () => "high",
    setModel: async (chosen: unknown) => {
      assert.equal(chosen, model);
      actions.push("model");
      return true;
    },
    setThinkingLevel: (level: string) => {
      actions.push(`thinking:${level}`);
    },
  };
  keepNewSessionModel(pi as never);

  return {
    beforeSwitch: (reason: string) =>
      handlers.get("session_before_switch")!({ reason }, { model: selectedModel }),
    start: (reason: string) =>
      handlers.get("session_start")!(
        { reason },
        {
          modelRegistry: { find: () => model },
          ui: { notify: () => assert.fail("unexpected warning") },
        },
      ),
  };
}

test("a new session carries the model and thinking level across extension instances", async () => {
  const actions: string[] = [];
  await loadExtension(actions).beforeSwitch("new");
  await loadExtension(actions).start("new");

  assert.deepEqual(actions, ["model", "thinking:high"]);
});

test("resuming a session does not carry the previous selection", async () => {
  const actions: string[] = [];
  await loadExtension(actions).beforeSwitch("resume");
  await loadExtension(actions).start("resume");

  assert.deepEqual(actions, []);
});
