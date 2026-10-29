import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-ai";

const provider = "openai-codex";
const modelCycle: { modelId: string; thinkingLevel: ThinkingLevel }[] = [
  { modelId: "gpt-6.1-terra", thinkingLevel: "high" },
  { modelId: "gpt-6.1-sol", thinkingLevel: "high" },
  { modelId: "gpt-6-astra", thinkingLevel: "medium" },
  { modelId: "gpt-6-astra", thinkingLevel: "high" },
];

export default function modelCycleExtension(pi: ExtensionAPI) {
  let switching = false;

  pi.registerShortcut("shift+tab", {
    description: "Cycle model and thinking level",
    handler: async (ctx) => {
      if (switching || modelCycle.length === 0) return;
      switching = true;

      try {
        const currentIndex = modelCycle.findIndex(
          (entry) =>
            ctx.model?.provider === provider &&
            ctx.model.id === entry.modelId &&
            pi.getThinkingLevel() === entry.thinkingLevel,
        );
        const next = modelCycle[(currentIndex + 1) % modelCycle.length];
        const model = ctx.modelRegistry.find(provider, next.modelId);
        if (!model) {
          ctx.ui.notify(`Model not found: ${provider}/${next.modelId}`, "error");
          return;
        }
        if (!(await pi.setModel(model))) {
          ctx.ui.notify(`No credentials for ${provider}/${next.modelId}`, "error");
          return;
        }

        pi.setThinkingLevel(next.thinkingLevel);
        ctx.ui.notify(`${next.modelId}:${pi.getThinkingLevel()}`, "info");
      } catch (error) {
        ctx.ui.notify(`Could not cycle model: ${String(error)}`, "error");
      } finally {
        switching = false;
      }
    },
  });
}
