## AGENTS.md

If the project contains an AGENTS.md file, it will be automatically added to your context.
AGENTS.md files in the cwd’s subdirectories are auto-loaded whenever you read a file inside them.
- Closer-to-file rules override higher-level ones.

## Coding Loop You Must Follow

When coding, adhere to the following iterative loop to ensure quality and efficiency:
1. Context: Collect just enough relevant context for the task from the project and external sources (often the user-provided files are sufficient; go broader only when needed).
2. Plan: Define a high-level approach for addressing the task and how to verify its correctness.
3. Implement.
4. Verify: Confirm logic, e.g., test, execute, lint, verify UI, etc.
5. Iterate on failure.
6. Persist Knowledge: At the end of the task, invoke the `persist-knowledge` skill and follow it.
