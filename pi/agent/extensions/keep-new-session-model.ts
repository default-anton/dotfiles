import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-ai";

type Selection = {
  provider: string;
  modelId: string;
  thinkingLevel: ThinkingLevel;
};

let pendingSelection: Selection | undefined;

export default function keepNewSessionModel(pi: ExtensionAPI) {
  pi.on("session_before_switch", (event, ctx) => {
    pendingSelection =
      event.reason === "new" && ctx.model
        ? {
            provider: ctx.model.provider,
            modelId: ctx.model.id,
            thinkingLevel: pi.getThinkingLevel(),
          }
        : undefined;
  });

  pi.on("session_start", async (event, ctx) => {
    const selection = pendingSelection;
    pendingSelection = undefined;
    if (event.reason !== "new" || !selection) return;

    const model = ctx.modelRegistry.find(selection.provider, selection.modelId);
    if (!model || !(await pi.setModel(model))) {
      ctx.ui.notify(
        `Could not carry model ${selection.provider}/${selection.modelId} into the new session`,
        "warning",
      );
      return;
    }

    pi.setThinkingLevel(selection.thinkingLevel);
  });
}
