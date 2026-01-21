# gpw command recipes

All commands assume:

```bash
cd ~/.dotfiles/pi/agent/skills/gh-projects-workflow
```

## Ensure projects exist

```bash
./scripts/gpw global ensure
./scripts/gpw project ensure --title "my-product"
```

## Quick discovery

```bash
./scripts/gpw projects list
./scripts/gpw repos list --limit 50
```

List items (default mode: `--all`):

```bash
./scripts/gpw project items --title "Global" --drafts
./scripts/gpw project items --title "my-repo" --issues --status "In Review"
./scripts/gpw project items --title "my-repo" --issues --status "In Progress"
```

Issue refs in list output look like: `OWNER/REPO#123`.

To view an issue from a ref:

```bash
repo="${ref%#*}"
num="${ref#*#}"
./scripts/gpw task view --repo "$repo" --issue "$num"
```

Read a draft item body by `ITEM_ID` (from the list output):

```bash
./scripts/gpw item view --item ITEM_ID
```

Machine output:

```bash
./scripts/gpw project items --title "my-repo" --all --json | jq .
```

## Create a draft item (default project: `Global`)

```bash
./scripts/gpw draft create --title "..." --body "..."                      # Global
./scripts/gpw draft create --project "my-repo" --title "..." --body "..." # per-repo project
```

## Convert draft → issue

1) Find draft item ids:

```bash
./scripts/gpw project items --title "Global" --drafts
```

2) Convert in-place:

```bash
./scripts/gpw draft convert --project "Global" --item ITEM_ID --repo OWNER/REPO
```

3) Convert + add to another project (optionally delete old draft item):

```bash
./scripts/gpw draft convert --project "Global" --item ITEM_ID --repo OWNER/REPO \
  --to-project "my-repo" --delete-from-project
```

## Create a repo (+ protect default branch) (+ optional per-repo project)

```bash
./scripts/gpw repo create --name my-repo              # repo + project "my-repo"
./scripts/gpw repo create --name my-repo --no-project # repo only
```

## Create an issue (“task”) and add it to a project

```bash
./scripts/gpw task create --repo OWNER/REPO --title "..." --body "..."
```

## Read / comment on an issue

```bash
./scripts/gpw task view --repo OWNER/REPO --issue 123
./scripts/gpw task comment --repo OWNER/REPO --issue 123 --body "..."
```

## Move an issue through statuses

Prefer explicit status (less ambiguous):

```bash
./scripts/gpw task set-status --repo OWNER/REPO --issue 123 --status "In Progress"
./scripts/gpw task set-status --repo OWNER/REPO --issue 123 --status "In Review"
./scripts/gpw task set-status --repo OWNER/REPO --issue 123 --status "Done"
```

## gh primitives (still useful)

```bash
gh issue edit -R OWNER/REPO 123 --body "..."           # replace body

gh pr view -R OWNER/REPO 456
```
