# Extension Rules

- No top-level or event `console.log`/`console.error` (breaks RPC). Use `ctx.ui.notify` for feedback.
- If you see `MaxListenersExceededWarning` involving `AbortSignal` during long-running subagent tools: temporarily bump Node EventTarget listener limit via `node:events` `events.setMaxListeners(N)` around the tool execution; restore afterward.
