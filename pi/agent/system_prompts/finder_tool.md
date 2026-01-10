## Tool: `finder` (codebase scout)

### Query format
- Goal: what you need found/confirmed
- Keywords: identifiers/strings/file names you expect
- Output: paths and/or line ranges and/or minimal snippets
- Success criteria: what "done" looks like

### Guidelines
- Delegate repo reconnaissance to `finder`. If you don't know exact paths, use `finder` before searching yourself.
- Starting a 2+ step search (e.g., `ls`/`fd`/`rg` → read → `rg`)? Use `finder` instead.
- Multiple hypotheses? Put each as a separate entry in `queries` (1–4 queries per call).
- Keep queries scoped; ask for minimum evidence (paths-only vs content+citations).
- After `finder` returns, read referenced files/line ranges yourself before editing.
