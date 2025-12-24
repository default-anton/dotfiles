---
name: persist-knowledge
description: Capture high-leverage, non-obvious project knowledge for future tasks (AGENTS.md/docs/skills). Includes AGENTS.md maintenance guidance. Use at the end of a task; otherwise explicitly skip.
---

# Persist Knowledge

## Goal

Turn task-specific discoveries into small, durable artifacts (AGENTS.md, docs, skills) that make future work faster and less error-prone.

## Protocol (required)

At the end of a task, do one of the following:
- If there is anything worth persisting, follow this skill and mention what you updated.
- Otherwise output: `Persist Knowledge: skipped (reason)`.

## What to persist

Persist information that is likely to be reused and was not obvious upfront:
- Non-obvious commands, paths, scripts, flags, environment variables, etc.
- Conventions/patterns you had to infer by reading existing code
- Gotchas that caused failures or iteration (e.g., tests, tooling, auth, permissions)
- Decisions/tradeoffs that constrain future changes

Avoid persisting:
- Generic best practices
- Facts already obvious from the codebase
- Task-specific transient details

## Choose the right home for the info (by scope)

1. **Repo-wide rules/conventions you’ll need everywhere**: put in the repo root `./AGENTS.md` (if it exists/if appropriate).
2. **Directory/component-specific rules, workflows, schemas, or gotchas**: put in the nearest relevant subdirectory `AGENTS.md` so it auto-loads when working in that subtree. If you had to “rediscover” it while working there, add it there.
3. **Cross-project/global habits**: put in `~/.pi/agent/AGENTS.md`.

## AGENTS.md files

`AGENTS.md` files act like a local README for a subtree.

### How they work

- Subdirectory `AGENTS.md` files are auto-loaded when you read any file inside that subtree.
- Closer-to-file rules override higher-level ones.

### What subdirectory `AGENTS.md` files are for

- Critical requirements: “must/must not” rules, security constraints, formatting requirements.
- Local workflows: the 1–3 commands you actually run (e.g., how to run evals/tests for that area).
- Key patterns & APIs: the conventions/DSLs used in that subtree (with short snippets).
- Canonical examples: point to 1–3 “reference” files that demonstrate best practice.
- Gotchas: non-obvious traps specific to that code/data.

### Suggested structure (optional)

- 1–2 lines: what this directory is and when you’re in here.
- “Running …” / “Quickstart” commands.
- “Critical requirements” (hard rules).
- “Common patterns” (short snippets).
- “Reference example(s)” (paths).
- “Useful links” to longer docs/how-tos.

### AGENTS.md vs docs/

- `AGENTS.md`: short, actionable bullets/checklists optimized for fast scanning.
- `docs/`: longer explanations; keep `AGENTS.md` as the entrypoint (link out instead of duplicating).

### Maintenance

Keep `AGENTS.md` files token-efficient. Max 8000 chars each (check with `wc -c <AGENTS.md>`). If a subdir `AGENTS.md` starts turning into a tutorial, move the long-form content into `docs/` (or a local `docs/` in that subtree) and leave a tight checklist + links in `AGENTS.md`.

## When it should be a skill

If the knowledge is a repeatable workflow (commands/tools with a reliable sequence), consider creating/updating a project skill in `<cwd>/.pi/skills/<name>/SKILL.md` (plus scripts/assets), and then add a short pointer in the relevant `AGENTS.md`.

## Quality bar

- Keep notes token-efficient and non-duplicative.
- Never store secrets (tokens, credentials, private URLs).
- Prefer copy/pastable commands and concrete paths over prose.
