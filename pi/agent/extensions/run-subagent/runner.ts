import { spawn } from "node:child_process";

const SUBAGENT_DEPTH_ENV = "PI_SUBAGENT_DEPTH";
const ANSWER_PREVIEW_LIMIT = 120;
const LAST_TOOL_CALL_LIMIT = 3;
const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

type ChildModel = {
  provider: string;
  id: string;
  name?: string;
  contextWindow?: number;
  usingSubscription?: boolean;
};

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
  stopReason?: string;
  error?: string;
  exitCode?: number;
};

export type SpawnSubagentRunInput = {
  instructions: string;
  taskTitle: string;
  sessionId?: string;
  model?: string;
  cwd: string;
  currentModel?: ChildModel;
  availableModels?: ChildModel[];
  thinkingLevel: string;
  signal?: AbortSignal;
  onUpdate?: (details: SpawnSubagentDetails) => void;
};

export type SpawnSubagentRunResult = {
  contentText: string;
  details: SpawnSubagentDetails;
};

export function shouldRegisterSpawnSubagent(env: NodeJS.ProcessEnv = process.env): boolean {
  return getSubagentDepth(env) <= 0;
}

export function summarizeToolCall(toolName: string, args: Record<string, unknown> | undefined): string {
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

function getSubagentDepth(env: NodeJS.ProcessEnv): number {
  const rawDepth = env[SUBAGENT_DEPTH_ENV];
  const parsed = rawDepth ? Number.parseInt(rawDepth, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortenPath(path: string): string {
  const normalized = path.startsWith("@") ? path.slice(1) : path;
  if (normalized.length <= 64) {
    return normalized;
  }

  return `${normalized.slice(0, 28)}…${normalized.slice(-28)}`;
}

function cloneDetails(details: SpawnSubagentDetails): SpawnSubagentDetails {
  return {
    ...details,
    lastToolCalls: [...details.lastToolCalls],
    usage: {
      ...details.usage,
    },
  };
}

function createEmptyUsage(): SpawnSubagentUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0,
  };
}

function previewText(text: string | undefined): string | undefined {
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

function extractAssistantText(message: unknown): string {
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

function stripThinkingSuffix(modelName: string): string {
  const normalized = modelName.trim();
  const separatorIndex = normalized.lastIndexOf(":");
  if (separatorIndex === -1) {
    return normalized;
  }

  const suffix = normalized.slice(separatorIndex + 1);
  if (!THINKING_LEVELS.has(suffix)) {
    return normalized;
  }

  return normalized.slice(0, separatorIndex);
}

function findModelInfo(modelName: string, availableModels: ChildModel[] | undefined): ChildModel | undefined {
  if (!availableModels || availableModels.length === 0) {
    return undefined;
  }

  const raw = modelName.trim();
  if (!raw) {
    return undefined;
  }

  const normalized = stripThinkingSuffix(raw);
  const rawLower = raw.toLowerCase();
  const normalizedLower = normalized.toLowerCase();

  const exact = availableModels.find((model) => `${model.provider}/${model.id}` === normalized);
  if (exact) {
    return exact;
  }

  const matches = availableModels.filter((model) => {
    const fullId = `${model.provider}/${model.id}`.toLowerCase();
    const id = model.id.toLowerCase();
    const name = model.name?.toLowerCase();
    return (
      fullId === normalizedLower ||
      fullId === rawLower ||
      id === normalizedLower ||
      id === rawLower ||
      name === normalizedLower ||
      name === rawLower
    );
  });

  return matches.length === 1 ? matches[0] : undefined;
}

function applyResolvedModel(details: SpawnSubagentDetails, model: ChildModel | undefined): void {
  if (!model) {
    return;
  }

  if (model.contextWindow && model.contextWindow > 0) {
    details.usage.contextWindow = model.contextWindow;
  }
  if (typeof model.usingSubscription === "boolean") {
    details.usage.usingSubscription = model.usingSubscription;
  }
}

function updateAnswerFromMessage(
  details: SpawnSubagentDetails,
  message: unknown,
  availableModels: ChildModel[] | undefined,
  includeUsage = true,
): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const answer = extractAssistantText(message);
  if (answer) {
    details.answerPreview = previewText(answer);
  }

  if ("model" in message && typeof message.model === "string" && message.model.trim()) {
    details.childModel = message.model;
    applyResolvedModel(details, findModelInfo(message.model, availableModels));
  }

  if (includeUsage && "usage" in message && message.usage && typeof message.usage === "object") {
    const usage = message.usage as {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      totalTokens?: number;
      cost?: { total?: number };
    };
    details.usage.inputTokens += usage.input ?? 0;
    details.usage.outputTokens += usage.output ?? 0;
    details.usage.cacheReadTokens += usage.cacheRead ?? 0;
    details.usage.cacheWriteTokens += usage.cacheWrite ?? 0;
    details.usage.costUsd += usage.cost?.total ?? 0;
    if (typeof usage.totalTokens === "number" && usage.totalTokens >= 0) {
      details.usage.contextTokens = usage.totalTokens;
    }
  }

  if ("stopReason" in message && typeof message.stopReason === "string" && message.stopReason.trim()) {
    details.stopReason = message.stopReason;
  }

  if ("errorMessage" in message && typeof message.errorMessage === "string" && message.errorMessage.trim()) {
    details.error = message.errorMessage;
  }

  return answer || undefined;
}

function resolveModelArg(input: SpawnSubagentRunInput): string {
  if (input.model?.trim()) {
    return input.model.trim();
  }

  if (!input.currentModel) {
    throw new Error(
      "run_subagent could not determine the current model. Pass model explicitly or select a model before delegating.",
    );
  }

  return `${input.currentModel.provider}/${input.currentModel.id}:${input.thinkingLevel}`;
}

function appendSessionId(text: string, sessionId: string | undefined): string {
  if (!sessionId) {
    return text;
  }

  return `${text}\n\nsubagent_session_id: ${sessionId}`;
}

function buildFailureText(details: SpawnSubagentDetails, fallback: string): string {
  const reason = details.error || details.answerPreview || fallback;
  return appendSessionId(`Subagent failed for \"${details.taskTitle}\": ${reason}`, details.sessionId);
}

function buildFreshChildPrompt(instructions: string): string {
  return [
    "You are a delegated subagent running in a fresh pi session.",
    "- You only have the task brief below.",
    "- You share the same cwd/worktree as the parent and other agents. Do not revert unrelated edits.",
    "- Stay within scope.",
    "- Return the requested result directly, including validation and any open issues when useful.",
    "",
    "Task brief:",
    instructions,
  ].join("\n");
}

export async function runSpawnSubagent(input: SpawnSubagentRunInput): Promise<SpawnSubagentRunResult> {
  const childModel = resolveModelArg(input);
  const requestedSessionId = input.sessionId?.trim() || undefined;
  const childPrompt = requestedSessionId ? input.instructions : buildFreshChildPrompt(input.instructions);
  const childArgs = ["--mode", "json", "-p"];
  if (requestedSessionId) {
    childArgs.push("--session", requestedSessionId);
  }
  childArgs.push("--model", childModel, childPrompt);
  const details: SpawnSubagentDetails = {
    status: "running",
    taskTitle: input.taskTitle,
    childModel,
    modelArg: childModel,
    sessionId: requestedSessionId,
    turnCount: 0,
    toolCallCount: 0,
    lastToolCalls: [],
    usage: createEmptyUsage(),
  };

  if (!input.model?.trim()) {
    applyResolvedModel(details, input.currentModel);
  }
  applyResolvedModel(details, findModelInfo(childModel, input.availableModels));

  let exitCode = 0;
  let finalAnswer = "";
  let stderr = "";
  let spawnError: string | undefined;
  let aborted = Boolean(input.signal?.aborted);

  const emitUpdate = () => {
    input.onUpdate?.(cloneDetails(details));
  };

  if (aborted) {
    details.status = "error";
    details.error = "Parent request was aborted before the subagent started.";
    details.answerPreview = previewText(details.error);
    return {
      contentText: buildFailureText(details, "Parent request was aborted."),
      details: cloneDetails(details),
    };
  }

  await new Promise<void>((resolve) => {
    const child = spawn("pi", childArgs, {
      cwd: input.cwd,
      env: {
        ...process.env,
        [SUBAGENT_DEPTH_ENV]: String(getSubagentDepth(process.env) + 1),
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let finished = false;
    let stdoutBuffer = "";

    const finish = (code: number, errorMessage?: string) => {
      if (finished) {
        return;
      }

      finished = true;
      exitCode = code;
      if (errorMessage) {
        spawnError = errorMessage;
      }
      input.signal?.removeEventListener("abort", abortChild);
      resolve();
    };

    const abortChild = () => {
      aborted = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 2_000);
    };

    const handleEvent = (line: string) => {
      if (!line.trim()) {
        return;
      }

      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }

      if (event.type === "session" && typeof event.id === "string" && event.id.trim()) {
        details.sessionId = event.id;
        emitUpdate();
        return;
      }

      if (event.type === "tool_execution_start") {
        details.toolCallCount += 1;
        details.lastToolCalls = [...details.lastToolCalls, summarizeToolCall(event.toolName, event.args)].slice(
          -LAST_TOOL_CALL_LIMIT,
        );
        emitUpdate();
        return;
      }

      if (event.type === "message_end" && event.message?.role === "assistant") {
        const answer = updateAnswerFromMessage(details, event.message, input.availableModels);
        if (answer) {
          finalAnswer = answer;
        }
        emitUpdate();
        return;
      }

      if (event.type === "turn_end") {
        details.turnCount += 1;
        const answer = updateAnswerFromMessage(details, event.message, undefined, false);
        if (answer) {
          finalAnswer = answer;
        }
        emitUpdate();
      }
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        handleEvent(line);
      }
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      finish(1, `Failed to start pi subprocess: ${error.message}`);
    });

    child.on("close", (code) => {
      if (stdoutBuffer.trim()) {
        handleEvent(stdoutBuffer);
      }
      finish(code ?? 0);
    });

    input.signal?.addEventListener("abort", abortChild, { once: true });
  });

  details.exitCode = exitCode;
  if (finalAnswer && !details.answerPreview) {
    details.answerPreview = previewText(finalAnswer);
  }

  const failed = aborted || exitCode !== 0 || details.stopReason === "error" || details.stopReason === "aborted";
  if (failed) {
    details.status = "error";
    details.error =
      details.error ||
      spawnError ||
      stderr.trim() ||
      (aborted ? "Subagent was aborted." : `pi exited with code ${exitCode}.`);
    details.answerPreview = previewText(finalAnswer || details.error);
    return {
      contentText: buildFailureText(details, `pi exited with code ${exitCode}.`),
      details: cloneDetails(details),
    };
  }

  details.status = "success";
  return {
    contentText: appendSessionId(finalAnswer || "Subagent finished without a text answer.", details.sessionId),
    details: cloneDetails(details),
  };
}
