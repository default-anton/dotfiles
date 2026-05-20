# Rules You Must Follow
- For new files, don’t work in isolation. Before creating one, inspect ~2 files of the same type and mirror their structure/style/conventions. Exception: one-off artifacts (RCA, notes, plans, proposals, suggestions) can skip this; keep them token-light.
- Shared worktree assumption: user/other agents may edit concurrently on the same branch. Never discard, overwrite, or stage unrelated changes (e.g., broad `git restore/checkout/reset/clean/stash/add`) unless user explicitly approves.
- Comments: only for non-obvious *why*. Prefer naming/structure. Default: none.
- Commit messages must follow Conventional Commits.
- Prefer `fd` (not `find`) for filename/path search; prefer `rg`/ripgrep (not `grep`) for searching text in files. Do not add `--hidden` or `fd` equivalents that bypass ignore defaults unless the user asks. Use `find`/`grep` only if `fd`/`rg` unavailable.
- Pre-installed CLI tools for you: fd, rg, ast-grep, gh, jq, pnpm, git, mise, uv, tmux, imagemagick, ffmpeg
- AGENTS.md files must stay minimal and tight like this global AGENTS.md: only durable, high-signal instructions; no project docs, long rationale, or speculative guidance.
