import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function isAssistantMessage(message: unknown): message is AssistantMessage {
	if (!message || typeof message !== "object") return false;
	const role = (message as { role?: unknown }).role;
	return role === "assistant";
}

function isTpsData(data: unknown): data is { tokensPerSecond: number } {
	if (!data || typeof data !== "object") return false;
	const tokensPerSecond = (data as { tokensPerSecond?: unknown }).tokensPerSecond;
	return (
		typeof tokensPerSecond === "number" &&
		Number.isFinite(tokensPerSecond) &&
		tokensPerSecond >= 0
	);
}

const STATUS_KEY = "tps";
const SESSION_ENTRY_TYPE = "tps";

function setStatus(ctx: ExtensionContext, tokensPerSecond: number | undefined): void {
	if (!ctx.hasUI) return;

	const status = tokensPerSecond === undefined ? undefined : `${tokensPerSecond.toFixed(1)} tok/s`;
	ctx.ui.setStatus(
		STATUS_KEY,
		status === undefined ? undefined : ctx.ui.theme.fg("muted", status),
	);
}

function restoreStatus(ctx: ExtensionContext): void {
	let tokensPerSecond: number | undefined;
	const branch = ctx.sessionManager.getBranch();

	for (const entry of branch) {
		if (entry.type !== "custom" || entry.customType !== SESSION_ENTRY_TYPE) continue;
		if (isTpsData(entry.data)) tokensPerSecond = entry.data.tokensPerSecond;
	}

	// appendEntry() adds the TPS entry after the assistant message. When the
	// user navigates to that message, its child is not part of getBranch().
	const leafId = ctx.sessionManager.getLeafId();
	if (leafId) {
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.parentId !== leafId) continue;
			if (entry.type !== "custom" || entry.customType !== SESSION_ENTRY_TYPE) continue;
			if (isTpsData(entry.data)) tokensPerSecond = entry.data.tokensPerSecond;
		}
	}

	setStatus(ctx, tokensPerSecond);
}

export default function (pi: ExtensionAPI) {
	let agentStartMs: number | null = null;

	pi.on("agent_start", () => {
		agentStartMs = Date.now();
	});

	pi.on("agent_end", (event, ctx) => {
		if (agentStartMs === null) return;

		const elapsedMs = Date.now() - agentStartMs;
		agentStartMs = null;
		if (elapsedMs <= 0) return;

		let output = 0;
		for (const message of event.messages) {
			if (!isAssistantMessage(message)) continue;
			output += message.usage.output || 0;
		}

		if (output <= 0) return;

		const elapsedSeconds = elapsedMs / 1000;
		const tokensPerSecond = output / elapsedSeconds;
		pi.appendEntry(SESSION_ENTRY_TYPE, { tokensPerSecond });
		setStatus(ctx, tokensPerSecond);
	});

	pi.on("session_start", async (_event, ctx) => restoreStatus(ctx));
	pi.on("session_tree", async (_event, ctx) => restoreStatus(ctx));
}
