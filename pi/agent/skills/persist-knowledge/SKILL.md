---
name: persist-knowledge
description: Required at end of every task; and before editing/creating AGENTS.md/docs/skills
---

# Persist Knowledge

Turn non-obvious discoveries into the smallest durable artifact so future work is faster and safer.

## Do Every Task

At the end of every task:
- Apply **Gate**
- If it matches: persist/update the highest-leverage artifact(s) and say what you changed
- If it doesn’t: output `Persist Knowledge: skipped (<reason>)`

## Gate (persist only if ≥1 is true)

- High cost of rediscovery (took real time / >1 failed attempt)
- High blast radius (prod bugs, security issues, data loss)
- High frequency (likely again within ~3 future tasks)
- Low discoverability (no obvious keyword/entrypoint; you’d have to “already know”)
- Stale guidance exists (wrong/expired/contradictory)
- While using a doc/skill/AGENTS.md you found gaps worth fixing

If none apply: `Persist Knowledge: skipped (too task-specific / already discoverable)`.

## Choose The Artifact

Prefer changing reality over documenting it:
1. **Code/config**: make it true (types/tests/lint/CI/scripts)
2. **Skill**: repeatable workflow you can run/script (skills are auto-discovered by the harness)
3. **AGENTS.md**: hard rules + “how to work here” for a subtree (1–3 real commands + local gotchas)
4. **docs/**: only when you need narrative (architecture/rationale/troubleshooting) that would bloat `AGENTS.md`/skills

### Quick checks

- If it’s a **rule you must follow while editing a subtree** → that subtree’s `AGENTS.md`
- If it’s a **workflow you can run** (commands/tools with a reliable sequence) → a skill (+ scripts)
- If it’s **background/rationale/troubleshooting** → `docs/` (optional: add a short pointer where humans will look)

## Scope (where it lives)

- Project-specific workflow → `$CWD/.codex/skills/<name>/`
- Cross-repo/personal habit → `~/.codex/skills/<name>/`
- Cross-repo agent rules/workflow → `~/.codex/AGENTS.md`
- Subtree-specific rules/workflow → nearest relevant `AGENTS.md`
- Repo-wide → repo root `AGENTS.md` and/or `docs/`

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
- Reminders/TODOs (open an issue instead)

## Quality bar

- Tight and high-signal
- Prefer copy/pastable commands and concrete paths over prose
- Never store secrets (tokens, credentials, private URLs)
- Treat staleness as a bug: delete/update invalid guidance so there’s one canonical source
