import type {
  ExtensionAPI,
  ExtensionCommandContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";

function getEmptyBranchTargetId(branch: SessionEntry[]): string | undefined {
  for (const entry of branch) {
    if (entry.type === "custom_message") {
      return entry.id;
    }

    if (entry.type === "message" && entry.message.role === "user") {
      return entry.id;
    }
  }

  return undefined;
}

export async function sendMessageInNewBranch(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  branch: SessionEntry[],
  message: string,
  purpose: string,
  beforeSend?: () => void,
): Promise<boolean> {
  const targetId = getEmptyBranchTargetId(branch);
  if (targetId) {
    const result = await ctx.navigateTree(targetId, { summarize: false });
    if (result.cancelled) {
      if (ctx.hasUI) ctx.ui.notify(`New ${purpose} branch cancelled`, "info");
      return false;
    }
  }

  beforeSend?.();
  pi.sendUserMessage(message);

  if (ctx.hasUI) ctx.ui.notify(`Started ${purpose} branch`, "info");
  return true;
}
