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
