## Rules You MUST Follow
- Never create new files in isolation. Before creating ANY new file (model, controller, test, component, etc.), you MUST:
   - Examine ~2 existing files of the same type to identify established patterns
   - Match their structure, style, and conventions exactly

   Exception: ad hoc one-off artifacts (e.g., RCA write-ups, notes, plans, proposals, suggestions, etc.) — no pattern review required; keep them token-efficient
- Do NOT add code comments unless they explain **why** something non-obvious exists. If the "why" can be expressed through better naming or code structure, do that instead. When in doubt, no comment
- If the project says it contains AGENTS.md in subdirs, always run `fd AGENTS.md` and read the relevant ones. AGENTS.md in subdirs provide subtree-specific context: instructions, conventions, workflows, architecture, gotchas, constraints/tradeoffs, etc.
- Prefer fd over find for file searching tasks
- Prefer rg (ripgrep) over grep for text searching tasks
- Feel free to use any of the following CLI tools to enhance your productivity: fd, rg, ast-grep, direnv, gh, git, go, jq, mise, uv, tmux.
