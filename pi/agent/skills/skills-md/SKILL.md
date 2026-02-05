---
name: skills-md
description: >
  Use this skill before creating/modifying any skill (global, project, or package-level). It defines hard rules for writing tight, information-dense `SKILL.md` files, valid frontmatter, and when to move details into `references/` or `scripts/`.
---

# Skill authoring rules (mandatory)

Use before any create/edit/move/split of `SKILL.md`.

## Locations

Apply these rules to skills loaded from:
- global (source of truth in this setup): `~/.dotfiles/pi/agent/skills/` (synced to `~/.pi/agent/skills/`)
- project: `.pi/skills/`
- package-provided skill directories
- custom paths from settings `skills` entries or CLI `--skill`

## `SKILL.md` requirements

- Hard cap: **500 tokens max**.
- Frontmatter must include `name` and `description`.
- `name` must match parent directory and use lowercase letters/numbers/hyphens.
- `description` should state when to use the skill, why it exists, and what it covers.
- Keep body terse, imperative, and action-oriented.
- Put only the default/high-value path in `SKILL.md`.
- Avoid duplicating global guidance or other skills; reference instead.

## `references/` and `scripts/`

- Use `references/*.md` for progressive disclosure (edge cases, deep dives, examples, troubleshooting).
- Use `scripts/` for reusable runnable helpers.
- In `SKILL.md`, explicitly say when to consult a reference or run a script.

## Quality gate

Before finishing, verify:
1. Common-case execution is possible from `SKILL.md` alone.
2. Every line has operational value (no filler).
3. Wording is clear, firm, and unambiguous.

## If you changed a skill

Summarize: (1) what changed, (2) why this scope/structure.
