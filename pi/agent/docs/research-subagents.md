# Research with subagents

First identify the task surface: conversation context, stated task, requirements, acceptance criteria, reported behavior, errors or reproductions, current changes, and likely relevant subsystems.

Give each subagent the task surface and a bounded scope. Scope research by subsystem, contract, data flow, risk, history, test path, or competing hypothesis. Subagents must not modify source, tests, config, docs, or generated files. They may only write markdown notes in a temporary area outside the repository.

Study the relevant pre-existing subsystems, contracts, invariants, interfaces, data flow, tests, configuration, history, constraints, and project patterns. Look beyond the initially named files when needed to understand the assigned scope.

Do not implement changes, review work, make recommendations, or decide whether anything is a defect. Separate verified facts, reasonable inferences, and unresolved questions. Cite relevant paths and symbols.

Write a markdown context report organized for downstream use:

- subsystem and task map;
- contracts, invariants, defaults, and boundaries;
- callers, consumers, and data flow;
- tests, reproductions, and validation paths;
- relevant patterns, history, and constraints;
- conflicting evidence and unresolved questions.

Optimize for downstream usefulness, not exhaustive narration. Return the note path and a short summary.

After subagents return, read their reports, remove duplicates, resolve conflicts against the repository, and investigate gaps or uncertain claims. Scale subagent count to context and risk, not file count. Use the combined context to perform the requested diagnosis, plan, recommendation, or implementation.
