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
import type { ExtensionAPI, SessionEntry } from "@mariozechner/pi-coding-agent";
import { BorderedLoader, convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";

const HANDOFF_SYSTEM_PROMPT = `You are a strategic context transfer assistant. Your goal is to move the current work into a new, focused thread.

Extract and summarize the "high-signal" context:
1. **Goal & Current State**: What was the initial goal, and what is the current state/progress?
2. **Key Decisions & Rationale**: What architectural or implementation choices were made? Why? (e.g., "Used X over Y because of Z").
3. **Invariants & Constraints**: What must remain true? What should the next agent avoid?
4. **Relevant Artifacts**: List exact file paths that were modified or are central to the next task, plus why they matter.
5. **Next Task**: A clear, actionable set of instructions based on the user's goal.

## Strategic Guidelines:
- **Be Concise**: Avoid generic summaries. Focus on what's non-obvious.
- **Self-Contained**: The generated prompt must allow the next session to be 100% productive without looking back.
- **High Momentum**: Structure the "Next Task" so the agent can start executing immediately.

Format your response as a prompt the user can send to start the new thread. Use Markdown. No preamble.

Example output structure:
# Goal
[Goal for this work]

# Current State
- [What was implemented/investigated]
- [What remains / what's currently failing]

# Decisions & Rationale / Constraints / Invariants
- Decision: [X] over [Y] because [Reason]
- Constraint/Invariant: [Must remain true]
- Avoid: [Pitfalls / things not to refactor]

# Files & Why
- \`path/to/file.ts\` — [What changed / why it matters]

# Next Task: [Goal]
[Clear, actionable instructions that can be executed immediately]`;

export default function(pi: ExtensionAPI) {
  pi.registerCommand("handoff", {
    description: "Transfer context to a new focused session",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("handoff requires interactive mode", "error");
        return;
      }

      if (!ctx.model) {
        ctx.ui.notify("No model selected", "error");
        return;
      }

      const goal = args.trim();
      if (!goal) {
        ctx.ui.notify("Usage: /handoff <goal for new thread>", "error");
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

      // Generate the handoff prompt with loader UI
      const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
        const loader = new BorderedLoader(tui, theme, `Generating handoff prompt...`);
        loader.onAbort = () => done(null);

        const doGenerate = async () => {
          const apiKey = await ctx.modelRegistry.getApiKey(ctx.model!);

          const userMessage: Message = {
            role: "user",
            content: [
              {
                type: "text",
                text: `## Conversation History\n\n${conversationText}\n\n## User's Goal for New Thread\n\n${goal}`,
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
            console.error("Handoff generation failed:", err);
            done(null);
          });

        return loader;
      });

      if (result === null) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }

      // Let user edit the generated prompt
      const editedPrompt = await ctx.ui.editor("Edit handoff prompt", result);

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
