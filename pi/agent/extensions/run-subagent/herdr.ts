import { execFile, execFileSync, spawn } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type Pane = {
  pane_id: string;
  tab_id: string;
  workspace_id: string;
};

type CreationResponse = {
  result?: {
    workspace?: { workspace_id: string };
    tab?: { tab_id: string };
    root_pane?: Pane;
    pane?: Pane;
  };
};

type Group = {
  workspaceId: string;
  tabId: string;
  paneIds: Set<string>;
};

export type HerdrLayout = {
  childPaneId: string;
  groupId: string;
};

export type HerdrPaneInput = {
  cwd: string;
  taskTitle: string;
  parentSessionId: string;
  parentSessionName?: string;
  signal?: AbortSignal;
  onFallback?: (attachCommand: string) => void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isServerNotRunning(error: unknown): boolean {
  try {
    const stderr = (error as { stderr?: string }).stderr;
    return JSON.parse(stderr ?? "").error?.code === "server_not_running";
  } catch {
    return false;
  }
}

export class HerdrTerminal {
  readonly usesFallback: boolean;
  private readonly env: NodeJS.ProcessEnv;
  private readonly binary: string;
  private readonly sessionName: string;
  private readonly startupTimeoutMs: number;
  private readonly groups = new Map<string, Group>();
  private readonly notifiedParents = new Set<string>();
  private mutationQueue: Promise<void> = Promise.resolve();
  private startup?: Promise<void>;

  constructor(options: {
    env?: NodeJS.ProcessEnv;
    sessionName?: string;
    startupTimeoutMs?: number;
  } = {}) {
    this.env = { ...(options.env ?? process.env) };
    this.binary = this.env.HERDR_BIN_PATH?.trim() || "herdr";
    this.sessionName = options.sessionName ?? "pi-subagents";
    this.startupTimeoutMs = options.startupTimeoutMs ?? 10_000;
    this.usesFallback = !(
      this.env.HERDR_ENV === "1" ||
      this.env.HERDR_PANE_ID?.trim() ||
      this.env.HERDR_TAB_ID?.trim() ||
      this.env.HERDR_WORKSPACE_ID?.trim()
    );
  }

  private args(args: string[]): string[] {
    return this.usesFallback ? ["--session", this.sessionName, ...args] : args;
  }

  private command<T>(args: string[]): T {
    const output = execFileSync(this.binary, this.args(args), {
      env: this.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000,
    }).trim();
    return output ? JSON.parse(output) as T : undefined as T;
  }

  private async probe(): Promise<void> {
    await execFileAsync(this.binary, this.args(["workspace", "list"]), {
      env: this.env,
      encoding: "utf8",
      timeout: 1_000,
    });
  }

  private async startFallback(): Promise<void> {
    try {
      await this.probe();
      return;
    } catch (error) {
      if (!isServerNotRunning(error)) {
        throw new Error(`run_subagent could not reach Herdr: ${errorMessage(error)}`);
      }
    }

    const logDir = mkdtempSync(join(tmpdir(), "pi-herdr-start-"));
    const logPath = join(logDir, "server.log");
    let launchError: Error | undefined;
    let exited = false;
    try {
      const serverEnv = { ...this.env };
      for (const key of Object.keys(serverEnv)) {
        if (key.startsWith("HERDR_") && key !== "HERDR_CONFIG_PATH") {
          delete serverEnv[key];
        }
      }
      const logFd = openSync(logPath, "w", 0o600);
      try {
        const server = spawn(this.binary, ["--session", this.sessionName, "server"], {
          env: serverEnv,
          detached: true,
          stdio: ["ignore", logFd, logFd],
        });
        server.once("error", (error) => { launchError = error; });
        server.once("exit", () => { exited = true; });
        server.unref();
      } finally {
        closeSync(logFd);
      }

      const deadline = Date.now() + this.startupTimeoutMs;
      let lastError: unknown;
      while (Date.now() < deadline) {
        try {
          await this.probe();
          return;
        } catch (error) {
          lastError = error;
        }
        if (launchError || exited) {
          try {
            await this.probe();
            return;
          } catch (error) {
            lastError = error;
          }
          break;
        }
        await sleep(100);
      }
      const diagnostics = readFileSync(logPath, "utf8").trim();
      const reason = launchError?.message || (
        exited ? "server exited before becoming ready" : `readiness timed out after ${this.startupTimeoutMs} ms`
      );
      throw new Error(
        `run_subagent could not start Herdr session "${this.sessionName}": ${reason}\n${
          diagnostics || errorMessage(lastError)
        }`,
      );
    } finally {
      rmSync(logDir, { recursive: true, force: true });
    }
  }

  private async ensureFallback(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (!this.startup) {
      const startup = this.startFallback();
      this.startup = startup;
      void startup.finally(() => {
        if (this.startup === startup) this.startup = undefined;
      }).catch(() => {});
    }
    if (!signal) {
      await this.startup;
      return;
    }
    let abortListener: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(signal.reason);
      signal.addEventListener("abort", abortListener, { once: true });
    });
    try {
      await Promise.race([this.startup, aborted]);
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener("abort", abortListener);
    }
  }

  private async mutate<T>(fn: () => T): Promise<T> {
    const run = this.mutationQueue.then(fn, fn);
    this.mutationQueue = run.then(() => {}, () => {});
    return run;
  }

  private caller(): Pane {
    const paneId = this.env.HERDR_PANE_ID?.trim();
    if (!paneId) {
      throw new Error("run_subagent found Herdr context but no calling pane.");
    }
    try {
      const response = this.command<{ result?: { pane?: Pane } }>(["pane", "current", "--pane", paneId]);
      const pane = response.result?.pane;
      if (!pane?.pane_id || !pane.tab_id || !pane.workspace_id) {
        throw new Error("Herdr returned incomplete pane metadata");
      }
      return pane;
    } catch (error) {
      throw new Error(`run_subagent could not resolve the calling Herdr pane: ${errorMessage(error)}`);
    }
  }

  private splitTarget(paneId: string): { paneId: string; direction: string } {
    const response = this.command<{
      result?: { layout?: { panes?: { pane_id: string; rect: { width: number; height: number } }[] } };
    }>(["pane", "layout", "--pane", paneId]);
    const largest = [...(response.result?.layout?.panes ?? [])].sort((a, b) =>
      b.rect.width * b.rect.height - a.rect.width * a.rect.height
    )[0];
    return largest
      ? { paneId: largest.pane_id, direction: largest.rect.width >= largest.rect.height * 2 ? "right" : "down" }
      : { paneId, direction: "right" };
  }

  async createPane(input: HerdrPaneInput): Promise<HerdrLayout> {
    if (this.usesFallback) {
      await this.ensureFallback(input.signal);
    }
    return this.mutate(() => {
      input.signal?.throwIfAborted();
      const caller = this.usesFallback ? undefined : this.caller();
      const groupId = caller ? `tab:${caller.tab_id}` : `parent:${input.parentSessionId}`;
      let group = this.groups.get(groupId);
      let panes: Pane[] = [];
      if (group) {
        const { tabId, paneIds } = group;
        const response = this.command<{ result?: { panes?: Pane[] } }>(["pane", "list"]);
        panes = (response.result?.panes ?? []).filter((pane) =>
          pane.tab_id === tabId && paneIds.has(pane.pane_id)
        );
      }

      let response: CreationResponse;
      if (group && panes.length > 0) {
        const target = this.splitTarget(panes[0].pane_id);
        response = this.command([
          "pane", "split", target.paneId, "--direction", target.direction,
          "--cwd", input.cwd, "--no-focus",
        ]);
      } else if (caller) {
        response = this.command([
          "tab", "create", "--workspace", caller.workspace_id,
          "--cwd", input.cwd, "--label", "subagents", "--no-focus",
        ]);
      } else {
        const label = input.parentSessionName?.trim() || basename(input.cwd) || "Pi";
        response = this.command([
          "workspace", "create", "--cwd", input.cwd,
          "--label", `${label} · ${input.parentSessionId.slice(0, 8)}`, "--no-focus",
        ]);
      }

      const pane = response.result?.pane ?? response.result?.root_pane;
      const tabId = response.result?.tab?.tab_id ?? pane?.tab_id;
      const workspaceId = response.result?.workspace?.workspace_id ?? pane?.workspace_id ?? caller?.workspace_id;
      if (!pane?.pane_id || !tabId || !workspaceId) {
        throw new Error("run_subagent could not create the subagent Herdr pane.");
      }
      if (!group || group.tabId !== tabId) {
        group = { workspaceId, tabId, paneIds: new Set() };
        this.groups.set(groupId, group);
      }
      group.paneIds.add(pane.pane_id);
      try {
        this.command(["pane", "rename", pane.pane_id, input.taskTitle]);
      } catch {}
      if (this.usesFallback && !this.notifiedParents.has(input.parentSessionId)) {
        this.notifiedParents.add(input.parentSessionId);
        try {
          input.onFallback?.(`herdr session attach ${this.sessionName}`);
        } catch {}
      }
      return { childPaneId: pane.pane_id, groupId };
    });
  }

  isAlive(layout: HerdrLayout): boolean {
    try {
      this.command(["pane", "get", layout.childPaneId]);
      return true;
    } catch {
      return false;
    }
  }

  async run(layout: HerdrLayout, command: string, signal?: AbortSignal): Promise<void> {
    await this.mutate(() => {
      signal?.throwIfAborted();
      if (!this.isAlive(layout)) {
        throw new Error("Subagent pane exited before the subagent command was started.");
      }
      this.command(["pane", "run", layout.childPaneId, command]);
    });
  }

  async close(layout: HerdrLayout | undefined): Promise<void> {
    if (!layout) return;
    await this.mutate(() => {
      try {
        if (this.isAlive(layout)) {
          this.command(["pane", "close", layout.childPaneId]);
        }
      } catch {}
      const group = this.groups.get(layout.groupId);
      if (!group || !group.paneIds.delete(layout.childPaneId) || group.paneIds.size > 0) return;
      this.groups.delete(layout.groupId);
      if (this.usesFallback) {
        try {
          const response = this.command<{ result?: { panes?: Pane[] } }>([
            "pane", "list", "--workspace", group.workspaceId,
          ]);
          if (response.result?.panes?.length === 0) {
            this.command(["workspace", "close", group.workspaceId]);
          }
        } catch {}
      }
    });
  }
}
