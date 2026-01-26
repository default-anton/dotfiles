import {
  SessionManager,
  createAgentSession,
  createReadTool,
  createBashTool,
  discoverAuthStorage,
  discoverContextFiles,
  discoverModels,
} from "@mariozechner/pi-coding-agent";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import autoloadSubdirAgents from "../autoload-subdir-agents";
import { getSmallModelFromProvider } from "../shared/model-selection";
import { TASK_EXTRACTOR_USER_PROMPT, TASK_EXTRACTOR_SYSTEM_PROMPT } from "./prompts";
import { formatConversationForExtraction } from "./summary";

export async function extractTaskFromConversation(
  entries: any[],
  ctx: ExtensionContext,
): Promise<string> {
  const authStorage = discoverAuthStorage();
  const modelRegistry = ctx.modelRegistry ?? discoverModels(authStorage);
  const contextFiles = discoverContextFiles(ctx.cwd);

  const currentProvider = ctx.model?.provider;
  if (!currentProvider) {
    throw new Error("No model provider available. Configure credentials (e.g. /login or auth.json) and try again.");
  }

  const subModel = getSmallModelFromProvider(currentProvider, modelRegistry);
  if (!subModel) {
    throw new Error("No models available. Configure credentials (e.g. /login or auth.json) and try again.");
  }

  const conversation = formatConversationForExtraction(entries);
  const userPrompt = TASK_EXTRACTOR_USER_PROMPT.replace("{conversation}", conversation);

  const { session } = await createAgentSession({
    cwd: ctx.cwd,
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.inMemory(ctx.cwd),
    model: subModel,
    thinkingLevel: "low",
    tools: [createReadTool(ctx.cwd), createBashTool(ctx.cwd)],
    customTools: [],
    extensions: [autoloadSubdirAgents],
    skills: [],
    contextFiles,
    systemPrompt: TASK_EXTRACTOR_SYSTEM_PROMPT,
  });

  try {
    await session.prompt(userPrompt, { expandPromptTemplates: false });

    // Extract the task from the last assistant message
    const task = getLastAssistantText(session.state.messages as any[]).trim();
    return task;
  } finally {
    session.dispose();
  }
}

function getLastAssistantText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    const parts = msg.content;
    if (!Array.isArray(parts)) continue;

    const blocks: string[] = [];
    for (const part of parts) {
      if (part?.type === "text" && typeof part.text === "string") blocks.push(part.text);
    }

    if (blocks.length > 0) return blocks.join("");
  }
  return "";
}
