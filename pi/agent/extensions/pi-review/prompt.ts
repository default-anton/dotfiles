const CONTEXT_INSTRUCTION = `Review the code in five stages, one stage per turn:
1. gather and understand the task context;
2. research the code around the changes;
3. review the work;
4. double-check each finding;
5. recommend solutions and give the final review.

Use subagents for stages 2-5: call run_subagent with fork_current_context=true. Start each call's instructions with \`Role: <role> subagent.\` Then state its bounded scope, specific questions, and expected result.

This is stage 1 of 5: gather and understand the task context.

Identify the task and its requirements. If provided, read requirement sources like pull requests, task documents, and feature descriptions.
When you understand the task and scope, reply only \`Task context gathered.\` and stop.`;

const RESEARCH_INSTRUCTION = `This is stage 2 of 5: research the code around the changes.

Ask scoped research subagents to study the relevant pre-existing subsystems, contracts, invariants, interfaces, data flow, tests, configuration, history, constraints, and project patterns. They should look beyond changed files when needed.

Research subagents must not review the work, recommend changes, or decide whether anything is a defect. It should separate verified facts, reasonable inferences, and unresolved questions; cite relevant paths and symbols; and return a concise context report covering:
- subsystem and change map;
- contracts, invariants, defaults, and boundaries;
- callers, consumers, and data flow;
- tests and validation paths;
- relevant patterns, history, and constraints;
- conflicting evidence and unresolved questions.

Read the subagent results and run more bounded research if they leave an important gap. Do not restate the research. When the needed research is present, reply only \`Research complete.\` and stop.`;

const REVIEW_INSTRUCTION = `This is stage 3 of 5: review the work.

Start focused reviewers. Give each the review surface and tell to apply the shared review backbone. Scope each reviewer by subsystem, changed area, risk, acceptance criterion, impact, or hypothesis. Allow overlap when the risk warrants it, but avoid duplicate work. Reviewers should report candidate findings with their evidence, impact, and likely root cause, but should not recommend fixes.

Shared review backbone for you and review subagents:
Apply a strict maintainer’s standard.
Review the full assigned scope, not just the first few findings.
Check the work against the stated task, requirements, and acceptance criteria. Report missing or partial requirements.
Focus on correctness, security, performance, operability, and maintainability.
Flag changes that break existing behavior, invariants, security boundaries, or interfaces unless the task requires the break. Also flag departures from established project patterns that lack a clear reason.
Report concrete, high-confidence, material issues within the assigned scope, including pre-existing issues that meet the same bar.
Prefer issues the author would likely fix before merge.
Do not speculate. Point to the affected behavior, invariant, or code path.
Trace each finding to its root cause and cite the evidence that supports it.

Read the subagent results and use more bounded reviewers to cover important gaps or settle conflicts if any.

When the review is complete, number the findings and sort them by priority. Use [P0] for certain severe breakage, data loss, or security issues; [P1] for likely user-facing breakage or major regressions; [P2] for correctness, performance, or maintenance issues with limited impact; and [P3] for minor but real issues. For each finding, give the priority, location, clear explanation, evidence, and root cause. Name the affected behavior, invariant, or code path.
If no important findings remain, say \`looks good\`.`;

const VALIDATION_INSTRUCTION = `This is stage 4 of 5: double-check each finding.

Double-check each finding. Is it a real issue worth fixing? Is the state reachable? Try to disprove them. Drop false positives, duplicates, unsupported assumptions, and issues outside the assigned scope. Keep only material findings with a concrete effect and supported root cause.

Run more validation when a claim remains unclear, disputed, or high-risk.
If no important findings remain, say \`looks good\`.`;

const RECOMMENDATION_INSTRUCTION = `This is stage 5 of 5: recommend solutions and give the final review.

Fit solutions to the application's current scale, maturity, and operational needs. We need minimal, simple, clean, maintainable, and long-term solutions that follow established project patterns; introduce new patterns only when existing ones do not fit.

Final answer rules:
If no important findings remain, say \`looks good\`. Otherwise, use the format from stage 3, with a recommendation for each finding.`;

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
