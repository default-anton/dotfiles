---
name: subagent-workflow
description: >
  Execute any user-provided workflow by spawning pi subagents with `pi -p`
  from an inline bash plan. Supports sequential and parallel phases.
---

# Subagent Workflow

Use when the user gives a workflow definition and wants it executed now with subagents.

## Step model

Normalize each step to:
`id | mode(serial|parallel:<group>) | access(ro|rw) | prompt | inputs | output`

- `ro` => `pi --no-session --tools read,bash -p ...`
- `rw` => `pi --no-session -p ...` (no `--tools`)

## Execution rules

- Build one inline bash plan and run with `set -euo pipefail`.
- Create a temp run dir; write every subagent result to markdown artifacts.
- Pass artifacts forward via `@file` inputs.
- Parallelize only steps in the same `parallel:<group>`.
- Run `rw` steps in parallel by default when workflow dependencies allow it.
- Prompts must request structured sections and concrete file paths.

## Inline template

```bash
set -euo pipefail
RUN_DIR="$(mktemp -d)"
ART="$RUN_DIR/artifacts"; mkdir -p "$ART"

run_ro() { local out="$1" prompt="$2"; shift 2; pi --no-session --tools read,bash -p "$@" "$prompt" > "$out"; }
run_rw() { local out="$1" prompt="$2"; shift 2; pi --no-session -p "$@" "$prompt" > "$out"; }

# Example subagent workflow
run_rw "$ART/01-implement.md" "Implement from spec. Return changed files + rationale." @spec.md
run_ro "$ART/02-strict-maintainer-review.md" "Strict maintainer review. Output BLOCKERS/SHOULD_FIX/NITS." & p1=$!
run_ro "$ART/03-simplification-review.md" "Simplification review. Output SIMPLIFY_NOW/LATER." & p2=$!
wait "$p1" "$p2"
run_rw "$ART/04-resolve.md" "Resolve accepted findings; list rejected with reason." @"$ART/02-review-a.md" @"$ART/03-review-b.md"

echo "$ART"
```

## Final response format

Keep it short. Include only:
- artifact directory path
- ordered list of result `.md` files
- compact run summary after reading all artifacts: per-step status + overall status
