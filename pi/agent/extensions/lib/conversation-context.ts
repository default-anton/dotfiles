import type { SessionEntry } from "@mariozechner/pi-coding-agent";

export type ExtractedMessage = {
  role: "user" | "assistant";
  text: string;
};

type TextBlock = {
  type: "text";
  text: string;
};

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

export function extractConversation(branch: SessionEntry[]): ExtractedMessage[] {
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

export function formatConversation(messages: ExtractedMessage[]): string {
  return messages
    .map((message, index) => {
      const speaker = message.role === "user" ? "User" : "Assistant";
      return `### ${index + 1}. ${speaker}\n${message.text}`;
    })
    .join("\n\n");
}
