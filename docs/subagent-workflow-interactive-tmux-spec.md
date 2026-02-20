# Feature Spec: Interactive subagents in tmux windows for `subagent-workflow`

## Goal
Allow `subagent-workflow` to run subagents in **interactive** `pi` mode (no `-p`) inside dedicated tmux windows, while preserving deterministic orchestration for serial and parallel workflow steps.

This provides live observability when desired, and automatic cleanup when steps finish.

---

## Scope

### In scope
- Launch each workflow step in its own tmux window.
- Run `pi` interactively for those subagents.
- Capture completion via extension hook (`agent_end`) and write artifacts to files.
- Support serial and parallel steps using file-based waiting.
- Auto-close tmux windows when subagent run completes.

### Out of scope (v1)
- No RPC migration.
- No custom tmux dashboard UI.
- No workflow DSL redesign.
- No global auto-loaded extension for this feature.

---

## Critical constraint
The extension **must not** live in `pi/agent/extensions/` (auto-loaded globally).

Extension location for this feature:
- `pi/agent/skills/subagent-workflow/extensions/subagent-run-bridge.ts`

Runtime loading style:
- `pi -e /absolute/or/relative/path/to/subagent-run-bridge.ts ...`

This ensures behavior is opt-in and only used by the workflow executor.

---

## Design

## 1) Subagent completion bridge extension

### File
- `pi/agent/skills/subagent-workflow/extensions/subagent-run-bridge.ts`

### Responsibility
When a subagent run finishes:
- detect final result (`agent_end`),
- extract last assistant text,
- write markdown artifact file,
- write machine-readable status file,
- request graceful process shutdown.

### Activation contract
The extension is inert unless required env vars are present:
- `SUBAGENT_OUTPUT_FILE` (required)
- `SUBAGENT_STATUS_FILE` (required)
- `SUBAGENT_STEP_ID` (optional)
- `SUBAGENT_RUN_ID` (optional)

### Event handling
- `agent_end`:
  - inspect `event.messages`,
  - select last assistant message,
  - extract text blocks,
  - classify status:
    - `success`
    - `error`
    - `aborted`
    - `no_output`
  - write output markdown,
  - write status JSON (atomic write + rename),
  - call `ctx.shutdown()`.
- `session_shutdown` fallback:
  - if status file not yet written, write fallback status (`aborted` or `process_error` context).

### Output conventions
- Success: artifact markdown contains only final assistant text.
- Non-success: artifact markdown contains compact error summary with reason and diagnostics.

---

## 2) Workflow execution changes (`subagent-workflow` skill)

Current execution uses `pi -p` and stdout redirect.

New execution model:
- create a per-step wrapper command/script,
- spawn a detached tmux window in current session,
- run interactive `pi` with:
  - prompt + inputs,
  - `-e pi/agent/skills/subagent-workflow/extensions/subagent-run-bridge.ts`,
  - env vars for output/status files,
- wrapper exits when `pi` exits,
- tmux window closes automatically (`remain-on-exit off` behavior).

### Tool mode mapping (unchanged)
- `ro`: `--no-session --tools read,bash`
- `rw`: session-enabled run

Only run mode changes from print-driven capture to extension-driven capture.

---

## 3) Waiting and orchestration

### Synchronization primitive
File-based polling on `*.status.json`.

For each step:
- expected files:
  - `<artifact>.md`
  - `<artifact>.status.json`

### Serial
- launch step,
- wait until status file exists,
- parse status,
- fail fast on non-success.

### Parallel group
- launch all group steps,
- wait for all status files,
- aggregate results,
- fail group if any step non-success.

### Timeout
- configurable per step/group (default long timeout, e.g. 4h),
- timeout writes/returns explicit timeout status in parent orchestration report.

---

## Status JSON schema (v1)

```json
{
  "status": "success|error|aborted|no_output|process_error|timeout",
  "stepId": "01-implement",
  "runId": "...",
  "stopReason": "stop|length|error|aborted|unknown",
  "errorMessage": "...",
  "outputFile": ".../01-implement.md",
  "finishedAt": "2026-02-19T00:00:00.000Z"
}
```

---

## Failure handling
- LLM/tool failure: `error` + error markdown artifact.
- User interrupt in subagent window: `aborted`.
- No assistant output: `no_output`.
- Unexpected process exit before extension writes status: wrapper writes `process_error` fallback.
- Parent timeout: `timeout` at orchestration layer.

No silent failures. Every step must end with status file.

---

## Feedback loop / validation plan

1. Single-step success:
   - window appears, interactive progress visible,
   - status + artifact files written,
   - window closes automatically.
2. Single-step model/tool error:
   - non-success status,
   - error markdown artifact,
   - parent reports failure.
3. Parallel 2-step run:
   - both windows run concurrently,
   - both statuses observed,
   - group aggregation correct.
4. Serial dependency:
   - step N+1 launches only after step N status file exists and is successful.
5. Fallback path:
   - simulate extension failure/early process death,
   - wrapper still writes `process_error` status.

---

## Rollout

1. Add bridge extension in skill-local `extensions/` directory.
2. Update `subagent-workflow` skill execution template to tmux + `-e` loading.
3. Smoke test with one existing workflow (`feature-implementation.md`).
4. Keep old `-p` path as optional fallback behind explicit flag if needed during transition.

---

## Relevant references (pi docs/examples)

- CLI modes and extension loading flags:
  - `README.md` (Modes, `-p`, interactive default, `-e/--extension`).
- Extension events and lifecycle:
  - `docs/extensions.md`:
    - `agent_end` event,
    - `session_shutdown` event,
    - `ctx.shutdown()` behavior,
    - mode behavior (`ctx.hasUI`, print/json no-op UI),
    - extension loading/usage.
- JSON event stream reference (alternative capture model and event vocabulary):
  - `docs/json.md`.
- Concrete examples used as implementation references:
  - `examples/extensions/subagent/index.ts` (last assistant extraction, stopReason/error handling patterns),
  - `examples/extensions/plan-mode/index.ts` (`agent_end` message inspection pattern),
  - `examples/extensions/shutdown-command.ts` (`ctx.shutdown()` usage),
  - `examples/extensions/ssh.ts` (extension flag access timing at `session_start`).
- Type-level semantics:
  - `node_modules/@mariozechner/pi-ai/dist/types.d.ts` (`AssistantMessage.stopReason`, `errorMessage`).

---

## Acceptance criteria
- Subagent windows are observable in tmux during execution.
- Each step always produces deterministic artifact + status files.
- Sequential and parallel dependency behavior remains correct.
- Completed subagent windows close automatically.
- Feature is opt-in (no global extension side effects in normal pi sessions).
