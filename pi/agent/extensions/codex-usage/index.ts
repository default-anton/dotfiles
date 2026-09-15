import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "tps-codex-usage";

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function duration(seconds: number): string {
	const hours = Math.ceil(Math.max(0, seconds) / 3600);
	if (hours === 0) return "now";
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	return `${days}d${hours % 24 ? `${hours % 24}h` : ""}`;
}

function formatWindow(value: unknown, now: number): string | undefined {
	if (!isRecord(value) || !isNumber(value.used_percent)) return undefined;
	const remaining = Math.round(Math.max(0, Math.min(100, 100 - value.used_percent)));
	const resetSeconds = isNumber(value.reset_at)
		? value.reset_at - now
		: value.reset_after_seconds;
	const reset = isNumber(resetSeconds) ? `↻${duration(resetSeconds)}` : "";
	return `${remaining}%${reset}`;
}

function formatUsage(value: unknown): string {
	if (!isRecord(value) || !isRecord(value.rate_limit)) return "Codex: unavailable";
	const now = Date.now() / 1000;
	const windows = [
		formatWindow(value.rate_limit.primary_window, now),
		formatWindow(value.rate_limit.secondary_window, now),
	].filter(Boolean);
	return windows.length ? `Codex ${windows.join(" ")}` : "Codex: unavailable";
}

export default function codexUsageExtension(pi: ExtensionAPI) {
	let generation = 0;
	let request: AbortController | undefined;

	function clear(ctx: ExtensionContext): void {
		generation++;
		request?.abort();
		request = undefined;
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
	}

	pi.on("agent_settled", async (_event, ctx) => {
		clear(ctx);
		if (!ctx.hasUI || ctx.model?.provider !== "openai-codex") return;
		const currentGeneration = generation;
		const controller = new AbortController();
		request = controller;
		let status = "Codex: unavailable";

		try {
			const token = await ctx.modelRegistry.getApiKeyForProvider("openai-codex");
			if (currentGeneration !== generation) return;
			if (!token) return;
			const claims: unknown = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
			const auth = isRecord(claims) ? claims["https://api.openai.com/auth"] : undefined;
			const accountId = isRecord(auth) ? auth.chatgpt_account_id : undefined;
			if (typeof accountId !== "string" || !accountId) return;
			const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
				headers: {
					Authorization: `Bearer ${token}`,
					"ChatGPT-Account-Id": accountId,
				},
				signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
				redirect: "error",
			});
			if (response.ok) status = formatUsage(await response.json());
		} catch {
			status = "Codex: unavailable";
		} finally {
			if (currentGeneration === generation) {
				request = undefined;
				ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("muted", status));
			}
		}
	});

	pi.on("session_start", (_event, ctx) => clear(ctx));
	pi.on("model_select", (_event, ctx) => clear(ctx));
	pi.on("session_shutdown", (_event, ctx) => clear(ctx));
}
