---
description: Weekly update for management reporting
allowed-tools: Bash(git config user.name), Bash(git config user.email)
---

Get the current date and look up my commits from the relevant week (Saturday through Friday). Create a concise bullet-point list of my progress for management reporting. Keep descriptions direct and factual without unnecessary elaboration. Avoid cliche, flowery and marketing language. Group progress by Aha! feature and requirement IDs, if applicable. Feature/requirement urls are automatically rendered as record pills when pasted in Aha!, so use them, e.g. https://big.aha.io/features/FEATURE-ID and https://big.aha.io/requirements/REQUIREMENT-ID. Target audience is team leads and management, so focus on clarity and relevance instead of technical details.

Expected Output: Generate a markdown file named `weekly-update.md` at the repository root containing the formatted weekly update.

Expected Format:
```markdown
# Week: Dec 28, 2025 – Jan 10, 2026

https://big.aha.io/features/[FEATURE-ID]

PR: https://github.com/aha-app/aha-app/pull/44100 (significant progress, not merged)

- [Bullet points of work done]

---

...
```

Logic: If today is Friday/Saturday/Sunday, report on THIS week. If today is Monday-Thursday, report on PREVIOUS week.

Git user: !`git config user.name` (!`git config user.email`)

Here's how to get commits from the relevant week (Saturday to Friday):

```bash
# Calculate the date range based on current day
current_day=$(date +%u)  # 1=Monday, 7=Sunday

if [ $current_day -ge 5 ]; then
  # Friday (5), Saturday (6), or Sunday (7) - use THIS week
  week_saturday=$(date -v-$(($(date +%u) % 7))d +%Y-%m-%d)
  week_friday=$(date -v+$((6 - $(date +%u) % 7))d +%Y-%m-%d)
else
  # Monday (1) through Thursday (4) - use PREVIOUS week
  week_saturday=$(date -v-$(($(date +%u) % 7 + 7))d +%Y-%m-%d)
  week_friday=$(date -v-$(($(date +%u) % 7 + 1))d +%Y-%m-%d)
fi

# Get commits from the calculated week
git log --author="$(git config user.email)" \
  --since="$week_saturday 00:00:00" \
  --until="$week_friday 23:59:59" \
  --pretty=format:"%h %ad %s" \
  --date=short \
  --no-merges
```

Note: FEATURE-ID and REQUIREMENT-ID can be found in the branch name and commit messages. Feature IDs typically follow the format `[A-Z]+-[0-9]+` and REQUIREMENT IDs follow the format `[A-Z]+-[0-9]+(-[0-9]+)`. For example:
- `AI-18229-39-some-title` would have `AI-18229-39` as the REQUIREMENT-ID.
- `DEMO-1234-some-title` would have `DEMO-1234` as the FEATURE-ID.
