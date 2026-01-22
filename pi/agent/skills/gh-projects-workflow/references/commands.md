# gpw command recipes

All commands assume `gpw` in PATH (`~/.dotfiles/bin`).

## Ensure projects exist

```bash
gpw global ensure
gpw project ensure --title "my-product"
```

## Quick discovery

```bash
gpw projects list
gpw repos list --limit 50
```

List items (default mode: `--all`):

```bash
gpw project items --title "Global" --drafts
gpw project items --title "my-repo" --issues --status "In Review"
gpw project items --title "my-repo" --issues --status "In Progress"
```

Issue refs in list output look like: `OWNER/REPO#123`.

To view an issue from a ref:

```bash
repo="${ref%#*}"
num="${ref#*#}"
gpw task view --repo "$repo" --issue "$num"
```

Read a draft item body by `ITEM_ID` (from the list output):

```bash
gpw item view --item ITEM_ID
```

Machine output:

```bash
gpw project items --title "my-repo" --all --json | jq .
```

## Create a draft item (default project: `Global`)

```bash
gpw draft create --title "..." --body "..."                      # Global
gpw draft create --project "my-repo" --title "..." --body "..." # per-repo project
```

## Convert draft → issue

1) Find draft item ids:

```bash
gpw project items --title "Global" --drafts
```

2) Convert in-place:

```bash
gpw draft convert --project "Global" --item ITEM_ID --repo OWNER/REPO
```

3) Convert + add to another project (optionally delete old draft item):

```bash
gpw draft convert --project "Global" --item ITEM_ID --repo OWNER/REPO \
  --to-project "my-repo" --delete-from-project
```

## Create a repo (+ protect default branch) (+ optional per-repo project)

```bash
gpw repo create --name my-repo              # repo + project "my-repo"
gpw repo create --name my-repo --no-project # repo only
```

## Create an issue (“task”) and add it to a project

```bash
gpw task create --repo OWNER/REPO --title "..." --body "..."
```

## Read / comment on an issue

```bash
gpw task view --repo OWNER/REPO --issue 123
gpw task comment --repo OWNER/REPO --issue 123 --body "..."
```

## Move an issue through statuses

Prefer explicit status (less ambiguous):

```bash
gpw task set-status --repo OWNER/REPO --issue 123 --status "In Progress"
gpw task set-status --repo OWNER/REPO --issue 123 --status "In Review"
gpw task set-status --repo OWNER/REPO --issue 123 --status "Done"
```

## gh primitives (still useful)

```bash
gh issue edit -R OWNER/REPO 123 --body "..."           # replace body

gh pr view -R OWNER/REPO 456
```
