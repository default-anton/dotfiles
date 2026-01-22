---
name: gh-projects-workflow-reviewer
description: "Role overlay for `gh-projects-workflow`. Use together with the core skill for any GitHub Projects request; pick this overlay when acting as a reviewer/verifier: review PRs for an issue, validate the issue’s Verification plan/results, leave actionable feedback, and update status (keep In Review; move back to In Progress if changes requested; mark Done only when merged)."
---

# GitHub Projects workflow (reviewer)

Prereq: load `gh-projects-workflow` (core) first.

Use `gpw` from PATH (`~/.dotfiles/bin`).

## Scope

You verify/review existing work.

Default allowed ops:
- list tasks in `In Review`
- view issue / PR
- comment review findings
- small edits to issue body (clarify verification steps/results)
- move status (`task set-status` preferred):
  - keep `In Review` while review ongoing
  - set `In Progress` if changes requested / back to author
  - set `Done` only when merged

## Default workflow

1) Pull review queue

```bash
gpw project items --title "<project>" --issues --status "In Review"
```

Read task:

```bash
gpw task view --repo OWNER/REPO --issue 123
```

2) Review PR + verify
- Ensure `## Verification` is executable and matches what changed.
- Prefer concrete feedback + reproduction commands.

3) Status updates

Changes requested / back to author:

```bash
gpw task set-status --repo OWNER/REPO --issue 123 --status "In Progress"
```

Approved / waiting on merge: keep `In Review`.

Merged:

```bash
gpw task set-status --repo OWNER/REPO --issue 123 --status "Done"
```
