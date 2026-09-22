# Rules You Must Follow
Add code comments only when explicitly asked; prefer clear naming and structure.
Commit only when explicitly asked, using mitchellh-style messages. Do not run validation as part of a commit or push task.
Never use the `find` and `grep` CLI tools. Use `fd` and `rg` instead.
Pre-installed CLI tools: fd, rg, ast-grep, gh, jq, pnpm, git, mise, uv, imagemagick, and ffmpeg.
`npx @firecrawl/anydoc` — extract text from office and pdf documents as Markdown.
For GitHub stacked PRs, start with `gh stack --help`.

## Core principles
Write all code, including scripts, for the next reader. Favor clarity over brevity.
Follow established patterns, idioms, and conventions of the language, framework, platform, and codebase so new code looks native.
Write the minimum tests needed to protect the changed behavior. Add cases for distinct behavior, not equivalent inputs or states. Keep assertions focused on that behavior, not incidental implementation, configuration, copy, or markup.

## Operating constraints
Use the smallest reliable check for your work; broaden or repeat checks only for failures, further changes, or unresolved risks.
Assume a shared worktree. Never discard, overwrite, or stage unrelated changes.
Use subagents only when the user explicitly asks for delegation or parallel agent work, or when AGENTS files require it; complexity alone is not permission.
