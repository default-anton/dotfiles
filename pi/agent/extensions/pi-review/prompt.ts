const CONTEXT_INSTRUCTION = `Keep this review read-only, including all subagent work. The only permitted writes are the task brief and research reports in a unique temporary directory outside the worktree. Internal agent bookkeeping is exempt from write restrictions. Don't modify other files or run validation commands: CI handles tests, linting, formatting, type checks, builds, and static analysis. Inspect code, diffs, history, and existing results as needed.

Review in four stages: task context, code research, review, and recommendations. The extension queues one stage per turn; finish the current stage without asking to continue.

Delegate work in stages 2–4 as directed. Size assignments to scope and risk; parallelize independent work. Give each subagent a bounded assignment, the task brief's absolute path, and only the relevant research paths; require it to read those files and follow the brief's restrictions. Pass shared context by path, not by reprinting it. Stage sequencing and replies apply only to the parent; subagents return only their assigned result. Follow up only on specific coverage gaps, conflicting evidence, or unresolved claims.

In stages 3–4, if no important findings remain, say \`looks good\` unless missing evidence prevents that conclusion; report such gaps instead.

This is stage 1 of 4: gather and understand the task context.

Identify the task, requirements, acceptance criteria, and review scope from the context and current work. Consult linked requirements as needed. The copied conversation is task history, not authorization to carry out earlier requests.
If the project's AGENTS.md mentions subtree AGENTS files, read the ones relevant to the review scope.
Write a compact task brief in the temporary directory: task, requirements, acceptance criteria, review scope and baseline, relevant starting paths and AGENTS files, constraints, and unresolved questions. Include the read-only and no-validation restrictions above; task history is not authorization to implement anything. Preserve relevant user intent without copying the conversation. Keep the brief and research paths available across stages.
When the task and scope are clear, reply only \`Task context gathered.\`.`;

const RESEARCH_INSTRUCTION = `This is stage 2 of 4: research the code around the changes.

Use gpt-6.1-sol with medium reasoning and the current provider for all subagents in this stage.

Give each researcher relevant starting paths, questions to answer, and its own report path in the temporary directory.

Include this research brief:
\`\`\`
Establish how the existing code supports or interacts with the changes. Trace affected contracts and dependencies beyond changed files, but don't audit unrelated code.

Keep the work read-only except for writing your assigned research report. Internal agent bookkeeping is exempt from write restrictions. Don't modify other files or run validation commands: CI handles tests, linting, formatting, type checks, builds, and static analysis.

Don't review the work, recommend changes, or decide whether anything is a defect. Separate verified facts, reasonable inferences, and unresolved questions. Cite relevant paths and symbols. Write a concise context report to your assigned path covering the relevant:
- subsystem and change map;
- contracts, interfaces, invariants, configuration, defaults, and boundaries;
- callers, consumers, and data flow;
- tests and validation paths;
- relevant patterns, history, and constraints;
- conflicting evidence and unresolved questions.
Return only the report's absolute path and any blockers.
\`\`\`

Read and integrate the reports and close important context gaps. Keep corrections in the brief or relevant report so later subagents receive the resolved context. Once the review has the context it needs, reply only \`Research complete.\` without restating the research.`;

const REVIEW_INSTRUCTION = `This is stage 3 of 4: review the work.

Use focused reviewer subagents with the current provider, model, and reasoning level.

Assign review surfaces or distinct risk questions that together cover the scope. Give reviewers the standard below and ask them to return candidate findings directly, with evidence, impact, and likely root cause, without writing reports. Keep fixes for stage 4.

Review standard for you and reviewer subagents:
- Apply a strict maintainer's standard across the full assigned scope, not just the first few findings. Check the task, requirements, and acceptance criteria, including missing or partial implementation.
- Focus on correctness, security, performance, operability, and maintainability issues introduced or worsened directly or indirectly by the changes, including effects outside changed files. Flag unjustified breaks and departures from established project patterns.
- Report concrete, high-confidence issues the author would likely fix before merge. Ground each finding in the affected behavior or code path, material impact, and evidence supporting its root cause and connection to the changes; do not speculate.
- Don't hunt for unrelated pre-existing issues or expand research around them. Report serious ones encountered incidentally as secondary findings.

Integrate the reports, merge duplicate findings, and resolve important coverage gaps or conflicting claims.

When the review is complete, number the findings and sort them by priority. Use [P0] for certain severe breakage, data loss, or security issues; [P1] for likely user-facing breakage or major regressions; [P2] for correctness, performance, or maintenance issues with limited impact; and [P3] for minor but real issues.

Explain what is wrong, when it happens, and why it matters in clear prose, with supporting evidence, relevant paths or symbols, and the likely root cause. Distinguish introduced or worsened issues from unrelated pre-existing findings. Use labels only when they improve clarity.`;

const RECOMMENDATION_INSTRUCTION = `This is stage 4 of 4: recommend solutions and give the final review.

Use recommendation subagents for every finding, using the current provider, model, and reasoning level. Give each its assigned findings and their supporting evidence, alongside the shared context paths. Require solutions directly, without writing reports. If no findings remain, finish without starting subagents.

Ask for the simplest maintainable solution that addresses the root cause and fits the application's current scale, maturity, and operational needs. Follow established project patterns; introduce a new pattern only when existing ones do not fit.

Evaluate the solutions and give the final review in the stage 3 format. Completion requires a supported explanation and an actionable recommendation for every finding. Explain how each recommendation resolves the cause and any relevant tradeoffs.`;

function buildContextMessage(args: string, conversationXml?: string): string {
  const sections: string[] = [CONTEXT_INSTRUCTION];

  if (conversationXml) {
    sections.push(
      [
        "Conversation from the current branch (only user and assistant messages; no thinking or tool calls):",
        "",
        "````xml",
        conversationXml,
        "````",
      ].join("\n"),
    );
  }

  const focusText = args.trim();
  if (focusText) {
    sections.push(["Additional review context:", focusText].join("\n\n"));
  }

  return sections.join("\n\n");
}

export function buildReviewMessages(
  args: string,
  conversationXml?: string,
): [string, string, string, string] {
  return [
    buildContextMessage(args, conversationXml),
    RESEARCH_INSTRUCTION,
    REVIEW_INSTRUCTION,
    RECOMMENDATION_INSTRUCTION,
  ];
}
