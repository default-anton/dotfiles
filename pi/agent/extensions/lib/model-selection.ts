export type AvailableModel = {
  provider: string;
  id: string;
};

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

export class ModelSelectionError extends Error {
  readonly reason: "missing-provider" | "ambiguous" | "unavailable";

  constructor(
    reason: "missing-provider" | "ambiguous" | "unavailable",
    message: string,
  ) {
    super(message);
    this.reason = reason;
  }
}

export function resolveModelSelection<T extends AvailableModel>(input: {
  reference: string;
  currentProvider?: string;
  availableModels: T[];
  inheritedThinkingLevel: string;
}): { model: T; reference: string; thinkingLevel: string } {
  const requested = input.reference.trim();

  const match = (reference: string): T | undefined => {
    const canonicalReference = reference.includes("/")
      ? reference
      : input.currentProvider
        ? `${input.currentProvider}/${reference}`
        : undefined;
    if (!canonicalReference) {
      throw new ModelSelectionError(
        "missing-provider",
        `Model "${requested}" does not include a provider and there is no current provider to inherit.`,
      );
    }

    const normalized = canonicalReference.toLowerCase();
    const matches = input.availableModels.filter(
      (model) => `${model.provider}/${model.id}`.toLowerCase() === normalized,
    );
    if (matches.length > 1) {
      throw new ModelSelectionError(
        "ambiguous",
        `Model "${reference}" is ambiguous: ${matches.map((model) => `${model.provider}/${model.id}`).join(", ")}.`,
      );
    }
    return matches[0];
  };

  let model = match(requested);
  let thinkingLevel = input.inheritedThinkingLevel;
  if (!model) {
    const separator = requested.lastIndexOf(":");
    const suffix = requested.slice(separator + 1);
    if (separator !== -1 && THINKING_LEVELS.has(suffix)) {
      model = match(requested.slice(0, separator));
      thinkingLevel = suffix;
    }
  }

  if (!model) {
    throw new ModelSelectionError("unavailable", `Model "${requested}" is not available.`);
  }

  return {
    model,
    reference: `${model.provider}/${model.id}`,
    thinkingLevel,
  };
}
