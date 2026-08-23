---
description: Research the codebase and write a note to your future self before planning/implementing
argument-hint: "[task: feature, issue, bug, or free-form description]"
---
Research the current state of the codebase for the task below. Do not plan or implement anything yet. Explore what you need; use your judgment.

You understand it now, but you won't remember it later. Write a note to your future self — the developer who starts designing, implementing, or resolving this without any of today's context and should not have to rediscover anything.

- Save the note as markdown at `notes/<short-topic>.md` (create the directory if needed) unless the task says otherwise.
- The note is all that survives: sessions end and conversation context is lost. Assume the reader has zero prior context. Every claim stands on its own.
- Cite `file:line` for everything, so future-you jumps straight to the code.

Cover:

- Task restated in 1–2 sentences (what and why) and where it came from.
- Relevant subsystems: where they live and how they connect.
- Key files and symbols with what each does; quote short snippets only where they clarify.
- How the affected flow works today, end to end: entry points → control/data flow → output or side effects.
- Patterns and conventions the change must follow; similar existing code worth imitating.
- Constraints and gotchas: edge cases, invariants, tests or workflows guarding this area.
- Open questions and things not verified.

Task:
$ARGUMENTS
