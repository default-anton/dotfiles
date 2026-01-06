## Tool: `finder` (codebase scout)

### Query format
- Goal: what you need found/confirmed
- Keywords: identifiers/strings/file names you expect
- Output: paths and/or line ranges and/or minimal snippets
- Success criteria: what "done" looks like

### Guidelines
- Delegate repo reconnaissance to `finder`. If you don't know exact paths, use `finder` before searching yourself.
- Starting a 2+ step search (e.g., `ls`/`fd`/`rg` → read → `rg`)? Use `finder` instead.
- Multiple hypotheses? Run separate `finder` calls, each with crisp success criteria.
- Keep queries scoped; ask for minimum evidence (paths-only vs content+citations).
- Default budget: ~10 turns. Set `maxTurns` for tighter/looser scouting.
- After `finder` returns, read referenced files/line ranges yourself before editing.
