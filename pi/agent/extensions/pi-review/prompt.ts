const REVIEW_INSTRUCTION = `Review the available work and context.

First identify the review surface: current diff, uncommitted changes, conversation context, stated task, requirements, and acceptance criteria. Review small, localized changes directly. For broad, cross-cutting, context-heavy, or high-risk changes, use subagents to improve coverage.

When using subagents, give each one a tight scope. They must not modify source, tests, config, docs, or generated files. They may only write markdown notes or reports in a temporary review area.

1. Research:
Study relevant pre-existing subsystems, invariants, interfaces, tests, edge cases, and risks. Return the note path and a summary.

2. Focused review:
Give each reviewer the review surface, relevant research notes, the shared review backbone, and the final answer contract below. Scope the work by subsystem, changed area, risk, acceptance criterion, impact, or hypothesis. Allow overlap when the risk warrants it, but avoid duplicate work. Include both sections in each prompt.

3. Validate findings:
Check each candidate against the code path and context. For broad, high-risk, subtle, or uncertain findings, ask a scoped validator to try to disprove the claim using guards, call sites, defaults, tests, contracts, and invariants. Drop false positives, duplicates, unsupported assumptions, and issues outside the assigned scope. Keep only material findings with a concrete effect and fix.

Shared review backbone for you and focused review subagents:
Put your strict maintainer hat on.
Find concrete, high-confidence, material issues introduced by the work or revealed by the additional context.
Review the full assigned scope, not just the first few findings.
Check the work against the stated task, requirements, and acceptance criteria. Report missing or partial requirements.
Focus on correctness, security, performance, operability, and maintainability.
Do not speculate. Point to the affected behavior, invariant, or code path.
Prefer issues the author would likely fix before merge.
Assume existing interfaces and behavior must remain backward compatible unless the user or project instructions say otherwise.

After subagents return, read their reports, remove duplicates, resolve clear conflicts, and preserve valid findings. Check each finding's location and claim against the code; investigate further when it is unclear, disputed, or high-risk. Scale subagent count to context and risk, not file count. Check the full review surface once more before answering. Do not mention the review process unless it helps explain a finding.

Final answer contract:
If nothing material stands out, say \`looks good\`. Otherwise, return numbered findings sorted by priority. Use [P0] for certain severe breakage, data loss, or security issues; [P1] for likely user-facing breakage or major regressions; [P2] for limited-scope correctness, performance, or maintainability issues; and [P3] for minor but real issues. For each finding, include the priority, location, summary, affected behavior, invariant, or code path, and \`Recommendation:\` with the best specific fix.`;

function buildReviewInstruction(args: string): string {
  const focusText = args.trim();
  if (!focusText) {
    return REVIEW_INSTRUCTION;
  }

  return [REVIEW_INSTRUCTION, "Additional review context:", focusText].join("\n\n");
}

export function buildReviewMessage(args: string, conversationXml?: string): string {
  const reviewInstruction = buildReviewInstruction(args);
  if (!conversationXml) {
    return reviewInstruction;
  }

  return [
    "Conversation context copied from the current branch (user + assistant messages only; thinking and tool calls removed):",
    "",
    "````xml",
    conversationXml,
    "````",
    "",
    reviewInstruction,
  ].join("\n");
}
