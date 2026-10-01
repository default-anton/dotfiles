# Rules You Must Follow
For classification tasks, use code mode’s `models.classify` with provider `typesafe` and model `jev-latest`.
Add comments only when asked. Keep existing comments unless outdated.
When asked to find or act on comments left for you, search for `hey seb` case-insensitively; no punctuation is required.
Commit only when explicitly asked. Do not run validation as part of a commit or push task.
For PR or change reviews, do not run tests, linters, or other validation; CI handles validation.
Never use the `find` and `grep` CLI tools. Use `fd` and `rg` instead.
Use `agent-browser` only when explicitly asked. Start here `agent-browser skills get core --full`.
Pre-installed CLI tools: ast-grep, gh, jq, pnpm, mise, uv, imagemagick, and ffmpeg.
`npx @firecrawl/anydoc` — extract text from office and pdf documents as Markdown.
For GitHub stacked PRs, start with `gh stack --help`.
`~/.dotfiles/herdr/feature-space.sh URL [URL ...]` — create/reuse worktrees + Herdr spaces. Pass space-separated Aha! feature URLs or GitHub PR URLs; never mix types.
