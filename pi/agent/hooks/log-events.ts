import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HookAPI } from "@mariozechner/pi-coding-agent/hooks";

const MAX_STRING_LENGTH = 50_000;
const MAX_ARRAY_LENGTH = 200;
const MAX_OBJECT_KEYS = 200;
const MAX_DEPTH = 8;

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}\n… [truncated ${value.length - MAX_STRING_LENGTH} chars]`;
}

function sanitize(value: unknown, depth: number = 0): unknown {
  if (depth > MAX_DEPTH) return "[MaxDepth]";

  if (value === null) return null;
  if (value === undefined) return undefined;

  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return `[Function ${(value as Function).name || "anonymous"}]`;

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    const arr = value.slice(0, MAX_ARRAY_LENGTH).map((v) => sanitize(v, depth + 1));
    if (value.length > MAX_ARRAY_LENGTH) {
      arr.push(`[TruncatedArray ${value.length - MAX_ARRAY_LENGTH} items]` as unknown);
    }
    return arr;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    if (obj.type === "image" && typeof obj.data === "string") {
      return {
        type: "image",
        mimeType: typeof obj.mimeType === "string" ? obj.mimeType : undefined,
        dataLength: obj.data.length,
      };
    }

    if (
      typeof obj.id === "string" &&
      typeof obj.mimeType === "string" &&
      typeof obj.size === "number" &&
      typeof obj.content === "string"
    ) {
      return {
        ...sanitize({ ...obj, content: undefined }, depth + 1),
        contentLength: obj.content.length,
      };
    }

    const keys = Object.keys(obj);

    const out: Record<string, unknown> = {};
    for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
      try {
        out[key] = sanitize(obj[key], depth + 1);
      } catch (err) {
        out[key] = `[Thrown ${(err as Error)?.message ?? String(err)}]`;
      }
    }

    if (keys.length > MAX_OBJECT_KEYS) {
      out.__truncatedKeys__ = keys.length - MAX_OBJECT_KEYS;
    }

    return out;
  }

  return String(value);
}

function resolveDefaultLogPath(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
  return path.join(agentDir, "pi-hook-events.jsonl");
}

function summarizeSessionEntries(entries: unknown): unknown {
  if (!Array.isArray(entries)) return undefined;

  const tail = entries.slice(Math.max(0, entries.length - 25)).map((e: any) => {
    if (!e || typeof e !== "object") return e;
    const entry: Record<string, unknown> = e;

    if (entry.type === "message" && typeof (entry as any).message === "object") {
      const m: any = (entry as any).message;
      return {
        type: entry.type,
        role: m?.role,
        timestamp: entry.timestamp,
      };
    }

    return {
      type: entry.type,
      timestamp: entry.timestamp,
    };
  });

  return {
    count: entries.length,
    tail,
  };
}

function transformEvent(eventType: string, event: any): unknown {
  if (!event || typeof event !== "object") return event;

  if (eventType === "session") {
    const entries = (event as any).entries;
    const out: Record<string, unknown> = { ...event };
    out.entries = undefined;
    out.entriesSummary = summarizeSessionEntries(entries);

    if (event.reason === "before_compact") {
      out.messagesToSummarizeCount = Array.isArray(event.messagesToSummarize) ? event.messagesToSummarize.length : undefined;
      out.messagesToKeepCount = Array.isArray(event.messagesToKeep) ? event.messagesToKeep.length : undefined;
      out.model = event.model
        ? {
            id: event.model.id,
            provider: event.model.provider,
            api: event.model.api,
            baseUrl: event.model.baseUrl,
          }
        : undefined;
      out.resolveApiKey = undefined;
      out.signal = undefined;
      out.messagesToSummarize = undefined;
      out.messagesToKeep = undefined;
    }

    return out;
  }

  if (eventType === "agent_end") {
    const messages = (event as any).messages;
    const out: Record<string, unknown> = { ...event };

    if (Array.isArray(messages)) {
      out.messages = undefined;
      out.messagesSummary = {
        count: messages.length,
        tail: messages.slice(Math.max(0, messages.length - 10)).map((m: any) => ({
          role: m?.role,
          stopReason: m?.role === "assistant" ? m?.stopReason : undefined,
          timestamp: m?.timestamp,
        })),
      };
    }

    return out;
  }

  return event;
}

export default function(pi: HookAPI) {
  if (!process.env.PI_DEBUG) {
    return;
  }

  const logPath = process.env.PI_HOOK_LOG_FILE ?? resolveDefaultLogPath();
  const logDir = path.dirname(logPath);

  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    // ignore
  }

  let seq = 0;
  let didNotifyWriteError = false;

  function append(entry: Record<string, unknown>, ctx?: { hasUI: boolean; ui: { notify: (m: string, t?: any) => void } }) {
    const line = `${JSON.stringify(entry)}\n`;

    try {
      fs.appendFileSync(logPath, line, "utf-8");
    } catch (err) {
      if (!didNotifyWriteError && ctx?.hasUI) {
        didNotifyWriteError = true;
        ctx.ui.notify(`Hook log write failed: ${String(err)}`, "warning");
      }
    }
  }

  append({
    ts: Date.now(),
    type: "hook_init",
    hook: "log-events",
    pid: process.pid,
    argv: process.argv,
    node: process.version,
    logPath,
  });

  function logEvent(eventType: string, event: unknown, ctx: { cwd: string; sessionFile: string | null; hasUI: boolean }) {
    append(
      {
        ts: Date.now(),
        seq: (seq += 1),
        type: eventType,
        ctx: {
          cwd: ctx.cwd,
          sessionFile: ctx.sessionFile,
          hasUI: ctx.hasUI,
        },
        event: sanitize(transformEvent(eventType, event)),
      },
      ctx as any,
    );
  }

  pi.on("session", async (event, ctx) => {
    logEvent("session", event, ctx);
    return undefined;
  });

  pi.on("agent_start", async (event, ctx) => {
    logEvent("agent_start", event, ctx);
    return undefined;
  });

  pi.on("agent_end", async (event, ctx) => {
    logEvent("agent_end", event, ctx);
    return undefined;
  });

  pi.on("turn_start", async (event, ctx) => {
    logEvent("turn_start", event, ctx);
    return undefined;
  });

  pi.on("turn_end", async (event, ctx) => {
    logEvent("turn_end", event, ctx);
    return undefined;
  });

  pi.on("tool_call", async (event, ctx) => {
    logEvent("tool_call", event, ctx);
    return undefined;
  });

  pi.on("tool_result", async (event, ctx) => {
    logEvent("tool_result", event, ctx);
    return undefined;
  });
}
