export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type SmallModelInfo = { provider: string; id: string; thinkingLevel: ThinkingLevel };

type ModelInfo = { provider: string; id: string };

const VERTEXAI_GEMINI_FLASH: SmallModelInfo = { provider: "google-vertex", id: "gemini-3-flash-preview", thinkingLevel: "low" };

const ZAI_GLM: SmallModelInfo = { provider: "zai", id: "glm-4.7", thinkingLevel: "high" };

const DEEPSEEK_CHAT: SmallModelInfo = { provider: "deepseek", id: "deepseek-chat", thinkingLevel: "off" };

export const SMALL_MODELS_FOR_PROVIDER: Record<string, SmallModelInfo> = {
	openai: VERTEXAI_GEMINI_FLASH,
	"google-vertex": VERTEXAI_GEMINI_FLASH,
	"google-antigravity": DEEPSEEK_CHAT,
	zai: DEEPSEEK_CHAT,
	deepseek: DEEPSEEK_CHAT,
};

export function getSmallModelFromProvider(
	currentProvider: string,
	modelRegistry: { getAvailable(): ModelInfo[] },
): ModelInfo | null {
	const smallModel = SMALL_MODELS_FOR_PROVIDER[currentProvider] ?? DEEPSEEK_CHAT;
	const subModel = modelRegistry.getAvailable().find(
		(m) => m.provider === smallModel.provider && m.id === smallModel.id,
	);

	return subModel ?? null;
}
