---
name: create-verification-skill
description: Create or update a project-local verification skill grounded in the real app. Use when asked to set up manual testing or verification instructions for a project, not for ordinary implementation verification.
---

# Create a verification skill

Write a lean executable recipe for manually testing the project as a real user or API caller would. Work in the target project, not this global skill's directory.

## Inspect the project

Read applicable instructions and existing verification skills first; update an existing skill rather than creating a competing one. Learn from the repo before asking the user:

- What users or callers interact with: UI, CLI, API, library, or another surface.
- How to build and run locally, including readiness, auth, migrations, and usable test data.
- Which existing tools can test it and show the results.
- How to isolate processes, ports, accounts, and data from other work.

Use documented commands and existing harnesses. Ask only for missing information you cannot discover. Do not repair unrelated startup problems or introduce new infrastructure; report concrete blockers.

## Write the local skill

Use the project's existing skill location, or `.agents/skills/verify-<app>/SKILL.md`. Include `name` and a description that explicitly triggers after implementation changes affecting the relevant behavior or appearance. Do not disable automatic invocation.

Keep the body limited to what another agent needs to act:

- **Setup:** exact commands, working directory, local URLs and ports, prerequisites, readiness signal, and test data or auth setup. Ready means the affected flow is usable, not merely that a port responds.
- **Test:** specify tools and access, not selectors or feature-by-feature journeys. Instruct the agent to derive affected flows and expected outcomes from the current task and code, and discover controls from the live app. Cover relevant failure paths without requiring a full regression run. For web apps, explicitly authorize `agent-browser` for local verification and require reading `agent-browser skills get core` before use; do not duplicate the browser manual.
- **Check results:** the action and expected visible result, plus relevant side effects such as files or persisted state. Use the app’s real interface, not internal state changes or test-only shortcuts. Include screenshots for appearance changes; otherwise capture only evidence needed to support the conclusion. State where any retained artifacts go.
- **Cleanup:** stop only processes started for verification and remove only scratch state created by it. Preserve retained evidence. Document any shared-instance limitations; do not control or reset a session someone else is using.

Keep all verification in safe local or test environments. Browser authorization does not authorize purchases, messages, pushes, or other external effects. Check what dry-run or test modes actually skip rather than trusting their names. Never embed secrets.

Use concrete instructions, not placeholders. Add helpers only when they remove meaningful repetition; show their invocation.

Include the following section verbatim in every generated or updated verification skill. Do not shorten or paraphrase it; these constraints prevent one-off failures and bug workarounds from becoming permanent guidance.

```markdown
## Maintenance

Start without reference files. Add narrowly scoped notes only for non-obvious edge cases, verification gaps, or recurring pitfalls supported by code, shared configuration, or clean-environment reproduction—not a single local failure.

Prefer fixing preventable setup problems within scope. Record only the trigger, expected behavior, and verification guidance, with enough feature context to act. Link each note with a clear condition for reading it. Report application bugs rather than documenting workarounds as accepted outcomes; remove notes when they become obsolete.
```

Add or update one line in the project's `AGENTS.md` directing implementation changes on the relevant surface to this skill. Preserve unrelated instructions and avoid duplicate guidance.

## Prove the recipe

Follow the generated instructions once: set up, exercise one representative flow, observe its result, and clean up. For user-facing web changes, include the browser path. Follow applicable delegation rules; do not require delegation by default.

Clean up after failed attempts too. Fix problems in the recipe and rerun only the affected steps. If evidence was saved, confirm cleanup preserved it.

Report the skill's location, what you exercised, and any gaps or blockers. If you could not execute the recipe, call it unverified; do not claim that writing the instructions proved them. Do not broaden this task into checking every feature.
