import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { sendMessageInChildSession } from "./lib/child-session.ts";
import { extractConversation, formatConversation } from "./lib/conversation-context.ts";

const SIMPLIFY_INSTRUCTION =
  "Focus on clarity, consistency, and maintainability. Highlight concrete simplifications while preserving all behavior and intent.";

function buildSimplifyInstruction(args: string, hasConversationContext: boolean): string {
  const focusText = args.trim();
  if (!focusText) {
    return `Review these changes and provide a simplification assessment. ${SIMPLIFY_INSTRUCTION}`;
  }

  if (hasConversationContext) {
    return `Review these changes and provide a simplification assessment. ${SIMPLIFY_INSTRUCTION} ${focusText}`;
  }

  return `Review ${focusText} and provide a simplification assessment. ${SIMPLIFY_INSTRUCTION}`;
}

function buildSimplifyMessage(args: string, conversationMarkdown?: string): string {
  const simplifyInstruction = buildSimplifyInstruction(args, Boolean(conversationMarkdown));
  if (!conversationMarkdown) {
    return simplifyInstruction;
  }

  return [
    "Conversation context copied from the previous session (user + assistant messages only; thinking and tool calls removed):",
    "",
    "````markdown",
    conversationMarkdown,
    "````",
    "",
    simplifyInstruction,
  ].join("\n");
}

export default function simplifyExtension(pi: ExtensionAPI) {
  pi.registerCommand("simplify", {
    description: "Review simplification opportunities in child session (optional focus text)",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        await ctx.waitForIdle();
      }

      const extractedConversation = extractConversation(ctx.sessionManager.getBranch());
      const conversationMarkdown =
        extractedConversation.length === 0 ? undefined : formatConversation(extractedConversation);
      const simplifyMessage = buildSimplifyMessage(args, conversationMarkdown);
      await sendMessageInChildSession(pi, ctx, simplifyMessage, "simplify");
    },
  });
}
