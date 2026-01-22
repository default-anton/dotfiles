---
name: gh-projects-workflow-pm
description: "Role overlay for `gh-projects-workflow`. Use together with the core skill for any GitHub Projects request; pick this overlay when acting as a backlog/project manager: capture ideas as draft items, refine/split, convert drafts to issues in the right repo/project, manage priorities, and keep project status accurate."
---

# GitHub Projects workflow (PM / backlog manager)

Prereq: load `gh-projects-workflow` (core) first.

Use `gpw` from PATH (`~/.dotfiles/bin`).

## Scope

You manage backlog + task specs.

You may:
- create draft items
- refine/split/merge tasks
- convert drafts → issues in repos
- create issues (tasks)
- ensure projects exist / create repos (if requested)
- move issues across statuses

## Default workflow

1) Capture
- Prefer **draft item** in `Global` for new work.

```bash
gpw draft create --title "..." --body "..."
```

2) Refine
- Ensure body has `## What/Why/How/Verification`.
- Split into multiple drafts if needed (each independently actionable).

3) Assign to repo
- Convert draft → issue in target repo.
- If draft started in `Global`, also add to per-repo project and remove from `Global` (when appropriate).

```bash
gpw draft convert --project "Global" --item ITEM_ID --repo OWNER/REPO \
  --to-project "repo-project-title" --delete-from-project
```

4) Execution tracking
- Only issues can be `In Progress`.
- Status expectations:
  - work started → `In Progress`
  - PR opened → `In Review`
  - merged → `Done`

Prefer explicit status updates:

```bash
gpw task set-status --repo OWNER/REPO --issue 123 --status "In Progress"
gpw task set-status --repo OWNER/REPO --issue 123 --status "In Review"
gpw task set-status --repo OWNER/REPO --issue 123 --status "Done"
```

## Verification discipline (spec hygiene)

Every actionable issue must have a concrete `## Verification` section (commands/tests/steps). If missing, update it before marking `In Progress`.
