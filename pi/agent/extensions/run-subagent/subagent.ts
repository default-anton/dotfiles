import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import {
  RESULT_FILE_NAME,
  STATE_FILE_NAME,
  SUBAGENT_IPC_DIR_ENV,
  SUBAGENT_MODEL_ARG_ENV,
  SUBAGENT_TASK_TITLE_ENV,
  cloneDetails,
  createEmptyUsage,
  extractAssistantText,
  limitToolCalls,
  previewText,
  summarizeToolCall,
  writeJsonAtomic,
  type SpawnSubagentDetails,
  type SpawnSubagentStopReason,
} from "./ipc.ts";

function isStopReason(value: unknown): value is SpawnSubagentStopReason {
  return (
    value === "stop" ||
    value === "length" ||
    value === "toolUse" ||
    value === "error" ||
    value === "aborted"
  );
}

function readStopReason(message: unknown): SpawnSubagentStopReason | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  if (!("stopReason" in message)) {
    return undefined;
  }

  return isStopReason(message.stopReason) ? message.stopReason : undefined;
}

function updateAssistantState(
  details: SpawnSubagentDetails,
  message: unknown,
  options: { includeUsage: boolean; updateStopReason: boolean },
): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const isAssistantMessage = "role" in message && message.role === "assistant";
  const answer = isAssistantMessage ? extractAssistantText(message) : "";
  if (answer) {
    details.answerPreview = previewText(answer);
  }

  if ("model" in message && typeof message.model === "string" && message.model.trim()) {
    if ("provider" in message && typeof message.provider === "string") {
      details.childModel = `${message.provider}/${message.model}`;
    }
  }

  if (options.includeUsage && "usage" in message && message.usage && typeof message.usage === "object") {
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

  if (options.updateStopReason) {
    const stopReason = readStopReason(message);
    if (stopReason) {
      details.stopReason = stopReason;
    }
  }

  if ("errorMessage" in message && typeof message.errorMessage === "string" && message.errorMessage.trim()) {
    details.error = message.errorMessage;
  }

  return isAssistantMessage ? answer : undefined;
}

export default function runSubagentChildExtension(pi: ExtensionAPI) {
  const ipcDir = process.env[SUBAGENT_IPC_DIR_ENV]?.trim();
  if (!ipcDir) {
    return;
  }

  const statePath = join(ipcDir, STATE_FILE_NAME);
  const resultPath = join(ipcDir, RESULT_FILE_NAME);
  const taskTitle = process.env[SUBAGENT_TASK_TITLE_ENV]?.trim() || "subagent";
  const modelArg = process.env[SUBAGENT_MODEL_ARG_ENV]?.trim() || "(unknown)";

  const details: SpawnSubagentDetails = {
    status: "running",
    taskTitle,
    childModel: modelArg,
    modelArg,
    turnCount: 0,
    toolCallCount: 0,
    lastToolCalls: [],
    usage: createEmptyUsage(),
  };

  let lastAssistantText = "";
  let wroteResult = false;
  let stateWriteTimer: ReturnType<typeof setTimeout> | undefined;

  const flushState = () => {
    if (stateWriteTimer) {
      clearTimeout(stateWriteTimer);
      stateWriteTimer = undefined;
    }

    writeJsonAtomic(statePath, {
      details: cloneDetails(details),
    });
  };

  const scheduleStateWrite = () => {
    if (stateWriteTimer) {
      return;
    }

    stateWriteTimer = setTimeout(() => {
      flushState();
    }, 100);
  };

  const finalize = () => {
    flushState();
    if (wroteResult) {
      return;
    }

    if (!details.stopReason) {
      details.stopReason = "error";
      details.error ||= "Subagent exited without a model result. Startup or prompt preparation failed; check the selected model, provider credentials, and session configuration.";
    }

    details.status = details.stopReason === "stop" ? "success" : "error";
    if (details.status === "error" && !details.error) {
      details.error =
        details.stopReason === "length"
          ? "Subagent hit the model context or output limit."
          : details.stopReason === "toolUse"
            ? "Subagent exited while waiting for another tool turn."
            : details.stopReason === "aborted"
              ? "Subagent was aborted."
              : "Subagent failed.";
    }

    writeJsonAtomic(resultPath, {
      details: cloneDetails(details),
      lastAssistantText,
    });
    wroteResult = true;
  };

  pi.on("session_start", async (_event, ctx) => {
    details.sessionId = ctx.sessionManager.getSessionId();
    try {
      if (!ctx.model) {
        throw new Error("No model selected for the subagent. Select a model or pass an explicit provider/model ID.");
      }
      details.childModel = `${ctx.model.provider}/${ctx.model.id}`;
      if (details.childModel !== modelArg) {
        throw new Error(`Subagent selected ${details.childModel} instead of ${modelArg}. Check the child model configuration.`);
      }
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
      if (!auth.ok) {
        throw new Error(`Authentication failed for subagent model ${details.childModel}. ${auth.error}`);
      }
      scheduleStateWrite();
    } catch (error) {
      details.stopReason = "error";
      details.error = error instanceof Error ? error.message : String(error);
      finalize();
      ctx.shutdown();
    }
  });

  pi.on("tool_execution_start", async (event) => {
    details.toolCallCount += 1;
    details.lastToolCalls = limitToolCalls([
      ...details.lastToolCalls,
      summarizeToolCall(event.toolName, event.args),
    ]);
    scheduleStateWrite();
  });

  pi.on("message_update", async (event) => {
    const answer = updateAssistantState(details, event.message, {
      includeUsage: false,
      updateStopReason: false,
    });
    if (answer !== undefined) {
      lastAssistantText = answer;
      scheduleStateWrite();
    }
  });

  pi.on("message_end", async (event) => {
    const answer = updateAssistantState(details, event.message, {
      includeUsage: true,
      updateStopReason: true,
    });
    if (answer !== undefined) {
      lastAssistantText = answer;
    }
    scheduleStateWrite();
  });

  pi.on("turn_end", async (event) => {
    details.turnCount += 1;
    const answer = updateAssistantState(details, event.message, {
      includeUsage: false,
      updateStopReason: true,
    });
    if (answer !== undefined) {
      lastAssistantText = answer;
    }
    scheduleStateWrite();
  });

  pi.on("agent_end", async (_event, ctx) => {
    finalize();
    ctx.shutdown();
  });

  pi.on("session_shutdown", async () => {
    finalize();
  });
}
