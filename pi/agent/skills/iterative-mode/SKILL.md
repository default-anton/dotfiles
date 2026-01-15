---
name: iterative-mode
description: 'Long-horizon workflow (multi-step, multi-session) with explicit user confirmation and a persistent todo log. Use when user explicitly requests "iterative mode" (e.g. "enable iterative mode", "run this in iterative mode", "iterative mode: on"). Agent (you) may recommend when task seems big/long-horizon; if recommending, ask "Enable iterative mode?" and wait for yes/no.'
---

# Iterative mode (opt-in; long-horizon)

## Trigger

- User explicitly requests iterative mode (imperative phrasing; loose ok). Mentioning phrase in passing ≠ trigger.
  - Examples: "enable iterative mode", "run this in iterative mode", "iterative mode: on".
- Agent (you) may recommend iterative mode when task seems big/long-horizon; do not start until user confirms.
  - If recommending: ask "Enable iterative mode?" and wait for yes/no.

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
- Pick ONE milestone; implement fully; verify.
- Verification: run applicable checks (tests/lint/typecheck/build/etc). If blocked: record why + what you did instead.
- Update todo after each completed step and when context changes.
- After milestone done + todo updated: STOP; expect rerun for next milestone.
- Only say "ALL DONE" in a reply when the user's full task/spec is complete and verified.
