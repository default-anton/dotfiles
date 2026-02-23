---
name: agent-browser
description: >
  Browser automation CLI for AI agents. Use when you must interact with a live page
  (click/type/scroll/login/screenshot). For simple “fetch the page content”, prefer
  `read_web_page <url>`.
allowed-tools: Bash(npx agent-browser:*), Bash(agent-browser:*)
---

# agent-browser (browser automation)

## Default loop (don’t fight it)

1. `agent-browser open <url>`
2. `agent-browser wait --load networkidle` (or `wait @e…`)
3. `agent-browser snapshot -i` → get refs `@e1`, `@e2`, …
4. Interact using refs (`click/fill/select/check/...`).
5. Re-run `snapshot -i` after any navigation/DOM change (refs invalidate).

## Minimal cheat sheet

```bash
# Navigate + inspect
agent-browser open https://example.com
agent-browser wait --load networkidle
agent-browser snapshot -i            # add --json for machine parsing

# Interact (use @e… from snapshot)
agent-browser click @e1
agent-browser fill @e2 "text"        # clears then types
agent-browser type @e2 "text"        # appends
agent-browser select @e3 "Option"
agent-browser check @e4
agent-browser scroll down 600
agent-browser press Enter

# Extract + capture
agent-browser get text @e5
agent-browser screenshot --full out.png
agent-browser pdf out.pdf

# Persistence
agent-browser --session-name myapp open https://app.example.com
agent-browser state save auth.json
agent-browser state load auth.json

# JS (avoid shell-escaping problems)
agent-browser eval --stdin <<'JS'
document.title
JS

agent-browser close
```

## Rules (practical)

- **Always** `snapshot -i` again after clicks that navigate, form submits, modals, or lazy loads.
- Prefer `wait --url "**/path"` or `wait --load networkidle` over arbitrary sleeps.
- Credentials: pass via env vars (`$USERNAME`, `$PASSWORD`), don’t hardcode.

## Deep dives

- `references/commands.md` — full command surface
- `references/snapshot-refs.md` — ref lifecycle + troubleshooting
- `references/session-management.md` — sessions/state
- `references/authentication.md` — login/2FA patterns
- `references/video-recording.md` — headed/recording workflows
- `references/proxy-support.md` — proxies/geo testing

Templates: `templates/*.sh` (ready-to-run workflows).
