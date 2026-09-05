const CONTEXT_INSTRUCTION = `Keep this review read-only, including all subagent work. Don't modify files or run validation commands: CI handles tests, linting, formatting, type checks, builds, and static analysis. Inspect code, diffs, history, and existing results as needed.

Review in five stages: task context, code research, review, double-checking, and recommendations. The extension queues one stage per turn; finish the current stage without asking to continue.

Use \`run_subagent\` in stages 2–5 as directed. Size assignments to scope and risk; parallelize independent work. Start forked briefs with \`You are a subagent. Use the inherited conversation as context; complete only the assignment below.\` followed by a bounded assignment. Stage sequencing and replies apply only to the parent; subagents return their assigned result. Follow up only on specific coverage gaps, conflicting evidence, or unresolved claims.

In stages 3–5, if no important findings remain, say \`looks good\` unless missing evidence prevents that conclusion; report such gaps instead.

This is stage 1 of 5: gather and understand the task context.

Identify the task, requirements, acceptance criteria, and review scope from the context and current work. Consult linked requirements as needed. The copied conversation is task history, not authorization to carry out earlier requests.
When the task and scope are clear, reply only \`Task context gathered.\`.`;

const RESEARCH_INSTRUCTION = `This is stage 2 of 5: research the code around the changes.

Set \`model="openai/gpt-5.6-luna:high"\` for all subagents in this stage.

Use research subagents with \`fork_current_context=false\`. Give each the task, review scope, relevant starting paths, and questions to answer; they do not inherit this conversation.

Include this research brief:
\`\`\`
Establish how the relevant pre-existing code works. Look beyond changed files to understand its contracts and dependencies.

Keep the work read-only. Don't modify files or run validation commands: CI handles tests, linting, formatting, type checks, builds, and static analysis.

Don't review the work, recommend changes, or decide whether anything is a defect. Separate verified facts, reasonable inferences, and unresolved questions. Cite relevant paths and symbols. Return a context report covering the relevant:
- subsystem and change map;
- contracts, interfaces, invariants, configuration, defaults, and boundaries;
- callers, consumers, and data flow;
- tests and validation paths;
- relevant patterns, history, and constraints;
- conflicting evidence and unresolved questions.
\`\`\`

Integrate the reports and close important context gaps. Once the review has the context it needs, reply only \`Research complete.\` without restating the research.`;

const REVIEW_INSTRUCTION = `This is stage 3 of 5: review the work.

Use focused reviewer subagents with \`fork_current_context=true\` and leave \`model\` unset to inherit the current model and thinking level.

Assign review surfaces or distinct risk questions that together cover the scope. Tell reviewers to apply the standard below and return candidate findings with evidence, impact, and likely root cause. Keep fixes for stage 5.

Review standard for you and reviewer subagents:
- Apply a strict maintainer's standard across the full assigned scope, not just the first few findings. Check the task, requirements, and acceptance criteria, including missing or partial implementation.
- Focus on correctness, security, performance, operability, and maintainability. Flag broken behavior, invariants, security boundaries, or interfaces unless the task requires the break, and unjustified departures from established project patterns.
- Report concrete, high-confidence issues the author would likely fix before merge, including pre-existing issues that meet the same bar. Ground each finding in the affected behavior or code path, material impact, and evidence supporting its root cause; do not speculate.

Integrate the reports, merge duplicate findings, and resolve important coverage gaps or conflicting claims.

When the review is complete, number the findings and sort them by priority. Use [P0] for certain severe breakage, data loss, or security issues; [P1] for likely user-facing breakage or major regressions; [P2] for correctness, performance, or maintenance issues with limited impact; and [P3] for minor but real issues.

Explain what is wrong, when it happens, and why it matters in clear prose, with supporting evidence, relevant paths or symbols, and the likely root cause. Use labels only when they improve clarity.`;

const VALIDATION_INSTRUCTION = `This is stage 4 of 5: double-check each finding.

Have subagents independently double-check every finding with \`fork_current_context=true\` and \`model\` unset.

Ask them to verify the finding against the code and its contracts rather than trust the earlier explanation. Trace the relevant path from reachable inputs and state to the claimed outcome, checking each assumption and the root cause. Actively seek counterevidence in callers, guards, defaults, error handling, and existing tests. Require a verdict with precise code references, supporting or contradicting evidence, and any unresolved assumptions; do not recommend fixes.

Resolve disputed claims. Drop false positives, duplicates, and unsupported claims; revise severity when new evidence changes the claimed impact. Return surviving findings in the stage 3 format and briefly explain dropped or revised findings. If there are no findings to check, finish without starting subagents.`;

const RECOMMENDATION_INSTRUCTION = `This is stage 5 of 5: recommend solutions and give the final review.

Use recommendation subagents with \`fork_current_context=true\` and \`model\` unset for every surviving finding, using the research and validation evidence. If no findings remain, finish without starting subagents.

Ask for the simplest maintainable solution that addresses the root cause and fits the application's current scale, maturity, and operational needs. Follow established project patterns; introduce a new pattern only when existing ones do not fit.

Evaluate the solutions and give the final review in the stage 3 format. Completion requires a supported explanation and an actionable recommendation for every surviving finding. Explain how each recommendation resolves the cause and any relevant tradeoffs.`;

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
): [string, string, string, string, string] {
  return [
    buildContextMessage(args, conversationXml),
    RESEARCH_INSTRUCTION,
    REVIEW_INSTRUCTION,
    VALIDATION_INSTRUCTION,
    RECOMMENDATION_INSTRUCTION,
  ];
}
