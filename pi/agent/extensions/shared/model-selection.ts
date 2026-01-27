export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type SmallModelInfo = { provider: string; id: string; thinkingLevel: ThinkingLevel };

type ModelInfo = { provider: string; id: string };

const ANTIGRAVITY_GEMINI_FLASH: SmallModelInfo = { provider: "google-antigravity", id: "gemini-3-flash", thinkingLevel: "off" };
const VERTEX_GEMINI_FLASH: SmallModelInfo = { provider: "google-vertex", id: "gemini-3-flash-preview", thinkingLevel: "off" };
const GOOGLE_GEMINI_FLASH: SmallModelInfo = { provider: "google", id: "gemini-3-flash-preview", thinkingLevel: "off" };

export const SMALL_MODELS_FOR_PROVIDER: Record<string, SmallModelInfo> = {
  openai: VERTEX_GEMINI_FLASH,
  "google-antigravity": ANTIGRAVITY_GEMINI_FLASH,
  "google": GOOGLE_GEMINI_FLASH,
  "google-vertex": VERTEX_GEMINI_FLASH,
  zai: GOOGLE_GEMINI_FLASH,
  deepseek: GOOGLE_GEMINI_FLASH,
  moonshot: GOOGLE_GEMINI_FLASH,
};

export function getSmallModelFromProvider(
  currentProvider: string,
  modelRegistry: { getAvailable(): ModelInfo[] },
): ModelInfo | null {
  const smallModel = SMALL_MODELS_FOR_PROVIDER[currentProvider] ?? ZAI_GLM;
  const subModel = modelRegistry.getAvailable().find(
    (m) => m.provider === smallModel.provider && m.id === smallModel.id,
  );

  return subModel ?? null;
}
