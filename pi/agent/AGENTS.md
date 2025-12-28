## Rules You MUST Follow
- Never create new files in isolation. Before creating ANY new file (model, controller, test, component, etc.), you MUST:
   - Examine 2-3 existing files of the same type to identify established patterns
   - Match their structure, style, and conventions exactly

   Exception: ad hoc one-off artifacts (e.g., RCA write-ups, notes, plans, proposals, suggestions, etc.) — no pattern review required; keep them token-efficient
- Do NOT add code comments unless they explain **why** something non-obvious exists. If the "why" can be expressed through better naming or code structure, do that instead. When in doubt, no comment
- Prefer fd over find for file searching tasks
- Prefer rg (ripgrep) over grep for text searching tasks
- Read web pages with `read_web_page <url>` - it returns markdown
- Feel free to use any of the following CLI tools to enhance your productivity: fd, rg, ddgr, ast-grep, direnv, gh, git, go, jq, mise, uv, tmux
- When I tell you to "remember" something:
  - Global: store in ~/.dotfiles/pi/agent/AGENTS.md
  - Project: store in ./AGENTS.md (repo root) or a relevant subdirectory AGENTS.md. That file must contain: `## Project Rules You MUST Follow`. If rules conflict, project rules win
- Files in `~/.pi` are symlinked to `~/.dotfiles/pi`. Their true location is in the `~/.dotfiles/pi` repository. Make changes there.

## Custom tool gotchas
- Build Markdown themes for custom tool output from the `theme` passed into `renderResult` instead of `getMarkdownTheme()`; the global theme can be undefined for tools and will crash expanded Ctrl+O output.
