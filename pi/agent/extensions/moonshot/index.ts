import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Moonshot Provider Extension
 *
 * Adds support for Moonshot AI models, specifically the new Kimi K2.5.
 * It uses the "zai" thinking format (thinking: { type: "enabled" }).
 */

export default function(pi: ExtensionAPI) {
  pi.registerProvider("moonshot", {
    baseUrl: "https://api.moonshot.ai/v1",
    apiKey: "MOONSHOT_API_KEY",
    api: "openai-completions",
    models: [
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5",
        reasoning: true,
        input: ["text", "image"],
        cost: {
          input: 0.6,
          output: 3.0,
          cacheRead: 0.1,
          cacheWrite: 0.6,
        },
        contextWindow: 262144,
        maxTokens: 32768,
        compat: {
          thinkingFormat: "zai",
          maxTokensField: "max_tokens",
          supportsDeveloperRole: false,
          supportsStore: false,
        },
      },
      {
        id: "kimi-latest",
        name: "Kimi Latest",
        reasoning: false,
        input: ["text", "image"],
        cost: {
          input: 1.0,
          output: 3.0,
          cacheRead: 0.15,
          cacheWrite: 1.0,
        },
        contextWindow: 131072,
        maxTokens: 131072,
        compat: {
          maxTokensField: "max_tokens",
          supportsDeveloperRole: false,
          supportsStore: false,
        },
      },
      {
        id: "kimi-k2-turbo-preview",
        name: "Kimi K2 Turbo",
        reasoning: false,
        input: ["text"],
        cost: {
          input: 1.15,
          output: 8.0,
          cacheRead: 0.15,
          cacheWrite: 1.15,
        },
        contextWindow: 262144,
        maxTokens: 32768,
        compat: {
          maxTokensField: "max_tokens",
          supportsDeveloperRole: false,
          supportsStore: false,
        },
      },
      {
        id: "kimi-k2-thinking",
        name: "Kimi K2 Thinking",
        reasoning: true,
        input: ["text"],
        cost: {
          input: 0.6,
          output: 2.5,
          cacheRead: 0.15,
          cacheWrite: 0.6,
        },
        contextWindow: 262144,
        maxTokens: 32768,
        compat: {
          thinkingFormat: "zai",
          maxTokensField: "max_tokens",
          supportsDeveloperRole: false,
          supportsStore: false,
        },
      },
      {
        id: "moonshot-v1-8k",
        name: "Moonshot V1 8K",
        reasoning: false,
        input: ["text"],
        cost: {
          input: 0.2,
          output: 2.0,
          cacheRead: 0.2,
          cacheWrite: 0.2,
        },
        contextWindow: 8192,
        maxTokens: 8192,
        compat: {
          maxTokensField: "max_tokens",
          supportsDeveloperRole: false,
          supportsStore: false,
        },
      },
      {
        id: "moonshot-v1-32k",
        name: "Moonshot V1 32K",
        reasoning: false,
        input: ["text"],
        cost: {
          input: 1.0,
          output: 3.0,
          cacheRead: 1.0,
          cacheWrite: 1.0,
        },
        contextWindow: 32768,
        maxTokens: 32768,
        compat: {
          maxTokensField: "max_tokens",
          supportsDeveloperRole: false,
          supportsStore: false,
        },
      },
      {
        id: "moonshot-v1-128k",
        name: "Moonshot V1 128K",
        reasoning: false,
        input: ["text"],
        cost: {
          input: 2.0,
          output: 5.0,
          cacheRead: 2.0,
          cacheWrite: 2.0,
        },
        contextWindow: 131072,
        maxTokens: 131072,
        compat: {
          maxTokensField: "max_tokens",
          supportsDeveloperRole: false,
          supportsStore: false,
        },
      },
    ],
  });
}
