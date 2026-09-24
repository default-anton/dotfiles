---
name: pi-agents
description: "Create and coordinate Pi agents in Herdr tabs or split panes: launch, fork or continue sessions, assign tasks, collect results, and clean up. Use only when explicitly asked to use agents, delegate work, or manage Pi sessions, or when AGENTS instructions require it. Complexity alone is not permission."
---

# Pi agents

Use Herdr through bash. This is the common-operation reference: do not read `herdr --skill` or help before launching. Consult targeted `--help` only for an unlisted operation or a compatibility failure. Assume this session runs inside Herdr.

## Launch in one bash call

Default: fresh Pi session, background tab, current workspace/cwd, parent's provider/model/thinking. Adapt this recipe and execute it immediately after reading the skill. Stop on failure; never blindly retry a mutation. Choose a tool timeout longer than the CLI waits (milliseconds).

```bash
set -euo pipefail
name="worker-$$-$RANDOM"
workspace="${HERDR_WORKSPACE_ID:?}"
args=(--provider "${PI_PROVIDER:?}" --model "${PI_MODEL:?}" --thinking "${PI_REASONING_LEVEL:?}")
task=$(cat <<'TASK'
Replace with a bounded assignment and all necessary context.
Preserve others' edits. Do not delegate further. Report results and validation.
TASK
)
created=$(herdr tab create --workspace "$workspace" --cwd "$PWD" --no-focus)
printf '%s\n' "$created"
tab=$(jq -er '.result.tab.tab_id' <<<"$created")
pane=$(jq -er '.result.root_pane.pane_id' <<<"$created")
jq -e --arg workspace "$workspace" '.result.tab.workspace_id == $workspace' <<<"$created" >/dev/null
printf 'agent=%s pane=%s\n' "$name" "$pane"
herdr agent start "$name" --kind pi --pane "$pane" -- "${args[@]}"
herdr agent prompt "$name" "$task" --wait --timeout 120000
herdr agent get "$name"
herdr agent read "$name" --source recent-unwrapped --lines 120
```

`start` already waits for interactive readiness (default 30 seconds); no sleep/poll needed. `get` returns `.result.agent.agent_status` and `.result.agent.agent_session`; save the session reference before cleanup. Names must be unique among live agents and match `[a-z][a-z0-9_-]{0,31}`. Targets accept names or pane IDs, not terminal IDs.

For long/parallel tasks, omit `--wait --timeout 120000` from submission and defer get/read. Launch and submit all independent assignments in one call before waiting. Avoid duplicate work.

### Launch variations

- Other workspace: when requested, use its known ID or resolve it with `herdr workspace list`, then replace the recipe's `workspace` value with that ID. Tab creation and verification both use it. Keep `$PWD` unless another cwd is requested.
- Model override: change the requested entries in `args`; inherit the others. Shared configuration loads normally. Forward required temporary tool restrictions/extensions through native Pi arguments after `--`, and process-only credentials via creation's `--env KEY=VALUE`. Never print secrets.
- Fork context: append `args+=(--fork "${PI_SESSION_FILE:?}")`; require an existing persisted session. History is context, not authorization to resume old tasks.
- Continue: only when requested, reuse an existing idle agent or append `args+=(--session "<path-or-id>")`. Never open the same session file concurrently.
- Split: replace tab creation/parsing with the following; no tab to close:

```bash
created=$(herdr pane split --current --direction right --cwd "$PWD" --no-focus)
printf '%s\n' "$created"
pane=$(jq -er '.result.pane.pane_id' <<<"$created")
```

Honor a requested direction; otherwise use `herdr pane layout --current` to choose right for wide panes, down for narrow/tall panes. Avoid cramped repeated splits. Use other layouts/locations only when requested; a workspace does not isolate files. Always use explicit IDs or `--current`, never UI focus.

## Wait, inspect, follow up, close

| Need | Command |
| --- | --- |
| Wait for submitted work | `herdr agent wait "$name" --timeout 120000` |
| State and session reference | `herdr agent get "$name"` |
| Result or failure diagnostics | `herdr agent read "$name" --source recent-unwrapped --lines 120` |
| Follow-up on a ready agent | `herdr agent prompt "$name" "$task" --wait --timeout 120000` |
| Inspect detection problems | `herdr agent explain "$name"` |
| Interactive keys | `herdr agent send-keys "$name" esc` |
| Close created tab | `herdr tab close "$tab"` |
| Close created split only | `herdr pane close "$pane"` |

- Waits settle on `idle`, `done`, **or `blocked`**; success alone is not completion. `unknown` is not completion either. Inspect get/read on failures or blocked states; ask the user before answering approval/question dialogs.
- `prompt --wait` requires observed activity; standalone `wait` can return an existing idle state. Neither tracks individual turns. Prompt only ready agents. Timeout/stall does not mean submission failed: inspect, do not resubmit blindly.
- If output is incomplete, increase `--lines`; if still missing, ask the agent to write its result to a temporary Markdown file and return its path. File output is a fallback, not the default.
- Review/integrate results without blindly trusting or needlessly redoing them. After collecting complete results and session references, close resources you created unless asked to keep them. Batch cleanup when completion is confirmed; never close unrelated or user-taken-over resources. Preserve session files/worktrees.
- Collect diagnostics before cleaning up confirmed startup failures or requested cancellations. Do not auto-close on shell exit: blocked, unknown, stalled, or timed-out agents need inspection/resolution or a report. Report failures and resources left open. Never stop the Herdr server.
