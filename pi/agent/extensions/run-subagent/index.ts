import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type, type Static } from "@sinclair/typebox";
import {
  runSpawnSubagent,
  shouldRegisterSpawnSubagent,
  type SpawnSubagentDetails,
} from "./runner.ts";

const SpawnSubagentParams = Type.Object({
  instructions: Type.String({
    description:
      "Standalone task brief sent to the child as its prompt. The child does not see the parent conversation, so include the goal, relevant context, constraints, concrete scope, expected deliverable, and validation to run before finishing.",
    minLength: 1,
  }),
  task_title: Type.String({
    description: "Short UI label for this subagent run. Not sent to the child. Do not put required instructions or context here.",
    minLength: 1,
  }),
  model: Type.Optional(
    Type.String({
      description:
        "Optional child model override, passed exactly as pi --model accepts. Leave unset to inherit the current model and thinking level. Override only when a smaller/faster or stronger model materially helps the subtask.",
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

  let text = `${statusIcon} ${theme.fg("toolTitle", theme.bold("run_subagent "))}${theme.fg("accent", details.taskTitle)}`;
  text += `\n${theme.fg("muted", "status")} ${statusLabel}`;
  text += `\n${theme.fg("muted", "turns")} ${theme.fg("text", String(details.turnCount))}  ${theme.fg("muted", "tool calls")} ${theme.fg("text", String(details.toolCallCount))}`;

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
      "Run a bounded subagent in a fresh pi subprocess. The child shares the current cwd/worktree and inherits the same on-disk system prompt, extensions, and tools, but it does not receive the parent conversation or plan unless you include that context in instructions. This call blocks until the child finishes. run_subagent is disabled in the child to prevent recursion.",
    promptSnippet:
      "Run a bounded subagent in a fresh pi subprocess when the user explicitly asks for delegated or parallel agent work.",
    promptGuidelines: [
      "Use run_subagent only when the user explicitly authorizes subagents, delegation, or parallel agent work.",
      "run_subagent blocks until the child finishes. Do not delegate the immediate next blocking step if doing it yourself is simpler or faster.",
      "The child starts in a fresh conversation. Put all operative context, constraints, deliverables, and validation expectations in instructions.",
      "task_title is UI-only. Put required instructions in instructions, not task_title.",
      "The child shares the same worktree. Give it a concrete scope, avoid overlapping write ownership, and tell it to adapt to concurrent changes instead of reverting unrelated edits.",
    ],
    parameters: SpawnSubagentParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const typedParams = params as SpawnSubagentParams;
      const result = await runSpawnSubagent({
        instructions: typedParams.instructions,
        taskTitle: typedParams.task_title,
        model: typedParams.model,
        cwd: ctx.cwd,
        currentModel: ctx.model
          ? {
              provider: ctx.model.provider,
              id: ctx.model.id,
            }
          : undefined,
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
      if (args.model) {
        text += ` ${theme.fg("dim", args.model)}`;
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as SpawnSubagentDetails | undefined;
      if (!details) {
        const content = result.content[0];
        const text = content?.type === "text" ? previewFallback(content.text) : "(no output)";
        return new Text(text, 0, 0);
      }

      return new Text(renderDetails(details, theme, expanded), 0, 0);
    },
  });
}
