import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HerdrTerminal, type HerdrLayout } from "./herdr.ts";
import { isolatedEnvironmentArgs, shellEscape } from "./environment.ts";
import {
  EXIT_FILE_NAME,
  RESULT_FILE_NAME,
  STATE_FILE_NAME,
  SUBAGENT_DEPTH_ENV,
  SUBAGENT_IPC_DIR_ENV,
  SUBAGENT_MODEL_ARG_ENV,
  SUBAGENT_TASK_TITLE_ENV,
  cloneDetails,
  createEmptyUsage,
  previewText,
  readJsonFile,
  type SpawnSubagentDetails,
  type SpawnSubagentExitFile,
  type SpawnSubagentResultFile,
  type SpawnSubagentStateFile,
} from "./ipc.ts";
import { resolveChildModel, type ChildModel } from "./model.ts";

const POLL_INTERVAL_MS = 250;
const RESULT_GRACE_PERIOD_MS = 2_000;
const ABORT_CLEANUP_GRACE_PERIOD_MS = 1_000;

const terminal = new HerdrTerminal();

export type { SpawnSubagentDetails } from "./ipc.ts";
export type SpawnSubagentUsage = SpawnSubagentDetails["usage"];

export type SpawnSubagentRunInput = {
  instructions: string;
  taskTitle: string;
  sessionId?: string;
  forkCurrentContext?: boolean;
  parentSessionFile?: string;
  parentSessionId: string;
  parentSessionName?: string;
  onFallback?: (attachCommand: string) => void;
  model?: string;
  cwd: string;
  currentModel?: ChildModel;
  availableModels?: ChildModel[];
  activeTools?: string[];
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

function getSubagentDepth(env: NodeJS.ProcessEnv): number {
  const rawDepth = env[SUBAGENT_DEPTH_ENV];
  const parsed = rawDepth ? Number.parseInt(rawDepth, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function findModelInfo(modelName: string, availableModels: ChildModel[] | undefined): ChildModel | undefined {
  return availableModels?.find((model) => `${model.provider}/${model.id}` === modelName);
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

function mergeDetails(
  details: SpawnSubagentDetails,
  next: SpawnSubagentDetails,
  availableModels: ChildModel[] | undefined,
): void {
  const merged = cloneDetails({
    ...details,
    ...next,
    lastToolCalls: [...next.lastToolCalls],
    usage: {
      ...details.usage,
      ...next.usage,
    },
  });
  applyResolvedModel(merged, findModelInfo(merged.childModel, availableModels));

  details.status = merged.status;
  details.taskTitle = merged.taskTitle;
  details.childModel = merged.childModel;
  details.modelArg = merged.modelArg;
  details.turnCount = merged.turnCount;
  details.toolCallCount = merged.toolCallCount;
  details.lastToolCalls = merged.lastToolCalls;
  details.usage = merged.usage;
  details.sessionId = merged.sessionId;
  details.answerPreview = merged.answerPreview;
  details.stopReason = merged.stopReason;
  details.error = merged.error;
  details.exitCode = merged.exitCode;
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
    "- You share the same cwd/worktree as the parent and other agents. Do not revert unrelated edits.",
    "- Stay within scope.",
    "- Return the requested result directly, including validation and any open issues when useful.",
    "",
    "Task brief:",
    instructions,
  ].join("\n");
}

function buildChildEnvAssignments(input: SpawnSubagentRunInput, ipcDir: string, childModel: string): string[] {
  const depth = String(getSubagentDepth(process.env) + 1);
  const assignments = [
    ...(terminal.usesFallback ? isolatedEnvironmentArgs(process.env) : []),
    `${SUBAGENT_DEPTH_ENV}=${shellEscape(depth)}`,
    `${SUBAGENT_IPC_DIR_ENV}=${shellEscape(ipcDir)}`,
    `${SUBAGENT_TASK_TITLE_ENV}=${shellEscape(input.taskTitle)}`,
    `${SUBAGENT_MODEL_ARG_ENV}=${shellEscape(childModel)}`,
  ];

  const inheritedPath = process.env.PATH;
  if (!terminal.usesFallback && inheritedPath?.trim()) {
    assignments.push(`PATH=${shellEscape(inheritedPath)}`);
  }

  return assignments;
}

function buildChildToolArgs(activeTools: string[] | undefined): string[] {
  if (!activeTools) {
    return [];
  }

  const toolNames = [...new Set(activeTools.map((toolName) => toolName.trim()).filter(Boolean))];
  if (toolNames.length === 0) {
    return ["--no-tools"];
  }

  return ["--tools", toolNames.join(",")];
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  if (currentScript && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: process.execPath, args };
  }

  return { command: "pi", args };
}

function writeLauncherScript(
  input: SpawnSubagentRunInput,
  childPrompt: string,
  childModel: string,
  thinkingLevel: string,
  requestedSessionId: string | undefined,
  parentSessionFile: string | undefined,
  ipcDir: string,
): string {
  const childExtensionPath = fileURLToPath(new URL("./subagent.ts", import.meta.url));
  const scriptPath = join(ipcDir, "launch-subagent.sh");
  const exitPath = join(ipcDir, EXIT_FILE_NAME);

  const childArgs: string[] = [];
  if (parentSessionFile) {
    childArgs.push("--fork", parentSessionFile);
  } else if (requestedSessionId) {
    childArgs.push("--session", requestedSessionId);
  }
  childArgs.push("--thinking", thinkingLevel);
  childArgs.push("--model", childModel, ...buildChildToolArgs(input.activeTools), "-e", childExtensionPath, childPrompt);

  const invocation = getPiInvocation(childArgs);
  const command = [invocation.command, ...invocation.args].map(shellEscape).join(" ");
  const envAssignments = buildChildEnvAssignments(input, ipcDir, childModel);

  const script = [
    "#!/bin/sh",
    "code=0",
    `cd ${shellEscape(input.cwd)} || code=$?`,
    'if [ "$code" -eq 0 ]; then',
    `  ${envAssignments.join(" \\\n  ")} \\\n  ${command}`,
    "  code=$?",
    "fi",
    `tmp=${shellEscape(`${exitPath}.tmp`)}`,
    `printf '{\"exitCode\":%s}\n' \"$code\" > \"$tmp\"`,
    `mv \"$tmp\" ${shellEscape(exitPath)}`,
    "exit \"$code\"",
    "",
  ].join("\n");

  writeFileSync(scriptPath, script, { encoding: "utf8", mode: 0o700 });
  chmodSync(scriptPath, 0o700);
  return scriptPath;
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runSpawnSubagent(input: SpawnSubagentRunInput): Promise<SpawnSubagentRunResult> {
  const resolvedModel = resolveChildModel(input);
  const childModel = resolvedModel.reference;
  const requestedSessionId = input.sessionId?.trim() || undefined;
  const parentSessionFile = input.forkCurrentContext ? input.parentSessionFile?.trim() || undefined : undefined;
  if (input.forkCurrentContext && requestedSessionId) {
    throw new Error("run_subagent cannot combine fork_current_context with session_id.");
  }
  if (input.forkCurrentContext && !parentSessionFile) {
    throw new Error("run_subagent fork_current_context requires a persisted parent session.");
  }

  const hasPriorContext = parentSessionFile || requestedSessionId;
  const childPrompt = hasPriorContext ? input.instructions : buildFreshChildPrompt(input.instructions);
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

  applyResolvedModel(details, resolvedModel.model);

  if (input.signal?.aborted) {
    details.status = "error";
    details.stopReason = "aborted";
    details.error = "Parent request was aborted before the subagent started.";
    details.answerPreview = previewText(details.error);
    return {
      contentText: buildFailureText(details, "Parent request was aborted."),
      details: cloneDetails(details),
    };
  }

  const ipcDir = mkdtempSync(join(tmpdir(), "pi-run-subagent-"));
  const statePath = join(ipcDir, STATE_FILE_NAME);
  const resultPath = join(ipcDir, RESULT_FILE_NAME);
  const exitPath = join(ipcDir, EXIT_FILE_NAME);

  let layout: HerdrLayout | undefined;
  let finalAnswer = "";
  let exitCode = 1;
  let aborted = false;
  let sawExit = false;
  let sawResult = false;
  let successResultDeadline = 0;
  let deadPaneDeadline = 0;
  let abortCleanupDeadline = 0;
  let cleanupPromise: Promise<void> | undefined;

  const emitUpdate = () => {
    input.onUpdate?.(cloneDetails(details));
  };

  const markAborted = (message: string) => {
    if (aborted) {
      return;
    }

    aborted = true;
    abortCleanupDeadline = Date.now() + ABORT_CLEANUP_GRACE_PERIOD_MS;
    details.stopReason = "aborted";
    details.status = "error";
    details.error = details.error || message;
    details.answerPreview = details.answerPreview || previewText(details.error);
    emitUpdate();
  };

  const startCleanup = () => {
    if (!cleanupPromise) {
      cleanupPromise = terminal.close(layout);
    }

    return cleanupPromise;
  };

  const readStateUpdate = () => {
    if (aborted) {
      return;
    }

    const state = readJsonFile<SpawnSubagentStateFile>(statePath);
    if (state?.details) {
      mergeDetails(details, state.details, input.availableModels);
      emitUpdate();
    }
  };

  const readTerminalResult = (): boolean => {
    if (aborted) {
      return false;
    }

    const result = readJsonFile<SpawnSubagentResultFile>(resultPath);
    if (!result?.details) {
      return false;
    }

    sawResult = true;
    mergeDetails(details, result.details, input.availableModels);
    finalAnswer = result.lastAssistantText.trim();
    emitUpdate();
    return true;
  };

  const abortListener = () => {
    markAborted("Subagent was aborted.");
  };
  input.signal?.addEventListener("abort", abortListener, { once: true });

  try {
    await sleep(0);
    if (input.signal?.aborted) {
      markAborted("Subagent was aborted before the subagent started.");
      return {
        contentText: buildFailureText(details, "Parent request was aborted."),
        details: cloneDetails(details),
      };
    }

    const scriptPath = writeLauncherScript(
      input,
      childPrompt,
      childModel,
      resolvedModel.thinkingLevel,
      requestedSessionId,
      parentSessionFile,
      ipcDir,
    );
    layout = await terminal.createPane(input);

    try {
      await terminal.run(layout, `${shellEscape(scriptPath)}; exit`, input.signal);
    } catch (error: any) {
      if (input.signal?.aborted) {
        markAborted("Subagent was aborted before the subagent command was started.");
        return {
          contentText: buildFailureText(details, "Parent request was aborted."),
          details: cloneDetails(details),
        };
      }

      details.status = "error";
      details.stopReason = "error";
      details.error = error?.message ?? "run_subagent could not start the subagent command.";
      details.answerPreview = previewText(details.error);
      return {
        contentText: buildFailureText(details, details.error),
        details: cloneDetails(details),
      };
    }

    let lastStateRaw = "";
    let lastResultRaw = "";
    while (true) {
      if (aborted) {
        startCleanup();
      }

      if (existsSync(statePath)) {
        const nextRaw = readFileSync(statePath, "utf8");
        if (nextRaw !== lastStateRaw) {
          lastStateRaw = nextRaw;
          readStateUpdate();
        }
      }

      if (existsSync(resultPath)) {
        const nextRaw = readFileSync(resultPath, "utf8");
        if (nextRaw !== lastResultRaw) {
          lastResultRaw = nextRaw;
          const loaded = readTerminalResult();
          if (loaded && details.stopReason === "stop" && successResultDeadline === 0) {
            successResultDeadline = Date.now() + RESULT_GRACE_PERIOD_MS;
          }
        }
      }

      if (existsSync(exitPath)) {
        const exitFile = readJsonFile<SpawnSubagentExitFile>(exitPath);
        exitCode = exitFile?.exitCode ?? 1;
        sawExit = true;
        break;
      }

      const paneAlive = layout ? terminal.isAlive(layout) : false;
      if (!paneAlive) {
        if (aborted) {
          exitCode = 130;
          sawExit = true;
          break;
        }

        if (sawResult && details.stopReason === "stop") {
          exitCode = 0;
          break;
        }

        if (deadPaneDeadline === 0) {
          deadPaneDeadline = Date.now() + RESULT_GRACE_PERIOD_MS;
        } else if (Date.now() >= deadPaneDeadline) {
          exitCode = 1;
          sawExit = true;
          details.stopReason = details.stopReason ?? "error";
          details.error = details.error || "Subagent pane exited before writing a result.";
          break;
        }
      } else {
        deadPaneDeadline = 0;
      }

      if (sawResult && details.stopReason !== "stop") {
        break;
      }

      if (sawResult && details.stopReason === "stop") {
        if (successResultDeadline > 0 && Date.now() >= successResultDeadline) {
          break;
        }
      }

      if (aborted && abortCleanupDeadline > 0 && Date.now() >= abortCleanupDeadline) {
        exitCode = 130;
        break;
      }

      await sleep(POLL_INTERVAL_MS);
    }

    if (!sawResult && !aborted) {
      const waitUntil = Date.now() + RESULT_GRACE_PERIOD_MS;
      while (!existsSync(resultPath) && Date.now() < waitUntil) {
        await sleep(50);
      }
      readTerminalResult();
    }

    details.exitCode = sawExit ? exitCode : undefined;
    if (!details.answerPreview) {
      details.answerPreview = previewText(finalAnswer || details.error);
    }

    const succeeded = details.stopReason === "stop" && (!sawExit || exitCode === 0);
    if (!succeeded) {
      details.status = "error";
      details.stopReason = details.stopReason ?? (aborted ? "aborted" : "error");
      details.error =
        details.error ||
        (aborted
          ? "Subagent was aborted."
          : sawExit && exitCode !== 0
            ? `pi exited with code ${exitCode}.`
            : details.stopReason === "length"
              ? "Subagent hit the model context or output limit."
              : details.stopReason === "toolUse"
                ? "Subagent exited while waiting for another tool turn."
                : details.stopReason === "aborted"
                  ? "Subagent was aborted."
                  : "Subagent failed.");
      details.answerPreview = previewText(finalAnswer || details.error);
      return {
        contentText: buildFailureText(details, sawExit ? `pi exited with code ${exitCode}.` : "Subagent failed."),
        details: cloneDetails(details),
      };
    }

    details.status = "success";
    return {
      contentText: appendSessionId(finalAnswer || "Subagent finished without a text answer.", details.sessionId),
      details: cloneDetails(details),
    };
  } catch (error) {
    if (input.signal?.aborted) {
      markAborted("Subagent was aborted.");
    } else {
      details.status = "error";
      details.stopReason = "error";
      details.error = error instanceof Error ? error.message : String(error);
    }
    return {
      contentText: buildFailureText(details, "Subagent failed."),
      details: cloneDetails(details),
    };
  } finally {
    input.signal?.removeEventListener("abort", abortListener);
    await (cleanupPromise ?? terminal.close(layout));
    try {
      rmSync(ipcDir, { recursive: true, force: true });
    } catch {}
  }
}
