const REVIEW_INSTRUCTION = `Review the available work and context.

First identify the review surface: current diff, uncommitted changes, conversation context, stated task, requirements, and acceptance criteria. Review small, localized changes directly. For broad, cross-cutting, context-heavy, or high-risk changes, use subagents to improve coverage.

When using subagents:

1. Reconnaissance:
Delegate tightly scoped repo-local research on relevant pre-existing subsystems, invariants, interfaces, tests, edge cases, and risk areas. Reconnaissance subagents must not modify source, tests, config, docs, or generated files; they may only write markdown notes/reports in a temporary review area and return the note path plus a summary.

2. Focused review:
Delegate one or more scoped reviews using the review surface, relevant reconnaissance note paths, and the shared review backbone below. Include the shared review backbone in each focused review prompt. Scope by subsystem, changed area, risk dimension, acceptance criterion, cross-cutting impact, or hypothesis. Allow intentional overlap when risk justifies it, but avoid accidental duplicate work. Focused review subagents must not modify source, tests, config, docs, or generated files; they may only write temporary markdown notes/reports.

3. Adversarial validation:
Challenge each candidate finding against the actual code path and surrounding context. For broad, high-risk, subtle, or uncertain findings, delegate tightly scoped validators to try to disprove specific candidates using guards, call sites, defaults, tests, documented contracts, and relevant invariants. Validators must not modify source, tests, config, docs, or generated files. Drop false positives, duplicates, out-of-scope concerns, and unsupported assumptions. Keep only material findings with concrete affected behavior and an actionable fix.

Shared review backbone for you and focused review subagents:
Put your strict maintainer hat on.
Find concrete, high-confidence, material issues introduced by the work or revealed by the additional context.
Do not stop after the first few findings; keep reviewing until the assigned scope is checked.
Verify completeness against the stated task, requirements, and acceptance criteria; flag missing or partially implemented requirements as findings.
Focus on correctness, security, performance, operability, and maintainability.
Do not speculate; point to the affected behavior, invariant, or code path.
Prefer issues the author would likely fix before merge.
Assume existing interfaces and behavior should remain backward compatible unless the user or project instructions explicitly say otherwise.
If nothing material stands out in the assigned scope, say \`looks good\`; otherwise return numbered findings sorted by priority.
Use [P0] for certain severe breakage, data loss, or security issues; [P1] for likely user-facing breakage or major regressions; [P2] for limited-scope correctness, performance, or maintainability issues; [P3] for minor but real issues.
For each finding, include a [P0]-[P3] tag, location, a summary, an explanation of the affected behavior, invariant, or code path, and \`Recommendation:\` with the top specific, actionable fix.

After subagents return, read their notes/reports, deduplicate findings, resolve obvious conflicts, preserve legitimate findings, and synthesize the final review. Scale subagent count to context and risk, not file count. Do not fully re-review every subagent finding unless it is internally inconsistent, unsupported, or contradicted by other evidence. Do one final missed-issue pass over the overall review surface before answering. Do not expose orchestration details unless needed to understand a finding.

Final answer contract:
If nothing material stands out, say \`looks good\`; otherwise return numbered sections for findings, sorted by priority. Use the same [P0]-[P3] priority rubric and finding format from the shared review backbone.`;

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
