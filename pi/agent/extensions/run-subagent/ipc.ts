import { readFileSync, renameSync, writeFileSync } from "node:fs";

export const SUBAGENT_DEPTH_ENV = "PI_SUBAGENT_DEPTH";
export const SUBAGENT_IPC_DIR_ENV = "PI_RUN_SUBAGENT_IPC_DIR";
export const SUBAGENT_TASK_TITLE_ENV = "PI_RUN_SUBAGENT_TASK_TITLE";
export const SUBAGENT_MODEL_ARG_ENV = "PI_RUN_SUBAGENT_MODEL_ARG";

export const STATE_FILE_NAME = "state.json";
export const RESULT_FILE_NAME = "result.json";
export const EXIT_FILE_NAME = "exit.json";

const ANSWER_PREVIEW_LIMIT = 120;
const LAST_TOOL_CALL_LIMIT = 3;

export type SpawnSubagentStopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

export type SpawnSubagentUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  contextTokens?: number;
  contextWindow?: number;
  usingSubscription?: boolean;
};

export type SpawnSubagentDetails = {
  status: "running" | "success" | "error";
  taskTitle: string;
  childModel: string;
  modelArg: string;
  turnCount: number;
  toolCallCount: number;
  lastToolCalls: string[];
  usage: SpawnSubagentUsage;
  sessionId?: string;
  answerPreview?: string;
  stopReason?: SpawnSubagentStopReason;
  error?: string;
  exitCode?: number;
};

export type SpawnSubagentStateFile = {
  details: SpawnSubagentDetails;
};

export type SpawnSubagentResultFile = {
  details: SpawnSubagentDetails;
  lastAssistantText: string;
};

export type SpawnSubagentExitFile = {
  exitCode: number;
};

export function createEmptyUsage(): SpawnSubagentUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0,
  };
}

export function cloneDetails(details: SpawnSubagentDetails): SpawnSubagentDetails {
  return {
    ...details,
    lastToolCalls: [...details.lastToolCalls],
    usage: {
      ...details.usage,
    },
  };
}

export function previewText(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= ANSWER_PREVIEW_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, ANSWER_PREVIEW_LIMIT - 3)}...`;
}

export function summarizeToolCall(
  toolName: string,
  args: Record<string, unknown> | undefined,
): string {
  const pathArg =
    typeof args?.path === "string"
      ? args.path
      : typeof args?.file_path === "string"
        ? args.file_path
        : undefined;

  if (!pathArg) {
    return toolName;
  }

  return `${toolName} ${shortenPath(pathArg)}`;
}

export function limitToolCalls(toolCalls: string[]): string[] {
  return toolCalls.slice(-LAST_TOOL_CALL_LIMIT);
}

export function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }

  if (!("role" in message) || message.role !== "assistant") {
    return "";
  }

  if (!("content" in message) || !Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .filter(
      (block): block is { type: "text"; text: string } =>
        !!block &&
        typeof block === "object" &&
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export function writeJsonAtomic(path: string, data: unknown): void {
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, JSON.stringify(data, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  renameSync(tempPath, path);
}

export function readJsonFile<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function shortenPath(path: string): string {
  const normalized = path.startsWith("@") ? path.slice(1) : path;
  if (normalized.length <= 64) {
    return normalized;
  }

  return `${normalized.slice(0, 28)}…${normalized.slice(-28)}`;
}
