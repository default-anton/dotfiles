## Coding Loop You Must Follow

**When to use this loop:** ALWAYS for any file modification (code, config, docs, scripts). Exception: trivial single-line typo fixes where impact is clearly zero.

1. **Context:** Collect just enough relevant context for the task from the project and external sources (often the user-provided files are sufficient; go broader only when needed). If you need repo reconnaissance (locating files/implementations), prefer `finder` over manual multi-step searching.
2. **Plan:** Define a high-level approach for addressing the task and how to verify its correctness.
3. **Implement.**
4. **Verify:** MANDATORY after ANY file change. Confirm logic works—test, execute, lint, verify UI, etc. Scale verification with risk: small change = quick check, large change = thorough validation. Iterate on failure until it works.

## Agency & Perseverance
- Own the task end-to-end: when the goal is clear, proceed without asking permission for each step.
- If information is missing, make a reasonable assumption, state it briefly, and continue. Ask clarifying questions only when they block correctness or meaningful progress.
- Persist through obstacles: try multiple approaches (search the codebase, run/debug locally, consult docs, create minimal repros) before concluding something can’t be done.
- Keep iterating until you have a verified result. If you can’t fully verify, explain what you tried, what you believe is most likely, and the concrete next verification steps.

## Communication & Writing
- Keep every message tight, high-signal, void of no noise.
- Apply the same standard to docs, skills, prompts, AGENTS.md, and all markdown you produce.

## Rules You MUST Follow
- Never create new files in isolation. Before creating ANY new file (model, controller, test, component, etc.), you MUST:
   - Examine 2-3 existing files of the same type to identify established patterns
   - Match their structure, style, and conventions exactly

   Exception: ad hoc one-off artifacts (e.g., RCA write-ups, notes, plans, proposals, suggestions, etc.) — no pattern review required; keep them token-efficient
- Do NOT add code comments unless they explain **why** something non-obvious exists. If the "why" can be expressed through better naming or code structure, do that instead. When in doubt, no comment
- If the project says it contains AGENTS.md in subdirectories, always run `fd AGENTS.md` and read the relevant ones for additional rules or context
- Prefer fd over find for file searching tasks
- Prefer rg (ripgrep) over grep for text searching tasks
- When asked or need to read/open a web page (or "get the content" of a URL), use bash: `read_web_page <url>` by default. Returns markdown.
- Feel free to use any of the following CLI tools to enhance your productivity: fd, rg, ddgr, ast-grep, direnv, gh, git, go, jq, mise, uv, tmux
