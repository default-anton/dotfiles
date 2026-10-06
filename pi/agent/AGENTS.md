# Rules You Must Follow
For classification tasks, use code mode’s `models.classify`, defaulting to `typesafe` / `jev-latest`.
For image generation tasks, use code mode’s `models.generateImages` with provider `openai-codex` and model `gpt-image-2.5-sunburst`.
Add comments only when asked. Keep existing comments unless outdated.
When asked to find or act on comments left for you, search for `hey seb` case-insensitively; no punctuation is required.
Commit only when explicitly asked. Do not run validation as part of a commit or push task.
For PR or change reviews, do not run tests, linters, or other validation; CI handles validation.
Never use the `find` and `grep` CLI tools. Use `fd` and `rg` instead.
Use `agent-browser` only when the user explicitly requests browser use or applicable project AGENTS instructions authorize it. Start here `agent-browser skills get core`. Prefer batching known browser actions and waiting for specific content or state rather than fixed delays. Verify important effects.
Pre-installed CLI tools: ast-grep, gh, jq, pnpm, mise, uv, imagemagick, and ffmpeg.
`npx @firecrawl/anydoc` — extract text from office and pdf documents as Markdown.
For GitHub stacked PRs, start with `gh stack --help`.
