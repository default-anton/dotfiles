import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "tps-codex-usage";
const REFRESH_INTERVAL_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function availableCount(value: unknown): number | undefined {
	if (!isRecord(value)) return undefined;
	const count = value.available_count;
	return isNumber(count) && Number.isInteger(count) && count >= 0 ? count : undefined;
}

async function fetchUsageData(ctx: ExtensionContext, path: string, signal?: AbortSignal): Promise<unknown> {
	const token = await ctx.modelRegistry.getApiKeyForProvider("openai-codex");
	if (!token) throw new Error("Missing Codex authentication");
	const claims: unknown = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
	const auth = isRecord(claims) ? claims["https://api.openai.com/auth"] : undefined;
	const accountId = isRecord(auth) ? auth.chatgpt_account_id : undefined;
	if (typeof accountId !== "string" || !accountId) throw new Error("Missing ChatGPT account");
	signal?.throwIfAborted();
	const response = await fetch(`https://chatgpt.com/backend-api/wham/${path}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			"ChatGPT-Account-Id": accountId,
		},
		signal: signal
			? AbortSignal.any([signal, AbortSignal.timeout(5000)])
			: AbortSignal.timeout(5000),
		redirect: "error",
	});
	if (!response.ok) throw new Error("Codex usage request failed");
	return response.json();
}

function formatResets(value: unknown): string {
	const count = availableCount(value);
	if (!isRecord(value) || count === undefined || !Array.isArray(value.credits)) {
		throw new Error("Invalid reset details");
	}
	if (count === 0) return "Codex: no usage limit resets available.";
	const lines = [`Codex: ${count} usage limit reset${count === 1 ? "" : "s"} available`];
	for (const credit of value.credits) {
		if (!isRecord(credit) || credit.status !== "available") continue;
		const title = typeof credit.title === "string" ? credit.title : "Usage limit reset";
		const expiry = typeof credit.expires_at === "string" ? new Date(credit.expires_at) : undefined;
		const expiration = expiry && Number.isFinite(expiry.getTime())
			? `expires ${expiry.toLocaleString()} (${duration((expiry.getTime() - Date.now()) / 1000)} left)`
			: "expiry unavailable";
		lines.push(`• ${title} — ${expiration}`);
	}
	lines.push("Manage resets at https://chatgpt.com/codex/settings/usage");
	return lines.join("\n");
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
	if (!isRecord(value)) return "Codex: unavailable";
	const rateLimit = isRecord(value.rate_limit) ? value.rate_limit : {};
	const now = Date.now() / 1000;
	const windows = [
		formatWindow(rateLimit.primary_window, now),
		formatWindow(rateLimit.secondary_window, now),
	].filter(Boolean);
	const usage = windows.length ? windows.join(" ") : "Codex: unavailable";
	const count = availableCount(value.rate_limit_reset_credits);
	return count ? `${usage} ⟲${count}` : usage;
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
			status = formatUsage(await fetchUsageData(ctx, "usage", controller.signal));
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

	pi.registerCommand("usage", {
		description: "List available Codex/ChatGPT usage limit resets",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;
			void refresh(ctx);
			try {
				ctx.ui.notify(formatResets(await fetchUsageData(ctx, "rate-limit-reset-credits")), "info");
			} catch {
				ctx.ui.notify("Codex usage limit resets: unavailable. Check your ChatGPT login or try again.", "warning");
			}
		},
	});

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
