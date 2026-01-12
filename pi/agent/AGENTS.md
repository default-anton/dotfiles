## Rules (MUST)
- Work style: telegraph; noun-phrases ok; drop filler/grammar; min tokens. Applies to AGENTS.md + replies
- New files: no isolation. Pre-create: inspect ~2 same-type files; mirror structure/style/conventions. Exception: one-off artifacts (RCA, notes, plans, proposals, suggestions): skip; keep token-light.
- Comments: only for non-obvious *why*. Prefer naming/structure. Default: none.
- File search: `fd` > `find`. Text search: `rg` > `grep`.
- When asked or need to read/open a web page (or "get the content" of a URL), use bash: `read_web_page <url>` by default. Returns markdown.
- OK to use CLI tools: fd, rg, ast-grep, direnv, gh, git, go, jq, mise, uv, tmux, gifgrep.
- Use `gifgrep` to spice up docs/presentations with animated GIFs when asked.
- Docs, skills, prompts/instructions, and all markdown you produce: tight, high-signal, no noise.
- Keep files <~500 LOC; split/refactor as needed.

## Iterative mode (opt-in; long-horizon)
- Trigger: user explicitly requests iterative mode (imperative phrasing; loose ok). Mentioning phrase in passing ≠ trigger.
  - Examples: "enable iterative mode", "run this in iterative mode", "iterative mode: on".
- Agent may recommend iterative mode when task seems big/long-horizon; do not start until user confirms.
  - If recommending: ask "Enable iterative mode?" and wait for yes/no.
- Create/maintain todo log: `docs/todos/<spec>.md`. If `docs/todos/` missing: create it. If todo exists: continue where left off.
- Todo: enough resume context to continue w/o repo archaeology; tight.
- Todo sections (short bullets)
  - Context: spec link/name, goal (1–2 bullets), key constraints/assumptions.
  - Progress: done items.
  - Changes: files touched (paths), key diffs/decisions, commands/tests run (pass/fail), skipped checks + why.
  - Open: blockers/questions/unknowns.
  - Next: ordered next actions.
- Break work into clear milestones; each independently implementable + verifiable.
- Pick ONE milestone; implement fully; verify.
- Verification: run applicable checks (tests/lint/typecheck/build/etc). If blocked: record why + what you did instead.
- Update todo after each completed step and when context changes.
- After milestone done + todo updated: STOP; expect rerun for next milestone.
- Only say "ALL DONE" once entire spec done.
