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
5. Sets the session to read-only mode (bash, read, finder only)

### `/implement [instructions]`

After reviewing suggestions, start a fresh implementation session:

```bash
/implement do only first and second suggestion
```

The extension:
1. Retrieves the stored review state (task, summary)
2. Extracts the review text from the current session
3. Creates a new session with an implementation prompt
4. Restores full tool access for making changes

## Session Naming

Sessions are automatically named for easy navigation:
- Review: `Review: {task snippet}...`
- Implement: `Implement: {task snippet}...`

## State Management

- Each `/review` clears previous review state
- Review state includes: task, summary, review text, timestamp, original session file
- State persists across sessions using `pi.appendEntry()`

## Read-Only Mode

In review mode, only these tools are available:
- `bash` - for running verification scripts
- `read` - for reading files
- `finder` - for codebase exploration

Write/edit operations are blocked to prevent accidental changes during review.
