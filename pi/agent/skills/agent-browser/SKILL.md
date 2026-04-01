---
name: agent-browser
description: >
  Browser automation CLI for AI agents. Use when you must interact with a live page:
  open sites, click/fill forms, log in, capture screenshots/PDFs, extract data, debug,
  or test web apps. For simple “fetch the page content”, prefer `read_web_page <url>`.
allowed-tools: Bash(npx agent-browser:*), Bash(agent-browser:*)
---

# agent-browser

## Default loop

1. `agent-browser open <url>`
2. `agent-browser wait --load networkidle` (or `wait --url ...` / `wait --text ...` / `wait <selector>`)
3. `agent-browser snapshot -i` (`--json` if you need machine parsing)
4. Interact using refs: `@e1`, `@e2`, ...
5. Re-run `snapshot -i` after any navigation or DOM change. Old refs expire.

## Minimal cheat sheet

```bash
# Navigate + inspect
agent-browser open https://example.com
agent-browser wait --load networkidle
agent-browser snapshot -i

# Interact
agent-browser click @e1
agent-browser fill @e2 "text"
agent-browser type @e2 "more"
agent-browser select @e3 "Option"
agent-browser check @e4
agent-browser upload @e5 ./file.pdf
agent-browser frame @e6        # Scope to an iframe when needed
agent-browser press Enter
agent-browser dialog status

# Extract + capture
agent-browser get text @e6
agent-browser get url
agent-browser screenshot --annotate out.png
agent-browser screenshot --full page.png
agent-browser pdf out.pdf
agent-browser console
agent-browser errors

# JS / debugging
agent-browser eval --stdin <<'JS'
document.title
JS
agent-browser diff snapshot
```

## Auth / state

- Anton’s existing Chrome: `agent-browser --auto-connect state save auth.json`
- Reuse state across runs: `agent-browser --session-name myapp open ...`
- Keep credentials out of the transcript: `echo "$PASSWORD" | agent-browser auth save myapp --url https://app.example.com/login --username "$USERNAME" --password-stdin && agent-browser auth login myapp`

## Rules

- Prefer `wait --url/--text/--load` over sleeps.
- Prefer refs from `snapshot -i` over brittle selectors once the page is open.
- Iframe content is inlined into `snapshot -i`; refs inside iframes work directly. Use `frame @eN` only when you want a scoped snapshot.
- `alert` and `beforeunload` auto-accept by default; handle `confirm`/`prompt` explicitly with `dialog ...` or disable with `--no-auto-dialog`.
- Use `&&` only when you do not need intermediate output.
- Put secrets in env vars / stdin. State files are sensitive: gitignore them and delete when done.
- Use `--auto-connect` when Anton asks to use his existing Chrome session.

## Deep dives

- `references/commands.md` — command surface
- `references/snapshot-refs.md` — ref lifecycle + troubleshooting
- `references/authentication.md` — login/2FA/state/auth vault
- `references/session-management.md` — sessions/state
- `references/video-recording.md` — headed/recording workflows
- `references/profiling.md` — traces/profiles
- `references/proxy-support.md` — proxies/geo testing

Templates: `templates/*.sh`
