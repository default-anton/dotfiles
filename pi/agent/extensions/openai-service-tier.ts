import { streamSimpleOpenAIResponses, type Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type OpenAIServiceTier = "auto" | "default" | "flex" | "scale" | "priority";

const VALID_SERVICE_TIERS = new Set<OpenAIServiceTier>(["auto", "default", "flex", "scale", "priority"]);

function parseServiceTier(value: string | undefined): OpenAIServiceTier | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return VALID_SERVICE_TIERS.has(normalized as OpenAIServiceTier)
    ? (normalized as OpenAIServiceTier)
    : undefined;
}

function setPayloadServiceTier(payload: unknown, serviceTier: OpenAIServiceTier): void {
  if (!payload || typeof payload !== "object") return;
  (payload as { service_tier?: OpenAIServiceTier }).service_tier = serviceTier;
}

export default function openaiServiceTierExtension(pi: ExtensionAPI) {
  const configuredValue = process.env.PI_OPENAI_SERVICE_TIER ?? process.env.OPENAI_SERVICE_TIER;
  const serviceTier = parseServiceTier(configuredValue);

  if (configuredValue && !serviceTier) {
    pi.on("session_start", (_event, ctx) => {
      if (!ctx.hasUI) return;
      ctx.ui.notify(
        `Ignoring invalid PI_OPENAI_SERVICE_TIER value "${configuredValue}". Valid values: auto, default, flex, scale, priority.`,
        "warning",
      );
    });
    return;
  }

  if (!serviceTier) {
    return;
  }

  pi.registerProvider("openai", {
    api: "openai-responses",
    streamSimple(model, context, options) {
      const responsesModel = model as Model<"openai-responses">;

      if (responsesModel.provider !== "openai") {
        return streamSimpleOpenAIResponses(responsesModel, context, options);
      }

      const parentOnPayload = options?.onPayload;
      return streamSimpleOpenAIResponses(responsesModel, context, {
        ...options,
        onPayload: (payload) => {
          parentOnPayload?.(payload);
          setPayloadServiceTier(payload, serviceTier);
        },
      });
    },
  });
}
