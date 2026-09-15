import {
  ModelSelectionError,
  resolveModelSelection,
} from "../lib/model-selection.ts";

export type ChildModel = {
  provider: string;
  id: string;
  name?: string;
  contextWindow?: number;
  usingSubscription?: boolean;
};

export function resolveChildModel(input: {
  model?: string;
  currentModel?: ChildModel;
  availableModels?: ChildModel[];
  thinkingLevel: string;
}): { model: ChildModel; reference: string; thinkingLevel: string } {
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

  try {
    return resolveModelSelection({
      reference: requested,
      currentProvider: input.currentModel?.provider,
      availableModels: input.availableModels ?? [],
      inheritedThinkingLevel: input.thinkingLevel,
    });
  } catch (error) {
    if (error instanceof ModelSelectionError && error.reason === "missing-provider") {
      throw new Error(`run_subagent could not determine the current provider for model "${requested}". Pass provider/model explicitly or select a model before delegating.`);
    }
    if (error instanceof ModelSelectionError && error.reason === "ambiguous") {
      throw new Error(`Ambiguous subagent model "${requested}". ${error.message}`);
    }
    throw new Error(`Subagent model "${requested}" is not available. Use an exact model ID for the current provider or an exact provider/model ID from /model, and configure that provider's credentials. Fuzzy model overrides are not supported.`);
  }
}
