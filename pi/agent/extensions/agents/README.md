# Agents

The extension runs persisted Pi workers in Herdr tabs. Workers share the working
tree; assign separate file ownership when running implementation tasks in parallel.

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

Keep the returned session and run IDs. Do independent work, then collect the result:

```js
text(await tools.agents({
  action: "wait",
  targets: [{ session: worker.session, run: worker.run }],
  until: "all",
  timeoutMs: 60000,
}));
```

`targets` accepts up to 32 exact session/run pairs. `until: "any"` waits for any
terminal run; `all` waits for every run to finish, fail, or stop. Neither means
“all successful.” Questions and UI blocks return early. Read `reason`, `events`,
and each entry in `runs`, not just the aggregate `status`.

`until: "message"` receives the next available event. Omitting targets receives
from the entire inbox and defaults to this condition. `timeoutMs: 0` receives
immediately. Other waits default to 60 seconds and allow up to one hour. A wait
does not hold the worker's mutation queue, so sending and stopping remain possible.
Only one wait can be active in a recipient session.

Routine updates stay buffered during a completion wait. A return includes up to
64 events with a 256 KiB event-batch budget (one oversized event can still be
received); `more: true` means another receive can collect the remainder. Large
worker results retain their existing `outputPath` references.

## Background delegation

```js
text(await tools.agents({
  action: "start",
  name: "research",
  message: "Research the assigned topic and report your findings.",
  delivery: "automatic",
  notify: "followUp",
  lifetime: "session",
}));
```

End the parent turn to stay available to the user. Automatic inbox delivery wakes
the parent when communication arrives. `notify: "steer"` schedules at the next
boundary; `followUp` defers until the current work finishes. It is not quiet mode.

Existing start calls default to automatic delivery, steer scheduling, and turn
lifetime. Ending a turn normally does not stop workers.

Lifetime and delivery are independent:

- `turn`: a parent-turn abort stops workers it launched with this lifetime.
- `session`: work survives parent-turn aborts, but parent shutdown stops it.
- `stop`: explicitly aborts the target and preserves its tab and saved session.
- Wait timeout or cancellation of just the tool call does not stop workers.
  Aborting the parent turn still applies its lifetime policy.

## Switching delivery

```js
text(await tools.agents({
  action: "configure",
  targets: [{ session, run }],
  delivery: "manual",
}));
```

Configuration applies to delegations tracked by the calling session. It controls
both worker correspondence and final results. It can also change `notify`.
An active wait receives matching unread events before automatic delivery, without
changing the stored delivery policy. Automatic delivery resumes when the wait
ends. Already queued or delivered notifications cannot be recalled; configure
manual mode before waiting if duplicate observation of an already queued result
would be inconvenient.

## Tasks and correspondence

`send` defaults to `kind: "task"` for parents and `kind: "message"` for workers.

- `task`: assign follow-on work, reopening a saved worker when needed. Subscribe
  to its result and inherit its previous delivery policy unless overridden.
  Sending to a busy worker joins the current run; it does not create a separately
  awaitable result for every message. Only tasks accept `mode`, `delivery`,
  `notify`, and `lifetime`.
- `message`: send an update through the recipient's inbox without subscribing to
  the recipient's eventual final reply.
- `question`: send an actionable request. Completion waits return
  `reason: "needs_input"` with the question's event ID.
- `answer`: reply with `replyTo` set to a received question's ID. An answer to a
  managed worker resumes it if necessary and watches the resulting run. Keep
  the returned run handle: it can differ from the original run.

```js
text(await tools.agents({
  action: "send",
  session: question.from,
  kind: "answer",
  replyTo: question.id,
  message: "Preserve the existing API contract.",
}));
```

Unanswered questions remain actionable across receives until an answer is
accepted or their run fails or stops. Workers waiting for an answer can use
`wait` with `until: "message"` and no targets; answering wakes that receive rather
than leaving the answer queued behind the worker's wait.
Ordinary messages and questions require a live recipient. Their receipt
returns an event ID, not a promise that the recipient has processed them.
The recipient's inbox policy determines scheduling; a sender cannot override
manual delivery with `mode: "steer"`.

Workers cannot start or stop agents or assign new tasks. They can correspond,
inspect status, and receive inbox events.

## Persistence and recovery

A session identifies an agent; a run identifies a work interval; an event ID
identifies communication. `status` is a non-consuming snapshot. `wait` receives
unread events and includes run snapshots, even if completion was already received.

Events, subscriptions, and terminal results are persisted in private coordination
state. Delivery receipts live on the recipient's session branch. Results remain
available after successful worker tabs close. Push and wait share these receipts:
collecting an event prevents it from being newly pushed later.

This is recoverable delivery, not a claim of exactly-once delivery across crashes.
A wait can record receipt before its enclosing Code Mode call reports the result.
After uncertain delivery, use `wait` with the same targets and `replay: true` to
retrieve retained events, including previously received ones. Do not blindly
resend an assignment or answer. Replay returns chronological batches; when
`more` is true, pass its `cursor` as `after` on the next replay to continue.

Session navigation pauses delivery. Receipts follow the active branch, so events
may be received again after navigating to a branch without those receipts.
Existing completion watches from the previous extension version are retained;
previously delivered legacy result messages are recognized during migration.
Live sessions using the previous control protocol must reload before accepting
new tasks or correspondence; they are not silently reopened as duplicate writers.
