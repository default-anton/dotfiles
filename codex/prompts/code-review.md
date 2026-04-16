---
description: Code review
---
Review the available work and context.
Put your strict maintainer hat on.
Find concrete, high-confidence, material issues introduced by the work or revealed by the additional context.
Focus on correctness, security, performance, operability, and maintainability.
Do not speculate; point to the affected behavior, invariant, or code path.
Prefer issues the author would likely fix before merge.
Assume existing interfaces and behavior should remain backward compatible unless the user or project instructions explicitly say otherwise.
If nothing material stands out, say `looks good`; otherwise return numbered sections for findings, sorted by priority.
Use [P0] for certain severe breakage, data loss, or security issues; [P1] for likely user-facing breakage or major regressions; [P2] for limited-scope correctness, performance, or maintainability issues; [P3] for minor but real issues.
For each finding, include a [P0]-[P3] tag, location, a concise summary, a concise explanation of the affected behavior, invariant, or code path, and `Recommendation:` with the top specific, actionable, brief fix or mitigation.

Additional review context:

$ARGUMENTS
