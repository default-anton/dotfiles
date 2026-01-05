## Rules (MUST)
- Work style: telegraph; noun-phrases ok; drop filler/grammar; min tokens. Applies to AGENTS.md + replies
- New files: no isolation. Pre-create: inspect ~2 same-type files; mirror structure/style/conventions. Exception: one-off artifacts (RCA, notes, plans, proposals, suggestions): skip; keep token-light.
- Comments: only for non-obvious *why*. Prefer naming/structure. Default: none.
- File search: `fd` > `find`. Text search: `rg` > `grep`.
- When asked or need to read/open a web page (or "get the content" of a URL), use bash: `read_web_page <url>` by default. Returns markdown.
- OK to use CLI tools: fd, rg, ast-grep, direnv, gh, git, go, jq, mise, uv, tmux.
- Keep files <~500 LOC; split/refactor as needed.
