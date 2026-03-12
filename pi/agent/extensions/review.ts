import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { sendMessageInChildSession } from "./lib/child-session.ts";
import { extractConversation, formatConversation } from "./lib/conversation-context.ts";

const REVIEW_INSTRUCTION = [
  "Review the available work and context.",
  "Put your strict maintainer hat on.",
  "Find concrete, high-confidence, material issues introduced by the work or revealed by the additional context.",
  "Focus on correctness, security, performance, operability, and maintainability.",
  "Do not speculate; point to the affected behavior, invariant, or code path.",
  "Prefer issues the author would likely fix before merge.",
  "Assume existing interfaces and behavior should remain backward compatible unless the user or project instructions explicitly say otherwise.",
  "If nothing material stands out, say `looks good`; otherwise return a numbered list of findings sorted by priority.",
  "For each finding, include a priority tag like [P1], [P2], or [P3], location, a concise summary, a concise explanation of the affected behavior, invariant, or code path, and `Recommendation:` with the top specific, actionable, brief fix or mitigation.",
].join(" ");

function buildReviewInstruction(args: string): string {
  const focusText = args.trim();
  if (!focusText) {
    return REVIEW_INSTRUCTION;
  }

  return [REVIEW_INSTRUCTION, "Additional review context:", focusText].join("\n\n");
}

function buildReviewMessage(args: string, conversationXml?: string): string {
  const reviewInstruction = buildReviewInstruction(args);
  if (!conversationXml) {
    return reviewInstruction;
  }

  return [
    "Conversation context copied from the previous session (user + assistant messages only; thinking and tool calls removed):",
    "",
    "````xml",
    conversationXml,
    "````",
    "",
    reviewInstruction,
  ].join("\n");
}

export default function reviewExtension(pi: ExtensionAPI) {
  pi.registerCommand("review", {
    description: "Review current work in child session (optional focus text)",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        await ctx.waitForIdle();
      }

      const extractedConversation = extractConversation(ctx.sessionManager.getBranch());
      const conversationXml =
        extractedConversation.length === 0 ? undefined : formatConversation(extractedConversation);
      const reviewMessage = buildReviewMessage(args, conversationXml);
      await sendMessageInChildSession(pi, ctx, reviewMessage, "review");
    },
  });
}
