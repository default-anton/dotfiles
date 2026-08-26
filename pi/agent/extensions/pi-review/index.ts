import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { buildReviewMessages } from "./prompt.js";
import { sendMessageInNewBranch } from "./lib/child-session.js";
import { extractConversation, formatConversation } from "./lib/conversation-context.js";

export default function reviewExtension(pi: ExtensionAPI) {
  let pendingReview:
    | {
        contextMessage: string;
        followUpMessages: string[];
      }
    | undefined;

  pi.on("input", (event) => {
    if (!pendingReview) return;
    if (event.source === "extension" && event.text === pendingReview.contextMessage) return;

    pendingReview = undefined;
  });

  pi.on("agent_start", () => {
    if (!pendingReview) return;

    const { followUpMessages } = pendingReview;
    pendingReview = undefined;

    // Pi's default one-at-a-time follow-up mode turns each phase into a separate turn.
    for (const message of followUpMessages) {
      pi.sendUserMessage(message, { deliverAs: "followUp" });
    }
  });

  pi.registerCommand("review", {
    description: "Review current work in new branch (optional focus text)",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        await ctx.waitForIdle();
      }

      const branch = ctx.sessionManager.getBranch();
      const extractedConversation = extractConversation(branch);
      const conversationXml =
        extractedConversation.length === 0 ? undefined : formatConversation(extractedConversation);
      const [contextMessage, ...followUpMessages] = buildReviewMessages(args, conversationXml);

      const started = await sendMessageInNewBranch(
        pi,
        ctx,
        branch,
        contextMessage,
        "review",
        () => {
          pendingReview = { contextMessage, followUpMessages };
        },
      );
      if (!started) return;

      if (ctx.hasUI) {
        ctx.ui.setEditorText("");
      }
    },
  });
}
