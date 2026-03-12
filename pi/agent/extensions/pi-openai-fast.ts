import { lstat, mkdir, readFile, readlink, realpath, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import type { ExtensionAPI, ExtensionContext, ReadonlyFooterDataProvider } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

const SETTINGS_KEY = "piOpenaiFast";
const FAST_STATE_ENTRY = "pi-openai-fast-state";
const FAST_COST_MULTIPLIER = 2;
const PROJECT_SETTINGS_DIR = ".pi";
const SUPPORTED_PROVIDERS = new Set(["openai", "openai-codex"]);

type JsonObject = Record<string, unknown>;

type UsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
};

type FastStateData = {
	enabled: boolean;
};

type UsageEntry = {
	type: string;
	timestamp: string;
	customType?: string;
	data?: unknown;
	message?: {
		role?: string;
		provider?: string;
		usage?: {
			input?: number;
			output?: number;
			cacheRead?: number;
			cacheWrite?: number;
			cost?: {
				total?: number;
			};
		};
	};
};

function expandHome(path: string): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return join(homedir(), path.slice(2));
	return path;
}

function getAgentDir(): string {
	const envDir = process.env.PI_CODING_AGENT_DIR;
	if (envDir) return expandHome(envDir);
	return join(homedir(), ".pi", "agent");
}

function getGlobalSettingsPath(): string {
	return join(getAgentDir(), "settings.json");
}

function getProjectSettingsPath(cwd: string): string {
	return join(cwd, PROJECT_SETTINGS_DIR, "settings.json");
}

function isRecord(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFoundError(error: unknown): boolean {
	return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

async function readJsonObject(path: string): Promise<JsonObject | undefined> {
	let content: string;
	try {
		content = await readFile(path, "utf8");
	} catch (error) {
		if (isNotFoundError(error)) return undefined;
		throw error;
	}

	if (!content.trim()) return {};

	const parsed = JSON.parse(content);
	if (!isRecord(parsed)) {
		throw new Error(`${path} must contain a JSON object`);
	}

	return parsed;
}

async function resolveWritableSettingsPath(settingsPath: string): Promise<string> {
	let stats: Awaited<ReturnType<typeof lstat>>;
	try {
		stats = await lstat(settingsPath);
	} catch (error) {
		if (isNotFoundError(error)) return settingsPath;
		throw error;
	}

	if (!stats.isSymbolicLink()) return settingsPath;

	try {
		return await realpath(settingsPath);
	} catch (error) {
		if (!isNotFoundError(error)) throw error;
		const target = await readlink(settingsPath);
		return isAbsolute(target) ? target : resolve(dirname(settingsPath), target);
	}
}

async function writeJsonObject(path: string, settings: JsonObject): Promise<void> {
	const writePath = await resolveWritableSettingsPath(path);
	await mkdir(dirname(writePath), { recursive: true });

	const next = `${JSON.stringify(settings, null, 2)}\n`;
	const tempPath = `${writePath}.tmp-${process.pid}-${Date.now()}`;

	try {
		await writeFile(tempPath, next, "utf8");
		await rename(tempPath, writePath);
	} catch (error) {
		await rm(tempPath, { force: true }).catch(() => undefined);
		throw error;
	}
}

async function readFastModeState(): Promise<boolean> {
	try {
		const settings = await readJsonObject(getGlobalSettingsPath());
		if (!settings) return false;

		const value = settings[SETTINGS_KEY];
		return isRecord(value) && value.enabled === true;
	} catch {
		return false;
	}
}

async function writeFastModeState(enabled: boolean): Promise<void> {
	const settingsPath = getGlobalSettingsPath();
	const settings = (await readJsonObject(settingsPath)) ?? {};
	settings[SETTINGS_KEY] = { enabled };
	await writeJsonObject(settingsPath, settings);
}

async function readAutoCompactEnabled(cwd: string): Promise<boolean> {
	let enabled = true;
	const settingsPaths = [getGlobalSettingsPath(), getProjectSettingsPath(cwd)];
	const settingsList = await Promise.all(
		settingsPaths.map(async (path) => {
			try {
				return await readJsonObject(path);
			} catch {
				return undefined;
			}
		}),
	);

	for (const settings of settingsList) {
		if (!settings) continue;

		const compaction = settings.compaction;
		if (isRecord(compaction) && typeof compaction.enabled === "boolean") {
			enabled = compaction.enabled;
		}
	}

	return enabled;
}

function isSupportedProvider(provider: string | undefined): boolean {
	return provider !== undefined && SUPPORTED_PROVIDERS.has(provider);
}

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

function getEntryTimestamp(entry: { timestamp: string }): number {
	const timestamp = Date.parse(entry.timestamp);
	return Number.isFinite(timestamp) ? timestamp : 0;
}

function readTrackedFastState(data: unknown): boolean | undefined {
	if (!isRecord(data)) return undefined;
	return typeof data.enabled === "boolean" ? data.enabled : undefined;
}

export function calculateUsageTotals(entries: readonly UsageEntry[], initialFastEnabled: boolean): UsageTotals {
	const totals: UsageTotals = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
	};

	let fastEnabled = initialFastEnabled;
	const sortedEntries = [...entries].sort((left, right) => getEntryTimestamp(left) - getEntryTimestamp(right));

	for (const entry of sortedEntries) {
		if (entry.type === "custom" && entry.customType === FAST_STATE_ENTRY) {
			const trackedState = readTrackedFastState(entry.data);
			if (trackedState !== undefined) {
				fastEnabled = trackedState;
			}
			continue;
		}

		if (entry.type !== "message" || entry.message?.role !== "assistant") continue;

		totals.input += entry.message.usage?.input ?? 0;
		totals.output += entry.message.usage?.output ?? 0;
		totals.cacheRead += entry.message.usage?.cacheRead ?? 0;
		totals.cacheWrite += entry.message.usage?.cacheWrite ?? 0;

		const multiplier = fastEnabled && isSupportedProvider(entry.message.provider) ? FAST_COST_MULTIPLIER : 1;
		totals.cost += (entry.message.usage?.cost?.total ?? 0) * multiplier;
	}

	return totals;
}

function sumAssistantUsage(ctx: ExtensionContext, initialFastEnabled: boolean): UsageTotals {
	return calculateUsageTotals(ctx.sessionManager.getEntries(), initialFastEnabled);
}

function buildPwdLine(ctx: ExtensionContext, footerData: ReadonlyFooterDataProvider, theme: ExtensionContext["ui"]["theme"]): string {
	let pwd = ctx.cwd;
	const home = process.env.HOME || process.env.USERPROFILE;
	if (home && pwd.startsWith(home)) {
		pwd = `~${pwd.slice(home.length)}`;
	}

	const branch = footerData.getGitBranch();
	if (branch) {
		pwd = `${pwd} (${branch})`;
	}

	const sessionName = ctx.sessionManager.getSessionName();
	if (sessionName) {
		pwd = `${pwd} • ${sessionName}`;
	}

	return theme.fg("dim", pwd);
}

function buildStatsLeft(
	ctx: ExtensionContext,
	currentModel: ExtensionContext["model"],
	fastEnabled: boolean,
	theme: ExtensionContext["ui"]["theme"],
	autoCompactEnabled: boolean,
): string {
	const totals = sumAssistantUsage(ctx, fastEnabled);
	const parts: string[] = [];

	if (totals.input) parts.push(theme.fg("dim", `↑${formatTokens(totals.input)}`));
	if (totals.output) parts.push(theme.fg("dim", `↓${formatTokens(totals.output)}`));
	if (totals.cacheRead) parts.push(theme.fg("dim", `R${formatTokens(totals.cacheRead)}`));
	if (totals.cacheWrite) parts.push(theme.fg("dim", `W${formatTokens(totals.cacheWrite)}`));

	const usingSubscription = currentModel ? ctx.modelRegistry.isUsingOAuth(currentModel) : false;
	if (totals.cost || usingSubscription) {
		parts.push(theme.fg("dim", `$${totals.cost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`));
	}

	const contextUsage = ctx.getContextUsage();
	const contextWindow = contextUsage?.contextWindow ?? currentModel?.contextWindow ?? 0;
	const contextPercentValue = contextUsage?.percent ?? 0;
	const autoIndicator = autoCompactEnabled ? " (auto)" : "";
	const contextDisplay = contextUsage?.percent === null
		? `?/${formatTokens(contextWindow)}${autoIndicator}`
		: `${contextPercentValue.toFixed(1)}%/${formatTokens(contextWindow)}${autoIndicator}`;

	if (contextPercentValue > 90) {
		parts.push(theme.fg("error", contextDisplay));
	} else if (contextPercentValue > 70) {
		parts.push(theme.fg("warning", contextDisplay));
	} else {
		parts.push(theme.fg("dim", contextDisplay));
	}

	return parts.join(theme.fg("dim", " "));
}

function buildFastIndicator(
	provider: string | undefined,
	fastEnabled: boolean,
	theme: ExtensionContext["ui"]["theme"],
): string {
	if (!isSupportedProvider(provider)) return "";

	const separator = theme.fg("dim", " • ");
	const label = fastEnabled ? "⚡ fast on" : "⚡ fast off";
	const color = fastEnabled ? "accent" : "muted";
	return `${separator}${theme.fg(color, label)}`;
}

function buildRightSide(
	currentModel: ExtensionContext["model"],
	thinkingLevel: string,
	footerData: ReadonlyFooterDataProvider,
	fastEnabled: boolean,
	theme: ExtensionContext["ui"]["theme"],
): string {
	const modelName = currentModel?.id || "no-model";
	const modelText = currentModel?.reasoning
		? thinkingLevel === "off"
			? `${modelName} • thinking off`
			: `${modelName} • ${thinkingLevel}`
		: modelName;
	const fastIndicator = buildFastIndicator(currentModel?.provider, fastEnabled, theme);
	const withoutProvider = `${theme.fg("dim", modelText)}${fastIndicator}`;

	if (!currentModel || footerData.getAvailableProviderCount() <= 1) {
		return withoutProvider;
	}

	return `${theme.fg("dim", `(${currentModel.provider}) `)}${withoutProvider}`;
}

function renderStatsLine(width: number, left: string, right: string, rightFallback: string): string {
	let renderedLeft = left;
	let leftWidth = visibleWidth(renderedLeft);
	if (leftWidth > width) {
		renderedLeft = truncateToWidth(renderedLeft, width, "...");
		leftWidth = visibleWidth(renderedLeft);
	}

	const minPadding = 2;
	let renderedRight = right;
	if (leftWidth + minPadding + visibleWidth(renderedRight) > width) {
		renderedRight = rightFallback;
	}

	const rightWidth = visibleWidth(renderedRight);
	const totalNeeded = leftWidth + minPadding + rightWidth;
	if (totalNeeded <= width) {
		return renderedLeft + " ".repeat(width - leftWidth - rightWidth) + renderedRight;
	}

	const availableForRight = width - leftWidth - minPadding;
	if (availableForRight > 0) {
		const truncatedRight = truncateToWidth(renderedRight, availableForRight, "");
		return renderedLeft + " ".repeat(Math.max(0, width - leftWidth - visibleWidth(truncatedRight))) + truncatedRight;
	}

	return renderedLeft;
}

function buildFooterLines(
	width: number,
	ctx: ExtensionContext,
	currentModel: ExtensionContext["model"],
	thinkingLevel: string,
	footerData: ReadonlyFooterDataProvider,
	fastEnabled: boolean,
	autoCompactEnabled: boolean,
): string[] {
	const theme = ctx.ui.theme;
	const pwdLine = truncateToWidth(buildPwdLine(ctx, footerData, theme), width, theme.fg("dim", "..."));
	const left = buildStatsLeft(ctx, currentModel, fastEnabled, theme, autoCompactEnabled);
	const rightFallback = `${theme.fg("dim", currentModel?.id || "no-model")}${buildFastIndicator(currentModel?.provider, fastEnabled, theme)}`;
	const right = buildRightSide(currentModel, thinkingLevel, footerData, fastEnabled, theme);
	const lines = [pwdLine, renderStatsLine(width, left, right, rightFallback)];

	const extensionStatuses = footerData.getExtensionStatuses();
	if (extensionStatuses.size > 0) {
		const statusLine = Array.from(extensionStatuses.entries())
			.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
			.map(([, text]) => sanitizeStatusText(text))
			.join(" ");
		lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
	}

	return lines;
}

export default function piOpenaiFastExtension(pi: ExtensionAPI) {
	let fastEnabled = false;
	let autoCompactEnabled = true;
	let currentModel: ExtensionContext["model"];
	let thinkingLevel = "off";
	let requestFooterRender: (() => void) | undefined;
	let sessionStateLoadId = 0;

	const refreshFooter = () => requestFooterRender?.();

	const loadSessionState = async (ctx: ExtensionContext) => {
		const loadId = ++sessionStateLoadId;
		const [nextFastEnabled, nextAutoCompactEnabled] = await Promise.all([
			readFastModeState(),
			readAutoCompactEnabled(ctx.cwd),
		]);
		if (loadId !== sessionStateLoadId) return;

		fastEnabled = nextFastEnabled;
		autoCompactEnabled = nextAutoCompactEnabled;
		refreshFooter();
	};

	const installFooter = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;

		ctx.ui.setFooter((tui, _theme, footerData) => {
			const requestRender = () => tui.requestRender();
			requestFooterRender = requestRender;
			const disposeBranch = footerData.onBranchChange(requestRender);

			return {
				dispose() {
					disposeBranch();
					if (requestFooterRender === requestRender) {
						requestFooterRender = undefined;
					}
				},
				invalidate() {},
				render(width: number) {
					return buildFooterLines(width, ctx, currentModel, thinkingLevel, footerData, fastEnabled, autoCompactEnabled);
				},
			};
		});
	};

	pi.on("session_start", async (_event, ctx) => {
		currentModel = ctx.model;
		thinkingLevel = pi.getThinkingLevel();
		installFooter(ctx);
		await loadSessionState(ctx);
	});

	pi.on("session_switch", async (_event, ctx) => {
		currentModel = ctx.model;
		thinkingLevel = pi.getThinkingLevel();
		installFooter(ctx);
		await loadSessionState(ctx);
	});

	pi.on("model_select", (event) => {
		currentModel = event.model;
		thinkingLevel = pi.getThinkingLevel();
		refreshFooter();
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (!fastEnabled) return;
		if (!isSupportedProvider(ctx.model?.provider)) return;
		if (!isRecord(event.payload)) return;
		return { ...event.payload, service_tier: "priority" };
	});

	pi.registerCommand("fast", {
		description: "Toggle fast OpenAI priority inference",
		handler: async (args, ctx) => {
			if (args.trim()) {
				ctx.ui.notify("/fast takes no arguments", "error");
				return;
			}

			const nextState = !fastEnabled;
			try {
				await writeFastModeState(nextState);
				fastEnabled = nextState;
				pi.appendEntry<FastStateData>(FAST_STATE_ENTRY, { enabled: nextState });
				refreshFooter();
			} catch (error) {
				ctx.ui.notify(
					`Failed to persist fast mode in ${getGlobalSettingsPath()}: ${error instanceof Error ? error.message : String(error)}`,
					"error",
				);
			}
		},
	});
}
