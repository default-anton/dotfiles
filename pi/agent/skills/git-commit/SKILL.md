---
name: git-commit
description: >
  Mandatory read before creating git commits. Stages only intended files, groups changes into logical commits, and writes concise Conventional Commits-style subjects.
---

Create a git commit for the current changes using a concise Conventional Commits-style subject.

## Format

`<type>(<scope>): <summary>`

- `type` REQUIRED. Use `feat` for new features, `fix` for bug fixes. Other common types: `docs`, `refactor`, `chore`, `test`, `perf`.
- `scope` OPTIONAL. Short noun in parentheses for the affected area (e.g., `api`, `parser`, `ui`).
- `summary` REQUIRED. Short, imperative, <= 72 chars, no trailing period.

## Notes

- Keep commits logically grouped: one commit = one cohesive, reviewable change.
- If current changes mix unrelated work, split into multiple commits with selective staging.
- "commit all" means stage all relevant files, not "force one commit".
- If multiple logical groups exist and user did not request a squash, create multiple commits.
- Body is OPTIONAL. If needed, add a blank line after the subject and write short paragraphs.
- Do NOT include breaking-change markers or footers.
- Do NOT add sign-offs (no `Signed-off-by`).
- Only commit; do NOT push (unless explicitly asked).
- If it is unclear whether a file should be included, ask the user which files to commit.
- Treat any caller-provided arguments as additional commit guidance. Common patterns:
  - Freeform instructions should influence scope, summary, and body.
  - File paths or globs should limit which files to commit. If files are specified, only stage/commit those unless the user explicitly asks otherwise.
  - If arguments combine files and instructions, honor both.

## Steps

1. Infer from the prompt if the user provided specific file paths/globs and/or additional instructions.
2. Review `git status` and `git diff` to understand the current changes (limit to argument-specified files if provided).
3. Partition changes into logical commit groups by intent and cohesion; use the smallest reviewable units.
4. If user asked to "commit all" and multiple groups exist, split into multiple commits by default; ask when grouping is ambiguous.
5. (Optional) Run `git log -n 50 --pretty=format:%s` to see commonly used scopes.
6. If there are ambiguous extra files, ask the user for clarification before committing.
7. Stage only files for the current logical commit (all changes only when they form one cohesive group and no files were specified).
8. Run `git diff --cached --name-only` to verify staged files match one logical group.
9. Run `git commit -m "<subject>"` (and `-m "<body>"` if needed).
10. Repeat staging/commit for remaining logical groups, if any.
