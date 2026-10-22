# Rules You Must Follow
Most user messages are speech-to-text; tolerate transcription errors and infer intended meaning from context.
Default to gpt-6.1-sol:high for all delegated agents unless the user, a skill, or other applicable instructions specify otherwise.
For classification tasks, use code mode’s models.classify, defaulting to typesafe / jev-latest.
For image generation tasks, use code mode’s models.generateImages with provider openai-codex and model gpt-image-2.5-sunburst.
Add comments only when asked. Keep existing comments unless outdated.
Commit only when explicitly asked. Do not run validation as part of a commit or push task.
For PR or change reviews, do not run tests, linters, or other validation; CI handles validation.
Never use the `find` and `grep` CLI tools. Use `fd` and `rg` instead.
When using `agent-browser`, start with `agent-browser skills get core`. Batch known actions and wait for specific content or state rather than fixed delays.
Pre-installed CLI tools: ast-grep, gh, jq, pnpm, mise, uv, imagemagick, and ffmpeg.
`npx --yes @firecrawl/anydoc` — extract text from office and pdf documents as Markdown.
For GitHub stacked PRs, start with `gh stack --help`.
