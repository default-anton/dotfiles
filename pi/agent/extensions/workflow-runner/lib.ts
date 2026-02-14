import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  DefaultPackageManager,
  getAgentDir,
  parseFrontmatter,
  SettingsManager,
  type ResolvedResource,
} from "@mariozechner/pi-coding-agent";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { SessionEntry } from "@mariozechner/pi-coding-agent";

export const STATE_VERSION = 1;
const INTERNAL_NEXT_COMMAND = "workflow-next";
const INTERNAL_STOP_COMMAND = "workflow-stop";
const STATE_ENTRY_TYPE = "workflow-runner-state";

export type WorkflowStep = {
  index: number;
  invocation: string;
  commandName: string;
  description?: string;
  outputRelativePath: string;
};

export type WorkflowDefinition = {
  slug: string;
  description?: string;
  sourcePath: string;
  steps: WorkflowStep[];
};

export type ActiveWorkflowState = {
  workflowSlug: string;
  workflowDescription?: string;
  workflowSourcePath: string;
  task: string;
  runDir: string;
  startedAt: string;
  steps: WorkflowStep[];
  currentStepIndex: number;
  waitingForWorkflowStepPrompt: boolean;
};

export type PersistedState = {
  version: number;
  activeWorkflow: ActiveWorkflowState | null;
};

function isTruthyFrontmatterValue(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;

  return ["true", "yes", "1", "on"].includes(value.trim().toLowerCase());
}

function parseInvocation(line: string): { invocation: string; commandName: string } | null {
  const invocation = line.trim();
  if (!invocation.startsWith("/")) return null;

  const [head] = invocation.split(/\s+/, 1);
  const commandName = head.slice(1).trim();
  if (!commandName) return null;

  return { invocation, commandName };
}

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "step";
}

function firstNonEmptyLine(text: string): string | undefined {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }

  return undefined;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitTopLevelFrontmatter(content: string): { yaml: string | null; body: string } {
  const normalized = normalizeNewlines(content);
  const lines = normalized.split("\n");
  if (lines.length === 0 || !/^---\s*$/.test(lines[0])) {
    return { yaml: null, body: normalized };
  }

  for (let i = 1; i < lines.length; i += 1) {
    if (!/^---\s*$/.test(lines[i])) continue;
    return {
      yaml: lines.slice(1, i).join("\n"),
      body: lines.slice(i + 1).join("\n").trim(),
    };
  }

  return { yaml: null, body: normalized };
}

function dedentBlock(lines: string[]): string[] {
  let minIndent = Number.POSITIVE_INFINITY;

  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    minIndent = Math.min(minIndent, indent);
  }

  if (!Number.isFinite(minIndent)) {
    return lines.map((line) => line.trimEnd());
  }

  return lines.map((line) => (line.trim() ? line.slice(minIndent).trimEnd() : ""));
}

function foldBlock(lines: string[]): string {
  const paragraphs = lines
    .join("\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.split("\n").map((line) => line.trim()).join(" ").trim())
    .filter(Boolean);

  return paragraphs.join("\n\n").trim();
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }

  const lower = trimmed.toLowerCase();
  if (["true", "yes", "on"].includes(lower)) return true;
  if (["false", "no", "off"].includes(lower)) return false;
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);

  return trimmed;
}

function parseSimpleFrontmatter(yaml: string): Record<string, unknown> {
  const lines = yaml.split("\n");
  const frontmatter: Record<string, unknown> = {};

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const match = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const marker = rawValue.trim();

    if (/^[>|][+-]?$/.test(marker)) {
      const block: string[] = [];
      let j = i + 1;

      while (j < lines.length) {
        const blockLine = lines[j];
        if (!blockLine.trim()) {
          block.push("");
          j += 1;
          continue;
        }

        if (!/^\s+/.test(blockLine)) break;
        block.push(blockLine);
        j += 1;
      }

      const dedented = dedentBlock(block);
      frontmatter[key] = marker.startsWith(">") ? foldBlock(dedented) : dedented.join("\n").trimEnd();
      i = j - 1;
      continue;
    }

    frontmatter[key] = parseScalar(rawValue);
  }

  return frontmatter;
}

function parseMarkdownFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const normalized = normalizeNewlines(content);

  try {
    const parsed = parseFrontmatter<Record<string, unknown>>(normalized);
    return {
      frontmatter: parsed.frontmatter && typeof parsed.frontmatter === "object" ? parsed.frontmatter : {},
      body: normalizeNewlines(parsed.body),
    };
  } catch {
    const { yaml, body } = splitTopLevelFrontmatter(normalized);
    if (!yaml) return { frontmatter: {}, body: body.trim() };

    return {
      frontmatter: parseSimpleFrontmatter(yaml),
      body,
    };
  }
}

function extractSkillDescription(content: string): string | undefined {
  const { frontmatter } = parseMarkdownFrontmatter(content);
  if (typeof frontmatter.description === "string" && frontmatter.description.trim()) {
    return frontmatter.description.trim();
  }

  const descriptionTag = content.match(/<description>\s*([\s\S]*?)\s*<\/description>/i);
  if (descriptionTag?.[1]) return descriptionTag[1].trim();

  return firstNonEmptyLine(content);
}

function extractSkillName(filePath: string, content: string): string {
  const { frontmatter } = parseMarkdownFrontmatter(content);
  if (typeof frontmatter.name === "string" && frontmatter.name.trim()) {
    return frontmatter.name.trim();
  }

  return path.basename(path.dirname(filePath));
}

function buildStepOutputRelativePaths(invocations: string[]): string[] {
  const counts = new Map<string, number>();

  return invocations.map((line) => {
    const parsed = parseInvocation(line);
    const base = sanitizeSlug(parsed?.commandName || line);
    const seen = counts.get(base) || 0;
    counts.set(base, seen + 1);
    const name = seen === 0 ? base : `${base}-${seen + 1}`;
    return path.join(name, "output.md");
  });
}

function enabledPaths(resources: ResolvedResource[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const resource of resources) {
    if (!resource.enabled) continue;
    if (seen.has(resource.path)) continue;

    seen.add(resource.path);
    result.push(resource.path);
  }

  return result;
}

async function resolvePromptAndSkillPaths(cwd: string): Promise<{ promptPaths: string[]; skillPaths: string[] }> {
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(cwd, agentDir);
  const packageManager = new DefaultPackageManager({ cwd, agentDir, settingsManager });
  const resolved = await packageManager.resolve();

  return {
    promptPaths: enabledPaths(resolved.prompts),
    skillPaths: enabledPaths(resolved.skills),
  };
}

async function commandDescriptions(cwd: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const { promptPaths, skillPaths } = await resolvePromptAndSkillPaths(cwd);

  for (const promptPath of promptPaths) {
    let content = "";
    try {
      content = await fs.readFile(promptPath, "utf8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseMarkdownFrontmatter(content);
    const name = path.basename(promptPath, ".md");
    const description =
      typeof frontmatter.description === "string" && frontmatter.description.trim()
        ? frontmatter.description.trim()
        : firstNonEmptyLine(body);
    if (description) result.set(name, description);
  }

  for (const skillPath of skillPaths) {
    let content = "";
    try {
      content = await fs.readFile(skillPath, "utf8");
    } catch {
      continue;
    }

    const name = extractSkillName(skillPath, content);
    const description = extractSkillDescription(content);
    if (description) result.set(`skill:${name}`, description);
  }

  return result;
}

export async function loadWorkflowDefinitions(cwd: string): Promise<WorkflowDefinition[]> {
  const { promptPaths } = await resolvePromptAndSkillPaths(cwd);
  const descriptions = await commandDescriptions(cwd);
  const bySlug = new Map<string, WorkflowDefinition>();

  for (const promptPath of promptPaths) {
    if (!promptPath.toLowerCase().endsWith(".md")) continue;

    let content = "";
    try {
      content = await fs.readFile(promptPath, "utf8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseMarkdownFrontmatter(content);
    if (!isTruthyFrontmatterValue(frontmatter.workflow)) continue;

    const lines = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    const outputPaths = buildStepOutputRelativePaths(lines);
    const steps: WorkflowStep[] = [];

    for (let i = 0; i < lines.length; i += 1) {
      const parsed = parseInvocation(lines[i]);
      if (!parsed) continue;

      steps.push({
        index: steps.length,
        invocation: parsed.invocation,
        commandName: parsed.commandName,
        description: descriptions.get(parsed.commandName),
        outputRelativePath: outputPaths[i],
      });
    }

    if (steps.length === 0) continue;

    const description =
      typeof frontmatter.description === "string" && frontmatter.description.trim()
        ? frontmatter.description.trim()
        : undefined;

    bySlug.set(path.basename(promptPath, ".md"), {
      slug: path.basename(promptPath, ".md"),
      description,
      sourcePath: promptPath,
      steps,
    });
  }

  return [...bySlug.values()];
}

function isAssistantMessage(message: unknown): message is AssistantMessage {
  return !!message && typeof message === "object" && (message as { role?: unknown }).role === "assistant";
}

function extractAssistantText(message: AssistantMessage): string {
  if (!Array.isArray(message.content)) return "";

  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function findLastAssistantText(messages: readonly unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (!isAssistantMessage(messages[i])) continue;
    const text = extractAssistantText(messages[i]);
    if (text) return text;
  }

  return "";
}

export function stateToEntry(activeWorkflow: ActiveWorkflowState | null): PersistedState {
  return { version: STATE_VERSION, activeWorkflow };
}

function stateFromEntry(data: unknown): ActiveWorkflowState | null {
  if (!data || typeof data !== "object") return null;
  const state = data as PersistedState;
  if (state.version !== STATE_VERSION) return null;
  if (!state.activeWorkflow) return null;
  if (!Array.isArray(state.activeWorkflow.steps)) return null;
  if (typeof state.activeWorkflow.workflowSlug !== "string") return null;
  return state.activeWorkflow;
}

export function restoreState(entries: SessionEntry[], stateEntryType: string): ActiveWorkflowState | null {
  const customEntries = entries
    .filter((entry): entry is SessionEntry & { type: "custom"; customType: string; data?: unknown } => {
      return entry.type === "custom";
    })
    .filter((entry) => entry.customType === stateEntryType);

  if (customEntries.length === 0) return null;
  return stateFromEntry(customEntries[customEntries.length - 1].data);
}

export function utcTimestamp(now = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}z`;
}

export async function writeStepOutput(state: ActiveWorkflowState, step: WorkflowStep, output: string): Promise<string> {
  const outputPath = path.join(state.runDir, step.outputRelativePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, output.trim() ? `${output.trim()}\n` : "", "utf8");
  return outputPath;
}

export function buildWorkflowTask(conversationContext: string, supplementalInput: string): string {
  return [
    "<workflow_input>",
    "<conversation_context>",
    conversationContext,
    "</conversation_context>",
    "<supplemental_input>",
    supplementalInput,
    "</supplemental_input>",
    "</workflow_input>",
  ].join("\n");
}

export function buildWorkflowContext(state: ActiveWorkflowState, currentStep: WorkflowStep): string {
  const steps = state.steps
    .map((step, index) => {
      const status = index < state.currentStepIndex ? "done" : index === state.currentStepIndex ? "current" : "pending";
      const outputPath = path.join(state.runDir, step.outputRelativePath);
      return `${index + 1}|${status}|${step.invocation}|output:${outputPath}`;
    })
    .join("\n");

  return [
    "Workflow execution context",
    `Workflow: /${state.workflowSlug}`,
    `Description: ${state.workflowDescription || "(none)"}`,
    `Current step: ${state.currentStepIndex + 1}/${state.steps.length}`,
    `Run directory: ${state.runDir}`,
    "",
    "<current_step>",
    currentStep.invocation,
    "</current_step>",
    "",
    "<steps>",
    steps,
    "</steps>",
    "",
    "Task input:",
    state.task,
    "",
    "Execution notes:",
    "- Final assistant message of each step is saved to that step output path.",
    "- Read previous output files when needed.",
    "- Treat <workflow_input> as source context for intent/constraints.",
  ].join("\n");
}

export const workflowRunnerConstants = {
  INTERNAL_NEXT_COMMAND,
  INTERNAL_STOP_COMMAND,
  STATE_ENTRY_TYPE,
};
