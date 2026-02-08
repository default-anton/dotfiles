import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

const TOOL_NAME = "workflow_subagent";
const DEPTH_ENV = "PI_WORKFLOW_SUBAGENT_DEPTH";
const BLOCKED_SUBAGENT_TOOLS = new Set([TOOL_NAME]);

const MAX_SLUG_LENGTH = 64;

const APPEND_SYSTEM_PROMPT = [
  "You are executing exactly one node of a larger workflow.",
  "Treat this as delegated implementation/research work with strict scope discipline.",
  `Do not spawn ${TOOL_NAME} subagents to prevent infinite recursion.`,
  "Use normal tools (read/write/edit/bash/finder/librarian/etc.) as needed.",
  "When done, your final assistant message MUST be concise Markdown suitable as node summary.",
  "Required final sections in this order:",
  "## Completed",
  "## Files Changed",
  "## Validation",
  "## Notes",
].join("\n");

const WorkflowSubagentParams = Type.Object({
  workflowSlug: Type.String({
    description: "Short workflow slug (e.g. auth-fix-9q3). Used under .pi/workflows/<workflowSlug>.",
  }),
  nodeSlug: Type.String({
    description: "Node slug for this workflow step. Writes nodes/<nodeSlug>.task.md and .summary.md.",
  }),
  task: Type.String({
    description: "Task instructions for this node. Saved to nodes/<nodeSlug>.task.md and executed by subagent.",
  }),
  cwd: Type.Optional(Type.String({ description: "Optional working directory for the subagent process." })),
  contextPath: Type.Optional(
    Type.String({
      description:
        "Optional path to context.md. Default: .pi/workflows/<workflowSlug>/context.md (relative to cwd).",
    }),
  ),
});

type WorkflowSubagentParamsType = {
  workflowSlug: string;
  nodeSlug: string;
  task: string;
  cwd?: string;
  contextPath?: string;
};

interface WorkflowSubagentDetails {
  workflowSlug: string;
  nodeSlug: string;
  cwd: string;
  contextPath: string;
  taskPath: string;
  summaryPath: string;
  exitCode: number;
  stopReason?: string;
  errorMessage?: string;
  stderr?: string;
  model?: string;
  provider?: string;
}

function isValidSlug(slug: string): boolean {
  if (!slug || slug.length > MAX_SLUG_LENGTH) return false;
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

function toAbsolutePath(baseDir: string, maybeRelative: string): string {
  const normalizedPath = maybeRelative.trim().replace(/^@/, "");
  if (path.isAbsolute(normalizedPath)) return path.normalize(normalizedPath);
  return path.resolve(baseDir, normalizedPath);
}

function getLastAssistantTextFromMessage(message: any): string {
  if (!message || message.role !== "assistant" || !Array.isArray(message.content)) return "";
  const textBlocks = message.content
    .filter((part: any) => part?.type === "text" && typeof part?.text === "string")
    .map((part: any) => part.text as string);
  return textBlocks.join("\n").trim();
}

function rel(baseDir: string, filePath: string): string {
  const relative = path.relative(baseDir, filePath);
  if (!relative || relative.startsWith("..")) return filePath;
  return relative;
}

function buildNodePrompt(input: {
  workflowSlug: string;
  nodeSlug: string;
  contextPath: string;
  taskPath: string;
  summaryPath: string;
}): string {
  return [
    `Workflow slug: ${input.workflowSlug}`,
    `Node slug: ${input.nodeSlug}`,
    "",
    "Read these files first:",
    `- ${input.contextPath} (workflow context: what/why/how, constraints)`,
    `- ${input.taskPath} (this node task)`,
    "",
    "Execution rules:",
    "- Execute only this node.",
    `- Do not spawn ${TOOL_NAME} subagents to prevent infinite recursion.`,
    "- Make required code changes directly in the repository when needed.",
    "- Keep output concise and factual.",
    "",
    "Your final assistant message will be saved verbatim to:",
    `- ${input.summaryPath}`,
    "",
    "Now execute the node task.",
  ].join("\n");
}

export default function workflowSubagentExtension(pi: ExtensionAPI) {
  const depth = Number.parseInt(process.env[DEPTH_ENV] ?? "0", 10) || 0;
  const isNestedSubagent = depth > 0;

  if (isNestedSubagent) {
    pi.on("tool_call", async (event) => {
      if (!BLOCKED_SUBAGENT_TOOLS.has(event.toolName)) return;
      return {
        block: true,
        reason: "Recursive subagent execution is disabled inside workflow_subagent runs.",
      };
    });
    return;
  }

  pi.registerTool({
    name: TOOL_NAME,
    label: "Workflow Subagent",
    description:
      "Spawn an isolated pi subprocess for one workflow node. Writes .pi/workflows/<workflowSlug>/nodes/<nodeSlug>.task.md and saves the subagent's final assistant text to <nodeSlug>.summary.md.",
    parameters: WorkflowSubagentParams,

    async execute(
      _toolCallId,
      rawParams,
      signal,
      _onUpdate,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<WorkflowSubagentDetails>> {
      const params = rawParams as WorkflowSubagentParamsType;
      const workflowSlug = params.workflowSlug.trim();
      const nodeSlug = params.nodeSlug.trim();
      const task = params.task.trim();

      if (!isValidSlug(workflowSlug)) {
        return {
          content: [{ type: "text", text: `Invalid workflowSlug: ${workflowSlug}` }],
          isError: true,
        };
      }
      if (!isValidSlug(nodeSlug)) {
        return {
          content: [{ type: "text", text: `Invalid nodeSlug: ${nodeSlug}` }],
          isError: true,
        };
      }
      if (!task) {
        return {
          content: [{ type: "text", text: "Invalid task: task must be non-empty." }],
          isError: true,
        };
      }

      const baseCwd = params.cwd ? toAbsolutePath(ctx.cwd, params.cwd) : ctx.cwd;
      const workflowDir = path.join(baseCwd, ".pi", "workflows", workflowSlug);
      const nodesDir = path.join(workflowDir, "nodes");
      const contextPath = params.contextPath
        ? toAbsolutePath(baseCwd, params.contextPath)
        : path.join(workflowDir, "context.md");
      const taskPath = path.join(nodesDir, `${nodeSlug}.task.md`);
      const summaryPath = path.join(nodesDir, `${nodeSlug}.summary.md`);

      fs.mkdirSync(nodesDir, { recursive: true });
      if (!fs.existsSync(contextPath)) {
        return {
          content: [
            {
              type: "text",
              text: `Missing context file: ${contextPath}. Create context.md first.`,
            },
          ],
          details: {
            workflowSlug,
            nodeSlug,
            cwd: baseCwd,
            contextPath,
            taskPath,
            summaryPath,
            exitCode: 1,
            errorMessage: "Missing context.md",
          },
          isError: true,
        };
      }

      fs.writeFileSync(taskPath, `${task}\n`, "utf-8");
      if (fs.existsSync(summaryPath)) fs.unlinkSync(summaryPath);

      const prompt = buildNodePrompt({ workflowSlug, nodeSlug, contextPath, taskPath, summaryPath });
      const args: string[] = ["--mode", "json", "-p", "--no-session", "--append-system-prompt", APPEND_SYSTEM_PROMPT];

      if (pi.getThinkingLevel) {
        const level = pi.getThinkingLevel();
        if (level) args.push("--thinking", level);
      }

      args.push(prompt);

      const provider = ctx.model?.provider;
      const model = ctx.model?.id;
      if (provider) args.push("--provider", provider);
      if (model) args.push("--model", model);

      let stdoutBuffer = "";
      let stderr = "";
      let exitCode = 1;
      let stopReason: string | undefined;
      let errorMessage: string | undefined;
      let lastAssistantText = "";
      let abortedBySignal = false;

      await new Promise<void>((resolve) => {
        const child = spawn("pi", args, {
          cwd: baseCwd,
          env: {
            ...process.env,
            [DEPTH_ENV]: String(depth + 1),
          },
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let settled = false;

        const parseLine = (line: string) => {
          if (!line.trim()) return;
          let event: any;
          try {
            event = JSON.parse(line);
          } catch {
            return;
          }

          if (event?.type === "message_end" && event?.message) {
            const text = getLastAssistantTextFromMessage(event.message);
            if (text) lastAssistantText = text;
            if (event.message?.stopReason) stopReason = event.message.stopReason;
            if (event.message?.errorMessage) errorMessage = event.message.errorMessage;
          }
        };

        const abortHandler = () => {
          abortedBySignal = true;
          child.kill("SIGKILL");
        };

        const finalize = (code: number) => {
          if (settled) return;
          settled = true;
          if (signal) signal.removeEventListener("abort", abortHandler);
          if (stdoutBuffer.trim()) parseLine(stdoutBuffer);
          exitCode = code;
          resolve();
        };

        child.stdout.on("data", (chunk) => {
          stdoutBuffer += chunk.toString();
          const lines = stdoutBuffer.split("\n");
          stdoutBuffer = lines.pop() ?? "";
          for (const line of lines) parseLine(line);
        });

        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });

        if (signal) {
          if (signal.aborted) abortHandler();
          else signal.addEventListener("abort", abortHandler, { once: true });
        }

        child.on("close", (code) => {
          finalize(code ?? 1);
        });

        child.on("error", (err) => {
          stderr += `\n${String(err)}`;
          finalize(1);
        });
      });

      const summaryText = lastAssistantText.trim();
      const details: WorkflowSubagentDetails = {
        workflowSlug,
        nodeSlug,
        cwd: baseCwd,
        contextPath,
        taskPath,
        summaryPath,
        exitCode,
        stopReason,
        errorMessage,
        stderr: stderr.trim() || undefined,
        provider,
        model,
      };

      const failed =
        abortedBySignal || exitCode !== 0 || stopReason === "error" || stopReason === "aborted" || !summaryText;

      if (failed) {
        const reason = abortedBySignal ? "Aborted" : errorMessage || stderr.trim() || `Subagent failed (exit ${exitCode})`;
        return {
          content: [{ type: "text", text: `workflow_subagent failed for node ${nodeSlug}: ${reason}` }],
          details,
          isError: true,
        };
      }

      fs.writeFileSync(summaryPath, `${summaryText}\n`, "utf-8");
      return {
        content: [
          {
            type: "text",
            text: [
              `Node complete: ${nodeSlug}`,
              `Task: ${rel(baseCwd, taskPath)}`,
              `Summary: ${rel(baseCwd, summaryPath)}`,
            ].join("\n"),
          },
        ],
        details,
      };
    },

    renderCall(args, theme) {
      const workflowSlug = typeof (args as any)?.workflowSlug === "string" ? (args as any).workflowSlug : "?";
      const nodeSlug = typeof (args as any)?.nodeSlug === "string" ? (args as any).nodeSlug : "?";
      const task = typeof (args as any)?.task === "string" ? (args as any).task.trim() : "";
      const preview = task.length > 80 ? `${task.slice(0, 80)}...` : task;

      let text =
        theme.fg("toolTitle", theme.bold("workflow_subagent ")) +
        theme.fg("accent", `${workflowSlug}/${nodeSlug}`);
      if (preview) text += `\n${theme.fg("muted", preview)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as WorkflowSubagentDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
      }

      const ok = !result.isError;
      const icon = ok ? theme.fg("success", "✓") : theme.fg("error", "✗");
      let text = `${icon} ${theme.fg("toolTitle", theme.bold(`${details.workflowSlug}/${details.nodeSlug}`))}`;
      text += `\n${theme.fg("muted", `task: ${details.taskPath}`)}`;
      text += `\n${theme.fg("muted", `summary: ${details.summaryPath}`)}`;
      if (!ok) {
        const msg = details.errorMessage || details.stderr || `exit ${details.exitCode}`;
        text += `\n${theme.fg("error", msg)}`;
      }
      return new Text(text, 0, 0);
    },
  });
}
