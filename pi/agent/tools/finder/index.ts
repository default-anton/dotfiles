import os from "node:os";
import nodePath from "node:path";

import type { CustomAgentTool, CustomToolFactory, HookFactory } from "@mariozechner/pi-coding-agent";
import {
  SessionManager,
  createAgentSession,
  createReadOnlyTools,
  discoverAuthStorage,
  discoverContextFiles,
  discoverModels,
  getMarkdownTheme,
} from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import autoloadSubdirAgents from "../../hooks/autoload-subdir-agents";

const autoloadSubdirAgentsPath = nodePath.join(os.homedir(), ".dotfiles/pi/agent/hooks/autoload-subdir-agents.ts");

const DEFAULT_MAX_TURNS = 10;

const FinderParams = Type.Object({
  query: Type.String({
    description: [
      "A self-contained codebase search request for the Finder subagent.",
      "Include: (1) goal, (2) expected keywords/identifiers, (3) desired output (paths + line ranges), (4) success criteria.",
    ].join(" "),
  }),
  maxTurns: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 25,
      default: DEFAULT_MAX_TURNS,
      description: "Maximum number of agent turns allowed for this search (includes the final answering turn).",
    }),
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

interface FinderDetails {
  status: FinderStatus;
  query: string;
  currentProvider?: string;
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
    const path = typeof args?.path === "string" ? args.path : typeof args?.file_path === "string" ? args.file_path : "";
    const offset = typeof args?.offset === "number" ? args.offset : undefined;
    const limit = typeof args?.limit === "number" ? args.limit : undefined;
    const range = offset || limit ? `:${offset ?? 1}${limit ? `-${(offset ?? 1) + limit - 1}` : ""}` : "";
    return `read ${path}${range}`;
  }

  return call.name;
}

function buildFinderSystemPrompt(maxTurns: number): string {
  return [
    "You are Finder, an evidence-first repository scout.",
    "You operate in a read-only environment and may only use the provided tools (ls/find/grep/read).",
    "Your job: locate and cite the exact code locations that answer the manager's query.",
    "",
    `Turn budget: you have at most ${maxTurns} turns total (including the final answering turn).`,
    "To conserve turns, batch independent searches: you may issue multiple tool calls in a single turn (e.g., several grep/find/read calls).",
    "Finish as soon as you can answer with high confidence — do NOT try to use all available turns.",
    "Tool use is disabled on the last allowed turn; once you have enough evidence, produce your final answer immediately.",
    "",
    "Non-negotiable constraints:",
    "- Do not modify files, propose patches, or refactor.",
    "- Do not guess: every claim must be supported by evidence you actually read.",
    "- Avoid large dumps: only include minimal snippets (≈5–15 lines) when needed.",
    "",
    "How to work:",
    "1) Translate the query into a checklist of things to locate.",
    "2) Search broadly (grep/find), then narrow.",
    "3) Validate by opening the smallest relevant ranges with read when you need line-level evidence.",
    "   If the query is only about file paths / directory structure, prefer ls/find and do not open files unnecessarily.",
    "   When you do use read, always include offset+limit so you can cite line ranges.",
    "",
    "Citations:",
    "- For claims about file contents, cite as `path:lineStart-lineEnd` using the read ranges you opened.",
    "- For claims only about the existence of files/paths (e.g., directory listings), you may cite just `path` based on ls/find output.",
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
    "For path-only results (e.g., list files in a directory), you may cite just `path` based on ls/find output.",
    `Turn budget: ${maxTurns} turns total. Optimize for fewer turns by batching tool calls.`,
    "",
    "Query:",
    query.trim(),
  ].join("\n");
}

function createTurnBudgetHook(maxTurns: number): HookFactory {
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
        content: [...event.content, { type: "text", text: `\n\n${budgetLine}` }],
      };
    });
  };
}

type HasProviderAndId = { provider: string; id: string };

function selectSubagentModel<T extends HasProviderAndId>(models: T[], currentProvider?: string): T | undefined {
  if (models.length === 0) return undefined;

  const preferredIdsByProvider: Record<string, string[]> = {
    "google-antigravity": ["gemini-3-flash"],
    "google-vertex": ["gemini-3-flash-preview"],
    openai: ["gpt-5.1-codex-mini"],
    anthropic: ["claude-haiku-4-5"],
  };

  const pickFromProvider = (provider: string): T | undefined => {
    const providerModels = models.filter((m) => m.provider === provider);
    if (providerModels.length === 0) return undefined;

    const preferredIds = preferredIdsByProvider[provider] ?? [];
    for (const id of preferredIds) {
      const match = providerModels.find((m) => m.id === id);
      if (match) return match;
    }

    const heuristic = providerModels.find((m) => /flash|haiku|mini/i.test(m.id));
    return heuristic ?? providerModels[0];
  };

  if (currentProvider) {
    const match = pickFromProvider(currentProvider);
    if (match) return match;
  }

  const globalPreferred: Array<{ provider: string; id: string }> = [
    { provider: "google-vertex", id: "gemini-3-flash-preview" },
    { provider: "google-antigravity", id: "gemini-3-flash" },
    { provider: "openai", id: "gpt-5.1-codex-mini" },
    { provider: "anthropic", id: "claude-haiku-4-5" },
  ];

  for (const pref of globalPreferred) {
    const match = models.find((m) => m.provider === pref.provider && m.id === pref.id);
    if (match) return match;
  }

  const heuristic = models.find((m) => /flash|haiku|mini/i.test(m.id));
  return heuristic ?? models[0];
}

const factory: CustomToolFactory = (pi) => {
  let lastDetectedProvider: string | undefined;

  const tool: CustomAgentTool<typeof FinderParams, FinderDetails> = {
    name: "finder",
    label: "Finder",
    description:
      "Read-only codebase scout: spawns an isolated subagent that searches with ls/find/grep/read and returns an evidence-backed Markdown summary with citations (path:lineStart-lineEnd).",
    parameters: FinderParams,

    async execute(_toolCallId, params, signal, onUpdate) {
      const startedAt = Date.now();
      const toolCalls: ToolCall[] = [];
      let turns = 0;
      let summaryText = "";
      const maxTurns = params.maxTurns ?? DEFAULT_MAX_TURNS;

      const currentProvider = (() => {
        try {
          const sessionManager = SessionManager.continueRecent(pi.cwd);
          return sessionManager.buildSessionContext().model?.provider;
        } catch {
          return undefined;
        }
      })();
      lastDetectedProvider = currentProvider;

      const authStorage = discoverAuthStorage();
      const modelRegistry = discoverModels(authStorage);

      const availableModels = await modelRegistry.getAvailable();
      const preferredModel = selectSubagentModel(availableModels, currentProvider);
      if (!preferredModel) {
        const error = "No models available. Configure credentials (e.g. /login or auth.json) and try again.";
        summaryText = error;
        return {
          content: [{ type: "text", text: error }],
          details: {
            status: "error",
            query: params.query,
            currentProvider,
            turns,
            maxTurns,
            toolCalls,
            summaryText,
            error,
            startedAt,
            endedAt: Date.now(),
          },
          isError: true,
        };
      }

      const subModel = preferredModel;
      const subagentProvider = subModel.provider;
      const subagentModelId = subModel.id;

      const emit = (details: Partial<FinderDetails> & { status: FinderStatus }) => {
        const text =
          details.summaryText ??
          summaryText ??
          (details.status === "running" ? "(searching...)" : "(no output yet)");

        onUpdate?.({
          content: [{ type: "text", text }],
          details: {
            query: params.query,
            currentProvider,
            subagentProvider,
            subagentModelId,
            turns,
            maxTurns,
            toolCalls,
            summaryText,
            startedAt,
            ...details,
          },
        });
      };

      emit({ status: "running" });

      const tools = createReadOnlyTools(pi.cwd);
      const contextFiles = discoverContextFiles(pi.cwd);
      const systemPrompt = buildFinderSystemPrompt(maxTurns);

      const { session } = await createAgentSession({
        cwd: pi.cwd,
        authStorage,
        modelRegistry,
        sessionManager: SessionManager.inMemory(pi.cwd),
        model: subModel,
        thinkingLevel: "off",
        tools,
        customTools: [],
        hooks: [
          { path: autoloadSubdirAgentsPath, factory: autoloadSubdirAgents },
          { path: "<finder-turn-budget>", factory: createTurnBudgetHook(maxTurns) },
        ],
        skills: [],
        slashCommands: [],
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

      if (signal) {
        if (signal.aborted) await abort();
        else signal.addEventListener("abort", () => void abort(), { once: true });
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
        await session.prompt(buildFinderUserPrompt(params.query, maxTurns), { expandSlashCommands: false });
        summaryText = getLastAssistantText(session.state.messages as any[]).trim();
        if (!summaryText) summaryText = aborted ? "Aborted" : "(no output)";

        const endedAt = Date.now();
        emit({ status: aborted ? "aborted" : "done", summaryText, endedAt });

        return {
          content: [{ type: "text", text: summaryText }],
          details: {
            status: aborted ? "aborted" : "done",
            query: params.query,
            currentProvider,
            subagentProvider,
            subagentModelId,
            turns,
            maxTurns,
            toolCalls,
            summaryText,
            startedAt,
            endedAt,
          },
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
            query: params.query,
            currentProvider,
            subagentProvider,
            subagentModelId,
            turns,
            maxTurns,
            toolCalls,
            summaryText,
            error,
            startedAt,
            endedAt,
          },
          isError: !aborted,
        };
      } finally {
        unsubscribe();
        session.dispose();
      }
    },

    renderCall(args, theme) {
      const providerNote = lastDetectedProvider ? theme.fg("dim", ` (${lastDetectedProvider})`) : "";
      const preview = shorten(args.query.replace(/\s+/g, " ").trim(), 90);
      const text =
        theme.fg("toolTitle", theme.bold("finder")) +
        providerNote +
        "\n" +
        theme.fg("muted", preview);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      const details = result.details as FinderDetails | undefined;
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
        theme.fg("toolTitle", theme.bold("finder ")) +
        theme.fg(
          "dim",
          `${details.subagentProvider ?? "?"}/${details.subagentModelId ?? "?"} • ${details.turns}/${details.maxTurns} turn${details.turns === 1 ? "" : "s"} • ${details.toolCalls.length} tool call${details.toolCalls.length === 1 ? "" : "s"}`,
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
        const body = `\n\n${theme.fg("muted", "Searching…")}`;
        return new Text((header + callsText + body).trimEnd(), 0, 0);
      }

      const mdTheme = getMarkdownTheme(theme);
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
  };

  return tool;
};

export default factory;
