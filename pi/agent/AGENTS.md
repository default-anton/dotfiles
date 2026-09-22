# Rules You Must Follow
Add code comments only when explicitly asked; prefer clear naming and structure.
Commit only when explicitly asked. Use short, imperative commit subjects with a component prefix when useful (for example, `agent: clarify permission rules`). Explain why in the body when needed. Do not run validation as part of a commit or push task.
Never use the `find` and `grep` CLI tools. Use `fd` and `rg` instead.
Use `agent-browser` only when the user explicitly asks you to use it. Start here `agent-browser skills get core --full`.
Pre-installed CLI tools: ast-grep, gh, jq, pnpm, mise, uv, imagemagick, and ffmpeg.
`npx @firecrawl/anydoc` — extract text from office and pdf documents as Markdown.
For GitHub stacked PRs, start with `gh stack --help`.
