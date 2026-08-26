const REVIEW_INSTRUCTION = `Review the available work and context.

First identify the review surface: current diff, uncommitted changes, conversation context, stated task, requirements, and acceptance criteria. Review small, localized changes directly. For broad, cross-cutting, context-heavy, or high-risk changes, use subagents to improve coverage.

When using subagents, call run_subagent with fork_current_context=true. Start each call's instructions with \`Role: <role> subagent.\` Then state its bounded scope, specific questions, and expected result.

Run dependent stages in order so each fork includes the prior stage's results:

1. Research:
Ask scoped research subagents to study the relevant pre-existing subsystems, contracts, invariants, interfaces, data flow, tests, configuration, history, constraints, and project patterns. They should look beyond changed files when needed.

Research must not review the work, recommend changes, or decide whether anything is a defect. It should separate verified facts, reasonable inferences, and unresolved questions; cite relevant paths and symbols; and return a concise context report covering:
- subsystem and change map;
- contracts, invariants, defaults, and boundaries;
- callers, consumers, and data flow;
- tests and validation paths;
- relevant patterns, history, and constraints;
- conflicting evidence and unresolved questions.

Finish research before starting focused review so reviewers inherit its results.

2. Focused review:
After research returns, fork focused reviewers from the updated context. Scope each reviewer by subsystem, changed area, risk, acceptance criterion, impact, or hypothesis. Tell it to apply the shared review backbone and final answer contract from the inherited review instruction. Allow overlap when the risk warrants it, but avoid duplicate work.

3. Validate findings:
Check each candidate against the code path and context. For broad, high-risk, subtle, or uncertain findings, fork a scoped validator after the candidate is present in the conversation. State the exact claim and ask the validator to try to disprove it using guards, call sites, defaults, tests, contracts, and invariants. Drop false positives, duplicates, unsupported assumptions, and issues outside the assigned scope. Keep only material findings with a concrete effect and fix.

Shared review backbone for you and focused review subagents:
Apply a strict maintainer’s standard.
Review the full assigned scope, not just the first few findings.
Check the work against the stated task, requirements, and acceptance criteria. Report missing or partial requirements.
Focus on correctness, security, performance, operability, and maintainability.
Flag changes that break existing behavior, invariants, security boundaries, or interfaces unless the task requires the break. Also flag departures from established project patterns that lack a clear reason.
Report concrete, high-confidence, material issues within the assigned scope, including pre-existing issues that meet the same bar.
Prefer issues the author would likely fix before merge.
Do not speculate. Point to the affected behavior, invariant, or code path.
Trace each finding to its root cause. Recommend a minimal, simple, clean, long-term, maintainable solution.
Recommend a minimal, simple, clean, maintainable, long-term solution that follows an established project pattern; introduce a new pattern only when existing ones do not fit.

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
