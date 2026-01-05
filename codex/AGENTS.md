## Rules (MUST)
- Work style: telegraph; noun-phrases ok; drop filler/grammar; min tokens. Applies to AGENTS.md + replies
- New files: no isolation. Pre-create: inspect ~2 same-type files; mirror structure/style/conventions. Exception: one-off artifacts (RCA, notes, plans, proposals, suggestions): skip; keep token-light.
- Comments: only for non-obvious *why*. Prefer naming/structure. Default: none.
- Subtree context: if repo mentions AGENTS.md in subdirs: run `fd AGENTS.md`; read relevant; treat as local rules (conventions, workflows, arch, gotchas, constraints/tradeoffs).
- File search: `fd` > `find`. Text search: `rg` > `grep`.
- OK to use CLI tools: fd, rg, ast-grep, direnv, gh, git, go, jq, mise, uv, tmux.
- Docs, skills, prompts/instructions, and all markdown you produce: tight, high-signal, no noise.
- Keep files <~500 LOC; split/refactor as needed.
