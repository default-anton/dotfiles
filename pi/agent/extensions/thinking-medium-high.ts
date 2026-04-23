import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type ThinkingLevel = ReturnType<ExtensionAPI["getThinkingLevel"]>;
type CycleThinkingLevel = Extract<ThinkingLevel, "medium" | "high">;

const SHORTCUT = "shift+tab";

function getNextThinkingLevel(current: ThinkingLevel): CycleThinkingLevel {
  if (current === "medium") return "high";
  if (current === "high") return "medium";
  return "medium";
}

function cycleThinkingLevel(pi: ExtensionAPI, ctx: ExtensionContext): void {
  const next = getNextThinkingLevel(pi.getThinkingLevel());
  pi.setThinkingLevel(next);
  ctx.ui.notify(`Thinking level: ${next}`, "info");
}

export default function thinkingMediumHighExtension(pi: ExtensionAPI) {
  pi.registerShortcut(SHORTCUT, {
    description: "Cycle thinking level between medium and high",
    handler: async (ctx) => {
      cycleThinkingLevel(pi, ctx);
    },
  });
}
