import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { extractTaskFromConversation } from "./extract";
import { extractAssistantSummary } from "./summary";
import { buildReviewPrompt } from "./prompts";

export default function codeReviewWorkflowExtension(pi: ExtensionAPI) {
	// Register /review command
	pi.registerCommand("review", {
		description: "Start code review session for current work",
		handler: async (instructions, ctx) => {
			await ctx.waitForIdle();

			if (ctx.hasUI) {
        ctx.ui.notify("Extracting task and preparing review...", "info");
        ctx.ui.setStatus("review", "Preparing review...");
			}

			try {
				const entries = ctx.sessionManager.getEntries();
        if (ctx.hasUI) ctx.ui.setStatus("review", "Extracting task...");
				const task = await extractTaskFromConversation(entries, ctx);

				if (!task) {
          if (ctx.hasUI) {
            ctx.ui.notify("Failed to extract task from conversation", "error");
            ctx.ui.setStatus("review", undefined);
          }
					return;
				}

				// Extract assistant summary
				if (ctx.hasUI) ctx.ui.setStatus("review", "Extracting summary...");
				const summary = extractAssistantSummary(entries);

				if (!summary) {
          if (ctx.hasUI) {
            ctx.ui.notify("No assistant messages found in conversation", "error");
            ctx.ui.setStatus("review", undefined);
          }
					return;
				}

				// Build session name
				const taskSnippet = task.slice(0, 50).replace(/\n/g, " ");
				const sessionName = `Review: ${taskSnippet}...`;

				// Build review prompt
				const reviewPrompt = buildReviewPrompt(task, summary, instructions || undefined);

				// Create new session
        if (ctx.hasUI) ctx.ui.setStatus("review", "Creating review session...");
				const result = await ctx.newSession({
					parentSession: ctx.sessionManager.getSessionFile(),
				});

				if (result.cancelled) {
          if (ctx.hasUI) {
            ctx.ui.notify("Review session creation cancelled", "warning");
            ctx.ui.setStatus("review", undefined);
          }
					return;
				}

				// Set session name
				pi.setSessionName(sessionName);

				// Send the review prompt which triggers the agent turn
				pi.sendUserMessage(reviewPrompt);

        if (ctx.hasUI) {
          ctx.ui.notify(`Started review: ${sessionName}`, "success");
          ctx.ui.setStatus("review", undefined);
        }
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
        if (ctx.hasUI) {
          ctx.ui.notify(`Review failed: ${message}`, "error");
          ctx.ui.setStatus("review", undefined);
        }
			}
		},
	});
}
