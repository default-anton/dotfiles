/**
 * Handoff extension - generate context handoff and move it to a new session
 *
 * Usage:
 *   /handoff now implement this for teams as well
 *   /handoff execute phase one of the plan
 *   /handoff check other places that need this fix
 */

import type { ExtensionAPI, SessionEntry } from "@mariozechner/pi-coding-agent";

const HANDOFF_INSTRUCTIONS = `You are writing a handoff note for another AI agent with NO access to this chat.

Extract only task-relevant context from this conversation.

Rules:
- Be tight and token-efficient.
- Use only concrete facts from this conversation.
- Prefer specifics: file paths, symbols, commands, errors, outputs, decisions.
- Include constraints/invariants only when explicit, non-negotiable, and task-relevant.
- Include line numbers only if known from this conversation.
- Omit irrelevant history and broad retrospectives.
- Do not invent missing details.
- If a critical detail is unknown, say so briefly and include the smallest verification step.
- Do not write a plan unless one already exists in this conversation.
- Do not call tools.

Output:
- Markdown only.
- Handoff context only (do not restate the task).`;

function getAssistantText(entries: SessionEntry[], fromIndex: number): string | null {
  for (let i = entries.length - 1; i >= fromIndex; i--) {
    const entry = entries[i];
    if (entry.type !== "message") {
      continue;
    }

    const message = entry.message;
    if (!("role" in message) || message.role !== "assistant") {
      continue;
    }

    if (message.stopReason !== "stop") {
      return null;
    }

    const text = message.content
      .filter((content): content is { type: "text"; text: string } => content.type === "text")
      .map((content) => content.text)
      .join("\n")
      .trim();

    if (text.length > 0) {
      return text;
    }
  }

  return null;
}

export default function(pi: ExtensionAPI) {
  pi.registerCommand("handoff", {
    description: "Transfer context to a new focused session",
    handler: async (args, ctx) => {
      const notify = (message: string, level: "info" | "warning" | "error") => {
        ctx.ui?.notify?.(message, level);
      };

      if (!ctx.model) {
        notify("No model selected", "error");
        return;
      }

      const task = args.trim();
      if (!task) {
        notify("Usage: /handoff <goal or task for new thread>", "error");
        return;
      }

      const currentSessionFile = ctx.sessionManager.getSessionFile();
      const branchBefore = ctx.sessionManager.getBranch();
      const startIndex = branchBefore.length;

      const handoffRequest = `${HANDOFF_INSTRUCTIONS}\n\nTask for the next agent:\n${task}`;

      if (ctx.isIdle()) {
        pi.sendUserMessage(handoffRequest);
      } else {
        pi.sendUserMessage(handoffRequest, { deliverAs: "followUp" });
      }

      notify("Generating handoff note...", "info");
      // Yield one tick so sendUserMessage can enqueue before waitForIdle observes state.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await ctx.waitForIdle();

      const branchAfter = ctx.sessionManager.getBranch();
      const handoffNote = getAssistantText(branchAfter, startIndex);

      if (!handoffNote) {
        notify("Failed to capture handoff note from the assistant response", "error");
        return;
      }

      const newSessionResult = await ctx.newSession({
        parentSession: currentSessionFile,
      });

      if (newSessionResult.cancelled) {
        notify("New session cancelled", "info");
        return;
      }

      const promptForNewSession = `${handoffNote}\n\n---\n\n## Task\n${task}`;

      if (ctx.ui?.setEditorText) {
        ctx.ui.setEditorText(promptForNewSession);
        notify("Handoff ready in new session. Submit when ready.", "info");
      } else if (ctx.isIdle()) {
        pi.sendUserMessage(promptForNewSession);
      } else {
        pi.sendUserMessage(promptForNewSession, { deliverAs: "followUp" });
      }
    },
  });
}
