---
name: subagent-workflow
description: >
  Execute any user-provided workflow by spawning pi subagents with `pi -p`
  from an inline bash plan. Supports sequential and parallel phases. Also
  help users define and manage workflow specs in a standard markdown format.
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

- `ro` => `pi --no-session --tools read,bash -p ...`
- `rw` => `pi -p ...` (session-enabled)
- Keep two-digit prefixes (`01`, `02`, ...), aligned step ids/output names.
- Use `parallel:<group>` only for dependency-independent steps.
- On workflow edits, update both `Steps` and `Order`.

## Execution rules

- Build one inline bash plan with `set -euo pipefail`.
- When running that plan via the harness `bash` tool, set a long timeout (`timeout: 14400`, ~4 hours).
- Use a temp artifact dir; each step writes one `.md` artifact.
- Pass dependencies via `@file`; wait for parallel PIDs before dependent steps.
- Parallelize only steps in the same `parallel:<group>`; `rw` may run in parallel when dependencies allow.
- Prompts should request structured sections and concrete file paths.

Example execution plan (adapt step prompts/inputs to the workflow spec):

```bash
set -euo pipefail
RUN_DIR="$(mktemp -d)"
ART="$RUN_DIR/artifacts"; mkdir -p "$ART"

run_ro(){ local out="$1" prompt="$2"; shift 2; pi --no-session --tools read,bash -p "$@" "$prompt" > "$out"; }
run_rw(){ local out="$1" prompt="$2"; shift 2; pi -p "$@" "$prompt" > "$out"; }

echo "$ART" # print early so path is visible even if a later step fails

# Example workflow execution (generic 01 -> 02/03 parallel -> 04)
run_rw "$ART/01-implement.md" "Implement the spec completely. Return changed files + rationale." @feature-spec.md
run_ro "$ART/02-review-maintainer.md" "Strict maintainer review. Output BLOCKERS/SHOULD_FIX/NITS." @"$ART/01-implement.md" & p1=$!
run_ro "$ART/03-review-simplification.md" "Simplification review. Output SIMPLIFY_NOW/LATER with concrete edits." @"$ART/01-implement.md" & p2=$!
wait "$p1" "$p2"
run_rw "$ART/04-resolve-feedback.md" "Resolve accepted findings; list rejected findings with reason." @"$ART/02-review-maintainer.md" @"$ART/03-review-simplification.md"

ls -1 "$ART"
```

## Final response format

Return only:
- artifact directory path
- ordered list of artifact `.md` files
- compact status: per-step + overall
