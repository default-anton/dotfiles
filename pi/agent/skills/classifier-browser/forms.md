# Forms, observations and takeover

## Run the local example

[form.html](form.html) is a disposable local UI: no backend, login, save or send.
[form.js](form.js) prepares an unsaved draft using one batched text classification,
direct dropdown/interval bindings, and classifier-chosen checkbox actions.
It preserves Billing Email, timezone and First run; captures four checkpoints;
cancels, reopens, verifies reset and cancels again. It never submits anything.
This is a manual browser recipe, not an automated test suite or a universal adapter.

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
as in the Wikipedia example. The runner loads its adjacent `choose.js`/`form.html`.
Build and review the report's captures with [visual-review.md](visual-review.md).
`outcome: "verified"` means browser effects, **not pixels**, were verified.

Read `form.js` to adapt to another app. Replace its URL, probes, field mapping,
allowed controls, defaults and outcome predicates. Do not inject this fixture
into a real app or infer real-app coverage from it.

## Batched independent fills

The runnable batch is the `fields → questions → batch` block in `form.js`:

1. Bind a few current editable fields from a scoped snapshot, preserving group
   context. Read actual values once; mark each `{requiredKey, satisfied}`.
2. Ask **one choice question per field in one classifier request**. Each question
   includes that field's context and compatible value purposes, plus `keep`/`none`.
3. Validate **the whole batch before any fill**. Reject wrong bindings, `none`,
   and `keep` for an unsatisfied field.
4. Fill serially, then verify each actual value and unchanged unrelated controls.

These independent questions may run together; they do not depend on each other's
answers. Use small batches (the example uses three fields). Do not batch
autosaving, conditional, submitting or remounting inputs. Re-observe those after
each action instead. When the task already binds every field/value uniquely,
direct fills are simpler; this example deliberately exercises classification.

## One probe, small classifier state

The example's `probe` reads actual values, visibility, disabled/checked state,
`aria-selected`/`aria-pressed`, focus and framing in one read-only browser `eval`.
For other apps extend that same probe with relevant readiness facts and field
identity/group metadata. Do not ask Jev to generate JavaScript.

Keep full values **host-side**. Build classifier-facing fields with only
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

Here `bindings`, `actual` and `values` are task-local host data, not invented refs.
The form batch sends this kind of projection, **not the raw probe or snapshot**.
This keeps even long prompts out of classifier input without losing correctness
checks. Removing literals only from `pool.values` is insufficient: also exclude
them from snapshot descendants, `currentValue`, history and other metadata.
Opaque keys reduce exposure/context; they are not credential protection.

**Shrink routing observations, not verification.** A tablist can choose a page;
it cannot prove the selected panel has loaded or preserved values. Keep full
task-specific effect checks host-side even when Jev sees only a small region.

## Take over and resume without restarting

For a deliberate practice handoff, run the loader with:

```js
const report = await run({ pauseAfterPrepared: true });
store("formRun", report);
text(report);
```

It returns `handoff` with reason `checkpoint_pause`, two capture records and
verified preparation evidence. Its owned browser session remains open.
Before practicing Cancel-and-resume, require `evidence.prepared === true`,
two captures, and `reason === "checkpoint_pause"`. A different failure is not this
checkpoint: diagnose it first, without assuming preparation finished.

Inspect that exact session, its URL and a fresh snapshot. For this fixture only,
you may directly click the observed Cancel button and check that `#draft` is
hidden; leave all other controls alone. Or simply inspect without changing it.
Use the returned session on every command and the same launch configuration:

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

The runner does **not** reopen the starting URL. It checks live identity and
untouched values, retains prior captures/evidence, skips completed preparation,
observes cancellation (including a parent-performed Cancel), and checks reset.
That task-specific logic is the pattern to copy—not blind replay or a generic
“resume everything” flag. For an alternate installation pass the same `skillDir`.
Evidence contains historical facts; recheck any state needed by the next action.

If the session is gone, URL is wrong, or effects are unknown, stop. Code Mode
stores commit only on successful script completion, so after a hard timeout a
stored report may lag the browser. Inspect before deciding what remains; never
resume an unknown submission from a stale receipt.

## Progress and cleanup

The toggle loop keys its no-progress guard by **action + target + relevant state
+ remaining obligations**. A second Cancel or capture of a different checkpoint
is not automatically a loop. Make readiness checks before judging progress.

Both examples leave handoffs open and close only their own successful sessions.
A failed close after verified effects is `cleanupError`, not workflow failure
and not permission to replay it. Report cleanup separately and retry only cleanup.
