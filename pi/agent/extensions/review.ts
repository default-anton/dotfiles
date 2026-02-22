import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { sendMessageInChildSession } from "./lib/child-session.ts";
import { extractConversation, formatConversation } from "./lib/conversation-context.ts";

const REVIEW_HAT_INSTRUCTION =
  "Put your technical co-founder/staff engineer/strict maintainer hat on. You know what to look for.";

function buildReviewInstruction(args: string, hasConversationContext: boolean): string {
  const focusText = args.trim();
  if (!focusText) {
    return `Review these changes. ${REVIEW_HAT_INSTRUCTION}`;
  }

  if (hasConversationContext) {
    return `Review these changes. ${REVIEW_HAT_INSTRUCTION} ${focusText}`;
  }

  return `Review ${focusText}. ${REVIEW_HAT_INSTRUCTION}`;
}

function buildReviewMessage(args: string, conversationMarkdown?: string): string {
  const reviewInstruction = buildReviewInstruction(args, Boolean(conversationMarkdown));
  if (!conversationMarkdown) {
    return reviewInstruction;
  }

  return [
    "Conversation context copied from the previous session (user + assistant messages only; thinking and tool calls removed):",
    "",
    "````markdown",
    conversationMarkdown,
    "````",
    "",
    reviewInstruction,
  ].join("\n");
}

export default function reviewExtension(pi: ExtensionAPI) {
  pi.registerCommand("review", {
    description: "Review this thread in child session (optional focus text)",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        await ctx.waitForIdle();
      }

      const extractedConversation = extractConversation(ctx.sessionManager.getBranch());
      const conversationMarkdown =
        extractedConversation.length === 0 ? undefined : formatConversation(extractedConversation);
      const reviewMessage = buildReviewMessage(args, conversationMarkdown);
      await sendMessageInChildSession(pi, ctx, reviewMessage, "review");
    },
  });
}
