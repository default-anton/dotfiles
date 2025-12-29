---
name: persist-knowledge
description: After tasks where you: struggled to discover something, hit gotchas, found broken AGENTS.md/skills/docs/commands, or learned non-obvious patterns. Capture high-leverage knowledge AND improve AGENTS.md/docs/skills. Use this skill at task end and before editing/creating AGENTS.md/docs/skills.
---

# Persist Knowledge

## Goal

Turn discoveries into small, durable artifacts (AGENTS.md, docs, skills) that make future work faster and less error-prone.

## Protocol (required)

At the end of a task, do one of the following:
- If there is anything worth persisting (or cleaning up), follow this skill and mention what you updated.
- Otherwise output: `Persist Knowledge: skipped (reason)`.

## The gate (required)

Persist or clean up something only if **at least one** is true:
- **High cost of rediscovery**: it took significant time or >1 failed attempt to learn
- **High blast radius**: getting it wrong risks prod bugs/security issues/data loss
- **High frequency**: likely needed again within ~3 future tasks
- **Not easily searchable**: you wouldn’t find it quickly via `rg` / existing docs
- **Stale guidance exists**: you found instructions that are wrong, expired, or contradicted by reality
- **Skill/doc can be improved**: using a skill or doc revealed gaps, bugs, missing scripts, or unclear steps that should be fixed for future uses

If none apply: `Persist Knowledge: skipped (too task-specific / already discoverable)`.

## What to persist

Persist information that is likely to be reused and was not obvious upfront:
- Non-obvious commands, paths, scripts, flags, environment variables
- Conventions/patterns you had to infer by reading existing code
- Gotchas that caused failures or iteration (tests, tooling, auth, permissions)
- Decisions/tradeoffs that constrain future changes

### Prefer encoding over documenting

If the knowledge can be made true/enforced via code (types, tests, lint rules, CI checks, schemas, component APIs), prefer implementing that. Persist only the minimal “where/how to run it” pointer.

## Improve skills/docs/AGENTS.md when using them

When you use a skill, doc, or AGENTS.md and encounter problems, gaps, or opportunities, update the source file itself so future uses are better:

**Update skills when:**
- Commands are broken, outdated, or missing flags/arguments
- Steps are unclear, ambiguous, or wrong order
- Missing helper scripts that would automate repetitive steps
- Undocumented gotchas that cause failures
- Examples don't match reality (paths, filenames, outputs)

**Update docs/AGENTS.md when:**
- You discover undocumented requirements, constraints, or gotchas
- Instructions reference non-existent files/paths
- "Quickstart" or "how to" sections don't actually work
- Critical information is buried or missing

**What "improving a skill" looks like:**
- Add/create helper scripts in the skill's directory (e.g., `<skill>/*.sh`)
- Fix command examples (add missing flags, correct paths, update syntax)
- Clarify ambiguous steps with concrete examples
- Add troubleshooting section for common failure modes
- Remove outdated workarounds that are no longer needed

## Avoid persisting (common failure modes)

Do **not** persist:
- Generic best practices
- Facts already obvious from the codebase
- “What I just did” task logs
- Reminders/TODOs (open an issue instead)

## Choose the right home for the info (by scope)

1. **Repo-wide rules/conventions you’ll need everywhere**: put in the repo root `./AGENTS.md` (if it exists/if appropriate).
2. **Directory/component-specific rules, workflows, schemas, or gotchas**: put in the nearest relevant subdirectory `AGENTS.md` so it auto-loads when working in that subtree.
3. **Cross-project/global habits**: put in `~/.pi/agent/AGENTS.md`.

## AGENTS.md files

`AGENTS.md` files act like a local README for a subtree.

### How they work

- Subdirectory `AGENTS.md` files are auto-loaded when you read any file inside that subtree.
- Closer-to-file rules override higher-level ones.

### What subdirectory `AGENTS.md` files are for

- Critical requirements: “must/must not” rules, security constraints, formatting requirements
- Local workflows: the 1–3 commands you actually run
- Key patterns & APIs: conventions/DSLs used in that subtree (short snippets)
- Canonical examples: point to 1–3 “reference” files that demonstrate best practice
- Gotchas: non-obvious traps specific to that code/data

### Suggested structure (optional)

- 1–2 lines: what this directory is and when you’re in here
- “Running …” / “Quickstart” commands
- “Critical requirements” (hard rules)
- “Common patterns” (short snippets)
- “Reference example(s)” (paths)
- “Useful links” to longer docs/how-tos

### AGENTS.md vs docs/

- `AGENTS.md`: short, actionable bullets/checklists optimized for fast scanning
- `docs/`: longer explanations; keep `AGENTS.md` as the entrypoint (link out instead of duplicating)
- `AGENTS.md` references should be canonical and long-lived (stable docs/specs or stable code paths); avoid ephemeral work artifacts (task files, scratch notes, PR branch names)

### Maintenance

Keep `AGENTS.md` files token-efficient. Max 8000 chars each (check with `wc -c <AGENTS.md>`).

If a subdir `AGENTS.md` starts turning into a tutorial, move long-form content into `docs/` (or a local `docs/` in that subtree) and leave a tight checklist + links.

Treat staleness as a bug:
- delete invalid/expired guidance
- avoid contradictory duplicates; keep one canonical rule

## When it should be a skill

If the knowledge is a repeatable workflow (commands/tools with a reliable sequence), consider creating/updating a project skill in `<cwd>/.pi/skills/<name>/SKILL.md` (plus scripts/assets), and then add a short pointer in the relevant `AGENTS.md`.

## Quality bar

- Keep notes token-efficient and non-duplicative
- Never store secrets (tokens, credentials, private URLs)
- Prefer copy/pastable commands and concrete paths over prose
- If you changed reality (e.g., scripts/config), ensure the docs/rules match it; if docs were stale, delete/update them
