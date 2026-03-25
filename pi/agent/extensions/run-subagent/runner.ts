import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
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

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
const POLL_INTERVAL_MS = 250;
const RESULT_GRACE_PERIOD_MS = 2_000;
const ABORT_CLEANUP_GRACE_PERIOD_MS = 1_000;
const SHELL_READY_POLL_INTERVAL_MS = 50;
const SHELL_READY_TIMEOUT_MS = 5_000;
const RIGHT_PANE_WIDTH = 120;

let tmuxMutationQueue: Promise<void> = Promise.resolve();
const activeSubagentsByWindowId = new Map<string, number>();

type ChildModel = {
  provider: string;
  id: string;
  name?: string;
  contextWindow?: number;
  usingSubscription?: boolean;
};

export type { SpawnSubagentDetails } from "./ipc.ts";
export type SpawnSubagentUsage = SpawnSubagentDetails["usage"];

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

type TmuxPane = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  active: boolean;
};

type TmuxLayout = {
  childPaneId: string;
  windowId: string;
};

type TmuxContext = {
  callerPaneId: string;
  sessionId: string;
  windowId: string;
};

export function shouldRegisterSpawnSubagent(env: NodeJS.ProcessEnv = process.env): boolean {
  return getSubagentDepth(env) <= 0;
}

function getSubagentDepth(env: NodeJS.ProcessEnv): number {
  const rawDepth = env[SUBAGENT_DEPTH_ENV];
  const parsed = rawDepth ? Number.parseInt(rawDepth, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
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

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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

function tmux(args: string[]): string {
  return execFileSync("tmux", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

async function withTmuxMutationLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const run = tmuxMutationQueue.then(() => fn(), () => fn());
  tmuxMutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function incrementActiveSubagent(windowId: string): void {
  activeSubagentsByWindowId.set(windowId, (activeSubagentsByWindowId.get(windowId) ?? 0) + 1);
}

function decrementActiveSubagent(windowId: string | undefined): void {
  if (!windowId) {
    return;
  }

  const next = (activeSubagentsByWindowId.get(windowId) ?? 1) - 1;
  if (next <= 0) {
    activeSubagentsByWindowId.delete(windowId);
    return;
  }

  activeSubagentsByWindowId.set(windowId, next);
}

function getActiveSubagentCount(windowId: string): number {
  return activeSubagentsByWindowId.get(windowId) ?? 0;
}

function ensureTmuxAvailable(): void {
  if (!process.env.TMUX) {
    throw new Error("run_subagent requires pi to be running inside tmux.");
  }

  try {
    tmux(["display-message", "-p", "#{pane_id}"]);
  } catch (error: any) {
    throw new Error(`run_subagent could not talk to tmux: ${error?.message ?? String(error)}`);
  }
}

function writeLauncherScript(
  input: SpawnSubagentRunInput,
  childPrompt: string,
  childModel: string,
  requestedSessionId: string | undefined,
  ipcDir: string,
): string {
  const childExtensionPath = fileURLToPath(new URL("./subagent.ts", import.meta.url));
  const scriptPath = join(ipcDir, "launch-subagent.sh");
  const exitPath = join(ipcDir, EXIT_FILE_NAME);

  const childArgs: string[] = [];
  if (requestedSessionId) {
    childArgs.push("--session", requestedSessionId);
  }
  childArgs.push("--model", childModel, "-e", childExtensionPath, childPrompt);

  const invocation = getPiInvocation(childArgs);
  const command = [invocation.command, ...invocation.args].map(shellEscape).join(" ");
  const depth = String(getSubagentDepth(process.env) + 1);

  const script = [
    "#!/bin/sh",
    "code=0",
    `cd ${shellEscape(input.cwd)} || code=$?`,
    'if [ "$code" -eq 0 ]; then',
    `  ${SUBAGENT_DEPTH_ENV}=${shellEscape(depth)} \\\n  ${SUBAGENT_IPC_DIR_ENV}=${shellEscape(ipcDir)} \\\n  ${SUBAGENT_TASK_TITLE_ENV}=${shellEscape(input.taskTitle)} \\\n  ${SUBAGENT_MODEL_ARG_ENV}=${shellEscape(childModel)} \\\n  ${command}`,
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

function resolveTmuxContext(): TmuxContext {
  const callerPaneId = process.env.TMUX_PANE?.trim();
  if (!callerPaneId) {
    throw new Error("run_subagent could not determine the calling tmux pane.");
  }

  try {
    const resolvedPaneId = tmux(["display-message", "-p", "-t", callerPaneId, "#{pane_id}"]);
    const sessionId = tmux(["display-message", "-p", "-t", callerPaneId, "#{session_id}"]);
    const windowId = tmux(["display-message", "-p", "-t", callerPaneId, "#{window_id}"]);
    return {
      callerPaneId: resolvedPaneId,
      sessionId,
      windowId,
    };
  } catch (error: any) {
    throw new Error(`run_subagent could not resolve the calling tmux pane: ${error?.message ?? String(error)}`);
  }
}

function getPaneRuntime(paneId: string): { currentCommand: string; dead: boolean } | undefined {
  try {
    const [currentCommand = "", dead = "0"] = tmux([
      "display-message",
      "-p",
      "-t",
      paneId,
      "#{pane_current_command}\t#{pane_dead}",
    ]).split("\t");
    return {
      currentCommand: currentCommand.trim(),
      dead: dead === "1",
    };
  } catch {
    return undefined;
  }
}

async function waitForPaneShellReady(paneId: string, signal?: AbortSignal): Promise<void> {
  const deadline = Date.now() + SHELL_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error("Subagent was aborted before the shell became ready.");
    }

    const runtime = getPaneRuntime(paneId);
    if (!runtime || runtime.dead) {
      throw new Error("Subagent pane exited before the shell became ready.");
    }

    if (runtime.currentCommand) {
      return;
    }

    await sleep(SHELL_READY_POLL_INTERVAL_MS);
  }

  throw new Error("Timed out waiting for the subagent shell to become ready.");
}

async function startCommandInPane(paneId: string, command: string, signal?: AbortSignal): Promise<void> {
  await waitForPaneShellReady(paneId, signal);

  await withTmuxMutationLock(() => {
    if (signal?.aborted) {
      throw new Error("Subagent was aborted before the subagent command was started.");
    }

    if (!isPaneAlive(paneId)) {
      throw new Error("Subagent pane exited before the subagent command was started.");
    }

    tmux(["send-keys", "-t", paneId, "-l", command]);
    tmux(["send-keys", "-t", paneId, "C-m"]);
  });
}

function listWindowPanes(windowId: string): TmuxPane[] {
  const output = tmux([
    "list-panes",
    "-t",
    windowId,
    "-F",
    "#{pane_id}\t#{pane_left}\t#{pane_top}\t#{pane_width}\t#{pane_height}\t#{pane_active}",
  ]);

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, left, top, width, height, active] = line.split("\t");
      return {
        id,
        left: Number.parseInt(left, 10),
        top: Number.parseInt(top, 10),
        width: Number.parseInt(width, 10),
        height: Number.parseInt(height, 10),
        active: active === "1",
      } satisfies TmuxPane;
    });
}

function getPreferredSplitWidth(width: number): number {
  const maxAllowed = Math.max(24, width - 20);
  const preferred = Math.max(24, Math.floor(width * 0.4));
  return Math.min(RIGHT_PANE_WIDTH, maxAllowed, preferred);
}

function getWindowWidth(panes: TmuxPane[]): number {
  return panes.reduce((max, pane) => Math.max(max, pane.left + pane.width), 0);
}

function pickLargestPane(panes: TmuxPane[]): TmuxPane {
  return [...panes].sort((a, b) => {
    const areaDiff = b.width * b.height - a.width * a.height;
    if (areaDiff !== 0) {
      return areaDiff;
    }

    const widthDiff = b.width - a.width;
    if (widthDiff !== 0) {
      return widthDiff;
    }

    const heightDiff = b.height - a.height;
    if (heightDiff !== 0) {
      return heightDiff;
    }

    const activeDiff = Number(b.active) - Number(a.active);
    if (activeDiff !== 0) {
      return activeDiff;
    }

    return 0;
  })[0];
}

function setPaneTitle(paneId: string, taskTitle: string): void {
  try {
    tmux(["select-pane", "-t", paneId, "-T", taskTitle]);
  } catch {}
}

function getDedicatedWindowName(windowId: string): string {
  return `subagents-${windowId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

function findWindowIdByName(sessionId: string, windowName: string): string | undefined {
  const output = tmux(["list-windows", "-t", sessionId, "-F", "#{window_name}\t#{window_id}"]);
  for (const line of output.split("\n")) {
    const [name, windowId] = line.trim().split("\t");
    if (name === windowName && windowId) {
      return windowId;
    }
  }

  return undefined;
}

function createSameWindowLayout(cwd: string, taskTitle: string, tmuxContext: TmuxContext): TmuxLayout {
  const panes = listWindowPanes(tmuxContext.windowId);
  if (panes.length === 0) {
    throw new Error("run_subagent could not find any tmux panes in the calling window.");
  }

  const childPaneId = tmux([
    "split-window",
    "-c",
    cwd,
    "-d",
    "-h",
    "-f",
    "-l",
    String(getPreferredSplitWidth(getWindowWidth(panes))),
    "-t",
    tmuxContext.callerPaneId,
    "-P",
    "-F",
    "#{pane_id}",
  ]);

  setPaneTitle(childPaneId, taskTitle);
  return {
    childPaneId,
    windowId: tmuxContext.windowId,
  };
}

function createDedicatedWindowLayout(cwd: string, taskTitle: string, tmuxContext: TmuxContext): TmuxLayout {
  const dedicatedWindowName = getDedicatedWindowName(tmuxContext.windowId);
  const existingWindowId = findWindowIdByName(tmuxContext.sessionId, dedicatedWindowName);

  if (!existingWindowId) {
    const [windowId, childPaneId] = tmux([
      "new-window",
      "-c",
      cwd,
      "-d",
      "-t",
      tmuxContext.sessionId,
      "-n",
      dedicatedWindowName,
      "-P",
      "-F",
      "#{window_id}\t#{pane_id}",
    ]).split("\t");
    if (!windowId || !childPaneId) {
      throw new Error("run_subagent could not create the subagent tmux window.");
    }

    setPaneTitle(childPaneId, taskTitle);
    return {
      childPaneId,
      windowId,
    };
  }

  const panes = listWindowPanes(existingWindowId);
  if (panes.length === 0) {
    throw new Error("run_subagent could not find any tmux panes in the subagent window.");
  }

  const childPaneId = tmux([
    "split-window",
    "-c",
    cwd,
    "-d",
    "-t",
    pickLargestPane(panes).id,
    "-P",
    "-F",
    "#{pane_id}",
  ]);
  tmux(["select-layout", "-t", existingWindowId, "tiled"]);
  setPaneTitle(childPaneId, taskTitle);

  return {
    childPaneId,
    windowId: existingWindowId,
  };
}

function killPaneSync(paneId: string | undefined): void {
  if (!paneId) {
    return;
  }

  try {
    if (isPaneAlive(paneId)) {
      tmux(["kill-pane", "-t", paneId]);
    }
  } catch {}
}

async function createTmuxLayout(
  cwd: string,
  taskTitle: string,
  tmuxContext: TmuxContext,
  signal?: AbortSignal,
): Promise<TmuxLayout | undefined> {
  return withTmuxMutationLock(() => {
    if (signal?.aborted) {
      return undefined;
    }

    const layout =
      getActiveSubagentCount(tmuxContext.windowId) > 1
        ? createDedicatedWindowLayout(cwd, taskTitle, tmuxContext)
        : (() => {
          try {
            return createSameWindowLayout(cwd, taskTitle, tmuxContext);
          } catch {
            return createDedicatedWindowLayout(cwd, taskTitle, tmuxContext);
          }
        })();

    if (signal?.aborted) {
      killPaneSync(layout.childPaneId);
      return undefined;
    }

    return layout;
  });
}

function isPaneAlive(paneId: string): boolean {
  if (!paneId) {
    return false;
  }

  try {
    tmux(["display-message", "-p", "-t", paneId, "#{pane_id}"]);
    return true;
  } catch {
    return false;
  }
}

async function killPane(paneId: string | undefined): Promise<void> {
  if (!paneId) {
    return;
  }

  await withTmuxMutationLock(() => {
    try {
      if (isPaneAlive(paneId)) {
        tmux(["kill-pane", "-t", paneId]);
      }
    } catch {}
  });
}

async function cleanupTmuxLayout(layout: TmuxLayout | undefined): Promise<void> {
  if (!layout) {
    return;
  }

  await killPane(layout.childPaneId);
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runSpawnSubagent(input: SpawnSubagentRunInput): Promise<SpawnSubagentRunResult> {
  const childModel = resolveModelArg(input);
  const requestedSessionId = input.sessionId?.trim() || undefined;
  const childPrompt = requestedSessionId ? input.instructions : buildFreshChildPrompt(input.instructions);
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

  ensureTmuxAvailable();

  const ipcDir = mkdtempSync(join(tmpdir(), "pi-run-subagent-"));
  const statePath = join(ipcDir, STATE_FILE_NAME);
  const resultPath = join(ipcDir, RESULT_FILE_NAME);
  const exitPath = join(ipcDir, EXIT_FILE_NAME);
  const tmuxContext = resolveTmuxContext();
  incrementActiveSubagent(tmuxContext.windowId);

  let layout: TmuxLayout | undefined;
  let finalAnswer = "";
  let exitCode = 1;
  let aborted = false;
  let sawExit = false;
  let sawResult = false;
  let cleanupAfterReturn = false;
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
    cleanupAfterReturn = true;
    abortCleanupDeadline = Date.now() + ABORT_CLEANUP_GRACE_PERIOD_MS;
    details.stopReason = "aborted";
    details.status = "error";
    details.error = details.error || message;
    details.answerPreview = details.answerPreview || previewText(details.error);
    emitUpdate();
  };

  const startCleanup = () => {
    if (!cleanupPromise) {
      cleanupPromise = cleanupTmuxLayout(layout);
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
      cleanupAfterReturn = true;
      return {
        contentText: buildFailureText(details, "Parent request was aborted."),
        details: cloneDetails(details),
      };
    }

    const scriptPath = writeLauncherScript(input, childPrompt, childModel, requestedSessionId, ipcDir);
    layout = await createTmuxLayout(input.cwd, input.taskTitle, tmuxContext, input.signal);

    if (!layout) {
      markAborted("Subagent was aborted before the tmux pane was created.");
      cleanupAfterReturn = true;
      return {
        contentText: buildFailureText(details, "Parent request was aborted."),
        details: cloneDetails(details),
      };
    }

    try {
      await startCommandInPane(layout.childPaneId, `${shellEscape(scriptPath)}; exit`, input.signal);
    } catch (error: any) {
      cleanupAfterReturn = true;
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
        cleanupAfterReturn = true;
        break;
      }

      const paneAlive = layout ? isPaneAlive(layout.childPaneId) : false;
      if (!paneAlive) {
        if (aborted) {
          exitCode = 130;
          sawExit = true;
          cleanupAfterReturn = true;
          break;
        }

        if (sawResult && details.stopReason === "stop") {
          exitCode = 0;
          cleanupAfterReturn = true;
          break;
        }

        if (deadPaneDeadline === 0) {
          deadPaneDeadline = Date.now() + RESULT_GRACE_PERIOD_MS;
        } else if (Date.now() >= deadPaneDeadline) {
          exitCode = 1;
          sawExit = true;
          cleanupAfterReturn = true;
          details.stopReason = details.stopReason ?? "error";
          details.error = details.error || "Subagent pane exited before writing a result.";
          break;
        }
      } else {
        deadPaneDeadline = 0;
      }

      if (sawResult && details.stopReason !== "stop") {
        cleanupAfterReturn = true;
        break;
      }

      if (sawResult && details.stopReason === "stop") {
        if (successResultDeadline > 0 && Date.now() >= successResultDeadline) {
          cleanupAfterReturn = true;
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
  } finally {
    input.signal?.removeEventListener("abort", abortListener);
    if (cleanupAfterReturn) {
      await (cleanupPromise ?? cleanupTmuxLayout(layout));
      try {
        rmSync(ipcDir, { recursive: true, force: true });
      } catch {}
    }
    decrementActiveSubagent(tmuxContext.windowId);
  }
}
