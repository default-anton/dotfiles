import { mkdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

type Profile = "work" | "personal";
type Auth = Record<string, unknown>;

const PROVIDER = "openai-codex";
const STATUS_KEY = "chatgpt-subscription";

function readObject(path: string): Auth {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected a JSON object in ${path}`);
  }
  return value as Auth;
}

function writeObject(path: string, value: Auth): void {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    renameSync(temporaryPath, path);
  } finally {
    try {
      unlinkSync(temporaryPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function createObject(path: string, value: Auth): void {
  try {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

function validateCredential(auth: Auth): void {
  const value = auth[PROVIDER];
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Codex subscription credentials");
  }
  const credential = value as Auth;
  if (
    credential.type !== "oauth" ||
    typeof credential.access !== "string" ||
    typeof credential.refresh !== "string" ||
    typeof credential.expires !== "number" ||
    !Number.isFinite(credential.expires)
  ) {
    throw new Error("Expected a Codex OAuth login");
  }
}

export default function subscriptionExtension(pi: ExtensionAPI) {
  const agentDir = getAgentDir();
  const authPath = join(agentDir, "auth.json");
  const profilesDir = join(agentDir, "subscriptions");
  const statePath = join(profilesDir, "active.json");
  const profilePath = (profile: Profile) => join(profilesDir, `auth.${profile}.json`);
  let switching = false;

  function readProfile(): Profile {
    const state = readObject(statePath);
    if (state.profile !== "work" && state.profile !== "personal") {
      throw new Error("Invalid active subscription profile");
    }
    return state.profile;
  }

  function withAuthLock<T>(operation: () => T): T {
    const lockPath = `${authPath}.lock`;
    try {
      mkdirSync(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error("Pi authentication is busy. Try /sub again.");
      }
      throw error;
    }
    try {
      return operation();
    } finally {
      rmdirSync(lockPath);
    }
  }

  function initialize(): void {
    mkdirSync(profilesDir, { recursive: true, mode: 0o700 });
    withAuthLock(() => {
      const auth = readObject(authPath);
      createObject(statePath, { profile: "work" });
      const profile = readProfile();
      createObject(profilePath(profile), auth);
      createObject(profilePath(profile === "work" ? "personal" : "work"), {});
    });
  }

  function refreshStatus(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    const profile = readProfile();
    ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", profile === "work" ? "💼" : "👤"));
  }

  function updateStatus(ctx: ExtensionContext): void {
    try {
      refreshStatus(ctx);
    } catch {
      if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
    }
  }

  pi.registerCommand("sub", {
    description: "Toggle ChatGPT subscription: work 💼 / personal 👤 (global)",
    handler: async (_args, ctx) => {
      if (switching || !ctx.isIdle()) {
        ctx.ui.notify("Wait for Pi to finish before switching subscriptions.", "warning");
        return;
      }
      switching = true;
      try {
        initialize();
        const result = withAuthLock(() => {
          const currentProfile = readProfile();
          const nextProfile: Profile = currentProfile === "work" ? "personal" : "work";
          const currentAuth = readObject(authPath);
          const nextAuth = readObject(profilePath(nextProfile));
          validateCredential(currentAuth);
          validateCredential(nextAuth);
          const mergedAuth = { ...currentAuth };
          delete mergedAuth[PROVIDER];
          if (nextAuth[PROVIDER] !== undefined) mergedAuth[PROVIDER] = nextAuth[PROVIDER];

          writeObject(profilePath(currentProfile), currentAuth);
          writeObject(authPath, mergedAuth);
          try {
            writeObject(statePath, { profile: nextProfile });
          } catch (error) {
            writeObject(authPath, currentAuth);
            throw error;
          }
          return { profile: nextProfile, needsLogin: nextAuth[PROVIDER] === undefined };
        });
        refreshStatus(ctx);
        ctx.ui.notify(
          `ChatGPT: ${result.profile}.${result.needsLogin ? " Run /login and choose OpenAI Codex for this account." : ""}`,
          result.needsLogin ? "warning" : "info",
        );
      } catch (error) {
        updateStatus(ctx);
        ctx.ui.notify(`Subscription switch: ${String(error)}`, "error");
        return;
      } finally {
        switching = false;
      }
      await ctx.reload();
    },
  });

  pi.on("session_start", (_event, ctx) => {
    try {
      initialize();
      refreshStatus(ctx);
    } catch (error) {
      ctx.ui.notify(`Subscription setup: ${String(error)}`, "warning");
    }
  });
  pi.on("model_select", (_event, ctx) => updateStatus(ctx));
  pi.on("before_agent_start", (_event, ctx) => updateStatus(ctx));
}
