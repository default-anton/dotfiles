import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type ThinkingLevel = ReturnType<ExtensionAPI["getThinkingLevel"]>;
type CycleThinkingLevel = Extract<ThinkingLevel, "low" | "medium" | "high">;

const SHORTCUT = "shift+tab";

function getNextThinkingLevel(current: ThinkingLevel): CycleThinkingLevel {
  if (current === "low") return "medium";
  if (current === "medium") return "high";
  if (current === "high") return "low";
  return "low";
}

function cycleThinkingLevel(pi: ExtensionAPI, ctx: ExtensionContext): void {
  const next = getNextThinkingLevel(pi.getThinkingLevel());
  pi.setThinkingLevel(next);
  ctx.ui.notify(`Thinking level: ${next}`, "info");
}

export default function thinkingLowMediumHighExtension(pi: ExtensionAPI) {
  pi.registerShortcut(SHORTCUT, {
    description: "Cycle thinking level between low, medium, and high",
    handler: async (ctx) => {
      cycleThinkingLevel(pi, ctx);
    },
  });
}
