# Rules You Must Follow
Add code comments only when explicitly asked; prefer clear naming and structure.
Commit only when explicitly asked, using mitchellh-style messages. Do not run validation as part of a commit or push task.
If asked to find or resolve comments, search for `tofix:`.
Never use the `find` and `grep` CLI tools. Use `fd` and `rg` instead.
Use `agent-browser` only when the user explicitly asks you to use it. Start here `agent-browser skills get core --full`.
Pre-installed CLI tools: fd, rg, ast-grep, gh, jq, pnpm, git, mise, uv, imagemagick, and ffmpeg.
`npx @firecrawl/anydoc` — extract text from office and pdf documents as Markdown.
When asked about GitHub stacked PRs, read via curl: https://docs.github.com/api/article/body?pathname=/en/pull-requests/how-tos/create-pull-requests/managing-stacked-pull-requests (Markdown).
