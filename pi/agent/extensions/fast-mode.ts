import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "fast-mode";
// service_tier is only valid on the OpenAI Responses API.
const SUPPORTED_APIS = new Set(["openai-responses", "openai-codex-responses"]);

function isOpenAIResponsesModel(model: ExtensionContext["model"]): boolean {
  return !!model && SUPPORTED_APIS.has(model.api);
}

function refreshStatus(ctx: ExtensionContext, enabled: boolean): void {
  if (enabled && isOpenAIResponsesModel(ctx.model)) {
    ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", "🚀"));
  } else {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  }
}

export default function fastModeExtension(pi: ExtensionAPI) {
  const agentDir = getAgentDir();
  const statePath = join(agentDir, "openai-service-tier.json");
  let enabled = false;
  let loadError: string | undefined;

  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    if (typeof state?.enabled !== "boolean") {
      throw new Error("Expected an enabled boolean");
    }
    enabled = state.enabled;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      loadError = `Could not read fast mode state; using default tier: ${String(error)}`;
    }
  }

  pi.registerCommand("fast", {
    description: "Toggle OpenAI priority service tier and remember the setting",
    handler: async (_args, ctx) => {
      const nextEnabled = !enabled;
      try {
        mkdirSync(agentDir, { recursive: true });
        writeFileSync(statePath, `${JSON.stringify({ enabled: nextEnabled }, null, 2)}\n`);
      } catch (error) {
        ctx.ui.notify(`Could not save fast mode state: ${String(error)}`, "error");
        return;
      }

      enabled = nextEnabled;
      refreshStatus(ctx, enabled);
      ctx.ui.notify(`Fast mode ${enabled ? "on (priority)" : "off (default)"}`, "info");
    },
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!isOpenAIResponsesModel(ctx.model)) return;
    if (!event.payload || typeof event.payload !== "object") return;
    return {
      ...(event.payload as Record<string, unknown>),
      service_tier: enabled ? "priority" : "default",
    };
  });

  pi.on("session_start", (_event, ctx) => {
    if (loadError) {
      ctx.ui.notify(loadError, "warning");
      loadError = undefined;
    }
    refreshStatus(ctx, enabled);
  });
  pi.on("model_select", (_event, ctx) => refreshStatus(ctx, enabled));
}
