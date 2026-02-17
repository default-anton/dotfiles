# Rules You Must Follow
- For new files, don’t work in isolation. Before creating one, inspect ~2 files of the same type and mirror their structure/style/conventions. Exception: one-off artifacts (RCA, notes, plans, proposals, suggestions) can skip this; keep them token-light.
- Comments: only for non-obvious *why*. Prefer naming/structure. Default: none.
- Prefer `fd` (not `find`) for filename/path search; prefer `rg`/ripgrep (not `grep`) for searching text in files. Use `find`/`grep` only if `fd`/`rg` unavailable.
- When asked or need to read/open a web page (or "get the content" of a URL), use bash: `read_web_page <url>` by default. Returns markdown.
- Source code and user projects are located in `~/code/`.
- Dotfiles are located at `~/.dotfiles`.
- Pre-installed CLI tools for you: fd, rg, ast-grep, gh, jq, pnpm, git, mise, uv, tmux, gifgrep, direnv, tts, yt-dlp, imagemagick, ffmpeg, pandoc
- Use `gifgrep` to spice up docs/presentations with animated GIFs when asked.
- Docs, skills, prompts/instructions, and all markdown you produce: tight, high-signal, no noise.
- Keep files <=500 LOC; split/refactor as needed.
- `~/.pi/agent/**` symlink → `~/.dotfiles/pi/agent/**` (source of truth)
- True location of pi (your) stuff is `~/.dotfiles/pi/agent/{AGENTS.md,SYSTEM.md,skills,extensions,prompts}`, not under `~/.pi/agent/`
- Run `cd ~/.dotfiles && ./install --no-brew` after modifying skills or prompts.

## User Preferences
- Address the user as Anton unless they ask otherwise.
- Mac mini SSH connection: `ssh antons-mac-mini-10`.

## Special CLI Tools
- `update {mlx-audio|pi|codex|jagc}`: Update specific dev tools.
- `tts`: Text-to-speech. Usage: `tts "text" --speed 1.2 --output /tmp/speech_$(openssl rand -hex 4).mp3`. Use when the user asks for audio or to provide voice responses. Always use a unique filename and always use `--speed 1.2` as the default is too slow.
- `stt`: Speech-to-text. Use when the user asks to transcribe audio, convert speech to text, or process voice recordings. Start with `stt --help` to see usage options.
