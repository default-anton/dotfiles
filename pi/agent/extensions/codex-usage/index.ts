import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "tps-codex-usage";
const REFRESH_INTERVAL_MS = 30_000;

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
	return windows.length ? `${windows.join(" ")}` : "Codex: unavailable";
}

export default function codexUsageExtension(pi: ExtensionAPI) {
	let generation = 0;
	let request: AbortController | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	let refreshAfterRequest = false;

	function stopPolling(): void {
		if (timer) clearInterval(timer);
		timer = undefined;
	}

	function clear(ctx: ExtensionContext): void {
		stopPolling();
		generation++;
		request?.abort();
		request = undefined;
		refreshAfterRequest = false;
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
	}

	async function refresh(ctx: ExtensionContext): Promise<void> {
		if (request || !ctx.hasUI || ctx.model?.provider !== "openai-codex") return;
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
				if (refreshAfterRequest) {
					refreshAfterRequest = false;
					void refresh(ctx);
				}
			}
		}
	}

	function startPolling(ctx: ExtensionContext): void {
		stopPolling();
		if (!ctx.hasUI || ctx.model?.provider !== "openai-codex") return;
		void refresh(ctx);
		timer = setInterval(() => void refresh(ctx), REFRESH_INTERVAL_MS);
		timer.unref();
	}

	function initialize(ctx: ExtensionContext): void {
		clear(ctx);
		if (ctx.isIdle()) void refresh(ctx);
		else startPolling(ctx);
	}

	pi.on("agent_start", (_event, ctx) => startPolling(ctx));
	pi.on("agent_settled", (_event, ctx) => {
		stopPolling();
		if (request) refreshAfterRequest = true;
		else void refresh(ctx);
	});

	pi.on("session_start", (_event, ctx) => initialize(ctx));
	pi.on("model_select", (_event, ctx) => initialize(ctx));
	pi.on("session_shutdown", (_event, ctx) => clear(ctx));
}
