const TOOL_NAME = "apply_patch";
const OPENAI_PROVIDERS = new Set(["openai", "openai-codex"]);
const OPENAI_RESPONSES_APIS = new Set(["openai-responses", "openai-codex-responses"]);

type ModelInfo = {
  provider: string;
  api: string;
  compat?: unknown;
};

export function supportsApplyPatch(model: ModelInfo | null | undefined): boolean {
  if (!model) return false;
  const compat = model.compat as { supportsOpenAIGrammarTools?: boolean } | undefined;
  return OPENAI_PROVIDERS.has(model.provider) &&
    OPENAI_RESPONSES_APIS.has(model.api) &&
    compat?.supportsOpenAIGrammarTools === true;
}

export function createApplyPatchAvailability(
  getActiveTools: () => string[],
  setActiveTools: (names: string[]) => void,
) {
  let hiddenForUnsupportedModel = false;
  let restoreForOpenAI = false;

  function sync(model: ModelInfo | null | undefined): void {
    const activeTools = getActiveTools();
    const isActive = activeTools.includes(TOOL_NAME);

    if (supportsApplyPatch(model)) {
      if (hiddenForUnsupportedModel && restoreForOpenAI && !isActive) {
        setActiveTools([...activeTools, TOOL_NAME]);
      }
      hiddenForUnsupportedModel = false;
      restoreForOpenAI = false;
      return;
    }

    if (!hiddenForUnsupportedModel) {
      restoreForOpenAI = isActive;
      hiddenForUnsupportedModel = true;
    } else if (isActive) {
      restoreForOpenAI = true;
    }
    if (isActive) {
      setActiveTools(activeTools.filter((name) => name !== TOOL_NAME));
    }
  }

  function initialize(model: ModelInfo | null | undefined): void {
    hiddenForUnsupportedModel = false;
    restoreForOpenAI = false;
    sync(model);
  }

  return { initialize, sync };
}
