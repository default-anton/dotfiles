---
name: pi-agents
description: Use only when explicitly asked to use subagents, delegate work, or create, fork, or continue Pi sessions, or when AGENTS instructions require it. Complexity alone is not permission.
---

# Pi agents

Use Herdr through bash; read `herdr --skill` once for usage and safety rules. Apply these preferences over its default workflow:

- Minimize tool round trips: batch required CLI discovery in one call, without chaining help commands on exit success. Then create the tab, parse returned IDs, start the agent, and submit its task in one bash call, stopping on failure. Assume this session runs inside Herdr; skip its environment guard. For short tasks, also wait and read the result in that call; close the created tab after confirming completion. Split calls only when new information or a failure requires a decision.

## Launch and context

- Default to one background tab per agent in the current workspace and cwd, without changing focus. Use other layouts or locations when requested; a workspace alone does not isolate files.
- Start `--kind pi` with `--provider "${PI_PROVIDER:?}" --model "${PI_MODEL:?}" --thinking "${PI_REASONING_LEVEL:?}"` after `--` to match the parent, unless instructed otherwise.
- Shared configuration loads normally; forward any required temporary tool restrictions, CLI extensions, or process-only credentials.
- Default to fresh sessions with self-contained briefs. For inherited conversation, add `--fork "$PI_SESSION_FILE"`; require a persisted session and treat history as context, not authorization to resume earlier tasks.
- Continue sessions only when explicitly asked: reuse the existing idle agent or launch with `--session <path-or-id>`. Never open the same session file concurrently.

## Coordinate

- Give each agent a bounded task and necessary context. Require it to preserve others' edits, report results and validation, and not delegate further.
- Avoid duplicate effort; overlap only for a distinct question or independent review. For parallel work, submit separate assignments before waiting.
- Review and integrate results; do not blindly trust or needlessly redo them.

## Clean up by default

- After collecting results and session references, close panes/tabs/workspaces you created unless asked to keep them. Preserve session files and worktrees; never close unrelated work or user-taken-over resources.
- Clean up confirmed startup failures and requested cancellations after collecting diagnostics. A blocked, unknown, stalled, or timed-out agent is not finished: inspect and resolve or report it, rather than blindly retrying or killing it.
- Cleanup is your responsibility, not Herdr's. Report failures and resources left open.
