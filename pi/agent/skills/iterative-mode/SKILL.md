---
name: iterative-mode
description: 'Long-horizon workflow (multi-step, multi-session) with explicit user confirmation and a persistent todo log. Use when user explicitly requests "iterative mode" (e.g. "enable iterative mode", "run this in iterative mode", "iterative mode: on"). Agent (you) may recommend when task seems big/long-horizon; if recommending, ask "Enable iterative mode?" and wait for yes/no.'
---

# Iterative mode (opt-in; long-horizon)

## Trigger

- Enable: user explicitly requests iterative mode (imperative phrasing; loose ok).
  - Examples: "enable iterative mode", "run this in iterative mode", "iterative mode: on".
- Variant: user can request **step-by-step** mode (stop after each milestone).
  - Examples: "iterative mode: step-by-step", "iterative mode: step by step", "iterative mode: stop after milestone", "iterative mode: stepwise".
- Mentioning phrase in passing ≠ trigger.
- Agent (you) may recommend iterative mode when task seems big/long-horizon; do not start until user confirms.
  - Ask: "Enable iterative mode? (default: continuous; reply 'step-by-step' to stop after each milestone)" and wait for yes/no.

## Modes

- **Continuous (default):** maintain todo log; keep executing milestones until full task/spec implemented + verified.
- **Step-by-step (opt-in):** after each milestone + todo update: STOP; wait for user to continue.

## Todo log

- Create/maintain todo log: `docs/todos/<spec>.md`.
  - `<spec>`: short slug from spec doc name/link.
  - No spec doc/link: use task-derived slug (e.g. `task-<short-slug>`).
  - If `docs/todos/` missing: create it.
  - If todo exists: continue where left off.
- Todo: enough resume context to continue w/o repo archaeology; tight.
- Todo should reflect current truth; OK to rewrite/condense, but keep each completed milestone’s Progress/Changes.

### Todo sections (short bullets)

- Context:
  - Spec link/name (or "no spec").
  - Task statement (copy user request into todo when no spec exists).
  - Goal (1–2 bullets), key constraints/assumptions.
- Progress: done items.
- Changes: files touched (paths), key diffs/decisions, commands/tests run (pass/fail), skipped checks + why.
- Open: blockers/questions/unknowns.
- Next: ordered next actions.

## Execution loop

- Break work into clear milestones; each independently implementable + verifiable.
- For each milestone:
  - Implement fully.
  - Verify (tests/lint/typecheck/build/etc). If blocked: record why + what you did instead.
  - Update todo.
  - If mode=step-by-step: STOP; expect rerun / "continue" for next milestone.
- If mode=continuous: keep going until the user’s full task/spec is complete and verified.
- Only say "ALL DONE" when the user’s full task/spec is complete and verified.
