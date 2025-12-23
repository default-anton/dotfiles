## AGENTS.md

AGENTS.md files in the cwd’s subdirectories are auto-loaded whenever you read a file inside them.
- Treat loaded rules as mandatory; closer-to-file rules override higher-level ones.
- If you need a subdir’s rules, read any file (or its AGENTS.md) in that directory to load them.

What subdirectory `AGENTS.md` files are for (think: *local README for working in this subtree*):
- Critical requirements: “must/must not” rules, security constraints, formatting requirements.
- Local workflows: the 1–3 commands you actually run (e.g., how to run evals/tests for that area).
- Key patterns & APIs: the conventions/DSLs used in that subtree (with short snippets).
- Canonical examples: point to 1–3 “reference” files that demonstrate best practice.
- Gotchas: non-obvious traps specific to that code/data.

Suggested structure (optional, but tends to work well):
- 1–2 lines: what this directory is and when you’re in here.
- “Running …” / “Quickstart” commands.
- “Critical requirements” (hard rules).
- “Common patterns” (short snippets).
- “Reference example(s)” (paths).
- “Useful links” to longer docs/how-tos.

Keep `AGENTS.md` files token-efficient. Max 8000 chars each (check with `wc -c <AGENTS.md>`). If a subdir AGENTS.md starts turning into a tutorial, move the long-form content into `docs/` (or a local `docs/` in that subtree) and leave a tight checklist + links in AGENTS.

## Coding Loop You Must Follow

When coding, adhere to the following iterative loop to ensure quality and efficiency:
1. Context: Collect just enough relevant context for the task from the project and external sources (often the user-provided files are sufficient; go broader only when needed).
2. Plan: Define a high-level approach for addressing the task.
3. Implement.
4. Verify: Confirm logic, e.g., tests, execution, linter, UI verification, etc.
5. Iterate on failure.
6. Learn (mandatory step): Decide whether there’s high-leverage project knowledge worth capturing to speed up future tasks.
   - Capture non-obvious commands, paths, conventions, gotchas, decisions.
   - Choose the right home for the info (by scope):
     - Repo-wide rules/conventions you’ll need everywhere: put in the project’s root `./AGENTS.md` (if it exists/if appropriate).
     - Directory/component-specific rules, workflows, schemas, or gotchas: put in the nearest relevant subdirectory `AGENTS.md` so it auto-loads when working in that subtree. If you had to “rediscover” it while working there, add it there.
     - Cross-project/global habits: put in `~/.pi/agent/AGENTS.md`.
   - `AGENTS.md` vs `docs/`:
     - `AGENTS.md`: short, actionable bullets/rules/checklists that guide day-to-day edits (optimize for fast context loading).
     - `docs/`: longer-form explanations, rationale, tutorials, or reference material; keep `AGENTS.md` as the entrypoint (link/summarize instead of duplicating).
   - Turn repeatable workflows into a project skill in `<cwd>/.pi/skills/<name>/SKILL.md` (plus scripts/assets as needed).
   - Keep notes token-efficient, avoid duplication, and never store secrets.
