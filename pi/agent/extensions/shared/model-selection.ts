export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type SmallModelInfo = { provider: string; id: string; thinkingLevel: ThinkingLevel };

type ModelInfo = { provider: string; id: string };

const VERTEXAI_GEMINI_FLASH: SmallModelInfo = { provider: "google-vertex", id: "gemini-3-flash-preview", thinkingLevel: "low" };

const ZAI_GLM: SmallModelInfo = { provider: "zai", id: "glm-4.7", thinkingLevel: "high" };

export const SMALL_MODELS_FOR_PROVIDER: Record<string, SmallModelInfo> = {
	openai: VERTEXAI_GEMINI_FLASH,
	"google-vertex": VERTEXAI_GEMINI_FLASH,
	"google-antigravity": ZAI_GLM,
	zai: ZAI_GLM,
	deepseek: ZAI_GLM,
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
