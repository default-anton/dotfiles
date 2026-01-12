import { getModel } from "@mariozechner/pi-ai";
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

const MAX_TURNS = 10;

const FinderParams = Type.Object({
  queries: Type.Array(
    Type.String({
      description: [
        "A self-contained codebase search request for the Finder subagent.",
        "Include: (1) goal, (2) expected keywords/identifiers, (3) desired output (paths + line ranges), (4) success criteria.",
      ].join(" "),
    }),
    {
      minItems: 1,
      maxItems: 4,
      description: "One to four independent Finder queries. They will run concurrently.",
    },
  ),
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
  queries: string[];
  subagentProvider?: string;
  subagentModelId?: string;
  maxTurns: number;
  runs: FinderRunDetails[];
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
  const blocks: string[] = [];
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    const header = `### Query ${i + 1}\n\n${r.query.trim()}`;
    const body = (r.summaryText ?? (r.status === "running" ? "(searching...)" : "(no output)")).trim();
    blocks.push([header, "", body].join("\n"));
  }
  return blocks.join("\n\n---\n\n");
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
      "Read-only codebase scout: spawns isolated subagents that search with bash/read (e.g., rg/fd/ls + read) and return evidence-backed Markdown summaries with citations (path:lineStart-lineEnd).",
    parameters: FinderParams,

    async execute(_toolCallId, params, onUpdate, ctx, signal) {
      const startedAt = Date.now();
      const maxTurns = MAX_TURNS;
      const queries = Array.isArray((params as any).queries) ? ((params as any).queries as string[]) : [];

      if (queries.length < 1 || queries.length > 4 || queries.some((q) => typeof q !== "string" || !q.trim())) {
        const error = "Invalid parameters: expected `queries` to be an array of 1–4 non-empty strings.";
        return {
          content: [{ type: "text", text: error }],
          details: {
            status: "error",
            queries,
            maxTurns,
            runs: [],
            startedAt,
            endedAt: Date.now(),
          } satisfies FinderDetails,
          isError: true,
        };
      }

      const runs: FinderRunDetails[] = queries.map((query) => ({
        status: "running",
        query,
        turns: 0,
        toolCalls: [],
        startedAt: Date.now(),
      }));

      const authStorage = discoverAuthStorage();
      const modelRegistry = ctx.modelRegistry ?? discoverModels(authStorage);

      const subModel = getModel(
        process.env.PI_SMALL_PROVIDER ?? "zai",
        process.env.PI_SMALL_MODEL ?? "glm-4.7"
      );

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
            queries,
            maxTurns,
            runs,
            startedAt,
            endedAt: Date.now(),
          } satisfies FinderDetails,
          isError: true,
        };
      }

      const subagentProvider = subModel.provider;
      const subagentModelId = subModel.id;

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
            queries,
            subagentProvider,
            subagentModelId,
            maxTurns,
            runs,
            startedAt,
          } satisfies FinderDetails,
        });
      };

      emitAll(true);

      const contextFiles = discoverContextFiles(ctx.cwd);
      const systemPrompt = buildFinderSystemPrompt(maxTurns);

      const runQuery = async (index: number) => {
        const run = runs[index];
        run.status = "running";
        run.turns = 0;
        run.toolCalls = [];
        run.startedAt = Date.now();
        run.endedAt = undefined;
        run.error = undefined;
        run.summaryText = undefined;

        const { session } = await createAgentSession({
          cwd: ctx.cwd,
          authStorage,
          modelRegistry,
          sessionManager: SessionManager.inMemory(ctx.cwd),
          model: subModel,
          thinkingLevel: "off",
          tools: [createReadTool(ctx.cwd), createBashTool(ctx.cwd)],
          customTools: [],
          extensions: [autoloadSubdirAgents, createTurnBudgetExtension(maxTurns)],
          skills: [],
          contextFiles,
          systemPrompt,
        });

        let aborted = false;
        const abort = async () => {
          aborted = true;
          run.status = "aborted";
          run.summaryText = run.summaryText ?? "Aborted";
          run.endedAt = Date.now();
          emitAll(true);
          try {
            await session.abort();
          } catch {
            // ignore
          }
        };

        if (signal) {
          if (signal.aborted) await abort();
          else signal.addEventListener("abort", () => void abort(), { once: true });
        }

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
          if (!run.summaryText) run.summaryText = aborted ? "Aborted" : "(no output)";

          run.status = aborted ? "aborted" : "done";
          run.endedAt = Date.now();
          emitAll(true);
        } catch (e) {
          const error = aborted ? "Aborted" : e instanceof Error ? e.message : String(e);
          run.status = aborted ? "aborted" : "error";
          run.error = aborted ? undefined : error;
          run.summaryText = error;
          run.endedAt = Date.now();
          emitAll(true);
        } finally {
          unsubscribe();
          session.dispose();
        }
      };

      try {
        await Promise.all(queries.map((_, i) => runQuery(i)));
        const endedAt = Date.now();
        const status = computeOverallStatus(runs);
        const text = renderCombinedMarkdown(runs);

        return {
          content: [{ type: "text", text }],
          details: {
            status,
            queries,
            subagentProvider,
            subagentModelId,
            maxTurns,
            runs,
            startedAt,
            endedAt,
          } satisfies FinderDetails,
          isError: status === "error",
        };
      } catch (e) {
        const endedAt = Date.now();
        const error = e instanceof Error ? e.message : String(e);
        const text = `Finder failed: ${error}`;
        return {
          content: [{ type: "text", text }],
          details: {
            status: "error",
            queries,
            subagentProvider,
            subagentModelId,
            maxTurns,
            runs,
            startedAt,
            endedAt,
          } satisfies FinderDetails,
          isError: true,
        };
      }
    },

    renderCall(args, theme) {
      const queries = Array.isArray((args as any)?.queries) ? (((args as any).queries as any[]) ?? []) : [];
      const previews = queries
        .filter((q) => typeof q === "string")
        .slice(0, 4)
        .map((q) => shorten(String(q).replace(/\s+/g, " ").trim(), 70));

      const title = theme.fg("toolTitle", theme.bold("finder")) + theme.fg("dim", ` (${previews.length} quer${previews.length === 1 ? "y" : "ies"})`);
      const text = title + (previews.length ? "\n" + theme.fg("muted", previews.join("\n")) : "");
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

      const doneCount = details.runs.filter((r) => r.status === "done").length;
      const errorCount = details.runs.filter((r) => r.status === "error").length;
      const abortedCount = details.runs.filter((r) => r.status === "aborted").length;
      const totalToolCalls = details.runs.reduce((acc, r) => acc + r.toolCalls.length, 0);
      const totalTurns = details.runs.reduce((acc, r) => acc + r.turns, 0);

      const header =
        icon +
        " " +
        theme.fg("toolTitle", theme.bold("finder ")) +
        theme.fg(
          "dim",
          `${details.subagentProvider ?? "?"}/${details.subagentModelId ?? "?"} • ${doneCount}/${details.runs.length} done • ${errorCount} error • ${abortedCount} aborted • ${totalTurns} turns • ${totalToolCalls} tool call${totalToolCalls === 1 ? "" : "s"}`,
        );

      const runLines = details.runs
        .map((r, i) => {
          const runIcon =
            r.status === "done"
              ? theme.fg("success", "✓")
              : r.status === "error"
                ? theme.fg("error", "✗")
                : r.status === "aborted"
                  ? theme.fg("warning", "◼")
                  : theme.fg("warning", "⏳");
          const preview = shorten((r.query ?? "").replace(/\s+/g, " ").trim(), 90);
          return `${runIcon} ${theme.fg("dim", `Q${i + 1}`)} ${theme.fg("muted", preview)}`;
        })
        .join("\n");

      let toolsText = "";
      if (expanded) {
        const blocks: string[] = [];
        for (let i = 0; i < details.runs.length; i++) {
          const r = details.runs[i];
          const calls = r.toolCalls;
          if (calls.length === 0) continue;
          blocks.push(theme.fg("muted", `\n\nTools (Q${i + 1}):`));
          for (const c of calls) {
            const callIcon = c.isError ? theme.fg("error", "✗") : theme.fg("dim", "→");
            blocks.push(`${callIcon} ${theme.fg("toolOutput", formatToolCall(c))}`);
          }
        }
        toolsText = blocks.join("\n").trimEnd();
      } else {
        const lastCalls: { q: number; call: ToolCall }[] = [];
        for (let i = 0; i < details.runs.length; i++) {
          const r = details.runs[i];
          for (const c of r.toolCalls.slice(-3)) lastCalls.push({ q: i + 1, call: c });
        }
        const callsToShow = lastCalls.slice(-6);
        if (callsToShow.length > 0) {
          toolsText += theme.fg("muted", "\n\nTools (latest):\n");
          for (const item of callsToShow) {
            const c = item.call;
            const callIcon = c.isError ? theme.fg("error", "✗") : theme.fg("dim", "→");
            toolsText += `${callIcon} ${theme.fg("dim", `Q${item.q}`)} ${theme.fg("toolOutput", formatToolCall(c))}\n`;
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
