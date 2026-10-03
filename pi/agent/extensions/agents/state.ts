import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { getAgentDir, parseSessionEntries, SessionManager } from "@earendil-works/pi-coding-agent";
import { ControlError, uuid } from "./schema";

export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function canonical(file: string) {
  if (existsSync(file)) return realpathSync(file);
  try {
    return join(realpathSync(dirname(file)), file.slice(file.lastIndexOf("/") + 1));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return resolve(file);
  }
}

export function readSession(file: string) {
  const entries = parseSessionEntries(readFileSync(file, "utf8"));
  const header = entries.find((entry) => entry.type === "session");
  if (!header || !uuid.test(header.id) || typeof header.cwd !== "string" || !header.cwd) {
    throw new ControlError("invalid_session", "The saved session has no valid identity or working directory.");
  }
  return SessionManager.inMemory(header.cwd, undefined, entries);
}

export function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function privateDirectory(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.()) {
    throw new ControlError("unsafe_state", `Not a private, user-owned directory: ${directory}`);
  }
  chmodSync(directory, 0o700);
}

export class State {
  readonly directory: string;
  readonly runtime: string;
  readonly server: string;

  constructor() {
    const socket = process.env.HERDR_SOCKET_PATH;
    if (process.env.HERDR_ENV !== "1" || !socket || !process.env.HERDR_PANE_ID) {
      throw new ControlError("herdr_required", "Use a persisted Pi TUI in a Herdr pane with explicit socket context.");
    }
    const socketPath = realpathSync(socket);
    const info = statSync(socketPath);
    this.server = hash(`${socketPath}:${info.dev}:${info.ino}:${info.birthtimeMs}`);
    const namespace = hash(`${realpathSync(getAgentDir())}:${socketPath}`);
    this.directory = join(process.env.XDG_STATE_HOME || join(homedir(), ".local/state"), "pi-agent-control", namespace);
    this.runtime = join(realpathSync("/tmp"), `pi-agents-${process.getuid?.()}-${namespace}`);
    privateDirectory(this.directory);
    privateDirectory(this.runtime);
  }

  path(name: string) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error("Invalid private state key.");
    return join(this.directory, name);
  }

  read<T>(name: string): T | undefined {
    try {
      return JSON.parse(readFileSync(this.path(name), "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      if (error instanceof SyntaxError) throw new ControlError("state_corrupt", `Invalid private coordination record: ${name}`);
      throw error;
    }
  }

  write(name: string, value: unknown) {
    this.writeText(name, `${JSON.stringify(value)}\n`);
  }

  writeText(name: string, text: string) {
    const temporary = this.path(`${name}.${randomUUID()}.tmp`);
    writeFileSync(temporary, text, { mode: 0o600, flag: "wx" });
    renameSync(temporary, this.path(name));
    return this.path(name);
  }

  records<T>(prefix: string): T[] {
    return readdirSync(this.directory)
      .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
      .flatMap((name) => this.read<T>(name) ?? []);
  }

  remove(name: string) {
    try {
      unlinkSync(this.path(name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  lock(key: string, incarnation: string) {
    const name = `lock-${hash(key)}.json`;
    const owner = { pid: process.pid, incarnation, nonce: randomUUID() };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fd = openSync(this.path(name), "wx", 0o600);
        try {
          writeFileSync(fd, JSON.stringify(owner));
        } finally {
          closeSync(fd);
        }
        return () => {
          if (this.read<typeof owner>(name)?.nonce === owner.nonce) this.remove(name);
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const reaping = `${name}.reaping`;
        let reaper: number;
        try {
          reaper = openSync(this.path(reaping), "wx", 0o600);
        } catch {
          throw new ControlError("busy", "Session lock recovery is already in progress or needs manual inspection.");
        }
        try {
          const previous = this.read<typeof owner>(name);
          if (previous && (!Number.isInteger(previous.pid) || processAlive(previous.pid))) {
            throw new ControlError("busy", "A live or unverified process holds the session lock.");
          }
          this.remove(name);
        } finally {
          closeSync(reaper);
          this.remove(reaping);
        }
      }
    }
    throw new ControlError("busy", "The session lock changed during acquisition.");
  }
}

export function resolveCwd(cwd: string, parentCwd: string) {
  if (!cwd.trim()) throw new Error("cwd must not be blank.");
  const expanded = cwd === "~" ? homedir() : cwd.startsWith("~/") ? join(homedir(), cwd.slice(2)) : cwd;
  const absolute = resolve(parentCwd, expanded);
  if (!statSync(absolute).isDirectory()) throw new Error("cwd must be an existing directory.");
  return realpathSync(absolute);
}

export class MutationQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => T | Promise<T>): Promise<T> {
    const next = this.tail.then(operation);
    this.tail = next.catch(() => {});
    return next;
  }
}

export function scheduleDeadline(milliseconds: number, action: () => void) {
  const deadline = Date.now() + milliseconds;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    timer = setTimeout(() => {
      if (Date.now() >= deadline) action();
      else schedule();
    }, Math.min(Math.max(0, deadline - Date.now()), 2147483647));
  };
  schedule();
  return () => clearTimeout(timer);
}
