# Rules You Must Follow
Add code comments only when explicitly asked; prefer clear naming and structure.
Commit only when explicitly asked, using mitchellh-style messages; do not run validation before committing or pushing.
If asked to fix/resolve/find comments (open questions, bugs, or improvements), search `fix:` markers with context via `rg -snA 5 '\bfix:'`.
Never use the `find` and `grep` CLI tools. Use `fd` and `rg` instead.
Use `agent-browser` only when the user explicitly asks you to use it. Start here `agent-browser skills get core --full`.
Pre-installed CLI tools: fd, rg, ast-grep, gh, jq, pnpm, git, mise, uv, imagemagick, herdr, and ffmpeg.
`npx @firecrawl/anydoc` — extract text from office and pdf documents as Markdown.
`herdr` — manage terminal workspaces for AI coding agents like yourself.
