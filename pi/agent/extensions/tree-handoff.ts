import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";

const SEPARATOR = "\n\n---\n\n";

type PendingTreeHandoff = {
  selectedText?: string;
  assistantText: string;
};

type TextBlock = { type: "text"; text: string };

function isTextBlock(block: unknown): block is TextBlock {
  return (
    !!block &&
    typeof block === "object" &&
    (block as Partial<TextBlock>).type === "text" &&
    typeof (block as Partial<TextBlock>).text === "string"
  );
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content.map((block) => (isTextBlock(block) ? block.text : "")).join("\n").trim();
}

function getUserLikeText(entry: SessionEntry): string | undefined {
  if (entry.type === "message" && entry.message.role === "user") {
    return textFromContent(entry.message.content);
  }

  if (entry.type === "custom_message") {
    return textFromContent(entry.content);
  }

  return undefined;
}

function getLastAssistantText(branch: SessionEntry[]): string | undefined {
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry?.type !== "message") continue;
    if (entry.message.role !== "assistant") continue;

    const text = textFromContent(entry.message.content);
    if (text) return text;
  }

  return undefined;
}

export default function treeHandoffExtension(pi: ExtensionAPI) {
  let pending: PendingTreeHandoff | undefined;

  pi.on("session_before_tree", (event, ctx) => {
    pending = undefined;

    const { oldLeafId, targetId } = event.preparation;
    if (!oldLeafId) return;

    const oldBranch = ctx.sessionManager.getBranch(oldLeafId);
    const assistantText = getLastAssistantText(oldBranch);
    if (!assistantText) return;

    const targetEntry = ctx.sessionManager.getEntry(targetId);
    if (!targetEntry) return;

    const selectedText = getUserLikeText(targetEntry);
    pending = { selectedText, assistantText };
  });

  pi.on("session_tree", async (_event, ctx) => {
    const handoff = pending;
    pending = undefined;

    if (!handoff) return;

    const editorText = handoff.selectedText
      ? `${handoff.selectedText}${SEPARATOR}${handoff.assistantText}`
      : handoff.assistantText;

    const confirmed = await ctx.ui.confirm("Tree handoff", "Copy previous reply into editor?");
    if (!confirmed) return;

    ctx.ui.setEditorText(editorText);
  });

  pi.on("session_shutdown", () => {
    pending = undefined;
  });
}
