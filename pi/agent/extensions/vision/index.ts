import events from "node:events";
import fs from "node:fs";
import nodePath from "node:path";

import type { ImageContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";
import {
	SessionManager,
	createAgentSession,
	createCodingTools,
	discoverAuthStorage,
	discoverContextFiles,
	discoverModels,
	getMarkdownTheme,
} from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import autoloadSubdirAgents from "../autoload-subdir-agents";

const VISION_MAX_TURNS = 50;

const DEFAULT_EVENTTARGET_MAX_LISTENERS = 100;
const EVENTTARGET_MAX_LISTENERS_STATE_KEY = Symbol.for("pi.eventTargetMaxListenersState");

type EventTargetMaxListenersState = { depth: number; savedDefault?: number };

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

const VisionParams = Type.Object({
	images: Type.Array(Type.String(), {
		description: "File paths to images (jpg, png, gif, webp). Paths are relative to cwd or absolute.",
		minItems: 1,
	}),
	task: Type.String({
		description: [
			"A detailed, self-contained task description for the vision subagent.",
			"The main agent must provide sufficient context about:",
			"- What the images show (UI component, page, error state, etc.)",
			"- What needs to be done (implement, verify, debug, analyze)",
			"- What relevant files to examine (paths, directories)",
			"- Expected output format and level of detail",
			"",
			"Example tasks:",
			"- 'Implement the navbar from navbar.png. Focus on src/components/Header.tsx and src/app.css. Return file refs and line ranges only.'",
			"- 'Verify the login form matches login-mockup.png. Check src/pages/Login.tsx. Report any mismatches with line ranges.'",
			"- 'Analyze the dashboard layout in dashboard.png. Describe component structure and suggest file organization. Do not modify files.'",
		].join("\n"),
	}),
});

type VisionStatus = "running" | "done" | "error" | "aborted";

type ToolCall = {
	id: string;
	name: string;
	args: unknown;
	startedAt: number;
	endedAt?: number;
	isError?: boolean;
};

interface VisionDetails {
	status: VisionStatus;
	task: string;
	images: string[];
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
		return `bash ${shorten(cmd, 60)}`;
	}

	if (call.name === "edit") {
		const path = typeof args?.path === "string" ? args.path : "";
		return `edit ${path}`;
	}

	if (call.name === "write") {
		const path = typeof args?.path === "string" ? args.path : "";
		return `write ${path}`;
	}

	return call.name;
}

function buildVisionSystemPrompt(): string {
	return [
		"You are Vision, a UI implementation and testing specialist with visual understanding.",
		"",
		"You can see and analyze images to implement, verify, or debug user interfaces.",
		"",
		"Your tools: read, bash, edit, write",
		"",
		"Non-negotiable constraints:",
		"- Every code change must cite the file and line range: `path:lineStart-lineEnd`",
		"- Never dump full source code in responses - use file refs and minimal snippets only",
		"- Batch related changes: use edit with multiple diffs rather than multiple calls",
		"- If unsure about a design detail, note it in '## Notes' rather than guessing",
		"- Images may show UIs, error states, designs, or documentation - interpret based on the task",
		"",
		"Output format (Markdown, use these section headers):",
		"",
		"## Summary",
		"(what was done or found)",
		"",
		"## Changed",
		"- `path:lineStart-lineEnd` - what changed and why",
		"",
		"## Created",
		"- `path` - new file description",
		"",
		"## Verified",
		"(if applicable: what was checked and confirmed, with citations)",
		"",
		"## Notes",
		"(only if needed: ambiguities, assumptions, unexpected findings, follow-up suggestions)",
		"",
		"Context from the main agent will include relevant files and task instructions.",
		"Focus on the specific task and avoid scope creep.",
	].join("\n");
}

function buildVisionUserPrompt(images: string[], task: string): string {
	return [
		"You have been provided with the following images to assist with your task:",
		images.map((img) => `- ${img}`).join("\n"),
		"",
		"Task:",
		task.trim(),
	].join("\n");
}

async function createImageContents(imagePaths: string[], cwd: string): Promise<ImageContent[]> {
	const images: ImageContent[] = [];

	for (const imagePath of imagePaths) {
		const resolvedPath = nodePath.isAbsolute(imagePath) ? imagePath : nodePath.resolve(cwd, imagePath);

		const buffer = await fs.promises.readFile(resolvedPath);
		const base64 = buffer.toString("base64");
		const ext = nodePath.extname(resolvedPath).toLowerCase();

		const mimeTypeMap: Record<string, string> = {
			".jpg": "image/jpeg",
			".jpeg": "image/jpeg",
			".png": "image/png",
			".gif": "image/gif",
			".webp": "image/webp",
		};

		const mimeType = mimeTypeMap[ext] || "image/png";

		images.push({
			type: "image",
			data: base64,
			mimeType,
		});
	}

	return images;
}

function createTurnBudgetExtension(maxTurns: number): ExtensionFactory {
	return (pi) => {
		let turnIndex = 0;

		pi.on("turn_start", async (event) => {
			turnIndex = event.turnIndex;
		});

		pi.on("tool_call", async () => {
			if (turnIndex < maxTurns - 1) return undefined;

			return {
				block: true,
				reason: "Tool use is disabled on the final turn. Provide your final answer now without calling tools.",
			};
		});
	};
}

type HasProviderAndId = { provider: string; id: string };

function selectVisionModel<T extends HasProviderAndId>(models: T[]): T | undefined {
	if (models.length === 0) return undefined;

	const visionModels: Array<{ provider: string; id: string }> = [{ provider: "zai", id: "glm-4.6v" }];

	for (const pref of visionModels) {
		const match = models.find((m) => m.provider === pref.provider && m.id === pref.id);
		if (match) return match;
	}

	return models[0];
}

const REQUIRED_MAIN_MODEL = { provider: "zai", id: "glm-4.7" } as const;

function visionEnabledForMainModel(ctx: { model?: { provider: string; id: string } }): boolean {
	return ctx.model?.provider === REQUIRED_MAIN_MODEL.provider && ctx.model?.id === REQUIRED_MAIN_MODEL.id;
}

export default function visionExtension(pi: ExtensionAPI) {
	const TOOL_NAME = "vision";

	const setActive = (enabled: boolean) => {
		const active = new Set(pi.getActiveTools());
		const has = active.has(TOOL_NAME);
		if (enabled && !has) {
			active.add(TOOL_NAME);
			pi.setActiveTools([...active]);
		}
		if (!enabled && has) {
			active.delete(TOOL_NAME);
			pi.setActiveTools([...active]);
		}
	};

	const maybeUpdate = (ctx: { model?: { provider: string; id: string } }) => {
		setActive(visionEnabledForMainModel(ctx));
	};

	// Tool must be registered eagerly (cannot be registered on-demand later).
	registerTool();

	pi.on("session_start", async (_event, ctx) => {
		maybeUpdate(ctx);
	});

	pi.on("context", async (_event, ctx) => {
		maybeUpdate(ctx);
		return undefined;
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== TOOL_NAME) return undefined;
		if (visionEnabledForMainModel(ctx)) return undefined;

		return {
			block: true,
			reason: `vision tool is only available when main model is ${REQUIRED_MAIN_MODEL.provider}/${REQUIRED_MAIN_MODEL.id}`,
		};
	});

	function registerTool() {
		pi.registerTool({
			name: TOOL_NAME,
			label: "Vision",
			description:
				"Vision-enabled subagent that analyzes screenshots/images and makes code changes based on visual input. Spawns as an isolated agent with access to coding tools (read, bash, edit, write).",
			parameters: VisionParams,

			async execute(_toolCallId, params, onUpdate, ctx, signal) {
				const restoreMaxListeners = bumpDefaultEventTargetMaxListeners();
				try {
					const startedAt = Date.now();
					const toolCalls: ToolCall[] = [];
					let turns = 0;
					let summaryText = "";

					const authStorage = discoverAuthStorage();
					const modelRegistry = ctx.modelRegistry ?? discoverModels(authStorage);

					const availableModels = await modelRegistry.getAvailable();
					const preferredModel = selectVisionModel(availableModels);
				if (!preferredModel) {
					const error =
						"No vision-capable models available. Configure credentials (e.g. /login or auth.json) and try again.";
					summaryText = error;
					return {
						content: [{ type: "text", text: error }],
						details: {
							status: "error",
							task: params.task,
							images: params.images,
							turns,
							maxTurns: VISION_MAX_TURNS,
							toolCalls,
							summaryText,
							error,
							startedAt,
							endedAt: Date.now(),
						} satisfies VisionDetails,
						isError: true,
					};
				}

				const subModel = preferredModel;
				const subagentProvider = subModel.provider;
				const subagentModelId = subModel.id;

				const emit = (details: Partial<VisionDetails> & { status: VisionStatus }) => {
					const text =
						details.summaryText ??
						summaryText ??
						(details.status === "running" ? "(analyzing...)" : "(no output yet)");

					onUpdate?.({
						content: [{ type: "text", text }],
						details: {
							task: params.task,
							images: params.images,
							subagentProvider,
							subagentModelId,
							turns,
							maxTurns: VISION_MAX_TURNS,
							toolCalls,
							summaryText,
							startedAt,
							...details,
						} satisfies VisionDetails,
					});
				};

				emit({ status: "running" });

				const tools = createCodingTools(ctx.cwd);
				const contextFiles = discoverContextFiles(ctx.cwd);
				const systemPrompt = buildVisionSystemPrompt();

				const { session } = await createAgentSession({
					cwd: ctx.cwd,
					authStorage,
					modelRegistry,
					sessionManager: SessionManager.inMemory(ctx.cwd),
					model: subModel,
					thinkingLevel: "high",
					tools,
					customTools: [],
					extensions: [autoloadSubdirAgents, createTurnBudgetExtension(VISION_MAX_TURNS)],
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
						// ignore
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
					const images = await createImageContents(params.images, ctx.cwd);
					await session.prompt(buildVisionUserPrompt(params.images, params.task), {
						expandPromptTemplates: false,
						images,
					});
					summaryText = getLastAssistantText(session.state.messages as any[]).trim();
					if (!summaryText) summaryText = aborted ? "Aborted" : "(no output)";

					const endedAt = Date.now();
					emit({ status: aborted ? "aborted" : "done", summaryText, endedAt });

					return {
						content: [{ type: "text", text: summaryText }],
						details: {
							status: aborted ? "aborted" : "done",
							task: params.task,
							images: params.images,
							subagentProvider,
							subagentModelId,
							turns,
							maxTurns: VISION_MAX_TURNS,
							toolCalls,
							summaryText,
							startedAt,
							endedAt,
						} satisfies VisionDetails,
						isError: false,
					};
				} catch (e) {
					const endedAt = Date.now();
					const error = aborted ? "Aborted" : e instanceof Error ? e.message : String(e);
					summaryText = error;
					emit({ status: aborted ? "aborted" : "error", error, summaryText, endedAt });
					return {
						content: [{ type: "text", text: error }],
						details: {
							status: aborted ? "aborted" : "error",
							task: params.task,
							images: params.images,
							subagentProvider,
							subagentModelId,
							turns,
							maxTurns: VISION_MAX_TURNS,
							toolCalls,
							summaryText,
							error,
							startedAt,
							endedAt,
						} satisfies VisionDetails,
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
				const imageFiles = args.images.map((p: string) => nodePath.basename(p)).join(" ");
				const preview = shorten(args.task.replace(/\s+/g, " ").trim(), 90);
				const text =
					theme.fg("toolTitle", theme.bold("vision")) + "\n" + theme.fg("muted", imageFiles + "\n" + preview);
				return new Text(text, 0, 0);
			},

			renderResult(result, { expanded, isPartial }, theme) {
				const details = result.details as VisionDetails | undefined;
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
					theme.fg("toolTitle", theme.bold("vision ")) +
					theme.fg(
						"dim",
						`${details.subagentProvider ?? "?"}/${details.subagentModelId ?? "?"} • ${details.turns}/${VISION_MAX_TURNS} turns • ${details.toolCalls.length} tool call${details.toolCalls.length === 1 ? "" : "s"}`,
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
					const body = `\n\n${theme.fg("muted", "Analyzing…")}`;
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
}
