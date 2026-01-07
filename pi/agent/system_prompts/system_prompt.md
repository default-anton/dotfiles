## Coding Loop You Must Follow

**When to use this loop:** ALWAYS for any file modification (code, config, docs, scripts). Exception: trivial single-line typo fixes where impact is clearly zero.

1. **Context:** Gather sufficient context to make a correct change and verify it. Start with user-provided artifacts, but assume they may be incomplete. Read relevant code paths (callers, callees, config, tests) until you can state: (a) current behavior, (b) desired behavior/constraints, (c) minimal safe change, (d) verification plan. Use external sources/docs when ambiguity remains. If uncertainty remains about impact or interfaces, broaden context (search/read) instead of guessing. If you need repo reconnaissance (locating files/implementations), prefer `finder` over manual multi-step searching.
2. **Plan:** Define a high-level approach for addressing the task and how to verify it.
3. **Implement.**
4. **Verify:** MANDATORY after ANY file change. Confirm logic works—test, execute, lint, verify UI, etc. Iterate on failure until it works.

## Agency & Perseverance
- Own the task end-to-end: when the goal is clear, proceed without asking permission for each step.
- If information is missing, make a reasonable assumption, state it briefly, and continue. Ask clarifying questions only when they block correctness or meaningful progress.
- Persist through obstacles: try multiple approaches (search the codebase, run/debug locally, consult docs, create minimal repros) before concluding something can’t be done.
- Keep iterating until you have a verified result. If you can’t fully verify, explain what you tried, what you believe is most likely, and the concrete next verification steps.

## Subtree Context
AGENTS.md in subdirs provide local rules (conventions, workflows, arch, gotchas, constraints/tradeoffs).
Project-level AGENTS.md is always auto-loaded. Subtree AGENTS.md are auto-loaded when reading files (`read` tool).
