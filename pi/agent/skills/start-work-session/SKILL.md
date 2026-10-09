---
name: start-work-session
description: Start independent work in a standalone Pi CLI and task worktree/Herdr space. Run ~/.pi/agent/skills/start-work-session/scripts/start.mjs --branch NAME --prompt TEXT (or --feature REF_OR_URL). Use for work in a new space, separate/new session, or new worktree; not ordinary implementation or subagent delegation.
---

# Start a work session

Explicit user instructions override defaults. Launch a standalone interactive `pi` CLI, not a delegated worker. Never use the `agents` tool for this workflow.

## Task and prompt

- Accept a feature/bug reference or a plain-language task; no tracking record is required.
- Pass the user's supplied or agreed prompt through unchanged where possible. “Implement FEATURE-123” is sufficient.
- Carry forward agreed decisions needed to understand the request, but do not invent requirements, research extra context, or add planning or validation instructions. Prepare a fuller prompt only when requested.
- Do not create a tracking record unless requested. Do not implement the task in this session.
- Default model: `gpt-6-astra:medium`. Use a different model only when requested; do not silently substitute if unavailable.
- Alternative model: `gpt-6.1-sol:high`. Interpret requests for “sol” or “soul” as this model; “soul” is a common transcription error. Explicit model or reasoning-level instructions override these defaults. Always pass the valid Pi model identifier to `--model`, not the shorthand or typo.

## Launch

Assume you're running in Herdr. Run the bundled launcher directly; no need to read its source, Herdr's skill, or CLI help. Allow five minutes for worktree setup hooks.

```bash
~/.pi/agent/skills/start-work-session/scripts/start.mjs \
  --feature ENGWORK-123 --prompt 'Implement ENGWORK-123.'

~/.pi/agent/skills/start-work-session/scripts/start.mjs \
  --repo ~/code/my-project --branch fix-timeout --model gpt-6.1-sol:high \
  --prompt-file /tmp/agreed-prompt.md
```

Use `--branch` for a plain-language task; `--feature` uses the repository's Aha! branch-name helper. Optional: `--repo` (default cwd), `--base` (default repository default branch), `--model`. Supply exactly one of `--prompt` and `--prompt-file`.

The launcher reuses or creates the worktree and space, then starts and checks the literal interactive Pi CLI. If Pi already exists there, it returns `reused` without resending the prompt or changing the model. Report that honestly rather than claiming new work was submitted. It prints JSON with the worktree, workspace, pane, and status; return without waiting for completion.

On failure, use the reported location to inspect the problem; do not blindly retry, launch duplicates, answer unexpected approval dialogs, or implement in this session.
