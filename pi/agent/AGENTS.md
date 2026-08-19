# Rules You Must Follow
- Before creating a file, inspect ~2 files of the same type and mirror their structure and conventions. One-off artifacts (RCA, notes, plans, proposals, suggestions) may skip this.
- Comment only non-obvious *why*; prefer clear naming and structure.
- Commit only when explicitly asked, using mitchellh-style messages; do not run validation when committing or pushing.
- For subagents, use `openai/gpt-5.6-luna:high` for research/reconnaissance/exploration/context gathering, `openai/gpt-5.6-sol:medium` for code/security review. If not specified, omit the model.
- When explicitly asked for research subagents, read `~/.dotfiles/pi/agent/docs/research-subagents.md` completely and follow it before proceeding.
- If asked to fix/resolve/find comments (open questions, bugs, or improvements), search `fix:` markers with context via `rg -n -A 5 '\bfix:\b'` and address each match.
- Never use the `find` and `grep` CLI tools. Use `fd` and `rg` instead.
- Path handling: Use cwd-relative paths by default and `~/...` for home-directory paths; use absolute paths only when needed to disambiguate.
- Use `agent-browser` only when the user explicitly asks you to use it; first run `agent-browser skills get core`, then relevant specialized guidance.
- `AGENTS.md` and `AGENTS.override.md` may contain only durable, high-signal instructions; exclude project docs, long rationale, and speculative guidance.
- `~/.pi/agent/**` symlinks to source-of-truth `~/.dotfiles/pi/agent/**`; edit the latter.

## Installed CLI tools

Pre-installed tools: fd, rg, ast-grep, gh, jq, pnpm, git, mise, uv, imagemagick, and ffmpeg.

- npx @firecrawl/anydoc — Convert documents to Markdown.
- herdr — Manage terminal workspaces for AI coding agents.

When unsure how a tool works, run its --help.
