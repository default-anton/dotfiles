import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const ENV_VAR = "OPENAI_SERVICE_TIER";
const STATUS_KEY = "openai-service-tier";
const VALID_TIERS = new Set(["auto", "default", "flex", "scale", "priority"]);
// service_tier is only valid on the OpenAI Responses API.
const SUPPORTED_APIS = new Set(["openai-responses", "openai-codex-responses"]);

function getTier(): string | undefined {
  const raw = process.env[ENV_VAR]?.trim();
  if (!raw) return undefined;
  if (!VALID_TIERS.has(raw)) return undefined;
  return raw;
}

function isOpenAIResponsesModel(model: ExtensionContext["model"]): boolean {
  return !!model && SUPPORTED_APIS.has(model.api);
}

function refreshStatus(ctx: ExtensionContext, tier: string | undefined): void {
  if (tier === "priority" && isOpenAIResponsesModel(ctx.model)) {
    ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", "⚡fast"));
  } else {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  }
}

export default function openaiServiceTierExtension(pi: ExtensionAPI) {
  // Validate at load: warn once if env is set but invalid.
  const raw = process.env[ENV_VAR]?.trim();
  if (raw && !VALID_TIERS.has(raw)) {
    pi.on("session_start", (_event, ctx) => {
      ctx.ui.notify(
        `${ENV_VAR}="${raw}" is not one of: ${[...VALID_TIERS].join(", ")} (ignored)`,
        "warning",
      );
    });
    return;
  }

  // Env not set → no-op.
  if (!raw) return;

  pi.on("before_provider_request", (event, ctx) => {
    const tier = getTier();
    if (!tier) return;
    if (!isOpenAIResponsesModel(ctx.model)) return;
    if (!event.payload || typeof event.payload !== "object") return;
    return { ...(event.payload as Record<string, unknown>), service_tier: tier };
  });

  pi.on("session_start", (_event, ctx) => refreshStatus(ctx, getTier()));
  pi.on("model_select", (_event, ctx) => refreshStatus(ctx, getTier()));
}
