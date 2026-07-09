import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type ThinkingLevel = ReturnType<ExtensionAPI["getThinkingLevel"]>;
type CycleThinkingLevel = Extract<ThinkingLevel, "medium" | "high" | "xhigh">;

const SHORTCUT = "shift+tab";

function getNextThinkingLevel(current: ThinkingLevel): CycleThinkingLevel {
  if (current === "medium") return "high";
  if (current === "high") return "xhigh";
  if (current === "xhigh") return "medium";
  return "medium";
}

function cycleThinkingLevel(pi: ExtensionAPI, ctx: ExtensionContext): void {
  const next = getNextThinkingLevel(pi.getThinkingLevel());
  pi.setThinkingLevel(next);
  ctx.ui.notify(`Thinking level: ${next}`, "info");
}

export default function thinkingMediumHighXhighExtension(pi: ExtensionAPI) {
  pi.registerShortcut(SHORTCUT, {
    description: "Cycle thinking level between medium, high, and xhigh",
    handler: async (ctx) => {
      cycleThinkingLevel(pi, ctx);
    },
  });
}
