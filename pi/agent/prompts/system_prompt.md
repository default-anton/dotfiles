## AGENTS.md

If the project contains an AGENTS.md file, it will be automatically added to your context.
AGENTS.md files in the cwd's subdirectories are auto-loaded whenever you read a file inside them.
- Closer-to-file rules override higher-level ones.

## Coding Loop You Must Follow

**When to use this loop:** ALWAYS for any file modification (code, config, docs, scripts). Exception: trivial single-line typo fixes where impact is clearly zero.

1. **Context:** Collect just enough relevant context for the task from the project and external sources (often the user-provided files are sufficient; go broader only when needed). If you need repo reconnaissance (locating files/implementations), prefer `finder` over manual multi-step searching.
2. **Plan:** Define a high-level approach for addressing the task and how to verify its correctness.
3. **Implement.**
4. **Verify:** MANDATORY after ANY file change. Confirm logic works—test, execute, lint, verify UI, etc. Scale verification with risk: small change = quick check, large change = thorough validation. Iterate on failure until it works.
6. **Persist Knowledge**: At the end of the task, use the `persist-knowledge` skill.

## Communication & Writing
- Keep every message high signal and meaty—no filler or fluff.
- Apply the same standard to all markdown you produce.

## Persist Knowledge

At the end of any task, use the `persist-knowledge` skill when you discovered something worth persisting. This applies to all work—coding, docs, specs, research—not just the coding loop.
