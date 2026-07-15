import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

type Verbosity = "low" | "medium" | "high";

const SHORTCUT = "ctrl+n";
const STATUS_KEY = "verbosity";
const SETTINGS_FILE = "verbosity-low-medium-high.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVerbosity(value: unknown): value is Verbosity {
  return value === "low" || value === "medium" || value === "high";
}

function getSettingsPath(): string {
  return join(getAgentDir(), SETTINGS_FILE);
}

function readSelectedVerbosity(): Verbosity | undefined {
  try {
    const settings: unknown = JSON.parse(readFileSync(getSettingsPath(), "utf8"));
    return isRecord(settings) && isVerbosity(settings.verbosity) ? settings.verbosity : undefined;
  } catch {
    return undefined;
  }
}

function writeSelectedVerbosity(verbosity: Verbosity): void {
  const settingsPath = getSettingsPath();
  const tempPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;

  try {
    writeFileSync(tempPath, JSON.stringify({ verbosity }, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(tempPath, settingsPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function getDefaultVerbosity(model: ExtensionContext["model"]): Verbosity | undefined {
  if (!model) return undefined;
  if (model.api === "openai-codex-responses") return "low";
  if (model.api === "openai-responses" && /^gpt-5(?:[.-]|$)/.test(model.id)) return "medium";
  return undefined;
}

function getNextVerbosity(current: Verbosity): Verbosity {
  if (current === "low") return "medium";
  if (current === "medium") return "high";
  return "low";
}

export default function verbosityLowMediumHighExtension(pi: ExtensionAPI) {
  let selectedVerbosity: Verbosity | undefined;

  function getCurrentVerbosity(ctx: ExtensionContext): Verbosity | undefined {
    const defaultVerbosity = getDefaultVerbosity(ctx.model);
    if (!defaultVerbosity) return undefined;
    return selectedVerbosity ?? defaultVerbosity;
  }

  function refreshStatus(ctx: ExtensionContext): void {
    const verbosity = getCurrentVerbosity(ctx);
    ctx.ui.setStatus(
      STATUS_KEY,
      verbosity ? ctx.ui.theme.fg("dim", `verbosity:${verbosity}`) : undefined,
    );
  }

  pi.registerShortcut(SHORTCUT, {
    description: "Cycle response verbosity between low, medium, and high",
    handler: async (ctx) => {
      const current = getCurrentVerbosity(ctx);
      if (!current) {
        const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "current model";
        ctx.ui.notify(`Verbosity is not supported by ${model}`, "warning");
        refreshStatus(ctx);
        return;
      }

      selectedVerbosity = getNextVerbosity(current);
      refreshStatus(ctx);

      try {
        writeSelectedVerbosity(selectedVerbosity);
        ctx.ui.notify(`Verbosity: ${selectedVerbosity}`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Verbosity: ${selectedVerbosity} (not saved: ${message})`, "error");
      }
    },
  });

  pi.on("before_provider_request", (event, ctx) => {
    const verbosity = getCurrentVerbosity(ctx);
    if (!verbosity || !isRecord(event.payload)) return;

    const text = isRecord(event.payload.text) ? event.payload.text : {};
    return {
      ...event.payload,
      text: {
        ...text,
        verbosity,
      },
    };
  });

  pi.on("session_start", (_event, ctx) => {
    selectedVerbosity = readSelectedVerbosity();
    refreshStatus(ctx);
  });
  pi.on("model_select", (_event, ctx) => refreshStatus(ctx));
}
