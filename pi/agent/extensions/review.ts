import type { ExtensionAPI, SessionEntry } from "@mariozechner/pi-coding-agent";

type ExtractedMessage = {
  role: "user" | "assistant";
  text: string;
};

type TextBlock = {
  type: "text";
  text: string;
};

const REVIEW_HAT_INSTRUCTION =
  "Put your technical co-founder/staff engineer/strict maintainer hat on. You know what to look for.";

function isTextBlock(block: unknown): block is TextBlock {
  return (
    !!block &&
    typeof block === "object" &&
    "type" in block &&
    block.type === "text" &&
    "text" in block &&
    typeof block.text === "string"
  );
}

function extractText(content: unknown, allowString: boolean): string {
  if (allowString && typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter(isTextBlock)
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function extractConversation(branch: SessionEntry[]): ExtractedMessage[] {
  const messages = branch
    .filter((entry): entry is SessionEntry & { type: "message" } => entry.type === "message")
    .map((entry) => entry.message);

  return messages.flatMap((message): ExtractedMessage[] => {
    if (message.role === "user") {
      const text = extractText(message.content, true);
      return text ? [{ role: "user", text }] : [];
    }

    if (message.role === "assistant") {
      const text = extractText(message.content, false);
      return text ? [{ role: "assistant", text }] : [];
    }

    return [];
  });
}

function formatConversation(messages: ExtractedMessage[]): string {
  return messages
    .map((message, index) => {
      const speaker = message.role === "user" ? "User" : "Assistant";
      return `### ${index + 1}. ${speaker}\n${message.text}`;
    })
    .join("\n\n");
}

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
      const parentSession = ctx.sessionManager.getSessionFile();
      const newSessionResult = parentSession
        ? await ctx.newSession({ parentSession })
        : await ctx.newSession();

      if (newSessionResult.cancelled) {
        if (ctx.hasUI) ctx.ui.notify("New review session cancelled", "info");
        return;
      }

      pi.sendUserMessage(reviewMessage);
      if (ctx.hasUI) ctx.ui.notify("Started review session", "info");
    },
  });
}
