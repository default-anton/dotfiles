# Code Review Workflow Extension

Automated code review workflow for pi with fresh session support.

## Usage

### `/review [instructions]`

After completing a coding task, start a fresh review session:

```bash
/review focus on frontend changes only
```

The extension:
1. Waits for the agent to finish
2. Uses an LLM to extract the task from the conversation
3. Extracts the summary from all assistant messages (excluding tool calls)
4. Creates a new session with a review prompt

## Session Naming

Sessions are automatically named for easy navigation:
- Review: `Review: {task snippet}...`
