import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

export async function sendMessageInChildSession(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  message: string,
  sessionPurpose: string,
): Promise<boolean> {
  const parentSession = ctx.sessionManager.getSessionFile();
  const newSessionResult = parentSession
    ? await ctx.newSession({ parentSession })
    : await ctx.newSession();

  if (newSessionResult.cancelled) {
    if (ctx.hasUI) ctx.ui.notify(`New ${sessionPurpose} session cancelled`, "info");
    return false;
  }

  pi.sendUserMessage(message);
  if (ctx.hasUI) ctx.ui.notify(`Started ${sessionPurpose} session`, "info");
  return true;
}
