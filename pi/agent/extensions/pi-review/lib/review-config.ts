import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export type ThinkingLevel = ReturnType<ExtensionAPI["getThinkingLevel"]>;

export const DEFAULT_REVIEW_THINKING_LEVEL: ThinkingLevel = "high";

const THINKING_LEVELS: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

type LoadedConfig = {
  thinkingLevel?: ThinkingLevel;
  warning?: string;
};

export type ReviewConfig = {
  thinkingLevel: ThinkingLevel;
  warnings: string[];
};

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return THINKING_LEVELS.some((level) => level === value);
}

function loadConfig(path: string): LoadedConfig {
  if (!existsSync(path)) return {};

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { warning: `Ignoring ${path}: expected a JSON object` };
    }

    if (!("thinkingLevel" in parsed)) return {};

    const thinkingLevel = parsed.thinkingLevel;
    if (!isThinkingLevel(thinkingLevel)) {
      return {
        warning: `Ignoring invalid thinkingLevel in ${path}; expected one of: ${THINKING_LEVELS.join(", ")}`,
      };
    }

    return { thinkingLevel };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { warning: `Failed to load ${path}: ${message}` };
  }
}

export function loadReviewConfig(cwd: string): ReviewConfig {
  const globalConfig = loadConfig(join(getAgentDir(), "pi-review.json"));
  const projectConfig = loadConfig(join(cwd, ".pi", "pi-review.json"));

  return {
    thinkingLevel:
      projectConfig.thinkingLevel ??
      globalConfig.thinkingLevel ??
      DEFAULT_REVIEW_THINKING_LEVEL,
    warnings: [globalConfig.warning, projectConfig.warning].filter(
      (warning): warning is string => warning !== undefined,
    ),
  };
}
