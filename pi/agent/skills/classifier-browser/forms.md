# Forms, observations and takeover

## Run the local example

form.html is disposable: no backend, login, save or send. form.js demonstrates
batched text classification, direct dropdown/interval bindings and classified
checkbox actions. Its four checkpoints preserve Billing Email, timezone and
First run through draft preparation, cancellation and reset.

After reading `agent-browser skills get core`, run in Code Mode:

```js
// @options: {"timeout_ms": 120000}
store("formStarted", Date.now());
const source = await tools.bash({
  command: "cat ~/.pi/agent/skills/classifier-browser/form.js", timeout: 10
});
if (source.exit_code !== 0 || source.truncated) throw new Error("form_load");
store("formRunner", source.output);
const run = eval(`(${source.output})`);
const report = await run();
store("formRun", report);
text(report);
```

Alternate installation: change the load path and pass the resolved `skillDir`
as in SKILL.md. The runner loads adjacent choose.js and form.html.
Review captures using visual-review.md; `outcome: "verified"` covers effects, not pixels.

To adapt form.js, replace its URL, probes, field mapping, allowed controls,
defaults and outcome predicates. Never inject the fixture into a real app
or infer real-app coverage from it.

## Batched independent fills

See the `fields → questions → batch` block in form.js:

1. Bind a few current editable fields from a scoped snapshot, preserving group
   context. Read actual values once; mark each `{requiredKey, satisfied}`.
2. Ask one choice question per field in one classifier request. Each question
   includes that field's context and compatible value purposes, plus `keep`/`none`.
3. Validate the whole batch before any fill. Reject wrong bindings, `none`,
   and `keep` for an unsatisfied field.
4. Fill serially, then verify each actual value and unchanged unrelated controls.

Use small independent batches (here, three fields). For autosaving, conditional,
submitting or remounting inputs, act and re-observe individually.
Fill directly when field/value bindings are unique; this example deliberately
exercises classification.

## One probe, small classifier state

Use one read-only browser `eval` probe for values, visibility, disabled/checked state,
`aria-selected`/`aria-pressed`, focus and framing. Add app-specific readiness and
field identity/group metadata to that probe. Never ask Jev to generate JavaScript.

Keep full values host-side. Build classifier-facing fields with only
identity, context, permitted value keys and comparisons:

```js
const fields = bindings.map(binding => ({
  ref: binding.ref,
  name: binding.name,
  context: binding.context,
  requiredKey: binding.valueKey,
  satisfied: actual.fields[binding.id].value === values[binding.valueKey],
  disabled: actual.fields[binding.id].disabled,
  focused: actual.fields[binding.id].focused
}));
```

`bindings`, `actual` and `values` are task-local host data. Use observed refs.
Send this projection, not raw probes/snapshots. Strip literals not just from
`pool.values`, but snapshot descendants, `currentValue`, history and other metadata.
Opaque keys reduce exposure/context; they are not credential protection.

Shrink routing observations, not host-side verification. A tablist can choose
a page, not prove its panel loaded or preserved values.

## Take over and resume without restarting

For a deliberate practice handoff, run the loader with:

```js
const report = await run({ pauseAfterPrepared: true });
store("formRun", report);
text(report);
```

The session stays open. Before practicing Cancel-and-resume, require
`evidence.prepared === true`, two captures, and `reason === "checkpoint_pause"`.
Diagnose any other failure without assuming preparation finished.

Inspect that session's URL and fresh snapshot. For this fixture only, optionally
click the observed Cancel button and verify `#draft` is hidden; leave other
controls alone. Keep the returned session and launch configuration:

```js
const report = load("formRun");
const result = await tools.bash({
  command: `AGENT_BROWSER_DEFAULT_TIMEOUT=5000 agent-browser --session '${report.session}' snapshot -i --json`,
  timeout: 10
});
if (result.exit_code !== 0 || result.truncated) throw new Error("takeover_snapshot");
const response = JSON.parse(result.output);
if (!response.success) throw new Error(JSON.stringify(response.error));
text(response.data);
```

Then resume in Code Mode, with fresh local budgets and no old ref pool:

```js
// @options: {"timeout_ms": 120000}
const run = eval(`(${load("formRunner")})`);
const report = await run({ resume: load("formRun") });
store("formRun", report);
text(report);
```

Resume checks live identity and untouched values without navigating, retaining
captures/evidence and skipping completed work. It handles a parent-performed
Cancel and verifies reset. Copy this task-specific logic, not blind replay or
a generic resume flag. Alternate installations need the same `skillDir`.
Evidence is historical; recheck state needed by the next action.

If the session is gone, URL is wrong, or effects are unknown, stop. Code Mode
stores commit only on successful script completion, so a stored report may lag
the browser after a hard timeout. Follow SKILL.md's timeout and cleanup rules.
