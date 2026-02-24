import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type TokenUsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
};

function isAssistantMessage(message: unknown): message is AssistantMessage {
  if (!message || typeof message !== "object") return false;

  const role = (message as { role?: unknown }).role;
  return role === "assistant";
}

function sumAssistantUsage(messages: readonly unknown[]): TokenUsageTotals {
  const totals: TokenUsageTotals = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  };

  for (const message of messages) {
    if (!isAssistantMessage(message)) continue;

    totals.input += message.usage?.input || 0;
    totals.output += message.usage?.output || 0;
    totals.cacheRead += message.usage?.cacheRead || 0;
    totals.cacheWrite += message.usage?.cacheWrite || 0;
    totals.total += message.usage?.totalTokens || 0;
  }

  return totals;
}

function buildTpsMessage(usage: TokenUsageTotals, elapsedSeconds: number): string {
  const tokensPerSecond = usage.output / elapsedSeconds;

  return `${tokensPerSecond.toFixed(1)} tok/s • ${elapsedSeconds.toFixed(1)}s`;
}

export default function tpsExtension(pi: ExtensionAPI) {
  let agentStartMs: number | null = null;

  pi.on("agent_start", () => {
    agentStartMs = Date.now();
  });

  pi.on("agent_end", (event, ctx) => {
    if (!ctx.hasUI || agentStartMs === null) return;

    const elapsedMs = Date.now() - agentStartMs;
    agentStartMs = null;
    if (elapsedMs <= 0) return;

    const totals = sumAssistantUsage(event.messages);
    if (totals.output <= 0) return;

    const elapsedSeconds = elapsedMs / 1000;
    ctx.ui.notify(buildTpsMessage(totals, elapsedSeconds), "info");
  });
}
