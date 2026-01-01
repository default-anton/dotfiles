---
name: persist-knowledge
description: Required at end of every task; and before editing/creating AGENTS.md/docs/skills
---

# Persist Knowledge

## Purpose

Turn discoveries into small, durable artifacts (AGENTS.md, docs, skills) that reduce rediscovery and mistakes.

## Workflow (do every task)

1. Apply **Gate**.
2. If any criterion matches: persist/clean up the highest-leverage item(s) and say what you updated.
3. If none match: output `Persist Knowledge: skipped (<reason>)`.

## Gate

Persist/clean up something only if **at least one** is true:

- **High cost of rediscovery**: significant time or >1 failed attempt to learn
- **High blast radius**: wrong outcome risks prod bugs/security issues/data loss
- **High frequency**: likely needed again within ~3 future tasks
- **Not easily searchable**: you wouldn’t find it quickly via `rg` / existing docs
- **Stale guidance exists**: instructions are wrong, expired, or contradict reality
- **Skill/doc can be improved**: gaps, bugs, missing scripts, or unclear steps discovered while using it

If none apply: `Persist Knowledge: skipped (too task-specific / already discoverable)`.

## What to persist

Persist info that is likely to be reused and wasn't obvious upfront:

- Non-obvious commands, paths, scripts, flags, environment variables
- Conventions/patterns you had to infer by reading existing code
- Gotchas that caused failures or iteration (tests, tooling, auth, permissions)
- Decisions/tradeoffs that constrain future changes

### Prefer encoding over documenting

If the knowledge can be made true/enforced via code (types, tests, lint rules, CI checks, schemas, component APIs), prefer implementing that. Persist only the minimal "where/how to run it" pointer.

## Improve skills/docs/AGENTS.md when you touch them

When you use a skill, doc, or AGENTS.md and hit problems/gaps, update the source file so future uses are better.

**Update skills when:**
- Commands are broken, outdated, or missing flags/arguments
- Steps are unclear, ambiguous, or wrong order
- Repetitive workflow should be automated (add helper scripts)
- Undocumented gotchas cause failures
- Examples don't match reality (paths, filenames, outputs)

**Update docs/AGENTS.md when:**
- You discover undocumented requirements, constraints, or gotchas
- Instructions reference non-existent files/paths
- "Quickstart" / "how to" sections don't work
- Critical information is buried or missing

**What "improving a skill" looks like:**
- Add helper scripts in the skill directory (e.g., `<skill>/*.sh`)
- Fix command examples (flags, paths, syntax)
- Replace ambiguity with copy/pastable examples
- Add troubleshooting for common failure modes
- Remove outdated workarounds that are no longer needed

## Avoid persisting

Do **not** persist:
- Generic best practices
- Facts already obvious from the codebase
- "What I just did" task logs
- Reminders/TODOs (open an issue instead)

## Choose the right home (by scope)

1. **Repo-wide rules/conventions**: repo root `./AGENTS.md` (if it exists/appropriate).
2. **Directory/component-specific rules/workflows/gotchas**: nearest relevant subdirectory `AGENTS.md` (so you can `fd -tf AGENTS.md` and read the relevant one when working in that subtree).
3. **Cross-project/global habits**: `~/.pi/agent/AGENTS.md`.

## AGENTS.md files

`AGENTS.md` files act like a local README for a subtree.

**What subdirectory `AGENTS.md` files are for**
- Critical requirements: "must/must not" rules, security constraints, formatting requirements
- Local workflows: the 1–3 commands you actually run
- Key patterns & APIs: conventions/DSLs used in that subtree (short snippets)
- Canonical examples: point to 1–3 reference files that demonstrate best practice
- Gotchas: non-obvious traps specific to that code/data

**Suggested structure (optional)**
- 1–2 lines: what this directory is and when you’re in here
- "Running …" / "Quickstart" commands
- "Critical requirements" (hard rules)
- "Common patterns" (short snippets)
- "Reference example(s)" (paths)
- "Useful links" to longer docs/how-tos

**AGENTS.md vs docs/**
- `AGENTS.md`: short, actionable bullets/checklists optimized for fast scanning
- `docs/`: longer explanations; keep `AGENTS.md` as the entrypoint (link out instead of duplicating)
- References should be canonical and long-lived (stable docs/specs or stable code paths); avoid ephemeral work artifacts (task files, scratch notes, PR branch names)

**Maintenance**
- Keep `AGENTS.md` files token-efficient. Max 8000 chars each (`wc -c <AGENTS.md>`).
- If a subdir `AGENTS.md` starts turning into a tutorial, move long-form content into `docs/` and leave a tight checklist + links.
- Treat staleness as a bug: delete invalid/expired guidance; avoid contradictory duplicates; keep one canonical rule.

## When it should be a skill

If the knowledge is a repeatable workflow (commands/tools with a reliable sequence), consider creating/updating a project skill in `<cwd>/.pi/skills/<name>/SKILL.md` (plus scripts/assets), and then add a short pointer in the relevant `AGENTS.md`.

## Quality bar

- Tight, high-signal, void of noise
- Never store secrets (tokens, credentials, private URLs)
- Prefer copy/pastable commands and concrete paths over prose
- If you changed reality (scripts/config), ensure the docs/rules match it; if docs were stale, delete/update them
