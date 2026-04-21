import type {
  ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type, type Static } from "@sinclair/typebox";
import {
  runSpawnSubagent,
  shouldRegisterSpawnSubagent,
  type SpawnSubagentDetails,
} from "./runner.ts";

const SpawnSubagentParams = Type.Object({
  instructions: Type.String({
    description: "Task brief sent to the child as its next prompt",
    minLength: 1,
  }),
  task_title: Type.String({
    description: "Short UI label for this subagent run. Not sent to the child. Do not put required instructions or context here",
    minLength: 1,
  }),
  session_id: Type.Optional(
    Type.String({
      description: "Optional prior subagent session ID. If set, the child continues that session with these instructions",
      minLength: 1,
    }),
  ),
  model: Type.Optional(
    Type.String({
      description: "Optional child model override, passed exactly as pi --model accepts. Leave unset to inherit the current model and thinking level",
    }),
  ),
});

type SpawnSubagentParams = Static<typeof SpawnSubagentParams>;

function previewFallback(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "(no output)";
  }

  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117)}...`;
}

function formatTokens(count: number): string {
  if (count < 1000) {
    return count.toString();
  }

  if (count < 10_000) {
    return `${(count / 1000).toFixed(1)}k`;
  }

  if (count < 1_000_000) {
    return `${Math.round(count / 1000)}k`;
  }

  return `${(count / 1_000_000).toFixed(1)}M`;
}

function formatCost(costUsd: number): string {
  if (costUsd === 0) {
    return "$0.000";
  }

  if (costUsd < 0.001) {
    return `$${costUsd.toFixed(4)}`;
  }

  if (costUsd < 1) {
    return `$${costUsd.toFixed(3)}`;
  }

  return `$${costUsd.toFixed(2)}`;
}

function getResultText(result: { content: Array<{ type: string; text?: string }> }): string | undefined {
  const text = result.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return text || undefined;
}

function coerceErrorDetails(
  result: { content: Array<{ type: string; text?: string }> },
  previous: SpawnSubagentDetails | undefined,
  isError: boolean,
): SpawnSubagentDetails | undefined {
  if (!previous) {
    return undefined;
  }

  if (!isError) {
    return previous;
  }

  const errorText = getResultText(result);
  return {
    ...previous,
    status: "error",
    stopReason: previous.stopReason ?? "aborted",
    error: previous.error || errorText,
    answerPreview: previous.answerPreview || previewFallback(errorText || ""),
  };
}

function renderUsage(details: SpawnSubagentDetails, theme: any): string {
  const costLabel = `${formatCost(details.usage.costUsd)}${details.usage.usingSubscription ? " (sub)" : ""}`;
  const cost = theme.fg("dim", costLabel);
  const contextWindow = details.usage.contextWindow;
  const contextTokens = details.usage.contextTokens;

  if (!contextWindow || contextWindow <= 0) {
    if (typeof contextTokens === "number") {
      return `${cost} ${theme.fg("dim", `ctx:${formatTokens(contextTokens)}`)}`;
    }

    return cost;
  }

  if (typeof contextTokens !== "number") {
    return `${cost} ${theme.fg("dim", `?/${formatTokens(contextWindow)}`)}`;
  }

  const percent = (contextTokens / contextWindow) * 100;
  const contextText = `${percent.toFixed(1)}%/${formatTokens(contextWindow)}`;
  const contextColor = percent > 90 ? "error" : percent > 70 ? "warning" : "dim";
  return `${cost} ${theme.fg(contextColor, contextText)}`;
}

function renderDetails(details: SpawnSubagentDetails, theme: any, expanded: boolean): string {
  const statusIcon =
    details.status === "running"
      ? theme.fg("warning", "⏳")
      : details.status === "success"
        ? theme.fg("success", "✓")
        : theme.fg("error", "✗");
  const statusLabel =
    details.status === "running"
      ? theme.fg("warning", "running")
      : details.status === "success"
        ? theme.fg("success", "done")
        : theme.fg("error", "failed");

  let text = `${statusIcon} ${theme.fg("muted", "status")} ${statusLabel}`;
  text += `\n${theme.fg("muted", "turns")} ${theme.fg("text", String(details.turnCount))}  ${theme.fg("muted", "tool calls")} ${theme.fg("text", String(details.toolCallCount))}`;
  text += `\n${theme.fg("muted", "usage")} ${renderUsage(details, theme)}`;

  text += `\n${theme.fg("muted", "last tool calls")}`;
  if (details.lastToolCalls.length === 0) {
    text += `\n  ${theme.fg("dim", "none yet")}`;
  } else {
    for (const toolCall of details.lastToolCalls) {
      text += `\n  ${theme.fg("dim", "•")} ${theme.fg("text", toolCall)}`;
    }
  }

  text += `\n${theme.fg("muted", "answer preview")} ${theme.fg("dim", details.answerPreview || "(none yet)")}`;

  if (expanded) {
    text += `\n${theme.fg("muted", "model")} ${theme.fg("dim", details.modelArg)}`;
    if (details.childModel !== details.modelArg) {
      text += `\n${theme.fg("muted", "resolved model")} ${theme.fg("dim", details.childModel)}`;
    }
    if (details.sessionId) {
      text += `\n${theme.fg("muted", "session id")} ${theme.fg("dim", details.sessionId)}`;
    }
    if (details.stopReason) {
      text += `\n${theme.fg("muted", "stop reason")} ${theme.fg("dim", details.stopReason)}`;
    }
    if (details.error) {
      text += `\n${theme.fg("muted", "error")} ${theme.fg("error", details.error)}`;
    }
  }

  return text;
}

export default function spawnSubagentExtension(pi: ExtensionAPI) {
  if (!shouldRegisterSpawnSubagent()) {
    return;
  }

  pi.registerTool({
    name: "run_subagent",
    label: "Run Subagent",
    description:
      "Run a bounded subagent in a fresh pi subprocess. The child shares the current cwd/worktree and inherits the same system prompt, extensions, and tools. run_subagent is disabled in the child to prevent recursion. If session_id is set, the child continues that prior subagent session with the provided instructions. Keep concurrent run_subagent calls to 8 or fewer; higher fan-out is not supported reliably.",
    parameters: SpawnSubagentParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const typedParams = params as SpawnSubagentParams;
      const result = await runSpawnSubagent({
        instructions: typedParams.instructions,
        taskTitle: typedParams.task_title,
        sessionId: typedParams.session_id,
        model: typedParams.model,
        cwd: ctx.cwd,
        currentModel: ctx.model
          ? {
            provider: ctx.model.provider,
            id: ctx.model.id,
            name: ctx.model.name,
            contextWindow: ctx.model.contextWindow,
            usingSubscription: ctx.modelRegistry.isUsingOAuth(ctx.model),
          }
          : undefined,
        availableModels: ctx.modelRegistry.getAvailable().map((model) => ({
          provider: model.provider,
          id: model.id,
          name: model.name,
          contextWindow: model.contextWindow,
          usingSubscription: ctx.modelRegistry.isUsingOAuth(model),
        })),
        activeTools: pi.getActiveTools(),
        thinkingLevel: pi.getThinkingLevel(),
        signal,
        onUpdate: onUpdate
          ? (details) => {
            onUpdate({
              content: [{ type: "text", text: details.answerPreview || "(running...)" }],
              details,
            });
          }
          : undefined,
      });

      if (result.details.status === "error") {
        throw new Error(result.contentText);
      }

      return {
        content: [{ type: "text", text: result.contentText }],
        details: result.details,
      };
    },

    renderCall(args, theme) {
      let text =
        theme.fg("toolTitle", theme.bold("run_subagent ")) + theme.fg("accent", args.task_title || "(untitled)");
      if (args.session_id) {
        text += ` ${theme.fg("dim", `↻ ${args.session_id}`)}`;
      }
      if (args.model) {
        text += ` ${theme.fg("dim", args.model)}`;
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme, context) {
      const state = context.state as { lastDetails?: SpawnSubagentDetails };
      const incomingDetails = result.details as SpawnSubagentDetails | undefined;
      if (incomingDetails) {
        state.lastDetails = incomingDetails;
      }

      const details = coerceErrorDetails(result, incomingDetails || state.lastDetails, context.isError);
      if (!details) {
        const content = result.content[0];
        const text = content?.type === "text" ? previewFallback(content.text) : "(no output)";
        return new Text(text, 0, 0);
      }

      return new Text(renderDetails(details, theme, expanded), 0, 0);
    },
  });
}
