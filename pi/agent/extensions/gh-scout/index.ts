import events from "node:events";
import nodePath from "node:path";

import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";
import {
	SessionManager,
	createAgentSession,
	createBashTool,
	createReadTool,
	discoverAuthStorage,
	discoverContextFiles,
	discoverModels,
	getMarkdownTheme,
} from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import autoloadSubdirAgents from "../autoload-subdir-agents";
import { getSmallModelFromProvider } from "../shared/model-selection";

const GH_SCOUT_MAX_TURNS = 10;
const GH_SCOUT_CACHE_ROOT = process.env.GH_SCOUT_CACHE_ROOT ?? "/tmp/gh_scout";

const DEFAULT_EVENTTARGET_MAX_LISTENERS = 100;
const EVENTTARGET_MAX_LISTENERS_STATE_KEY = Symbol.for("pi.eventTargetMaxListenersState");

type EventTargetMaxListenersState = { depth: number; savedDefault?: number };

type GhScoutStatus = "running" | "done" | "error" | "aborted";

type ToolCall = {
	id: string;
	name: string;
	args: unknown;
	startedAt: number;
	endedAt?: number;
	isError?: boolean;
};

interface GhScoutDetails {
	status: GhScoutStatus;
	repo: string;
	ref?: string;
	query: string;
	subagentProvider?: string;
	subagentModelId?: string;
	turns: number;
	maxTurns: number;
	toolCalls: ToolCall[];
	summaryText?: string;
	error?: string;
	startedAt: number;
	endedAt?: number;
}

const GhScoutParams = Type.Object({
	repo: Type.String({ description: "GitHub repository in owner/repo format." }),
	query: Type.String({ description: "What to find or verify in the repository." }),
	ref: Type.Optional(Type.String({ description: "Git ref (branch/tag/sha). If omitted, resolve default branch." })),
});

function getEventTargetMaxListenersState(): EventTargetMaxListenersState {
	const g = globalThis as any;
	if (!g[EVENTTARGET_MAX_LISTENERS_STATE_KEY]) g[EVENTTARGET_MAX_LISTENERS_STATE_KEY] = { depth: 0 };
	return g[EVENTTARGET_MAX_LISTENERS_STATE_KEY] as EventTargetMaxListenersState;
}

function bumpDefaultEventTargetMaxListeners(): () => void {
	const state = getEventTargetMaxListenersState();

	const raw = process.env.PI_EVENTTARGET_MAX_LISTENERS ?? process.env.PI_ABORT_MAX_LISTENERS;
	const desired = raw !== undefined ? Number(raw) : DEFAULT_EVENTTARGET_MAX_LISTENERS;
	if (!Number.isFinite(desired) || desired < 0) return () => {};

	if (state.depth === 0) state.savedDefault = events.defaultMaxListeners;
	state.depth += 1;

	if (events.defaultMaxListeners < desired) events.setMaxListeners(desired);

	return () => {
		state.depth = Math.max(0, state.depth - 1);
		if (state.depth !== 0) return;
		if (state.savedDefault === undefined) return;

		events.setMaxListeners(state.savedDefault);
		state.savedDefault = undefined;
	};
}

function shorten(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}…`;
}

function getLastAssistantText(messages: any[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg?.role !== "assistant") continue;
		const parts = msg.content;
		if (!Array.isArray(parts)) continue;

		const blocks: string[] = [];
		for (const part of parts) {
			if (part?.type === "text" && typeof part.text === "string") blocks.push(part.text);
		}

		if (blocks.length > 0) return blocks.join("");
	}
	return "";
}

function formatToolCall(call: ToolCall): string {
	const args = call.args && typeof call.args === "object" ? (call.args as Record<string, any>) : undefined;

	if (call.name === "read") {
		const path = typeof args?.path === "string" ? args.path : typeof args?.file_path === "string" ? args.file_path : "";
		const offset = typeof args?.offset === "number" ? args.offset : undefined;
		const limit = typeof args?.limit === "number" ? args.limit : undefined;
		const range = offset || limit ? `:${offset ?? 1}${limit ? `-${(offset ?? 1) + limit - 1}` : ""}` : "";
		return `read ${path}${range}`;
	}

	if (call.name === "bash") {
		const cmd = typeof args?.command === "string" ? args.command : "";
		return `bash ${shorten(cmd.replace(/\s+/g, " ").trim(), 80)}`.trimEnd();
	}

	return call.name;
}

function buildGhScoutSystemPrompt(scriptPath: string, cacheRoot: string, maxTurns: number): string {
	return [
		"You are gh_scout, an evidence-first GitHub dependency scout.",
		"You operate in a read-only environment and may only use the provided tools (bash/read).",
		"Use bash to call the helper script (preferred) for GitHub operations:",
		`- ${scriptPath}`,
		"",
		"Helper commands:",
		"- repo-info OWNER/REPO",
		"- ls OWNER/REPO [ref] [path]",
		"- cat OWNER/REPO [ref] path",
		"- cache OWNER/REPO [ref] path",
		"- range OWNER/REPO [ref] path start end",
		"- find-file OWNER/REPO pattern",
		"- search OWNER/REPO query",
		"",
		`Cache root: ${cacheRoot}. Cache every file you cite (use cache or range) and cite local paths with line ranges.`,
		"Always prefer cached files for citations (use read on local cache).",
		"For directory listings, use ls; it writes a cached listing file and prints `cached: <path>`.",
		"Cite that cached listing path (no line ranges).",
		"",
		`Turn budget: you have at most ${maxTurns} turns total (hard cap, not a target).`,
		"Tool use is disabled on the final turn; stop early once you have evidence.",
		"",
		"Non-negotiable constraints:",
		"- Do not list huge directories; list one directory at a time and keep outputs small.",
		"- Do not dump entire files; only minimal snippets (≈5–30 lines) when needed.",
		"- Do not guess; every claim must be supported by evidence you read.",
		"",
		"How to work:",
		"1) Resolve default branch if ref not provided (repo-info).",
		"2) Start from root docs (README, INSTALL, docs/) and package manifests.",
		"3) Use find-file/search only if directory walking fails.",
		"4) Cache every file you cite (use cache or range), then read cached files for snippets.",
		"",
		"Citations:",
		"- Cite local cached files as /tmp/gh_scout/...:lineStart-lineEnd.",
		"- For directory listings, cite the cached listing path printed by ls (no line ranges).",
		"- Do not cite GitHub URLs or uncached paths.",
		"- Always include offset+limit when using read so citations are valid.",
		"",
		"Output format (Markdown, use this section order):",
		"## Summary",
		"(1–3 sentences)",
		"## Locations",
		"- `/tmp/gh_scout/.../README.md:12-30` — install steps (example format)",
		"## Evidence (optional)",
		"/tmp/gh_scout/.../README.md:12-20",
		"```",
		"(minimal snippet)",
		"```",
		"## Searched (only if incomplete / not found)",
		"(patterns and directories you tried)",
		"## Next steps (optional)",
		"(what to check next if ambiguous)",
	].join("\n");
}

function buildGhScoutUserPrompt(repo: string, ref: string | undefined, query: string, maxTurns: number): string {
	const refLine = ref ? ref : "(none; resolve default branch)";
	return [
		"Task: gather evidence from the GitHub repository to answer the query.",
		"Return Markdown in the required section order (Summary, Locations, Evidence?, Searched?, Next steps?).",
		`Turn budget: at most ${maxTurns} turns total (hard cap).`,
		"",
		`Repo: ${repo}`,
		`Ref: ${refLine}`,
		"",
		"Query:",
		query.trim(),
	].join("\n");
}

function createTurnBudgetExtension(maxTurns: number): ExtensionFactory {
	return (pi) => {
		let turnIndex = 0;

		pi.on("turn_start", async (event) => {
			turnIndex = event.turnIndex;
		});

		pi.on("tool_call", async () => {
			if (turnIndex < maxTurns - 1) return undefined;

			const humanTurn = Math.min(turnIndex + 1, maxTurns);
			return {
				block: true,
				reason: `Tool use is disabled on the final turn (turn ${humanTurn}/${maxTurns}). Provide your final answer now without calling tools.`,
			};
		});

		pi.on("tool_result", async (event) => {
			const remainingAfter = Math.max(0, maxTurns - (turnIndex + 1));
			const humanTurn = Math.min(turnIndex + 1, maxTurns);
			const budgetLine = `[turn budget] turn ${humanTurn}/${maxTurns}; remaining after this turn: ${remainingAfter}`;

			return {
				content: [...(event.content ?? []), { type: "text", text: `\n\n${budgetLine}` }],
			};
		});
	};
}

export default function ghScoutExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "gh_scout",
		label: "GitHub Scout",
		description:
			"GitHub dependency scout: spawns an isolated subagent that inspects GitHub repos via API, caches relevant files under /tmp, and returns evidence-backed summaries with local path citations.",
		parameters: GhScoutParams,

		async execute(_toolCallId, params, onUpdate, ctx, signal) {
			const restoreMaxListeners = bumpDefaultEventTargetMaxListeners();
			try {
				const startedAt = Date.now();
				const repo = typeof (params as any).repo === "string" ? (params as any).repo.trim() : "";
				const query = typeof (params as any).query === "string" ? (params as any).query.trim() : "";
				const ref = typeof (params as any).ref === "string" ? (params as any).ref.trim() : undefined;

				if (!repo || !query) {
					const error = "Invalid parameters: `repo` and `query` must be non-empty strings.";
					return {
						content: [{ type: "text", text: error }],
						details: {
							status: "error",
							repo,
							ref,
							query,
							turns: 0,
							maxTurns: GH_SCOUT_MAX_TURNS,
							toolCalls: [],
							startedAt,
							endedAt: Date.now(),
						} satisfies GhScoutDetails,
						isError: true,
					};
				}

				const authStorage = discoverAuthStorage();
				const modelRegistry = ctx.modelRegistry ?? discoverModels(authStorage);
				const currentProvider = ctx.model?.provider;

				if (!currentProvider) {
					const error = "No model provider available. Configure credentials (e.g. /login or auth.json) and try again.";
					return {
						content: [{ type: "text", text: error }],
						details: {
							status: "error",
							repo,
							ref,
							query,
							turns: 0,
							maxTurns: GH_SCOUT_MAX_TURNS,
							toolCalls: [],
							error,
							startedAt,
							endedAt: Date.now(),
						} satisfies GhScoutDetails,
						isError: true,
					};
				}

				const subModel = getSmallModelFromProvider(currentProvider, modelRegistry);

				if (!subModel) {
					const error = "No models available. Configure credentials (e.g. /login or auth.json) and try again.";
					return {
						content: [{ type: "text", text: error }],
						details: {
							status: "error",
							repo,
							ref,
							query,
							turns: 0,
							maxTurns: GH_SCOUT_MAX_TURNS,
							toolCalls: [],
							error,
							startedAt,
							endedAt: Date.now(),
						} satisfies GhScoutDetails,
						isError: true,
					};
				}

				const subagentProvider = subModel.provider;
				const subagentModelId = subModel.id;
				const contextFiles = discoverContextFiles(ctx.cwd);
				const scriptPath = nodePath.resolve(__dirname, "bin/gh_scout");
				const systemPrompt = buildGhScoutSystemPrompt(scriptPath, GH_SCOUT_CACHE_ROOT, GH_SCOUT_MAX_TURNS);

				let turns = 0;
				let summaryText: string | undefined;
				let error: string | undefined;
				const toolCalls: ToolCall[] = [];

				const emit = (details: Partial<GhScoutDetails> & { status: GhScoutStatus }) => {
					const text =
						details.summaryText ??
						summaryText ??
						(details.status === "running" ? "(scouting...)" : "(no output yet)");

					onUpdate?.({
						content: [{ type: "text", text }],
						details: {
							status: details.status,
							repo,
							ref,
							query,
							subagentProvider,
							subagentModelId,
							turns,
							maxTurns: GH_SCOUT_MAX_TURNS,
							toolCalls,
							summaryText,
							error,
							startedAt,
							endedAt: details.endedAt,
						} satisfies GhScoutDetails,
					});
				};

				emit({ status: "running" });

				const { session } = await createAgentSession({
					cwd: ctx.cwd,
					authStorage,
					modelRegistry,
					sessionManager: SessionManager.inMemory(ctx.cwd),
					model: subModel,
					thinkingLevel: "off",
					tools: [createReadTool(ctx.cwd), createBashTool(ctx.cwd)],
					customTools: [],
					extensions: [autoloadSubdirAgents, createTurnBudgetExtension(GH_SCOUT_MAX_TURNS)],
					skills: [],
					contextFiles,
					systemPrompt,
				});

				let aborted = false;
				const abort = async () => {
					aborted = true;
					try {
						await session.abort();
					} catch {
						return;
					}
				};

				let abortListenerAdded = false;
				const onAbort = () => void abort();

				if (signal) {
					if (signal.aborted) await abort();
					else {
						signal.addEventListener("abort", onAbort);
						abortListenerAdded = true;
					}
				}

				let lastUpdate = 0;
				const maybeEmit = (force = false) => {
					const now = Date.now();
					if (!force && now - lastUpdate < 200) return;
					lastUpdate = now;
					emit({ status: "running" });
				};

				const unsubscribe = session.subscribe((event) => {
					switch (event.type) {
						case "turn_end": {
							turns += 1;
							maybeEmit();
							break;
						}
						case "tool_execution_start": {
							toolCalls.push({
								id: event.toolCallId,
								name: event.toolName,
								args: event.args,
								startedAt: Date.now(),
							});
							if (toolCalls.length > 50) toolCalls.splice(0, toolCalls.length - 50);
							maybeEmit(true);
							break;
						}
						case "tool_execution_end": {
							const call = toolCalls.find((c) => c.id === event.toolCallId);
							if (call) {
								call.endedAt = Date.now();
								call.isError = event.isError;
							}
							maybeEmit(true);
							break;
						}
					}
				});

				try {
					await session.prompt(buildGhScoutUserPrompt(repo, ref, query, GH_SCOUT_MAX_TURNS), {
						expandPromptTemplates: false,
					});
					summaryText = getLastAssistantText(session.state.messages as any[]).trim();
					if (!summaryText) summaryText = aborted ? "Aborted" : "(no output)";

					const endedAt = Date.now();
					emit({ status: aborted ? "aborted" : "done", summaryText, endedAt });

					return {
						content: [{ type: "text", text: summaryText }],
						details: {
							status: aborted ? "aborted" : "done",
							repo,
							ref,
							query,
							subagentProvider,
							subagentModelId,
							turns,
							maxTurns: GH_SCOUT_MAX_TURNS,
							toolCalls,
							summaryText,
							startedAt,
							endedAt,
						} satisfies GhScoutDetails,
						isError: false,
					};
				} catch (e) {
					const endedAt = Date.now();
					error = aborted ? "Aborted" : e instanceof Error ? e.message : String(e);
					summaryText = error;
					emit({ status: aborted ? "aborted" : "error", error, summaryText, endedAt });
					return {
						content: [{ type: "text", text: error }],
						details: {
							status: aborted ? "aborted" : "error",
							repo,
							ref,
							query,
							subagentProvider,
							subagentModelId,
							turns,
							maxTurns: GH_SCOUT_MAX_TURNS,
							toolCalls,
							summaryText,
							error,
							startedAt,
							endedAt,
						} satisfies GhScoutDetails,
						isError: !aborted,
					};
				} finally {
					if (signal && abortListenerAdded) signal.removeEventListener("abort", onAbort);
					unsubscribe();
					session.dispose();
				}
			} finally {
				restoreMaxListeners();
			}
		},

		renderCall(args, theme) {
			const repo = typeof (args as any)?.repo === "string" ? (args as any).repo : "(unknown)";
			const ref = typeof (args as any)?.ref === "string" ? (args as any).ref : "";
			const query = typeof (args as any)?.query === "string" ? (args as any).query : "";
			const preview = shorten(query.replace(/\s+/g, " ").trim(), 80);
			const title = theme.fg("toolTitle", theme.bold("gh_scout ")) + theme.fg("dim", ref ? `${repo}@${ref}` : repo);
			const text = title + (preview ? `\n${theme.fg("muted", preview)}` : "");
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details as GhScoutDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}

			const icon =
				details.status === "done"
					? theme.fg("success", "✓")
					: details.status === "error"
						? theme.fg("error", "✗")
						: details.status === "aborted"
							? theme.fg("warning", "◼")
							: theme.fg("warning", "⏳");

			const header =
				icon +
				" " +
				theme.fg("toolTitle", theme.bold("gh_scout ")) +
				theme.fg(
					"dim",
					`${details.subagentProvider ?? "?"}/${details.subagentModelId ?? "?"} • ${details.turns}/${details.maxTurns} turns • ${details.toolCalls.length} tool call${details.toolCalls.length === 1 ? "" : "s"}`,
				);

			const callsToShow = expanded ? details.toolCalls : details.toolCalls.slice(-6);
			let callsText = "";
			if (callsToShow.length > 0) {
				callsText += theme.fg("muted", "\n\nTools:\n");
				for (const c of callsToShow) {
					const callIcon = c.isError ? theme.fg("error", "✗") : theme.fg("dim", "→");
					callsText += `${callIcon} ${theme.fg("toolOutput", formatToolCall(c))}\n`;
				}
				callsText = callsText.trimEnd();
				if (!expanded && details.toolCalls.length > 6) {
					callsText += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				}
			}

			if (details.status === "running" || isPartial) {
				const body = `\n\n${theme.fg("muted", "Scouting…")}`;
				return new Text((header + callsText + body).trimEnd(), 0, 0);
			}

			const mdTheme = getMarkdownTheme();
			const summary = (details.summaryText ?? (result.content[0]?.type === "text" ? result.content[0].text : ""))
				.trim()
				.slice(0, expanded ? 20000 : 4000);

			if (!expanded) {
				const preview = summary ? summary.split("\n").slice(0, 12).join("\n") : "(no output)";
				let text = `${header}\n\n${theme.fg("toolOutput", preview)}`;
				if (summary.split("\n").length > 12) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			const container = new Container();
			container.addChild(new Text(header, 0, 0));
			if (callsText) {
				container.addChild(new Spacer(1));
				container.addChild(new Text(callsText.trim(), 0, 0));
			}
			container.addChild(new Spacer(1));
			container.addChild(new Markdown(summary || "(no output)", 0, 0, mdTheme));
			return container;
		},
	});
}
