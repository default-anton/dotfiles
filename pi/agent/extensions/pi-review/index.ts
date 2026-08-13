import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";

import { buildReviewMessage } from "./prompt.js";
import { sendMessageInNewBranch } from "./lib/child-session.js";
import {
  extractConversation,
  extractLatestAssistantText,
  formatConversation,
} from "./lib/conversation-context.js";
const REVIEW_METADATA_TYPE = "pi-review";

type ReviewMetadata = {
  kind: "review";
  reviewedLeafId: string;
};

function isReviewMetadata(data: unknown): data is ReviewMetadata {
  return (
    !!data &&
    typeof data === "object" &&
    "kind" in data &&
    data.kind === "review" &&
    "reviewedLeafId" in data &&
    typeof data.reviewedLeafId === "string"
  );
}

function findReviewMetadata(branch: SessionEntry[]): ReviewMetadata | undefined {
  for (const entry of [...branch].reverse()) {
    if (entry.type !== "custom" || entry.customType !== REVIEW_METADATA_TYPE) continue;
    if (isReviewMetadata(entry.data)) return entry.data;
  }

  return undefined;
}

function buildReviewBackEditorText(reviewReport: string): string {
  return [
    "<review_findings>",
    reviewReport.trim(),
    "</review_findings>",
  ].join("\n");
}

export default function reviewExtension(pi: ExtensionAPI) {
  pi.registerCommand("review", {
    description: "Review current work in new branch (optional focus text)",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        await ctx.waitForIdle();
      }

      const branch = ctx.sessionManager.getBranch();
      const reviewedLeafId = ctx.sessionManager.getLeafId();
      const extractedConversation = extractConversation(branch);
      const conversationXml =
        extractedConversation.length === 0 ? undefined : formatConversation(extractedConversation);
      const reviewMessage = buildReviewMessage(args, conversationXml);

      const started = await sendMessageInNewBranch(pi, ctx, branch, reviewMessage, "review", () => {
        if (!reviewedLeafId) return;
        pi.appendEntry(REVIEW_METADATA_TYPE, { kind: "review", reviewedLeafId });
      });
      if (!started) return;

      if (ctx.hasUI) {
        ctx.ui.setEditorText("");
      }
    },
  });

  pi.registerCommand("review-back", {
    description: "Return to reviewed branch with review findings in the editor",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        await ctx.waitForIdle();
      }

      if (!ctx.hasUI) return;

      const branch = ctx.sessionManager.getBranch();
      const metadata = findReviewMetadata(branch);
      if (!metadata) {
        ctx.ui.notify("No review branch metadata found", "warning");
        return;
      }

      const reviewReport = extractLatestAssistantText(branch);
      if (!reviewReport) {
        ctx.ui.notify("No assistant review report found", "warning");
        return;
      }

      const result = await ctx.navigateTree(metadata.reviewedLeafId, { summarize: false });
      if (result.cancelled) {
        ctx.ui.notify("Return to reviewed branch cancelled", "info");
        return;
      }

      ctx.ui.setEditorText(buildReviewBackEditorText(reviewReport));
      ctx.ui.notify("Returned to reviewed branch", "info");
    },
  });
}
