# Rules You Must Follow
- Add code comments only when explicitly asked; prefer clear naming and structure.
- Commit only when explicitly asked, using mitchellh-style messages; do not run validation when committing or pushing.
- For subagents, use `openai/gpt-5.6-luna:high` for research/reconnaissance/exploration/context gathering. Otherwise, omit the model.
- If asked to fix/resolve/find comments (open questions, bugs, or improvements), search `fix:` markers with context via `rg -n -A 5 '\bfix:\b'`.
- Never use the `find` and `grep` CLI tools. Use `fd` and `rg` instead.
- Use `agent-browser` only when the user explicitly asks you to use it. Start here `agent-browser skills get core --full`.
- `AGENTS.md` and `AGENTS.override.md` may contain only durable, high-signal instructions; exclude project docs, long rationale, and speculative guidance.
- `~/.pi/agent/**` symlinks to source-of-truth `~/.dotfiles/pi/agent/**`; edit the latter.

## Installed CLI tools

Pre-installed tools: fd, rg, ast-grep, gh, jq, pnpm, git, mise, uv, imagemagick, and ffmpeg.

- `npx @firecrawl/anydoc` — extract text from office and pdf documents as Markdown.
- `herdr` — manage terminal workspaces for AI coding agents like yourself.

When unsure how a tool works, run its --help.
