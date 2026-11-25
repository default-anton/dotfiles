---
name: prompt-design
description: Design, simplify, or improve model-facing surfaces—LLM prompts, agent instructions, decision models/classifiers, agent tools (names, schemas, descriptions, outputs), skills (SKILL.md), and AGENTS.md files. Use when authoring or tuning any of these, rethinking a tool or classifier interface, trimming bloated instructions, or debugging why a model isn't behaving as intended. If a repo defines its own prompt/tool design skill, prefer that for in-repo prompts and tools and still use this for SKILL.md and AGENTS.md.
---

# Prompt design

Design every model-facing surface—prompts, agent instructions, classifiers, tools, skills, and `AGENTS.md`—the same way you design an API: understand the full context reaching the model, start minimal, observe what the weights already do, and make every instruction or parameter earn its tokens.

## 1. Trace what the model actually sees

Before writing or editing anything, inspect the entire surface reaching the model:

- What capability, decision, or behavior are we shaping, and why?
- What else is already in context: system/agent instructions, `AGENTS.md` hierarchy, tool names/schemas/descriptions, skill descriptions, serialized inputs, and tool outputs?
- Don't patch one layer in isolation when the real ambiguity, missing context, or bloat lives in another.

## 2. Start minimal and observe the weights

- **New work**: start with the smallest clear prompt, schema, skill, or rule set that states the goal and essential context—no preemptive edge-case rules.
- **Existing work**: when instructions have grown dense, defensive, or brittle, try stripping them down to essentials (even bare questions or minimal descriptions) to see what the model already gets right on its own.
- **Add in order: context → why → what → how.** Most mistakes come from missing domain context, unclear intent, or ambiguous boundaries. Add step-by-step "how" only after observing the model fail without it.
- **Prefer durable principles over patches.** Keep structure short and scannable. Never bolt on case-specific "NEVER do X" rules for one failure; clarify the underlying boundary, and delete conflicting or stale rules instead of appending overrides.
- **Cut what the model already knows or can read.** Omit generic best practices, restated schema types/enums, and codebase summaries that drift out of date.

## 3. Fix the shape and environment before adding prose

When a surface needs paragraphs of rules to prevent misuse, the underlying interface is usually wrong—**poka-yoke** (mistake-proof) it so invalid or ambiguous actions are hard or impossible to take. Before adding another reminder to a prompt, skill, or `AGENTS.md`, prefer fixing the shape of the code or types first (when feasible), then linters, formatters, scripts, or error messages.

### Agent tools

- **Name and boundaries**: match the tool name to the actual capability. Split overloaded tools with conditional parameter soup; merge chattily split tools that are always called together.
- **Schema over prose**: make parameter names self-explanatory and let types, enums, and defaults do the work. Never repeat types, required flags, or enum values in descriptions—use descriptions for semantics, units, formats, and non-obvious constraints.
- **Outputs and errors**: return canonical IDs, minimal relevant facts, and actionable failure details as data. Put situational next steps in tool results or on-demand docs rather than always-loaded prompts.

### Decision models and classifiers

- **Fix the taxonomy first**: crisp, mutually exclusive labels and boundary definitions carry most of the accuracy. If two labels overlap conceptually, redesign the labels instead of piling on tie-breaker prose or brittle keyword rules.
- **Verify input signal**: check that the serialized input actually contains what's needed to make the call—misclassifications are often missing or noisy context, not weak instructions.
- **Constrain outputs**: use explicit booleans, enums, or anchored scales (define what lowest vs. highest means). Add a short rationale field only when complex judgment benefits from it, and keep few-shot examples minimal and focused on real boundary cases if needed at all.

### Skills (`SKILL.md`)

- **Treat `description` as the routing API**: the model decides whether to load a skill from `name` + `description` alone. State the capability and concrete when-to-use / when-not-to-use triggers—don't waste `description` summarizing the steps.
- **Use progressive disclosure**: keep `SKILL.md` focused on the mental model, workflow, and high-leverage invariants. Put bulky references, templates, or deep guides in sibling files loaded on demand.
- **Separate invariants from judgment, and automate mechanics**: don't write rigid scripts for judgment calls, and don't write 40 lines of prose to work around brittle deterministic steps when a small script or CLI command belongs there instead.
- **Avoid duplication**: don't repeat `AGENTS.md` or pretraining knowledge; encode the non-obvious workflow, domain judgment, and gotchas.

### `AGENTS.md` files

- **Respect the always-loaded tax**: every line in `AGENTS.md` is paid on every turn and dilutes attention on the rules that actually matter. Keep only non-obvious invariants, authoritative commands, architectural boundaries, and pointers to deeper docs or skills—and prune stale or redundant lines whenever you touch it.
- **Scope down aggressively**:
  - Global `AGENTS.md`: cross-project personal preferences and universal guardrails only.
  - Repo root `AGENTS.md`: repo-wide commands, orientation, and invariants.
  - Nested `AGENTS.md`: rules specific to that directory or subsystem.
  - Skills or referenced docs: situational, task-specific workflows.

## 4. Verify against real behavior

Measure or observe behavior instead of guessing—whether or not the project has an eval harness:

- **Test representative cases**: exercise happy paths, tricky boundaries (adjacent classifier labels, ambiguous skill triggers, misuse-prone tool inputs), and failure modes.
- **Compare minimally**: if the project has evals, use them; otherwise compare the baseline/stripped version against your edit on concrete cases and inspect the full trace (inputs, tool calls, outputs) before tuning further.
- **Diagnose before adding text**: ask whether a failure came from missing context, bad shape, or a conflicting instruction before writing another rule. When trimming existing prompts, skills, or `AGENTS.md`, verify that removing a rule actually causes a regression before keeping it.
