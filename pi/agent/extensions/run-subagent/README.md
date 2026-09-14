# Run subagent

Runs interactive Pi children in Herdr panes. Children share the parent's working
directory; this extension does not create worktrees.

## Terminal selection

- **Inside Herdr:** create a `subagents` tab in the caller's workspace and split
  it for concurrent children. Keep the caller's focus.
- **Outside Herdr:** reuse the named `pi-subagents` session, starting a detached
  headless server on the first call if needed. Each parent Pi session gets its
  own workspace. Concurrent children share that workspace.
- **Broken Herdr context:** report an error rather than silently switching to
  another server.

Watch fallback runs from another terminal:

```sh
herdr session attach pi-subagents
```

The fallback forwards the parent's environment to each Pi child while retaining
the new pane's Herdr and terminal context. Children do not inherit credentials
from whichever parent first started the shared server.

Completed and cancelled runs close their child panes. Empty, extension-owned
fallback workspaces are removed; user-added panes are left alone. Parent shutdown
cancels that parent's pending runs. The shared server stays running for reuse.
Only stop it when no other parent needs it:

```sh
herdr session stop pi-subagents
```

## Checks

From the repository root:

```sh
node --test pi/agent/extensions/run-subagent/test/*.test.ts
HERDR_SMOKE_TEST=1 node --test pi/agent/extensions/run-subagent/test/herdr-smoke.test.ts
```

The opt-in smoke test needs Herdr and Pi on `PATH`. It creates an isolated
headless session, starts eight offline Pi processes without prompts or model
requests, and removes its session data after stopping its server.

## Model selection and failures

Overrides accept an exact available model ID or `provider/model`, optionally
followed by a thinking level such as `:high`. Bare IDs must identify one
available model; ambiguous IDs require a provider. Fuzzy names and unavailable
models fail before a pane opens. References containing `/` must include the
provider (for example, `openrouter/openai/model`). Without an override, the child inherits the
parent model and thinking level.

Exact model IDs take precedence over thinking suffixes, including IDs that
contain colons. The launcher passes the canonical model and `--thinking`
separately to avoid Pi's fuzzy suffix resolution. Supported thinking levels are
`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`.

The child checks model selection and authentication before its initial prompt
and writes failures to the parent result before requesting shutdown. A shutdown
without a model result reports a startup/prompt-preparation failure rather than
claiming cancellation. Errors outside that preflight may lack their original
TUI diagnostic; model-reported and parent-requested cancellation remain aborted.

Reload extensions with `/reload` in an existing parent Pi session after updates.
