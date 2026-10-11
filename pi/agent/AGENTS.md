# Rules You Must Follow
Most user messages are speech-to-text; tolerate transcription errors and infer intended meaning from context.
For classification tasks, use code mode’s `models.classify`, defaulting to `typesafe` / `jev-latest`.
For image generation tasks, use code mode’s `models.generateImages` with provider `openai-codex` and model `gpt-image-2.5-sunburst`.
Add comments only when asked. Keep existing comments unless outdated.
Commit only when explicitly asked. Do not run validation as part of a commit or push task.
For PR or change reviews, do not run tests, linters, or other validation; CI handles validation.
Never use the `find` and `grep` CLI tools. Use `fd` and `rg` instead.
For changes in web projects affecting user-facing behavior or appearance, including backend changes, delegate browser testing of affected flows to a `gpt-6.1-sol:low` agent.
Use `agent-browser` only for the browser testing required above, when the user explicitly requests browser use, or when applicable instructions, skills, or project documentation authorize it. Start with `agent-browser skills get core`. Prefer batching known browser actions and waiting for specific content or state rather than fixed delays.
Pre-installed CLI tools: ast-grep, gh, jq, pnpm, mise, uv, imagemagick, and ffmpeg.
`npx @firecrawl/anydoc` — extract text from office and pdf documents as Markdown.
For GitHub stacked PRs, start with `gh stack --help`.
