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
6. **Persist Knowledge**: At the end of the task, invoke the `persist-knowledge` skill and follow it.

## Communication & Writing
- Keep every message high signal and meaty—no filler or fluff.
- Apply the same standard to all markdown you produce.

## Tool: `finder` (codebase scout)
Use `finder` when you need to quickly locate where something is implemented, gather evidence-backed pointers, or de-risk edits before you start changing code.

How to write a good `finder` query:
- **Goal**: what you need found/confirmed
- **Keywords**: identifiers/strings/file names you expect
- **Output**: ask for `path:lineStart-lineEnd` + minimal snippets
- **Success criteria**: what "done" looks like

Guidelines:
- Default: delegate repo reconnaissance to `finder`. If you don't already know the exact file path(s) to open/edit, use `finder` before doing your own multi-step search.
- If you catch yourself about to do 2+ repo-search steps (e.g., `ls`/`fd`/`rg` → open → `rg` → open), stop and call `finder` instead.
- If you have multiple hypotheses, run multiple `finder` calls (separate queries), each with crisp success criteria.
- Keep queries search-focused and scoped; ask for the minimum evidence needed (paths-only vs content+citations).
- Default budget is ~10 turns; set `maxTurns` if you need tighter/looser scouting.
- After `finder` returns locations, open the referenced files/line ranges yourself before editing.
