# Agents

Persisted Pi workers run in Herdr tabs and share the working tree. Assign separate
file ownership when delegating parallel implementation work.

## Quiet delegation

```js
const worker = await tools.agents({
  action: "start",
  name: "implementation",
  message: "Implement the assigned change and report what you checked.",
  delivery: "manual",
});
text(worker);
```

Keep the returned `session` UUID and opaque `run` handle. Pass handles unchanged:

```js
text(await tools.agents({
  action: "wait",
  targets: [worker.run],
  until: "all",
}));
```

`targets` accepts up to 32 distinct run handles. `all` waits for every run to
finish, fail, or stop; `any` waits for one. Questions and UI blocks return early.
Read `reason`, `events`, and individual `runs`, not just aggregate `status`.

Without targets, wait defaults to `until: "message"` and receives from the entire
inbox. With targets, it defaults to `all`. Routine updates stay buffered during
completion waits. `timeoutMs` defaults to 60000, permits up to one hour, and can
be zero for an immediate receive. A timeout or cancelled wait never stops workers.
Only one wait can be active per session.

## Background work and delivery

Use `delivery: "steer"` to wake the parent at the next boundary, then do independent
work or end your turn. This is the default; `manual` buffers events for wait.

```js
text(await tools.agents({
  action: "configure",
  targets: [worker.run],
  delivery: "manual",
}));
```

Only the session tracking a delegation can configure it. Delivery controls both
correspondence and final results. An active wait takes priority over new pushes;
already queued notifications cannot be recalled.

`lifetime: "turn"` (default) stops work when the parent turn is aborted.
`lifetime: "session"` survives that abort but not parent shutdown. Ending a turn
normally does not stop workers. `stop` explicitly aborts a session and preserves
its tab and saved session.

## Tasks and correspondence

All four actions below require a recipient `session` and `message`:

- `task`: assign more work and watch completion, reopening a saved worker if
  needed. Always steers at the next boundary. A busy worker joins its current run;
  the new instructions do not get a separately awaitable result. Delivery and
  lifetime inherit unless overridden.
- `message`: send an update without watching the recipient's eventual final reply.
- `question`: request a decision. Completion waits return `needs_input` with the
  question's event ID.
- `answer`: requires `replyTo`, the received question's ID. Can resume a managed
  worker and watch its result. Keep the returned run handle; it may change.

```js
text(await tools.agents({
  action: "answer",
  session: question.from,
  replyTo: question.id,
  message: "Preserve the existing API contract.",
}));
```

Messages and questions require a live recipient. Their returned event ID confirms
receipt, not processing. Correspondence follows the recipient's delivery policy.
Its optional `run` selects the sender's work interval, defaulting to the current
one. Workers cannot start, task, or stop agents.

Unanswered questions remain actionable until answered or their run fails/stops.
Workers awaiting an answer can wait without targets; answers wake that receive.

## Status and recovery

`status` accepts `session` for its latest run, or `run` for an exact snapshot.
It does not consume events. Successful tabs close, but results remain persisted.

Snapshots may include `contextUsage` (`tokens`, `contextWindow`, `percent`): live
estimates for active or idle sessions, saved estimates for terminal runs. Unknown
usage is omitted, or has null `tokens` and `percent`.

After uncertain delivery, do not blindly resend work or answers. Check status or
replay retained events:

```js
const batch = await tools.agents({
  action: "wait",
  targets: [worker.run],
  replay: true,
  timeoutMs: 0,
});
text(batch);
```

When `more` is true, continue with `replay: batch.cursor` and the same targets.
Receives return at most 64 events within a 256 KiB batch budget, allowing one
oversized event. Large results retain `outputPath` references.

Push and wait share persisted receipts, but delivery is not exactly-once across
crashes. Session navigation pauses delivery; receipts follow the active branch.
Run handles encode the persisted session/run identity and survive reloads without
an in-memory lookup. Existing subscriptions retain manual delivery; other legacy
delivery policies become steer. Live sessions on an older bridge protocol must
reload before accepting new tasks or correspondence.
