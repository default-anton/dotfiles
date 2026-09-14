import assert from "node:assert/strict";
import test from "node:test";
import { resolveChildModel } from "../model.ts";

const openai = { provider: "openai", id: "gpt-5.6-luna" };
const router = { provider: "openrouter", id: "openai/gpt-5.6-luna:batch" };
const input = { availableModels: [openai, router], currentModel: openai, thinkingLevel: "medium" };

test("bare ID with thinking resolves exactly against authenticated models", () => {
  assert.deepEqual(resolveChildModel({ ...input, model: "gpt-5.6-luna:high" }), {
    model: openai, reference: "openai/gpt-5.6-luna", thinkingLevel: "high",
  });
});

test("explicit provider and inherited thinking are preserved", () => {
  assert.equal(resolveChildModel({ ...input, model: "openrouter/openai/gpt-5.6-luna:batch:high" }).reference,
    "openrouter/openai/gpt-5.6-luna:batch");
  assert.deepEqual(resolveChildModel(input), {
    model: openai, reference: "openai/gpt-5.6-luna", thinkingLevel: "medium",
  });
});

test("ambiguous bare IDs require a provider, not a fuzzy preference", () => {
  const availableModels = [openai, { ...openai, provider: "other" }];
  assert.throws(() => resolveChildModel({ ...input, availableModels, model: "gpt-5.6-luna:high" }), /Ambiguous.*openai\/gpt-5.6-luna.*other\/gpt-5.6-luna/);
  assert.equal(resolveChildModel({ ...input, availableModels, model: "other/gpt-5.6-luna:high" }).reference, "other/gpt-5.6-luna");
});

test("exact colon IDs take precedence over thinking suffixes", () => {
  const colon = { provider: "other", id: "model:high" };
  const availableModels = [colon, { provider: "other", id: "model" }];
  assert.deepEqual(resolveChildModel({ ...input, availableModels, model: "model:high" }), {
    model: colon, reference: "other/model:high", thinkingLevel: undefined,
  });
  assert.equal(resolveChildModel({ ...input, availableModels, model: "model:high:max" }).thinkingLevel, "max");
});

test("unknown providers, fuzzy names and invalid suffixes fail with guidance", () => {
  for (const model of ["missing/gpt-5.6-luna:high", "luna", "gpt-5.6-luna:invalid"]) {
    assert.throws(() => resolveChildModel({ ...input, model }), /not available.*provider\/model.*credentials/);
  }
});

test("provider references never fall back to another provider's slash-containing ID", () => {
  assert.throws(() => resolveChildModel({ ...input, availableModels: [
    { provider: "openrouter", id: "openai/gpt-5.6-luna" },
  ], model: "openai/gpt-5.6-luna:high" }), /not available/);
});
