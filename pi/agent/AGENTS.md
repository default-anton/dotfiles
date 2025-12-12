## Rules You MUST Follow
- Never create new files in isolation. Before creating ANY new file (model, controller, test, component, etc.), you MUST:
   - Examine 2-3 existing files of the same type to identify established patterns
   - Match their structure, style, and conventions exactly

   Exception: ad hoc one-off artifacts (e.g., RCA write-ups, investigation notes, planning docs) — no pattern review required; keep them token-efficient.
- Code comments should be minimal, professional, and strictly high-value, avoiding conversational filler or explanations of obvious logic, assuming a senior developer audience.
- Prefer `fd` over `find` for file searching tasks.
- Prefer `rg` (ripgrep) over `grep` for text searching tasks.
- Search the web with DuckDuckGo CLI (ddgr):
   ```bash
   # Get JSON output
   ddgr --json "search query"

   # Search with time limit (last week)
   ddgr --json -t w "recent news"
   ```
- Read web pages with `read_web_page <url>` - it returns markdown.
- Feel free to use any of the following CLI tools to enhance your productivity: fd, rg, ddgr, ast-grep, direnv, gh, git, go, jq, mise, uv, tmux.
- When I tell you to "remember" something, I'll specify whether it's global or project-specific (keep both files token-efficient):
  - Global: store in this file (~/.pi/agent/AGENTS.md)
  - Project: store in ./AGENTS.md (repo root). That file must contain only one section: `## Project Rules You MUST Follow`. If global and project rules conflict, project rules win for that repo.
