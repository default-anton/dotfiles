---
name: subagent-workflow
description: >
  Execute user-provided workflows by orchestrating interactive pi subagents in tmux
  windows with deterministic artifact/status files. Supports serial and parallel
  phases. Also help users define and manage workflow specs in a standard markdown format.
---

# Subagent Workflow

Use when the user wants to define, update, or execute a workflow with subagents.

## Workflow library + selection

- Store reusable workflow specs only in: `~/.dotfiles/pi/agent/workflows/*.md`.
- Do not search other locations unless the user gives an explicit path.
- If the user names a workflow, match by filename stem first (case-insensitive).
- If the user is loose (for example: “use your sub-agent workflow to implement this feature”), list available workflows and pick the best match using: filename, H1 title, `For ...` scope line, and step ids.
- If no clear winner, present top 2–3 candidates with one-line rationale and ask for selection.
- Before execution, state the chosen workflow path and why it matched.

## Default workflow format (unless user specifies another)

<default-format>
# <Workflow name>

For <target/path/or-scope>.

- Replace only `<placeholders>`.
- Keep prompt text unchanged unless asked.

## Steps
1) `01-<id>` (`serial`, `rw`) -> `01-<id>.md`
Prompt:
````markdown
<prompt text>
````

2) `02-<id>` (`parallel:<group>`, `ro`, input `@01-<id>.md`) -> `02-<id>.md`
Prompt:
````markdown
<prompt text>
````

3) `03-<id>` (`parallel:<group>`, `ro`, input `@01-<id>.md`) -> `03-<id>.md`
Prompt:
````markdown
<prompt text>
````

4) `04-<id>` (`serial`, `rw`, inputs `@02-<id>.md @03-<id>.md`) -> `04-<id>.md`
Prompt:
````markdown
<prompt text>
````

## Order
`01` → (`02` + `03` in parallel) → `04`.
</default-format>

## Step model + constraints

Normalize each step as:
`id | mode(serial|parallel:<group>) | access(ro|rw) | prompt | inputs | output`

- `ro` => `subwf ... --ro` (internally `pi --no-session --tools read,bash`)
- `rw` => `subwf ... --rw` (interactive session-enabled `pi`)
- Keep two-digit prefixes (`01`, `02`, ...), aligned step ids/output names.
- Use `parallel:<group>` only for dependency-independent steps.
- On workflow edits, update both `Steps` and `Order`.

## Execution rules

- Parse the workflow format in-agent. Do not ask `subwf` to parse or validate workflow files.
- Use: `SUBWF=~/.dotfiles/pi/agent/skills/subagent-workflow/scripts/subwf`
- Build one inline bash plan with `set -euo pipefail`.
- When running that plan via the harness `bash` tool, set a long timeout (`timeout: 14400`, ~4 hours).
- Initialize once per execution: `RUN_DIR="$($SUBWF init)"` and set `--run-dir "$RUN_DIR"` on subsequent calls.
- Each step must end with:
  - artifact markdown: `$RUN_DIR/artifacts/<step-id>.md`
  - status json: `$RUN_DIR/status/<step-id>.status.json`
- For serial steps, prefer `subwf run ...`.
- For parallel groups, use `subwf start ...` for each step, then a single `subwf wait ...`.
- Pass dependencies with repeated `--input <path>`.
- Default capture mode is interactive tmux + extension bridge.
- Optional fallback during transition: `--capture-mode print`.

Example execution plan (generic `01 -> (02+03) -> 04`):

```bash
set -euo pipefail
SUBWF="$HOME/.dotfiles/pi/agent/skills/subagent-workflow/scripts/subwf"
RUN_DIR="$($SUBWF init)"

echo "$RUN_DIR/artifacts"

$SUBWF --run-dir "$RUN_DIR" run 01-implement \
  --rw \
  --prompt "Implement the spec completely. Return changed files + rationale." \
  --input feature-spec.md

$SUBWF --run-dir "$RUN_DIR" start 02-review-maintainer \
  --ro \
  --prompt "Strict maintainer review. Output BLOCKERS/SHOULD_FIX/NITS." \
  --input "$RUN_DIR/artifacts/01-implement.md"

$SUBWF --run-dir "$RUN_DIR" start 03-review-simplification \
  --ro \
  --prompt "Simplification review. Output SIMPLIFY_NOW/LATER with concrete edits." \
  --input "$RUN_DIR/artifacts/01-implement.md"

$SUBWF --run-dir "$RUN_DIR" wait 02-review-maintainer 03-review-simplification

$SUBWF --run-dir "$RUN_DIR" run 04-resolve-feedback \
  --rw \
  --prompt "Resolve accepted findings; list rejected findings with reason." \
  --input "$RUN_DIR/artifacts/02-review-maintainer.md" \
  --input "$RUN_DIR/artifacts/03-review-simplification.md"

$SUBWF --run-dir "$RUN_DIR" status
```

## Final response format

Return only:
- artifact directory path
- ordered list of artifact `.md` files
- reviewer-focused execution summary (PR-style):
  - Goal/scope
  - What was done (ordered by step, with key decisions)
  - Validation evidence (tests/checks/log signals)
  - Risks, follow-ups, and rollback notes
  - Final outcome (complete/partial/failed)
