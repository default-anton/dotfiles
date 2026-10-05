---
name: create-pr
description: Use when asked to create a PR
---

# Create a pull request

Create a draft pull request for the current branch. Treat the user's request to create the PR as approval to push the branch and create the PR.

1. Inspect the branch, commits, and diff against the target branch, including uncommitted changes. Extract any issue ID from the branch name, then read that issue through available tools. Use any Sentry or support refs in the issue or in the user's request.
2. Write a concise PR title with an issue ID prefix if present, like "FEAT-123: ...".
3. Create `/tmp/pr-<...>-body.md` from `.github/PULL_REQUEST_TEMPLATE.md` if present. Write the Description for an engineer who knows the codebase but not the context:
   - Start with why the change is needed. Match the context to the work: the failure and workaround for a bug, the use case for a feature, the limitation for an improvement, or the operational goal for scripts and configuration. Be concrete.
   - Show the outcome, not the sequence of code edits. Choose the clearest format: before/after behavior, a usage example, a request flow, pseudocode, or a small diagram. For multi-step workflows, show where one step's output becomes the next step's input. Use examples when they clarify the change, not as a mandatory template.
   - Explain surprising behavior, consequential tradeoffs, or operational constraints needed to judge the change. Do not inventory every boundary or invent review risks.
   - Do not restate what is obvious from the diff, including tests added. Do not include test results or checks performed unless explicitly required.
   - Let the complexity of the change determine the length. Include enough context to review the intent and outcome without reading the diff, then cut repetition and details the diff explains just as well.

   Include links or refs for applicable issues, support tickets, and Sentry errors.
4. Push the current branch if needed, then create the PR with:
   ```bash
   gh pr create \
     --draft \
     --title "$title" \
     --body-file /tmp/pr-<...>-body.md
   ```
5. Get the PR URL plus its `additions` and `deletions` with `gh pr view --json url,additions,deletions`. Copy this ready-to-send message with `pbcopy` (do not include a code fence). Choose one apt Slack emoji for `:emoji:`; omit the issue line if there is no linked issue:
   ```md
   @here :emoji: PR title without ticket ID
   > :ticket: ISSUE_URL
   > :pr: PR_URL `+N/-M`
   ```
6. Report the PR URL and confirm that the Slack message is on the clipboard.

Use any additional refs or instructions supplied with the user's request.
