---
name: capture-learnings
description: End-of-task gate/checklist to turn non-obvious discoveries into durable artifacts (code/config/tests/skills/AGENTS.md/docs) and avoid rediscovery. Use at the end of every task (mandatory).
---

# Capture Learnings

Turn non-obvious discoveries into the **smallest durable artifact** so future work is faster and safer.

## Do this at the end of every task (mandatory)

At the end of every task:
- Apply **Gate**
- If it matches: persist/update the highest-leverage artifact(s) and say what you changed
- If it doesn’t: output `Capture Learnings: skipped (<reason>)`

## Gate (persist only if ≥1 is true)

- High cost of rediscovery (took real time / >1 failed attempt)
- High blast radius (prod bugs, security issues, data loss)
- High frequency (likely again within ~3 future tasks)
- Low discoverability (no obvious keyword/entrypoint; you’d have to “already know”)
- Stale guidance exists (wrong/expired/contradictory)
- While using an existing doc/skill/AGENTS.md you found gaps worth fixing

If none apply: `Capture Learnings: skipped (too task-specific / already discoverable)`.

## Choose the artifact (routing rules)

Prefer changing reality over documenting it:

1) Code/config/tests/CI: make it true (types/tests/lint/CI/scripts).

2) Nearest subtree `AGENTS.md`: a rule/gotcha you must follow while working in a specific part of the tree.
   - `AGENTS.md` is canonical + portable for all agents (not just Claude).
   - **Mandatory for Claude Code** (loads `CLAUDE.md`, not `AGENTS.md`): same-dir `CLAUDE.md` containing `@AGENTS.md`.
   - Style: telegraph; noun-phrases ok; drop filler/grammar; min tokens.
   - Do **not** dump subtree rules into the repo root.
   - If unsure where a rule belongs, run `fd AGENTS.md` and read the relevant ones for the subtree you touched.
   - If the repo has multiple `AGENTS.md` files: update the **closest one that governs the files you touched**.
   - If none exists in the relevant subtree, create both `AGENTS.md` (rules) + `CLAUDE.md` (`@AGENTS.md`) in that subtree.

3) Project-local skill (`$REPO/.pi/skills/<name>/SKILL.md`): a repeatable agent workflow.
   - Use when it’s **3+ steps**, easy to mess up, and has clear **verification**.
   - Do **not** create a skill for a single rule (that belongs in `AGENTS.md`).

4) `docs/`: only for durable artifacts like **feature specs**, **agent TODOs**, and **developer docs**.
   - `docs/` is not a dumping ground for generic background/rationale.

### Quick checks

- “I must remember a rule while editing files under `X/**`” → nearest `X/**/AGENTS.md` (+ same-dir `CLAUDE.md` with `@AGENTS.md`)
- “I must run a playbook and verify it worked” → project-local skill in `.pi/skills/`
- “I need a living spec/todo/runbook that will be referenced” → `docs/` (update an existing doc if possible)

## Hard constraints (prevents low-signal artifacts)

### `docs/` gate (avoid junk)

Write to `docs/` only if at least one is true:
- The task explicitly asked for a spec/todo/doc.
- The information is a structured artifact you’ll reuse (spec/checklist/runbook), not “what I learned”.
- There is a clear existing place to put it (an existing file/section).

If you do write/update `docs/`:
- Prefer **updating an existing doc** over creating a new doc.
- Do not add long narrative sections (“Architecture”, “Rationale”, “Troubleshooting”) unless explicitly requested.

### Skills: local-first + pi grounding

Skills are often misunderstood; keep them concrete and procedural.

**Local-first rule:**
- Default to **project-local** skills in `$REPO/.pi/skills/`.
- Only create a global skill if it is truly cross-repo and contains no repo-specific paths/commands.

**Before creating/updating a skill (or hooks/tools/providers/themes):**
- Read the pi docs and follow cross-references:
  - `/path/to/@mariozechner/pi-coding-agent/docs/skills.md`
- Read ~2 existing skills in the same scope (project-local vs global) and match their conventions.

## Scope (where it lives)

- Project-specific workflow → `$REPO/.pi/skills/<name>/`
- Cross-repo/personal habit → `~/.pi/agent/skills/<name>/`
- Cross-repo agent rules/workflow → `~/.pi/agent/AGENTS.md` (don't create `CLAUDE.md` here)
- Subtree-specific rules/workflow → nearest relevant `AGENTS.md` (+ same-dir `CLAUDE.md` with `@AGENTS.md`)
- Repo-wide rules/workflow → repo root `AGENTS.md` (+ same-dir `CLAUDE.md` with `@AGENTS.md`)

Prefer updating an existing artifact over creating a new one; avoid duplicates.

## What to persist

- Non-obvious commands/paths/flags/env vars that matter
- Conventions/patterns you had to infer by reading code
- Gotchas that caused failures/iteration (tests, tooling, auth, permissions)
- Constraints/tradeoffs that shape future changes

## Avoid persisting

Do **not** persist:
- Generic best practices
- Facts already obvious from the codebase
- Task logs (“what I just did”)
- One-off reminders/TODOs outside the agreed `docs/` TODO workflow

## Quality bar

- Tight and high-signal
- Prefer copy/pastable commands and concrete paths over prose
- Never store secrets (tokens, credentials, private URLs)
- Treat staleness as a bug: delete/update invalid guidance so there’s one canonical source
