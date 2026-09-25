---
name: pi-agents
description: "Create and coordinate Pi agents in Herdr tabs or split panes: launch, fork or continue sessions, assign tasks, collect results, and clean up. Use only when explicitly asked to use agents, delegate work, or manage Pi sessions, or when AGENTS instructions require it. Complexity alone is not permission."
---

# Pi agents

Delegate bounded tasks with sufficient context, clear ownership, and expected validation/reporting. Avoid duplicate work. Agents share files: another workspace is not isolation. Review and integrate results without blindly trusting or needlessly redoing them.

## Launch one agent

Use the script directly; no Herdr help or launch recipe is needed:

```bash
~/.pi/agent/skills/pi-agents/agent.mjs "Review the authentication changes. Do not edit files."
```

Default: fresh Pi session, unfocused tab, current workspace/cwd, inherited provider/model/thinking. Waits for completion without a time limit, prints the complete final assistant text from Pi's native session API, then closes the created tab unless focused. Session files remain. The script instructs the agent not to delegate further.

Use `--stdin` for multiline prompts. Overrides: `--workspace ID`, `--cwd PATH`, `--provider NAME`, `--model NAME`, `--thinking LEVEL`.

For launches that wait and for `wait`, omit the bash tool timeout when supported. If the tool requires one, use 3600 seconds (1 hour). If the tool times out, the agent remains running; recover using its handle and call `wait` again. Never resubmit the task.

For independent assignments, call the script once per agent through parallel tool calls. Do not build a batch launcher or background a waiting script just to detach:

```bash
~/.pi/agent/skills/pi-agents/agent.mjs --detach "Implement the assigned change and report validation."
```

Detached mode returns a compact JSON handle after submission, leaving the agent running. Keep the handle. stderr also carries recovery information.

## Collect or recover

```bash
~/.pi/agent/skills/pi-agents/agent.mjs wait worker-HANDLE
~/.pi/agent/skills/pi-agents/agent.mjs read worker-HANDLE
```

`wait` waits for completion, prints the final response to stdout, and closes the created tab unless focused. Use `wait --keep` to return the response while leaving the tab open. `read` prints an already-completed response without waiting or closing the tab. Both reject unfinished, failed, truncated, or unrelated responses. Neither reads terminal snapshots as the answer.

On blocked states or failures, the script exits nonzero and leaves resources open. Startup/readiness checks still have limits; task completion does not. Inspect rather than resubmit. A standalone wait may observe an earlier idle state; missing task output is not completion. Ask the user before answering approval/question dialogs. Report unresolved failures and resources left open.

For operations the script doesn't cover, read `herdr --skill`; use targeted `--help` as needed.

Fork or continue sessions only when requested. History is context, not authorization to resume old tasks. Never open the same session concurrently in two agents.

Save complete results and session references before cleanup. Never close unrelated or user-taken-over resources, delete session files/worktrees, or stop the Herdr server.
