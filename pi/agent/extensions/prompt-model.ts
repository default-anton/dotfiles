import { readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-ai";

const THINKING_LEVELS = new Set<ThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

type ModelSelection = {
  provider: string;
  modelId: string;
  thinkingLevel?: ThinkingLevel;
};

function readFrontmatterModel(filePath: string): string | undefined {
  const content = readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return undefined;

  const modelLine = match[1].match(/^model:\s*(.*?)\s*$/m);
  if (!modelLine?.[1]) return undefined;

  const value = modelLine[1];
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.at(-1) === quote) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function parseModelSelection(value: string): ModelSelection | undefined {
  const separator = value.indexOf("/");
  if (separator <= 0 || separator === value.length - 1) return undefined;

  const provider = value.slice(0, separator);
  let modelId = value.slice(separator + 1);
  let thinkingLevel: ThinkingLevel | undefined;
  const thinkingSeparator = modelId.lastIndexOf(":");
  const suffix = modelId.slice(thinkingSeparator + 1) as ThinkingLevel;

  if (thinkingSeparator > 0 && THINKING_LEVELS.has(suffix)) {
    modelId = modelId.slice(0, thinkingSeparator);
    thinkingLevel = suffix;
  }

  return { provider, modelId, thinkingLevel };
}

function promptCommandName(text: string): string | undefined {
  return text.match(/^\/([^\s]+)(?:\s|$)/)?.[1];
}

async function selectTemplateModel(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  commandName: string,
  filePath: string,
): Promise<boolean> {
  let configuredModel: string | undefined;
  try {
    configuredModel = readFrontmatterModel(filePath);
  } catch (error) {
    ctx.ui.notify(`Could not read /${commandName} model: ${String(error)}`, "error");
    return false;
  }

  if (!configuredModel) return true;

  const selection = parseModelSelection(configuredModel);
  if (!selection) {
    ctx.ui.notify(`Invalid model for /${commandName}: ${configuredModel}`, "error");
    return false;
  }

  const model = ctx.modelRegistry.find(selection.provider, selection.modelId);
  if (!model) {
    ctx.ui.notify(`Model not found for /${commandName}: ${configuredModel}`, "error");
    return false;
  }

  if (!(await pi.setModel(model))) {
    ctx.ui.notify(`No credentials for /${commandName} model: ${configuredModel}`, "error");
    return false;
  }

  if (selection.thinkingLevel) {
    pi.setThinkingLevel(selection.thinkingLevel);
  }
  return true;
}

export default function promptModelExtension(pi: ExtensionAPI) {
  pi.on("input", async (event, ctx) => {
    const commandName = promptCommandName(event.text);
    if (!commandName) return;

    const template = pi
      .getCommands()
      .find((command) => command.source === "prompt" && command.name === commandName);
    if (!template) return;

    const selected = await selectTemplateModel(
      pi,
      ctx,
      commandName,
      template.sourceInfo.path,
    );
    if (!selected) return { action: "handled" };
  });
}
