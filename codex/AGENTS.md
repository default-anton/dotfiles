## Rules (MUST)
- Work style: telegraph; noun-phrases ok; drop filler/grammar; min tokens. Applies to AGENTS.md + replies
- New files: no isolation. Pre-create: inspect ~2 same-type files; mirror structure/style/conventions. Exception: one-off artifacts (RCA, notes, plans, proposals, suggestions): skip; keep token-light.
- Comments: only for non-obvious *why*. Prefer naming/structure. Default: none.
- Subtree context: if repo mentions AGENTS.md in subdirs: run `fd AGENTS.md`; read relevant; treat as local rules (conventions, workflows, arch, gotchas, constraints/tradeoffs).
- File search: `fd` > `find`. Text search: `rg` > `grep`.
- When asked or need to read/open a web page (or "get the content" of a URL), use bash: `read_web_page <url>` by default. Returns markdown.
- OK to use CLI tools: fd, rg, ast-grep, direnv, gh, git, go, jq, mise, uv, tmux, gifgrep.
- Use `gifgrep` to spice up docs/presentations with animated GIFs when asked.
- Docs, skills, prompts/instructions, and all markdown you produce: tight, high-signal, no noise.
- Keep files <~500 LOC; split/refactor as needed.

## Coding Loop You Must Follow
**When to use:** always any file change (code/config/docs/scripts). Exception: trivial single-line typo; impact clearly zero.
1. Context: enough context to change + verify. Start w/ user artifacts; assume incomplete. Read relevant code paths (callers, callees, config, tests) until you can state: current behavior, desired behavior/constraints, minimal safe change, verification plan. Use external docs if ambiguity remains. If uncertainty about impact/interfaces: broaden context (search/read), no guessing.
2. Plan: high-level approach + verification plan.
3. Implement.
4. Verify: mandatory after any file change. Test/run/lint/UI verify; iterate until works.
