import { readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-ai";
import { resolveModelSelection } from "./lib/model-selection.ts";

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

function promptCommandName(text: string): string | undefined {
  return text.match(/^\/([^\s]+)(?:\s|$)/)?.[1];
}

export async function selectTemplateModel(
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

  let selection;
  try {
    selection = resolveModelSelection({
      reference: configuredModel,
      currentProvider: ctx.model?.provider,
      availableModels: ctx.modelRegistry.getAll(),
      inheritedThinkingLevel: pi.getThinkingLevel(),
    });
  } catch {
    ctx.ui.notify(`Model not found for /${commandName}: ${configuredModel}`, "error");
    return false;
  }

  if (!(await pi.setModel(selection.model))) {
    ctx.ui.notify(`No credentials for /${commandName} model: ${configuredModel}`, "error");
    return false;
  }

  pi.setThinkingLevel(selection.thinkingLevel as ThinkingLevel);
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
