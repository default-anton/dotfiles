---
name: start-work-session
description: Start independent work in a standalone Pi CLI and task worktree/Herdr space. Run ~/.pi/agent/skills/start-work-session/scripts/start.mjs --branch NAME --prompt TEXT (or --feature REF_OR_URL). Use for work in a new space, separate/new session, or new worktree; not ordinary implementation or subagent delegation.
---

# Start a work session

Launch an interactive `pi` CLI, never an `agents` worker.

## Task and prompt

- Accept a feature/bug reference or a plain-language task; no tracking record is required.
- Pass the user's supplied or agreed prompt through unchanged where possible. “Implement FEATURE-123” is sufficient.
- Carry forward agreed decisions needed to understand the request, but do not invent requirements, research extra context, or add planning or validation instructions. Prepare a fuller prompt only when requested.
- Do not create a tracking record unless requested. Do not implement the task in this session.
- Require the user to specify both the model and thinking/reasoning level before launching. If either is missing, ask for it. Allow only Sol High, Astra Medium, or Astra High.
- Map Astra → `gpt-6-astra`; Sol/Soul/Sole/Seoul → `gpt-6.1-sol` (the alternatives are common transcription errors). Append the user's chosen level, `:medium` or `:high`. Pass the full identifier to `--model`; never silently substitute.

## Launch

Assume you're running in Herdr. Run the bundled launcher directly; no need to read its source, Herdr's skill, or CLI help. Allow five minutes for worktree setup hooks.

```bash
~/.pi/agent/skills/start-work-session/scripts/start.mjs \
  --feature ENGWORK-123 --model gpt-6-astra:medium --prompt 'Implement ENGWORK-123.'

~/.pi/agent/skills/start-work-session/scripts/start.mjs \
  --repo ~/code/my-project --branch fix-timeout --model gpt-6.1-sol:high \
  --prompt-file /tmp/agreed-prompt.md
```

Use `--branch` for a plain-language task; `--feature` uses the repository's Aha! branch-name helper. Required: `--model`. Optional: `--repo` (default cwd), `--base` (default repository default branch). Supply exactly one of `--prompt` and `--prompt-file`.

The launcher reuses or creates the worktree and space, then starts and checks the interactive Pi CLI. If status is `reused`, report that no prompt was sent or model changed. It prints JSON with the worktree, workspace, pane, and status; return without waiting for completion.

On failure, inspect the cause, fix routine setup issues, and resume using the existing worktree/space. Avoid duplicate launches; ask only when recovery needs permission or is blocked. Keep task implementation in the new session.
