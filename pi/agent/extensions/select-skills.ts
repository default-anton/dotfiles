import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ClassifierQuestion, SystemMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Skill } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { escapeXml, formatSkillsForPrompt } from "./inject-context";

const SELECTION_ENTRY = "select-skills";
const STATE_AND_QUESTION_BYTE_BUDGET = 30_000;
const REQUEST_BYTE_BUDGET = 60_000;
const ASSISTANT_HISTORY_BYTE_BUDGET = 4_000;
const CLASSIFIER_TIMEOUT_MS = 1_500;
const SELECTION_POLICY = {
  context: "Use systemPrompt and recentConversation to interpret userMessage.",
  relevance: "Select plausible usefulness, including requests to read, review, or edit the skill itself; mentioning a domain alone is not enough.",
  history: [
    "History is a bounded recent excerpt.",
    "Messages marked truncated omit their middle.",
    "omittedHistoryMessages counts older messages not included.",
    "Missing history is not evidence that a skill is irrelevant.",
  ],
};
const SKILL_INSTRUCTIONS = [
  "Skills provide specialized instructions and may be presented when relevant.",
  "Decide whether a presented skill applies to your task; selection does not require using it.",
  "Read a skill file when asked to read, review, or edit it, or before doing the work it prescribes; a mention alone is not enough.",
  "Resolve relative paths in a skill against the directory containing its SKILL.md, not the working directory.",
  "Do not discover or search for other skills unless the user asks.",
].join("\n");

type SelectedSkill = Pick<Skill, "name" | "description" | "filePath">;
type Selection = {
  userEntryId: string;
  skills: SelectedSkill[];
};
type SkillBatch = {
  skills: SelectedSkill[];
  questions: Record<string, ClassifierQuestion>;
};
type ConversationMessage = {
  role: string;
  text: string;
  truncated?: boolean;
};

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function messageText(message: AgentMessage): string {
  if (message.role === "compactionSummary" || message.role === "branchSummary") return message.summary;
  if (message.role !== "user" && message.role !== "assistant") return "";
  if (typeof message.content === "string") return message.content;
  return message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n");
}

function fitHistoryMessage(message: ConversationMessage, byteBudget: number): ConversationMessage | undefined {
  if (jsonBytes(message) <= byteBudget) return message;
  const marker = "\n[... middle omitted ...]\n";
  const excerpt = (characters: number): ConversationMessage => ({
    ...message,
    text: message.text.slice(0, Math.ceil(characters / 2)).replace(/[\uD800-\uDBFF]$/u, "")
      + marker
      + message.text.slice(message.text.length - Math.floor(characters / 2)).replace(/^[\uDC00-\uDFFF]/u, ""),
    truncated: true,
  });
  if (jsonBytes(excerpt(0)) >= byteBudget) return undefined;
  let lower = 0;
  let upper = message.text.length;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (jsonBytes(excerpt(middle)) <= byteBudget) lower = middle;
    else upper = middle - 1;
  }
  const result = excerpt(lower);
  return lower > 0 && result.text !== marker ? result : undefined;
}

function buildSelectionState(messages: AgentMessage[], systemPrompt: string, byteBudget: number) {
  const history = messages.slice(0, -1).filter((message) =>
    message.role === "user" || message.role === "assistant"
    || message.role === "compactionSummary" || message.role === "branchSummary");
  const state = {
    systemPrompt,
    userMessage: messageText(messages[messages.length - 1]),
    selectionPolicy: SELECTION_POLICY,
    recentConversation: [] as ConversationMessage[],
    omittedHistoryMessages: history.length,
  };
  if (jsonBytes(state) > byteBudget) {
    throw new Error(
      `Protected system prompt and current request plus a skill question exceed the conservative ${STATE_AND_QUESTION_BYTE_BUDGET}-byte budget for Jev's 32k-token limit; neither protected input was truncated.`,
    );
  }
  for (let index = history.length - 1; index >= 0; index--) {
    const message = history[index];
    const remainingBytes = byteBudget - jsonBytes(state) - 1;
    const messageBudget = message.role === "assistant"
      ? Math.min(remainingBytes, ASSISTANT_HISTORY_BYTE_BUDGET)
      : remainingBytes;
    const fitted = fitHistoryMessage({ role: message.role, text: messageText(message) }, messageBudget);
    if (!fitted) break;
    state.recentConversation.unshift(fitted);
    state.omittedHistoryMessages--;
  }
  return state;
}

async function selectSkills(
  skills: SelectedSkill[],
  messages: AgentMessage[],
  ctx: ExtensionContext,
): Promise<SelectedSkill[]> {
  if (skills.length === 0) return [];
  const model = ctx.modelRegistry.getModelOfType("classifier", "typesafe", "jev-latest");
  if (!model) throw new Error("typesafe/jev-latest is unavailable");

  const skillQuestions = skills.map((skill): ClassifierQuestion => ({
    type: "bool",
    instructions: [
      "Under `selectionPolicy`, could this skill help with `userMessage`, or is the skill itself being requested?",
      `<skill name="${escapeXml(skill.name)}">\n${skill.description}\n</skill>`,
    ].join("\n"),
    criteria: {
      true: "The skill's described work could plausibly help, or the user asks to read, review, or change this skill.",
      false: "Neither the skill itself nor its described work is relevant to the current request.",
    },
  }));
  const questionBytes = skillQuestions.map((question) => jsonBytes({
    [`skill_${skills.length}`]: { ...question, type: "noul" },
  }));
  const state = buildSelectionState(
    messages,
    ctx.getSystemPrompt(),
    STATE_AND_QUESTION_BYTE_BUDGET - Math.max(...questionBytes),
  );
  const emptyRequestBytes = jsonBytes({ state, questions: {} });
  const batches: SkillBatch[] = [];
  let batch: SkillBatch = { skills: [], questions: {} };
  let requestBytes = emptyRequestBytes;
  for (let index = 0; index < skills.length; index++) {
    if (requestBytes + questionBytes[index] > REQUEST_BYTE_BUDGET && batch.skills.length > 0) {
      batches.push(batch);
      batch = { skills: [], questions: {} };
      requestBytes = emptyRequestBytes;
    }
    batch.questions[`skill_${batch.skills.length}`] = skillQuestions[index];
    batch.skills.push(skills[index]);
    requestBytes += questionBytes[index];
  }
  batches.push(batch);

  const timeout = AbortSignal.timeout(CLASSIFIER_TIMEOUT_MS);
  const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
  const batchResults = await Promise.allSettled(batches.map(async ({ skills: batchSkills, questions }) => {
    const result = await ctx.modelRegistry.classify(model, { state, questions }, { signal });
    if (result.stopReason !== "stop") {
      throw new Error(result.errorMessage ?? `Classifier ${result.stopReason}`);
    }
    const selected: SelectedSkill[] = [];
    for (let index = 0; index < batchSkills.length; index++) {
      const answer = result.answers[`skill_${index}`];
      if (answer?.type !== "bool" || !Number.isFinite(answer.probability)
        || answer.probability < 0 || answer.probability > 1) {
        throw new Error("Classifier returned an invalid selection");
      }
      if (answer.probability >= 0.5) selected.push(batchSkills[index]);
    }
    return selected;
  }));
  ctx.signal?.throwIfAborted();

  const selected: SelectedSkill[] = [];
  const failures: unknown[] = [];
  for (const result of batchResults) {
    if (result.status === "fulfilled") selected.push(...result.value);
    else failures.push(result.reason);
  }
  if (failures.length > 0) {
    ctx.ui.notify(
      `Skill selection incomplete: ${failures.length}/${batches.length} batches failed; keeping ${selected.length} new skills from successful batches. First failure: ${String(failures[0])}`,
      "warning",
    );
  }
  return selected;
}

function skillMessage(skills: SelectedSkill[], timestamp: number): SystemMessage {
  return {
    role: "system",
    content: formatSkillsForPrompt(skills),
    timestamp,
  };
}

function selectionLabel(skills: SelectedSkill[]): string {
  return `Skill descriptions added: ${skills.map(({ name }) => name).join(", ")}`;
}

function labelSelection(pi: ExtensionAPI, ctx: ExtensionContext, entryId: string, selection: Selection): void {
  if (selection.skills.length === 0 || ctx.sessionManager.getLabel(entryId)) return;
  pi.setLabel(entryId, selectionLabel(selection.skills));
}

export default function selectSkillsExtension(pi: ExtensionAPI) {
  let availableSkills: SelectedSkill[] = [];

  pi.registerEntryRenderer<Selection>(SELECTION_ENTRY, (entry, { expanded }, theme) => {
    if (!entry.data || entry.data.skills.length === 0) return undefined;
    const { skills } = entry.data;
    const lines = [theme.fg("muted", selectionLabel(skills))];
    if (expanded) {
      for (const skill of skills) {
        lines.push(theme.fg("dim", `${skill.name}: ${skill.description}\n${skill.filePath}`));
      }
    }
    return new Text(lines.join("\n"), 1, 0);
  });

  pi.on("before_agent_start", (event) => {
    const options = event.systemPromptOptions;
    availableSkills = options.skills
      .filter((skill) => !skill.disableModelInvocation)
      .map(({ name, description, filePath }) => ({ name, description, filePath }));
    options.skills = [];
    options.sections.skills = SKILL_INSTRUCTIONS;
  });

  pi.on("session_start", (_event, ctx) => {
    availableSkills = [];
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === SELECTION_ENTRY) {
        labelSelection(pi, ctx, entry.id, entry.data as Selection);
      }
    }
  });

  pi.on("context_with_system", async (event, ctx) => {
    const branch = ctx.sessionManager.getBranch();
    const selections = new Map<string, Selection>();
    const userEntries = new Map<number, string>();
    for (const entry of branch) {
      if (entry.type === "custom" && entry.customType === SELECTION_ENTRY) {
        const selection = entry.data as Selection;
        selections.set(selection.userEntryId, selection);
      }
      if (entry.type === "message" && entry.message.role === "user") {
        userEntries.set(entry.message.timestamp, entry.id);
      }
    }

    const shown = new Set([...selections.values()].flatMap(({ skills }) => skills.map(({ name }) => name)));
    const lastAssistant = event.messages.findLastIndex((message) => message.role === "assistant");
    for (let index = lastAssistant + 1; index < event.messages.length; index++) {
      const message = event.messages[index];
      if (message.role !== "user") continue;
      const userEntryId = userEntries.get(message.timestamp);
      if (!userEntryId || selections.has(userEntryId)) continue;

      let skills: SelectedSkill[] = [];
      try {
        skills = await selectSkills(
          availableSkills.filter((skill) => !shown.has(skill.name)),
          event.messages.slice(0, index + 1),
          ctx,
        );
      } catch (error) {
        if (ctx.signal?.aborted) return;
        ctx.ui.notify(`Skill selection failed; continuing without new skills: ${String(error)}`, "warning");
      }
      if (ctx.signal?.aborted) return;
      const selection = { userEntryId, skills };
      pi.appendEntry(SELECTION_ENTRY, selection);
      const selectionEntry = ctx.sessionManager.getLeafEntry();
      if (selectionEntry?.type === "custom" && selectionEntry.customType === SELECTION_ENTRY) {
        labelSelection(pi, ctx, selectionEntry.id, selection);
      }
      selections.set(userEntryId, selection);
      for (const skill of skills) shown.add(skill.name);
    }

    const messages: AgentMessage[] = [];
    const remaining = new Map(selections);
    for (const message of event.messages) {
      if (message.role === "system" && message.sections && "skills" in message.sections) {
        messages.push({
          ...message,
          sections: { ...message.sections, skills: `<skills>\n${SKILL_INSTRUCTIONS}\n</skills>` },
        });
        continue;
      }
      if (message.role === "user") {
        const userEntryId = userEntries.get(message.timestamp);
        const selection = userEntryId && remaining.get(userEntryId);
        if (selection) {
          if (selection.skills.length > 0) messages.push(skillMessage(selection.skills, message.timestamp));
          remaining.delete(selection.userEntryId);
        }
      }
      messages.push(message);
    }

    const retainedSkills = [...remaining.values()].flatMap(({ skills }) => skills);
    if (retainedSkills.length > 0) {
      messages.splice(1, 0, skillMessage(retainedSkills, messages[0].timestamp));
    }
    return { messages };
  });
}
