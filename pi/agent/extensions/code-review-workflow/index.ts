import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { extractTaskFromConversation } from "./extract";
import { extractAssistantSummary } from "./summary";
import { buildReviewPrompt, buildImplementPrompt } from "./prompts";

interface ReviewState {
	timestamp: number;
	task: string;
	summary: string;
	review?: string;
	originalSessionFile?: string;
}

const REVIEW_STATE_KEY = "crw:review-state";
const REVIEW_MODE_TOOLS = ["bash", "read", "finder", "gh_scout"];

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

				// Prepare review state
				const reviewState: ReviewState = {
					timestamp: Date.now(),
					task,
					summary,
					originalSessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
				};

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

				// Store review state in the NEW session
				pi.appendEntry(REVIEW_STATE_KEY, reviewState);

				// Set session name and read-only mode
				pi.setSessionName(sessionName);
				pi.setActiveTools(REVIEW_MODE_TOOLS);

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

	// Register /implement command
	pi.registerCommand("implement", {
		description: "Implement suggested improvements from review",
		handler: async (instructions, ctx) => {
			// Wait for agent to finish
			await ctx.waitForIdle();

			// Retrieve review state
			const reviewStateEntry = ctx.sessionManager
				.getEntries()
				.find(
					(e) => e.type === "custom" && e.customType === REVIEW_STATE_KEY,
				);

			if (!reviewStateEntry || !reviewStateEntry.data) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            "No review state found. Run /review first to generate review suggestions.",
            "error",
          );
        }
				return;
			}

			const reviewState = reviewStateEntry.data as ReviewState;

			// Get the review text from the current session's assistant messages
			const entries = ctx.sessionManager.getEntries();
			const review = extractAssistantSummary(entries);

			if (!review) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            "No review content found. Please run /review and complete the review first.",
            "error",
          );
        }
				return;
			}

      if (ctx.hasUI) {
        ctx.ui.notify("Preparing implementation session...", "info");
        ctx.ui.setStatus("implement", "Preparing implementation...");
      }

			try {
				// Update review state with the review text
				const updatedReviewState: ReviewState = {
					...reviewState,
					review,
				};
				pi.appendEntry(REVIEW_STATE_KEY, updatedReviewState);

				// Build session name
				const taskSnippet = reviewState.task.slice(0, 50).replace(/\n/g, " ");
				const sessionName = `Implement: ${taskSnippet}...`;

				// Build implementation prompt
				const implementPrompt = buildImplementPrompt(
					reviewState.task,
					reviewState.summary,
					review,
					instructions || undefined,
				);

				// Create new session
        if (ctx.hasUI) ctx.ui.setStatus("implement", "Creating implementation session...");
				const result = await ctx.newSession({
					parentSession: ctx.sessionManager.getSessionFile(),
				});

				if (result.cancelled) {
          if (ctx.hasUI) {
            ctx.ui.notify("Implementation session creation cancelled", "warning");
            ctx.ui.setStatus("implement", undefined);
          }
					return;
				}

				// Set session name and restore full tools
				pi.setSessionName(sessionName);
				// Restore all available tools
				const allToolNames = pi.getAllTools().map((t) => t.name);
				pi.setActiveTools(allToolNames);

				// Send the implementation prompt which triggers the agent turn
				pi.sendUserMessage(implementPrompt);

        if (ctx.hasUI) {
          ctx.ui.notify(`Started implementation: ${sessionName}`, "success");
          ctx.ui.setStatus("implement", undefined);
        }
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
        if (ctx.hasUI) {
          ctx.ui.notify(`Implementation failed: ${message}`, "error");
          ctx.ui.setStatus("implement", undefined);
        }
			}
		},
	});
}
