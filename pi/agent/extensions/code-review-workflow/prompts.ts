export const TASK_EXTRACTOR_SYSTEM_PROMPT = `You are an expert at extracting coding tasks from conversations.

Analyze the conversation and extract the core coding task that was being worked on. Focus on:
- What was being built or modified
- The requirements and constraints
- Any specific implementation details discussed

Output ONLY the task description, nothing else. No preamble, no explanation, just the task text.`;

export const TASK_EXTRACTOR_USER_PROMPT = `<conversation>
{conversation}
</conversation>

Extract the coding task from the conversation above.

Output ONLY the task description, nothing else.`;

export function buildReviewPrompt(
  task: string,
  summary: string,
  instructions?: string,
): string {
  const parts = [
    "Another AI coding agent has just coded this task:",
    "<task>",
    task,
    "</task>",
    "",
    "The summary of changes as per that AI coding agent:",
    "<summary>",
    summary,
    "</summary>"
  ];

  if (instructions) {
    parts.push("", "Instructions:", instructions);
  }

  parts.push(
    "",
    "Review the diff like a maintainer. Provide feedback and suggestions.",
    "Do not implement any changes yet. Let me choose which suggestions to implement.",
  );

  return parts.join("\n");
}
