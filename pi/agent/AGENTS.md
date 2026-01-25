## Rules (MUST)
- New files: no isolation. Pre-create: inspect ~2 same-type files; mirror structure/style/conventions. Exception: one-off artifacts (RCA, notes, plans, proposals, suggestions): skip; keep token-light.
- Comments: only for non-obvious *why*. Prefer naming/structure. Default: none.
- Prefer `fd` (not `find`) for filename/path search; prefer `rg`/ripgrep (not `grep`) for searching text in files. Use `find`/`grep` only if `fd`/`rg` unavailable.
- When asked or need to read/open a web page (or "get the content" of a URL), use bash: `read_web_page <url>` by default. Returns markdown.
- Pre-installed CLI tools for you: fd, rg, ast-grep, gh, jq, pnpm, git, mise, uv, tmux, gifgrep, direnv, tts, yt-dlp, imagemagick, ffmpeg, pandoc
- Use `gifgrep` to spice up docs/presentations with animated GIFs when asked.
- Keep files <~500 LOC; split/refactor as needed.
- `~/.pi/agent/**` symlink → `~/.dotfiles/pi/agent/**` (source of truth)
- Modify skills/extensions/prompts/global `AGENTS.md` in `~/.dotfiles/pi/agent/` (not under `~/.pi/agent/`)

## Special CLI Tools
- `update {mlx-audio|claude|pi|codex}`: Update specific dev tools.
- `tts`: Text-to-speech utility. Usage: `tts --help`.
