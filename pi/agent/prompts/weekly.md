---
description: Weekly update for management reporting
argument-hint: "[instructions]"
---
Create a concise weekly progress report for management.

The report is for my team lead, VP Engineering, CTO, and CEO. Optimize for fast skimming. Be factual, direct, and sparse. Do not try to impress. Do not pad the report with low-value detail.

Report period:
- Relevant week is Saturday through Friday.
- If today is Friday/Saturday/Sunday, report on this week.
- If today is Monday-Thursday, report on the previous week.

Discovery:
1. Fetch latest remote refs before analysis.
2. Identify my Git identity:
   - `git config user.name`
   - `git config user.email`
   - GitHub user from `gh api user` if available.
3. Find pull requests I worked on during the period:
   - PRs I opened during the period.
   - PRs I merged or closed during the period.
   - PRs with commits by me during the period.
   - PRs I materially updated during the period, if discoverable.
4. Find branch-only work:
   - Inspect all remote branches.
   - Find commits authored or committed by me during the period.
   - Include branches even if no PR exists yet.
5. Dedupe work:
   - Prefer PRs over raw branch/commit entries.
   - Prefer the highest-signal container in this order: merged/closed PR, open PR, remote branch with no PR, raw commit only if no better grouping exists.
   - Do not report the same work twice if the same commits appear in both a PR and a remote branch.
   - Group by Aha! feature and requirement IDs.

Aha IDs:
- Feature IDs typically look like `[A-Z]+-[0-9]+`.
- Requirement IDs typically look like `[A-Z]+-[0-9]+-[0-9]+`.
- IDs can appear in branch names, PR titles, PR descriptions, and commit messages.
- Use Aha URLs directly:
  - `https://big.aha.io/features/FEATURE-ID`
  - `https://big.aha.io/requirements/REQUIREMENT-ID`
- Do not include the feature or requirement name in the report. Aha automatically renders the URL with metadata.

Writing rules:
- Each reported item should start with the relevant Aha feature/requirement URLs.
- Include PR links when applicable.
- Bullet points are optional.
- Only add bullets when the rendered Aha title or PR title is not enough to understand meaningful progress.
- Do not add bullets for obvious small fixes.
- Do not repeat the feature/requirement name in bullets.
- Keep bullets short and outcome-focused.
- Avoid implementation details unless they materially explain progress, risk, or status.
- Mention status only when useful, e.g. merged, closed, in review, significant progress but not merged, branch-only work.
- Exclude noise: formatting-only commits, dependency churn, tiny cleanup, WIP churn, and duplicated branch commits unless they materially changed delivery status.

Expected output:
Generate a markdown file named `weekly-update.md` at the repository root.

Expected format:
```markdown
# Week: Dec 28, 2025 – Jan 3, 2026

https://big.aha.io/features/FEATURE-ID or https://big.aha.io/requirements/REQUIREMENT-ID

PR: https://github.com/aha-app/aha-app/pull/44100 — merged

- Short factual note only if needed.
- Another note only if it adds useful context beyond the linked records.

---

https://big.aha.io/features/FEATURE-ID or https://big.aha.io/requirements/REQUIREMENT-ID

Branch: `origin/branch-name` — branch-only progress, no PR found

- Short factual note only if needed.

---
```

Additional user instructions:
$ARGUMENTS
