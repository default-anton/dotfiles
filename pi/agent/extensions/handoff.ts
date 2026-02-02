/**
 * Handoff extension - transfer context to a new focused session
 *
 * Instead of compacting (which is lossy), handoff extracts what matters
 * for your next task and creates a new session with a generated prompt.
 *
 * Usage:
 *   /handoff now implement this for teams as well
 *   /handoff execute phase one of the plan
 *   /handoff check other places that need this fix
 *
 * The generated prompt appears as a draft in the editor for review/editing.
 */

import { complete, type Message } from "@mariozechner/pi-ai";
import type { ExtensionAPI, SessionEntry, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { BorderedLoader, convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";

const HANDOFF_SYSTEM_PROMPT = `You are Handoff. Your purpose is to extract the highest-signal context from the current conversation, tailored to the user's next task.

Input you will receive:
- The full conversation history from the current session
- The user's stated next task for the new thread

Your job:
- Write a concise handoff note: what the current thread was doing, what happened, and the specific details from it that matter for the user's next task.
- Do NOT generate a new plan or new ideas. Only capture what was decided, tried, observed, or agreed in the conversation.
- The note should be usable as the first message in a new session without re-reading the old thread.

Hard rules:
- Do not produce a generic summary; include only material relevant to the user's next task.
- Do not invent details that are not in the conversation.
- Prefer concrete specifics: exact file paths, symbols, commands, error messages, outputs.
- If an important detail is unknown/uncertain, say so and list the smallest check/question to confirm.
- IMPORTANT: Do NOT rephrase the user's stated next task. Include it verbatim at the bottom.

Output requirements:
- Markdown only.
- No preamble.
- Use the following section headers exactly and in this order.

# Previous Thread (What We Were Doing)
- Original goal/intent of this conversation
- Scope boundaries (what we explicitly did not do)

# Previous Thread Status
- What was completed/changed
- What is still unresolved or failing (include exact errors if present)

# Key Decisions / Findings
- Decisions made (include rationale if it exists in the conversation)
- Findings/observations that changed direction
- Approaches attempted and outcomes (what worked/didn't)

# Relevant Details for the Next Task
- Explicitly call out the subset of details above that directly matter for the user's next task

# Constraints / Invariants
- Must remain true
- Avoid / do not change

# Files / Artifacts / Commands
- \`path/to/file\` — why it matters (touched, central, or needs follow-up)
- Relevant commands/scripts used (and where they were run), if mentioned

# Open Questions / Risks
- Unknowns, risks, edge cases, and the smallest check to resolve each

# User Task
(Paste the user's stated next task exactly as provided.)`;

export default function(pi: ExtensionAPI) {
  pi.registerCommand("handoff", {
    description: "Transfer context to a new focused session",
    handler: async (args, ctx: ExtensionContext) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("handoff requires interactive mode", "error");
        return;
      }

      if (!ctx.model) {
        ctx.ui.notify("No model selected", "error");
        return;
      }

      const task = args.trim();
      if (!task) {
        ctx.ui.notify("Usage: /handoff <task for new thread>", "error");
        return;
      }

      // Gather conversation context from current branch
      const branch = ctx.sessionManager.getBranch();
      const messages = branch
        .filter((entry): entry is SessionEntry & { type: "message" } => entry.type === "message")
        .map((entry) => entry.message);

      if (messages.length === 0) {
        ctx.ui.notify("No conversation to hand off", "error");
        return;
      }

      // Convert to LLM format and serialize
      const llmMessages = convertToLlm(messages);
      const conversationText = serializeConversation(llmMessages);
      const currentSessionFile = ctx.sessionManager.getSessionFile();

      let generationError: string | null = null;

      // Generate the handoff note with loader UI
      const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
        const loader = new BorderedLoader(tui, theme, `Generating handoff note...`);
        loader.onAbort = () => done(null);

        const doGenerate = async () => {
          const apiKey = await ctx.modelRegistry.getApiKey(ctx.model!);

          const userMessage: Message = {
            role: "user",
            content: [
              {
                type: "text",
                text: `## Conversation History\n\n${conversationText}\n\n## User's Task for New Thread\n\n${task}`,
              },
            ],
            timestamp: Date.now(),
          };

          const response = await complete(
            ctx.model!,
            { systemPrompt: HANDOFF_SYSTEM_PROMPT, messages: [userMessage] },
            { apiKey, signal: loader.signal },
          );

          if (response.stopReason === "aborted") {
            return null;
          }

          return response.content
            .filter((c): c is { type: "text"; text: string } => c.type === "text")
            .map((c) => c.text)
            .join("\n");
        };

        doGenerate()
          .then(done)
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            generationError = `Handoff generation failed: ${msg}`;
            done(null);
          });

        return loader;
      });

      if (result === null) {
        if (generationError) {
          ctx.ui.notify(generationError, "error");
          return;
        }

        ctx.ui.notify("Cancelled", "info");
        return;
      }

      // Let user edit the generated prompt
      const editedPrompt = await ctx.ui.editor("Edit handoff note", result);

      if (editedPrompt === undefined) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }

      // Create new session with parent tracking
      const newSessionResult = await ctx.newSession({
        parentSession: currentSessionFile,
      });

      if (newSessionResult.cancelled) {
        ctx.ui.notify("New session cancelled", "info");
        return;
      }

      // Set the edited prompt in the main editor for submission
      ctx.ui.setEditorText(editedPrompt);
      ctx.ui.notify("Handoff ready. Submit when ready.", "info");
    },
  });
}
