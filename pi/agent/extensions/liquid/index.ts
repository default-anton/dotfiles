import { createProvider, envApiKeyAuth, type ClassifierModel } from "@earendil-works/pi-ai";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const D1_MODEL: ClassifierModel<"typesafe-system-one"> = {
	type: "classifier",
	provider: "liquid",
	id: "d1",
	name: "Liquid d1",
	api: "typesafe-system-one",
	baseUrl: "https://api.liquid.ai/decisions/v1/",
	input: ["text"],
	contextWindow: 65536,
	cost: { input: 0.04, output: 0, cacheRead: 0, cacheWrite: 0 },
};

export default function liquidExtension(pi: ExtensionAPI) {
	const classify = builtinProviders().find((provider) => provider.id === "typesafe")?.classify;
	if (!classify) throw new Error("This Pi version does not include the TypeSafe classifier implementation.");

	pi.registerProvider(createProvider({
		id: "liquid",
		name: "Liquid AI",
		auth: {
			apiKey: envApiKeyAuth("Liquid AI API key", ["LIQUID_API_KEY"]),
		},
		models: [D1_MODEL],
		classifiers: {
			"typesafe-system-one": { classify },
		},
	}));
}
