# Rules You Must Follow
- Before creating a file, inspect ~2 files of the same type and mirror their structure and conventions. One-off artifacts (RCA, notes, plans, proposals, suggestions) may skip this.
- Comment only non-obvious *why*; prefer clear naming and structure.
- Commit only when explicitly asked, using mitchellh-style messages; do not run validation when committing or pushing.
- Prefer `fd` (not `find`) for filename/path search; prefer `rg`/ripgrep (not `grep`) for searching text in files. Do not add `--hidden` or `fd` equivalents that bypass ignore defaults unless the user asks.
- Pre-installed CLI tools for you: fd, rg, ast-grep, gh, jq, pnpm, git, mise, uv, tmux, imagemagick, ffmpeg
- AGENTS.md may contain only durable, high-signal instructions; exclude project docs, long rationale, and speculative guidance.
