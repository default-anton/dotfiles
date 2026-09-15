import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { selectTemplateModel } from "../prompt-model.ts";

const currentModel = { provider: "openai", id: "gpt-6-orbit" };
const selectedModel = { provider: "openai", id: "gpt-6-astra" };

async function runSelection(configuredModel: string, thinkingLevel: string) {
  const directory = mkdtempSync(join(tmpdir(), "pi-prompt-model-"));
  const filePath = join(directory, "prompt.md");
  writeFileSync(filePath, `---\nmodel: ${configuredModel}\n---\n`);

  let appliedModel;
  let appliedThinkingLevel;
  const pi = {
    getThinkingLevel: () => thinkingLevel,
    setModel: async (model: unknown) => {
      appliedModel = model;
      return true;
    },
    setThinkingLevel: (level: unknown) => {
      appliedThinkingLevel = level;
    },
  };
  const ctx = {
    model: currentModel,
    modelRegistry: {
      getAll: () => [currentModel, selectedModel],
    },
    ui: {
      notify: () => assert.fail("selection should not notify"),
    },
  };

  try {
    const result = await selectTemplateModel(pi as never, ctx as never, "test", filePath);
    return { result, appliedModel, appliedThinkingLevel };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("prompt models inherit the current provider and thinking level", async () => {
  assert.deepEqual(await runSelection("gpt-6-astra", "high"), {
    result: true,
    appliedModel: selectedModel,
    appliedThinkingLevel: "high",
  });
});

test("prompt model thinking overrides inherit the current provider", async () => {
  assert.deepEqual(await runSelection("gpt-6-astra:low", "high"), {
    result: true,
    appliedModel: selectedModel,
    appliedThinkingLevel: "low",
  });
});
