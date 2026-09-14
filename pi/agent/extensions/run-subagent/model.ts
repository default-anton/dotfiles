export type ChildModel = {
  provider: string;
  id: string;
  name?: string;
  contextWindow?: number;
  usingSubscription?: boolean;
};

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

export function resolveChildModel(input: {
  model?: string;
  currentModel?: ChildModel;
  availableModels?: ChildModel[];
  thinkingLevel: string;
}): { model: ChildModel; reference: string; thinkingLevel?: string } {
  const requested = input.model?.trim();
  if (!requested) {
    if (!input.currentModel) {
      throw new Error("run_subagent could not determine the current model. Pass model explicitly or select a model before delegating.");
    }
    return {
      model: input.currentModel,
      reference: `${input.currentModel.provider}/${input.currentModel.id}`,
      thinkingLevel: input.thinkingLevel,
    };
  }

  const models = input.availableModels ?? [];
  const match = (reference: string): ChildModel | undefined => {
    const normalized = reference.toLowerCase();
    const canonical = models.filter((model) => `${model.provider}/${model.id}`.toLowerCase() === normalized);
    const matches = canonical.length || reference.includes("/")
      ? canonical
      : models.filter((model) => model.id.toLowerCase() === normalized);
    if (matches.length > 1) {
      throw new Error(`Ambiguous subagent model "${reference}". Use one of: ${matches.map((model) => `${model.provider}/${model.id}`).join(", ")}.`);
    }
    return matches[0];
  };

  let model = match(requested);
  let thinkingLevel: string | undefined;
  if (!model) {
    const separator = requested.lastIndexOf(":");
    const suffix = requested.slice(separator + 1);
    if (separator !== -1 && THINKING_LEVELS.has(suffix)) {
      model = match(requested.slice(0, separator));
      thinkingLevel = suffix;
    }
  }
  if (!model) {
    throw new Error(`Subagent model "${requested}" is not available. Use an exact provider/model ID from /model and configure that provider's credentials. Fuzzy model overrides are not supported.`);
  }
  return { model, reference: `${model.provider}/${model.id}`, thinkingLevel };
}
