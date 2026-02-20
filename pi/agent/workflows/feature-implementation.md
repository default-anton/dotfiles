# Feature workflow

For feature docs at `docs/<feature-name>.md`.

- Replace only `<feature-name>`.
- Keep prompt text unchanged.

## Steps

1) `01-implement` (`serial`, `rw`) -> `01-implement.md`

Prompt:
````markdown
Implement the feature specified in docs/<feature-name>.md completely.
````

2) `02-review-maintainer` (`parallel:reviews`, `ro`, input `@01-implement.md`) -> `02-review-maintainer.md`

Prompt:
````markdown
A coding agent has just implemented the feature from docs/<feature-name>.md. Put your technical co-founder, staff engineer, and strict maintainer hats on. Review the change set (see `git status`). You know what to look for.
````

3) `03-review-simplification` (`parallel:reviews`, `ro`, input `@01-implement.md`) -> `03-review-simplification.md`

Prompt:
````markdown
A coding agent has just implemented the feature from docs/<feature-name>.md. Review the change set (see `git status`) and provide a simplification assessment focused on clarity, consistency, and maintainability. Highlight concrete opportunities to simplify while preserving all functionality and meaning.
````

4) `04-resolve-feedback` (`serial`, `rw`, inputs `@01-implement.md @02-review-maintainer.md @03-review-simplification.md`) -> `04-resolve-feedback.md`

Prompt:
````markdown
A coding agent has just implemented the feature from docs/<feature-name>.md. Address all feedback from both reviews by updating the implementation change set (code/tests/docs/etc. as needed).

Do not defer review items. Re-run relevant validation loop(s) and report results.
````

## Order

`01` → (`02` + `03` in parallel) → `04`.
