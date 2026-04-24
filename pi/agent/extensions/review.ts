import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const REVIEW_MODEL_ID = "gpt-5.5";
const REVIEW_THINKING_LEVEL = "high";

import { sendMessageInNewBranch } from "./lib/child-session.ts";
import { extractConversation, formatConversation } from "./lib/conversation-context.ts";

const REVIEW_INSTRUCTION = `Review the available work and context.
Put your strict maintainer hat on.
Find concrete, high-confidence, material issues introduced by the work or revealed by the additional context.
Focus on correctness, security, performance, operability, and maintainability.
Do not speculate; point to the affected behavior, invariant, or code path.
Prefer issues the author would likely fix before merge.
Assume existing interfaces and behavior should remain backward compatible unless the user or project instructions explicitly say otherwise.
If nothing material stands out, say \`looks good\`; otherwise return numbered sections for findings, sorted by priority.
Use [P0] for certain severe breakage, data loss, or security issues; [P1] for likely user-facing breakage or major regressions; [P2] for limited-scope correctness, performance, or maintainability issues; [P3] for minor but real issues.
For each finding, include a [P0]-[P3] tag, location, a concise summary, a concise explanation of the affected behavior, invariant, or code path, and \`Recommendation:\` with the top specific, actionable, brief fix or mitigation.`;

function buildReviewInstruction(args: string): string {
  const focusText = args.trim();
  if (!focusText) {
    return REVIEW_INSTRUCTION;
  }

  return [REVIEW_INSTRUCTION, "Additional review context:", focusText].join("\n\n");
}

function buildReviewMessage(args: string, conversationXml?: string): string {
  const reviewInstruction = buildReviewInstruction(args);
  if (!conversationXml) {
    return reviewInstruction;
  }

  return [
    "Conversation context copied from the current branch (user + assistant messages only; thinking and tool calls removed):",
    "",
    "````xml",
    conversationXml,
    "````",
    "",
    reviewInstruction,
  ].join("\n");
}

export default function reviewExtension(pi: ExtensionAPI) {
  pi.registerCommand("review", {
    description: "Review current work in new branch (optional focus text)",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        await ctx.waitForIdle();
      }

      const reviewModel = ctx.modelRegistry
        .getAvailable()
        .find((model) => model.id === REVIEW_MODEL_ID);
      if (!reviewModel) {
        if (ctx.hasUI) {
          ctx.ui.notify(`Cannot start review: model \`${REVIEW_MODEL_ID}\` is not available`, "warning");
        }
        return;
      }

      const modelSelected = await pi.setModel(reviewModel);
      if (!modelSelected) {
        if (ctx.hasUI) {
          ctx.ui.notify(`Cannot start review: failed to select model \`${REVIEW_MODEL_ID}\``, "warning");
        }
        return;
      }
      pi.setThinkingLevel(REVIEW_THINKING_LEVEL);

      const branch = ctx.sessionManager.getBranch();
      const extractedConversation = extractConversation(branch);
      const conversationXml =
        extractedConversation.length === 0 ? undefined : formatConversation(extractedConversation);
      const reviewMessage = buildReviewMessage(args, conversationXml);
      const started = await sendMessageInNewBranch(pi, ctx, branch, reviewMessage, "review");
      if (started && ctx.hasUI) {
        ctx.ui.setEditorText("");
      }
    },
  });
}
