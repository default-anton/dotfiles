---
name: gh-projects-workflow
description: "GitHub Projects v2 workflow (personal account) + `gpw` helper CLI for listing/creating/moving draft issues, issues, and statuses across projects. Use for any project/issue/status automation. ALWAYS load this core skill together with exactly one role overlay: `gh-projects-workflow-pm` (backlog mgmt), `gh-projects-workflow-coder` (implementation), or `gh-projects-workflow-reviewer` (review/verification)."
---

# GitHub Projects workflow (core; Projects v2)

## Mandatory: load a role overlay too

This skill defines the shared **model + commands**.

Also load **exactly one** role overlay skill:
- `gh-projects-workflow-pm`
- `gh-projects-workflow-coder`
- `gh-projects-workflow-reviewer`

## Model / invariants

Artifacts:
- **Draft issue**: Project draft item. Not directly actionable.
- **Issue**: GitHub issue (repo). Actionable.

Status field:
- `Todo`
- `In Progress`
- `In Review`
- `Done`

Rules:
- Only **issues** (not draft issues) may be `In Progress`.
- Every actionable issue body must include spec sections:
  - `## What`
  - `## Why`
  - `## How`
  - `## Verification`

## Requirements

- `gh` authenticated to your **user** account
- `jq`

## Scripts

Run commands from this dir:

```bash
cd ~/.dotfiles/pi/agent/skills/gh-projects-workflow
```

Help:

```bash
./scripts/gpw help
```

## Command index (what exists)

- Projects / repos
  - `./scripts/gpw projects list`
  - `./scripts/gpw repos list [--limit N]`
  - `./scripts/gpw global ensure` (ensures the `Global` project exists)
  - `./scripts/gpw project ensure --title TITLE`

- Project items (list)
  - `./scripts/gpw project items --title TITLE [--status STATUS] [--drafts|--issues|--all] [--json]`
    - default mode: `--all`
    - text output: TSV
      - drafts: `draft<TAB>Status<TAB>ITEM_ID<TAB>Title`
      - issues: `issue<TAB>Status<TAB>OWNER/REPO#N<TAB>Title<TAB>URL`
      - prs: `pr<TAB>Status<TAB>OWNER/REPO#N<TAB>Title<TAB>URL`

- Read item content by `ITEM_ID`
  - `./scripts/gpw item view --item ITEM_ID` (prints title/body for drafts; url/body for issues/PRs)
  - `./scripts/gpw item view --item ITEM_ID --json`

- Draft items
  - `./scripts/gpw draft create  --title TITLE [--body TEXT] [--project TITLE]`
  - `./scripts/gpw draft convert --item ITEM_ID --repo OWNER/REPO [--project TITLE] [--to-project TITLE] [--delete-from-project]`

- Issues (“tasks”)
  - `./scripts/gpw task create     --repo OWNER/REPO --title TITLE [--body TEXT] [--project TITLE]`
  - `./scripts/gpw task view       --repo OWNER/REPO --issue N [--json]` (prints issue body)
  - `./scripts/gpw task comment    --repo OWNER/REPO --issue N --body TEXT`
  - `./scripts/gpw task set-status --repo OWNER/REPO --issue N --status "Todo|In Progress|In Review|Done" [--project TITLE]`

- Repo bootstrap
  - `./scripts/gpw repo create --name NAME [--private|--public] [--with-project|--no-project]`

## Defaults

- Global project title: `Global` (hard-coded)

## References

- Copy/paste recipes + common flows: [references/commands.md](references/commands.md)
- GraphQL snippets + notes: [references/graphql.md](references/graphql.md)
