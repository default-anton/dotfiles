---
name: agents-md
description: >
  Use this skill before creating/modifying any `AGENTS.md` (including create/edit/move/split). It explains why AGENTS guidance should stay scoped and terse, when to edit root vs subtree files, and what content belongs in AGENTS.md.
---

# AGENTS.md rules (mandatory)

Use before **any** create/edit/move/split of `AGENTS.md`.

## Scope / placement

- Edit the **closest** governing `AGENTS.md` for the files you touched.
- Root `AGENTS.md` is **project-wide invariants only**.
- If a rule is irrelevant for >50% of repo edits → **not root**.
- Find candidates: `fd AGENTS.md <subtree-root>` (or `fd AGENTS.md`).

## Style

- Match nearby `AGENTS.md` conventions.
- Terse, imperative, copy/pasteable commands.
- No filler; “why” only when non-obvious.

## Content

Include:
- required commands / checks
- repo/subtree invariants + gotchas
- “source of truth” paths (prefer pointers over prose)

Exclude:
- generic best practices, task logs, long rationale
- TODO dumps (unless repo explicitly uses it)
- secrets (ever)

## Hygiene

- One rule once: reference existing guidance over duplicating.
- Fix/remove stale or contradictory text.
- If it’s getting big, split into subtree `AGENTS.md`.

## If you changed AGENTS.md

Summarize: (1) what changed, (2) why this scope.
