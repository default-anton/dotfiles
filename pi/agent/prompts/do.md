---
description: Fully implement a task with todo tracking
---
Implement this spec completely: $ARGUMENTS. Don't half-ass it.

Create and maintain docs/todos/[spec-name].md. If the todo already exists, continue where you left off.
Todo must carry resume context so a fresh run can continue without repo archaeology. Keep it tight.
Include sections (short bullets):
- Context: spec link/name, goal in 1–2 bullets, key constraints/assumptions.
- Progress: done items.
- Changes: files touched (paths), key diffs/decisions, commands/tests run.
- Open: blockers/questions/unknowns.
- Next: ordered next actions.
Update todo after each completed step and when context changes. Verify changes periodically (coding loop).

If the user/human says/implies the task is huge/big/large/long-horizon (i.e. unlikely to fit safely in one context window), do NOT try to implement it all in one run.
- Break the work into clear milestones in docs/todos/[spec-name].md (each milestone should be independently implementable + verifiable).
- Pick ONE milestone, implement it fully, and verify it works and matches the spec.
- A milestone is only "done" when all applicable verification passes (repo norms + spec): tests/lint/typecheck/build/etc.
- Run the checks when feasible; if blocked, record why + what you did instead.
- Update the todo (mark the milestone done, update Context/Changes/Open/Next), then STOP.
- The user will rerun this same command again to continue with the next milestone.

Once the entire spec is fully done, include ALL DONE in your final response (and only then).
