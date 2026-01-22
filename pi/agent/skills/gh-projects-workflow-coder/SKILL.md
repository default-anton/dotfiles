---
name: gh-projects-workflow-coder
description: "Role overlay for `gh-projects-workflow`. Use together with the core skill for any GitHub Projects request; pick this overlay when acting as a coding/implementation agent: pick up an existing issue, implement it, link PRs, add brief progress notes, and advance status (Todo → In Progress → In Review → Done). Avoid backlog shaping (creating/splitting tasks) unless explicitly asked."
---

# GitHub Projects workflow (coder)

Prereq: load `gh-projects-workflow` (core) first.

Run commands from the core skill dir:

```bash
cd ~/.dotfiles/pi/agent/skills/gh-projects-workflow
```

## Scope

You execute an existing task.

Default allowed ops:
- list tasks by status
- view issue / PR
- comment with progress + questions
- small issue body edits (implementation notes; verification results)
- advance status (`task set-status`)

Avoid unless explicitly asked:
- creating new tasks/drafts
- splitting/merging/re-scoping backlog
- creating repos/projects

## Default workflow

1) Get next task

```bash
./scripts/gpw project items --title "<project>" --issues --status "Todo"
```

Read task:

```bash
./scripts/gpw task view --repo OWNER/REPO --issue 123
```

2) Start work

Prefer explicit status:

```bash
./scripts/gpw task set-status --repo OWNER/REPO --issue 123 --status "In Progress"
```

3) Implement
- Create branch per issue.
- Keep changes scoped; update `## Verification` (tests/commands).
- If spec unclear/blockers: ask in an issue comment; do not invent new requirements.

4) Open PR
- Reference issue in PR (e.g. `Fixes #123` when appropriate).
- Move issue to review:

```bash
./scripts/gpw task set-status --repo OWNER/REPO --issue 123 --status "In Review"
```

5) Merge → Done

```bash
./scripts/gpw task set-status --repo OWNER/REPO --issue 123 --status "Done"
```
