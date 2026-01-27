import events from "node:events";

import type { ExtensionAPI, ExtensionFactory, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  DefaultResourceLoader,
  SessionManager,
  createAgentSession,
  createBashTool,
  createReadTool,
  getMarkdownTheme,
} from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import autoloadSubdirAgents from "../autoload-subdir-agents";
import { getSmallModelFromProvider } from "../shared/model-selection";

const MAX_TURNS = 10;

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
  if (!Number.isFinite(desired) || desired < 0) return () => { };

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

const FinderParams = Type.Object({
  query: Type.String({
    description: [
      "Describe what to find in the codebase. Include: (1) specific goal, (2) keywords/identifiers to search, (3) desired output type (paths, line ranges, directory structure), (4) what counts as 'found'.",
      "Finder uses rg/fd/ls and read — do not request grep or find.",
      "Example: 'Find where user authentication is implemented. Look for functions named login, auth, or authenticate. Return paths with line ranges for the main entry point and token handling. Search in src/auth and src/api directories.'",
    ].join("\n"),
  }),
});

type FinderStatus = "running" | "done" | "error" | "aborted";

type ToolCall = {
  id: string;
  name: string;
  args: unknown;
  startedAt: number;
  endedAt?: number;
  isError?: boolean;
};

interface FinderRunDetails {
  status: FinderStatus;
  query: string;
  turns: number;
  toolCalls: ToolCall[];
  summaryText?: string;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

interface FinderDetails {
  status: FinderStatus;
  subagentProvider?: string;
  subagentModelId?: string;
  runs: FinderRunDetails[];
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

  if (call.name === "grep") {
    const pattern = typeof args?.pattern === "string" ? args.pattern : "";
    const path = typeof args?.path === "string" ? args.path : ".";
    return `grep /${pattern}/ in ${path}`;
  }

  if (call.name === "find") {
    const pattern = typeof args?.pattern === "string" ? args.pattern : "*";
    const path = typeof args?.path === "string" ? args.path : ".";
    return `find ${pattern} in ${path}`;
  }

  if (call.name === "ls") {
    const path = typeof args?.path === "string" ? args.path : ".";
    return `ls ${path}`;
  }

  if (call.name === "read") {
    const path =
      typeof args?.path === "string" ? args.path : typeof args?.file_path === "string" ? args.file_path : "";
    const offset = typeof args?.offset === "number" ? args.offset : undefined;
    const limit = typeof args?.limit === "number" ? args.limit : undefined;
    const range = offset || limit ? `:${offset ?? 1}${limit ? `-${(offset ?? 1) + limit - 1}` : ""}` : "";
    return `read ${path}${range}`;
  }

  if (call.name === "bash") {
    const command = typeof args?.command === "string" ? args.command : "";
    const timeout = typeof args?.timeout === "number" ? args.timeout : undefined;
    const normalized = command.replace(/\s+/g, " ").trim();
    const suffix = timeout ? ` (timeout ${timeout}s)` : "";
    return `bash ${shorten(normalized, 120)}${suffix}`.trimEnd();
  }

  return call.name;
}

function computeOverallStatus(runs: FinderRunDetails[]): FinderStatus {
  if (runs.some((r) => r.status === "running")) return "running";
  if (runs.some((r) => r.status === "error")) return "error";
  if (runs.every((r) => r.status === "aborted")) return "aborted";
  return "done";
}

function renderCombinedMarkdown(runs: FinderRunDetails[]): string {
  const r = runs[0];
  const body = (r.summaryText ?? (r.status === "running" ? "(searching...)" : "(no output)")).trim();
  return body;
}

function buildFinderSystemPrompt(maxTurns: number): string {
  return [
    "You are Finder, an evidence-first repository scout.",
    "You operate in a read-only environment and may only use the provided tools (bash/read).",
    "Use bash for repository scouting (e.g., `rg`, `fd`, `ls`). Never use `grep` (use `rg`) or `find` (use `fd`). Use read to open specific file ranges for line-level citations.",
    "Your job: locate and cite the exact code locations that answer the manager's query.",
    "",
    `Turn budget: you have at most ${maxTurns} turns total (including the final answering turn). This is a hard cap, not a target.`,
    "To conserve turns, batch independent searches: you may issue multiple tool calls in a single turn (e.g., several bash/read calls).",
    "Finish as soon as you can answer with high confidence — do NOT try to use all available turns (it's fine to answer in 2–3 turns).",
    "Tool use is disabled on the last allowed turn; once you have enough evidence, produce your final answer immediately.",
    "",
    "Non-negotiable constraints:",
    "- Do not modify files, propose patches, or refactor.",
    "- Never use `grep` (use `rg`). Never use `find` (use `fd`).",
    "- Do not guess: every claim must be supported by evidence you actually read.",
    "- Avoid large dumps: only include minimal snippets (≈5–15 lines) when needed.",
    "",
    "How to work:",
    "1) Translate the query into a checklist of things to locate.",
    "2) Search broadly with bash using `rg` + `fd` (never `grep`/`find`), then narrow.",
    "3) Validate by opening the smallest relevant ranges with read when you need line-level evidence.",
    "   If the query is only about file paths / directory structure, prefer bash `ls`/`fd` and do not open files unnecessarily.",
    "   When you do use read, always include offset+limit so you can cite line ranges.",
    "",
    "Citations:",
    "- For claims about file contents, cite as `path:lineStart-lineEnd` using the read ranges you opened.",
    "- For path-only claims (e.g., directory listings), you may cite just `path` based on bash output (`ls`, `fd`, `rg`).",
    "- If you didn't observe it in tool output, don't cite it and don't present it as fact.",
    "",
    "Output format (Markdown, use this section order):",
    "## Summary",
    "(1–3 sentences)",
    "## Locations",
    "- `path` or `path:lineStart-lineEnd` — what is here and why it matters",
    "## Evidence (optional)",
    "(snippets, each preceded by a citation)",
    "## Searched (only if incomplete / not found)",
    "(patterns and directories you tried)",
    "## Next steps (optional)",
    "(what to check next if ambiguous)",
  ].join("\n");
}

function buildFinderUserPrompt(query: string, maxTurns: number): string {
  return [
    "Task: locate and cite the exact code locations that answer the query.",
    "Return Markdown in the required section order (Summary, Locations, Evidence?, Searched?, Next steps?).",
    "For claims about file contents, citations must be in the form `path:lineStart-lineEnd` based on the read ranges you opened.",
    "For path-only results (e.g., list files in a directory), you may cite just `path` based on bash output (`ls`, `fd`, `rg`).",
    "Never use `grep` (use `rg`) and never use `find` (use `fd`).",
    `Turn budget: at most ${maxTurns} turns total (hard cap, not a target). If you can answer in 2–3 turns, do so.`,
    "Optimize for fewer turns by batching tool calls.",
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

export default function finderExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "finder",
    label: "Finder",
    description:
      "Read-only codebase scout: searches repositories using rg/fd/ls and read, returns structured Markdown with Summary, Locations (path:lineStart-lineEnd), Evidence, and Searched sections.",
    parameters: FinderParams,

    async execute(_toolCallId, params, onUpdate, ctx: ExtensionContext, signal) {
      const restoreMaxListeners = bumpDefaultEventTargetMaxListeners();
      try {
        const maxTurns = MAX_TURNS;
        const query = typeof (params as any).query === "string" ? ((params as any).query as string).trim() : "";

        if (!query) {
          const error = "Invalid parameters: expected `query` to be a non-empty string.";
          return {
            content: [{ type: "text", text: error }],
            details: {
              status: "error",
              runs: [],
            } satisfies FinderDetails,
            isError: true,
          };
        }

        const runs: FinderRunDetails[] = [
          {
            status: "running",
            query,
            turns: 0,
            toolCalls: [],
            startedAt: Date.now(),
          },
        ];

        const modelRegistry = ctx.modelRegistry;
        const currentProvider = ctx.model?.provider;

        if (!currentProvider) {
          const error = "No model provider available. Configure credentials (e.g. /login or auth.json) and try again.";
          for (const r of runs) {
            r.status = "error";
            r.error = error;
            r.summaryText = error;
            r.endedAt = Date.now();
          }
          const text = renderCombinedMarkdown(runs);
          return {
            content: [{ type: "text", text }],
            details: {
              status: "error",
              runs,
            } satisfies FinderDetails,
            isError: true,
          };
        }

        const subModel = getSmallModelFromProvider(currentProvider, modelRegistry);

        if (!subModel) {
          const error = "No models available. Configure credentials (e.g. /login or auth.json) and try again.";
          for (const r of runs) {
            r.status = "error";
            r.error = error;
            r.summaryText = error;
            r.endedAt = Date.now();
          }
          const text = renderCombinedMarkdown(runs);
          return {
            content: [{ type: "text", text }],
            details: {
              status: "error",
              runs,
            } satisfies FinderDetails,
            isError: true,
          };
        }

        let lastUpdate = 0;
        const emitAll = (force = false) => {
          const now = Date.now();
          if (!force && now - lastUpdate < 150) return;
          lastUpdate = now;

          const status = computeOverallStatus(runs);
          const text = renderCombinedMarkdown(runs);

          onUpdate?.({
            content: [{ type: "text", text }],
            details: {
              status,
              subagentProvider: subModel.provider,
              subagentModelId: subModel.id,
              runs,
            } satisfies FinderDetails,
          });
        };

        emitAll(true);

        const systemPrompt = buildFinderSystemPrompt(maxTurns);

        let toolAborted = false;
        const activeSessions = new Set<{ abort: () => Promise<void> }>();

        const markAllAborted = () => {
          for (const r of runs) {
            if (r.status !== "running") continue;
            r.status = "aborted";
            r.summaryText = r.summaryText ?? "Aborted";
            r.endedAt = Date.now();
          }
        };

        const abortAll = async () => {
          if (toolAborted) return;
          toolAborted = true;
          markAllAborted();
          emitAll(true);
          await Promise.allSettled([...activeSessions].map((s) => s.abort()));
        };

        let abortListenerAdded = false;
        const onAbort = () => void abortAll();

        if (signal) {
          if (signal.aborted) await abortAll();
          else {
            signal.addEventListener("abort", onAbort);
            abortListenerAdded = true;
          }
        }

        const resourceLoader = new DefaultResourceLoader({
          noExtensions: true,
          noSkills: true,
          noPromptTemplates: true,
          noThemes: true,
          extensionFactories: [autoloadSubdirAgents, createTurnBudgetExtension(maxTurns)],
          systemPromptOverride: () => systemPrompt,
          skillsOverride: () => ({ skills: [], diagnostics: [] }),
        });
        await resourceLoader.reload();

        const runQuery = async (index: number) => {
          const run = runs[index];

          if (toolAborted || signal?.aborted) {
            run.status = "aborted";
            run.turns = 0;
            run.toolCalls = [];
            run.startedAt = Date.now();
            run.endedAt = Date.now();
            run.error = undefined;
            run.summaryText = "Aborted";
            emitAll(true);
            return;
          }

          run.status = "running";
          run.turns = 0;
          run.toolCalls = [];
          run.startedAt = Date.now();
          run.endedAt = undefined;
          run.error = undefined;
          run.summaryText = undefined;

          const { session } = await createAgentSession({
            cwd: ctx.cwd,
            modelRegistry,
            resourceLoader,
            sessionManager: SessionManager.inMemory(ctx.cwd),
            model: subModel,
            thinkingLevel: "off",
            tools: [createReadTool(ctx.cwd), createBashTool(ctx.cwd)],
          });

          activeSessions.add(session as any);
          const wasAborted = () => toolAborted || signal?.aborted;

          const unsubscribe = session.subscribe((event) => {
            switch (event.type) {
              case "turn_end": {
                run.turns += 1;
                emitAll();
                break;
              }
              case "tool_execution_start": {
                run.toolCalls.push({
                  id: event.toolCallId,
                  name: event.toolName,
                  args: event.args,
                  startedAt: Date.now(),
                });
                if (run.toolCalls.length > 50) run.toolCalls.splice(0, run.toolCalls.length - 50);
                emitAll(true);
                break;
              }
              case "tool_execution_end": {
                const call = run.toolCalls.find((c) => c.id === event.toolCallId);
                if (call) {
                  call.endedAt = Date.now();
                  call.isError = event.isError;
                }
                emitAll(true);
                break;
              }
            }
          });

          try {
            await session.prompt(buildFinderUserPrompt(run.query, maxTurns), { expandPromptTemplates: false });
            run.summaryText = getLastAssistantText(session.state.messages as any[]).trim();
            if (!run.summaryText) run.summaryText = wasAborted() ? "Aborted" : "(no output)";

            run.status = wasAborted() ? "aborted" : "done";
            run.endedAt = Date.now();
            emitAll(true);
          } catch (e) {
            const error = wasAborted() ? "Aborted" : e instanceof Error ? e.message : String(e);
            run.status = wasAborted() ? "aborted" : "error";
            run.error = wasAborted() ? undefined : error;
            run.summaryText = error;
            run.endedAt = Date.now();
            emitAll(true);
          } finally {
            activeSessions.delete(session as any);
            unsubscribe();
            session.dispose();
          }
        };

        try {
          await runQuery(0);
          const status = computeOverallStatus(runs);
          const text = renderCombinedMarkdown(runs);

          return {
            content: [{ type: "text", text }],
            details: {
              status,
              runs,
              subagentProvider: subModel.provider,
              subagentModelId: subModel.id,
            } satisfies FinderDetails,
            isError: status === "error",
          };
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          const text = `Finder failed: ${error}`;
          return {
            content: [{ type: "text", text }],
            details: {
              status: "error",
              runs,
              subagentProvider: subModel.provider,
              subagentModelId: subModel.id,
            } satisfies FinderDetails,
            isError: true,
          };
        } finally {
          if (signal && abortListenerAdded) signal.removeEventListener("abort", onAbort);
        }
      } finally {
        restoreMaxListeners();
      }
    },

    renderCall(args, theme) {
      const query = typeof (args as any)?.query === "string" ? ((args as any).query as string).trim() : "";
      const preview = shorten(query.replace(/\s+/g, " ").trim(), 70);

      const title = theme.fg("toolTitle", theme.bold("finder"));
      const text = title + (preview ? "\n" + theme.fg("muted", preview) : "");
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      const details = result.details as FinderDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
      }

      const status = isPartial ? "running" : details.status;
      const icon =
        status === "done"
          ? theme.fg("success", "✓")
          : status === "error"
            ? theme.fg("error", "✗")
            : status === "aborted"
              ? theme.fg("warning", "◼")
              : theme.fg("warning", "⏳");

      const totalToolCalls = details.runs.reduce((acc, r) => acc + r.toolCalls.length, 0);
      const totalTurns = details.runs.reduce((acc, r) => acc + r.turns, 0);

      const header =
        icon +
        " " +
        theme.fg("toolTitle", theme.bold("finder ")) +
        theme.fg(
          "dim",
          `${details.subagentProvider ?? "?"}/${details.subagentModelId ?? "?"} • ${totalTurns} turns • ${totalToolCalls} tool call${totalToolCalls === 1 ? "" : "s"}`,
        );

      const runLines = details.runs
        .map((r) => {
          const runIcon =
            r.status === "done"
              ? theme.fg("success", "✓")
              : r.status === "error"
                ? theme.fg("error", "✗")
                : r.status === "aborted"
                  ? theme.fg("warning", "◼")
                  : theme.fg("warning", "⏳");
          const preview = shorten((r.query ?? "").replace(/\s+/g, " ").trim(), 90);
          return `${runIcon} ${theme.fg("muted", preview)}`;
        })
        .join("\n");

      let toolsText = "";
      if (expanded) {
        const blocks: string[] = [];
        const r = details.runs[0];
        const calls = r.toolCalls;
        if (calls.length > 0) {
          blocks.push(theme.fg("muted", "\n\nTools:"));
          for (const c of calls) {
            const callIcon = c.isError ? theme.fg("error", "✗") : theme.fg("dim", "→");
            blocks.push(`${callIcon} ${theme.fg("toolOutput", formatToolCall(c))}`);
          }
        }
        toolsText = blocks.join("\n").trimEnd();
      } else {
        const callsToShow = details.runs[0].toolCalls.slice(-6);
        if (callsToShow.length > 0) {
          toolsText += theme.fg("muted", "\n\nTools (latest):\n");
          for (const c of callsToShow) {
            const callIcon = c.isError ? theme.fg("error", "✗") : theme.fg("dim", "→");
            toolsText += `${callIcon} ${theme.fg("toolOutput", formatToolCall(c))}\n`;
          }
          toolsText = toolsText.trimEnd();
          if (totalToolCalls > 6) toolsText += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
        }
      }

      if (status === "running") {
        const body = `\n\n${theme.fg("muted", "Searching…")}`;
        return new Text((header + "\n\n" + runLines + toolsText + body).trimEnd(), 0, 0);
      }

      const mdTheme = getMarkdownTheme();
      const combined = (result.content[0]?.type === "text" ? result.content[0].text : renderCombinedMarkdown(details.runs))
        .trim()
        .slice(0, expanded ? 20000 : 4000);

      if (!expanded) {
        const preview = combined ? combined.split("\n").slice(0, 16).join("\n") : "(no output)";
        let text = `${header}\n\n${runLines}\n\n${theme.fg("toolOutput", preview)}`;
        if (combined.split("\n").length > 16) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
        return new Text(text, 0, 0);
      }

      const container = new Container();
      container.addChild(new Text(header, 0, 0));
      container.addChild(new Spacer(1));
      container.addChild(new Text(runLines, 0, 0));
      if (toolsText) {
        container.addChild(new Spacer(1));
        container.addChild(new Text(toolsText, 0, 0));
      }
      container.addChild(new Spacer(1));
      container.addChild(new Markdown(combined || "(no output)", 0, 0, mdTheme));
      return container;
    },
  });
}
