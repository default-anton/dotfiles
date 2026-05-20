import { copyToClipboard } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export default function copyConversationExtension(pi: ExtensionAPI) {
  const commandDefinition = {
    description: "Copy the entire conversation (user/assistant messages) to the clipboard",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      try {
        const branch = ctx.sessionManager.getBranch();
        if (!branch || branch.length === 0) {
          ctx.ui.notify("No conversation history found", "warning");
          return;
        }

        const formattedParts: string[] = [];

        for (const entry of branch) {
          if (entry.type === "compaction") {
            const summary = entry.summary?.trim();
            if (summary) {
              formattedParts.push(`> **System (Compaction Summary)**:\n> ${summary.replace(/\n/g, "\n> ")}`);
            }
          } else if (entry.type === "branch_summary") {
            const summary = entry.summary?.trim();
            if (summary) {
              formattedParts.push(`> **System (Branch Summary)**:\n> ${summary.replace(/\n/g, "\n> ")}`);
            }
          } else if (entry.type === "message" && entry.message) {
            const role = entry.message.role;
            if (role === "user" || role === "assistant") {
              const textContent = extractMessageText(entry.message.content);
              if (textContent) {
                const label = role === "user" ? "User" : "Assistant";
                formattedParts.push(`**${label}**:\n${textContent}`);
              }
            }
          }
        }

        if (formattedParts.length === 0) {
          ctx.ui.notify("No conversation messages found to copy", "warning");
          return;
        }

        const conversationText = formattedParts.join("\n\n").trim();
        await copyToClipboard(conversationText);
        ctx.ui.notify("Copied entire conversation to clipboard", "info");
      } catch (error: any) {
        ctx.ui.notify(`Failed to copy conversation: ${error?.message || error}`, "error");
      }
    },
  };

  pi.registerCommand("copy-all", commandDefinition);
  pi.registerCommand("copy-conversation", commandDefinition);
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") {
      continue;
    }

    const block = part as { type?: string; text?: string; thinking?: string };
    if (block.type === "text" && typeof block.text === "string") {
      const text = block.text.trim();
      if (text) {
        parts.push(text);
      }
    } else if (block.type === "thinking" && typeof block.thinking === "string") {
      const thinking = block.thinking.trim();
      if (thinking) {
        parts.push(`<think>\n${thinking}\n</think>`);
      }
    }
  }

  return parts.join("\n\n").trim();
}
