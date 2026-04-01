# Rules You Must Follow
- For new files, don’t work in isolation. Before creating one, inspect ~2 files of the same type and mirror their structure/style/conventions. Exception: one-off artifacts (RCA, notes, plans, proposals, suggestions) can skip this; keep them token-light.
- Comments: only for non-obvious *why*. Prefer naming/structure. Default: none.
- If asked to fix/resolve/find comments (open questions, bugs, or improvements), search `afix:` markers with context via `rg -n -A 5 '\bafix:'` and address each match.
- Prefer `fd` (not `find`) for filename/path search; prefer `rg`/ripgrep (not `grep`) for searching text in files. Do not add `--hidden` or `fd` equivalents that bypass ignore defaults unless the user asks. Use `find`/`grep` only if `fd`/`rg` unavailable.
- Path handling: For file tools (`read`, `write`, `edit`), use cwd-relative paths by default. Use absolute paths only when needed to disambiguate
 or when operating outside the current repo.
- When asked or need to read/open a web page (or "get the content" of a URL), use bash: `read_web_page <url>` by default. Returns markdown.
- When Anton asks you to use his browser/Chrome, use the `agent-browser` skill; prefer `agent-browser --auto-connect ...` to attach to his running Chrome.
- When you need to look something up on the web, use Codex web search with a long bash timeout (`timeout: 1800`, i.e., 30 minutes): `codex --search exec --ephemeral --skip-git-repo-check --sandbox read-only "<question>. Use the web search tool. Search for the latest available information as of <early|mid|late> <year>. Do not execute commands or modify files. Return an answer with source URLs (if available)."`
- Subagents: use `model: openai-codex/gpt-5.4-mini:medium` for `run_subagent` unless the user explicitly asks for a different model, or instructed otherwise in project's AGENTS file.
- Most user projects are in `~/code/`; this is primarily for cross-project lookup/reuse and may be irrelevant to the current task.
- Dotfiles are located at `~/.dotfiles`.
- Pre-installed CLI tools for you: fd, rg, ast-grep, gh, jq, pnpm, git, mise, uv, tmux, imagemagick, ffmpeg
- Docs, skills, prompts/instructions, and all markdown you produce: apply the Communication style; keep them tight, token-light, high-signal, and no-noise.
- Keep files <=1000 LOC; split/refactor as needed.
- `~/.pi/agent/**` symlink → `~/.dotfiles/pi/agent/**` (source of truth)
- True location of pi (your) stuff is `~/.dotfiles/pi/agent/{AGENTS.md,SYSTEM.md,skills,extensions,prompts}`, not under `~/.pi/agent/`
- Run `cd ~/.dotfiles && ./install --no-brew` after modifying skills or prompts.

## User Preferences
- Address the user as Anton unless they ask otherwise.
- For the initial fast reconnaissance pass, use a subagent instead of starting with broad `rg`/`fd` sweeps.
