---
name: browser
description: Minimal Chrome DevTools Protocol tools for browser automation and scraping. Use when you need to start Chrome, navigate pages, execute JavaScript, or take screenshots.
---

# Browser Tools

Minimal CDP tools for collaborative site exploration and scraping.

**IMPORTANT**: All scripts are located in `~/.codex/skills/browser/scripts/` and must be called with full paths.

## Setup

Assume packages are already installed. If not, run once:

```bash
cd ~/.codex/skills/browser/
npm install
```

## Start Chrome

```bash
~/.codex/skills/browser/scripts/start.js              # Fresh profile
~/.codex/skills/browser/scripts/start.js --profile    # Copy user's profile (cookies, logins)
```

Start Chrome on `:9222` with remote debugging.

## Navigate

```bash
~/.codex/skills/browser/scripts/nav.js https://example.com
~/.codex/skills/browser/scripts/nav.js https://example.com --new
```

Navigate current tab or open new tab. Console capture is automatically injected to retain logs for later retrieval.

## Evaluate JavaScript

```bash
~/.codex/skills/browser/scripts/eval.js 'document.title'
~/.codex/skills/browser/scripts/eval.js 'document.querySelectorAll("a").length'
```

Execute JavaScript in active tab. Code is wrapped in `return (${code})` — expressions or IIFE for multiple statements:

```bash
# ✅ Works
~/.codex/skills/browser/scripts/eval.js 'document.title'
~/.codex/skills/browser/scripts/eval.js '(() => { const x = 1; return x + 1; })()'

# ❌ Fails
~/.codex/skills/browser/scripts/eval.js 'const btn = document.querySelector("button")'
```

## Screenshot

```bash
~/.codex/skills/browser/scripts/screenshot.js
```

Screenshot current viewport, returns temp file path.

## Console Logs

```bash
~/.codex/skills/browser/scripts/console.js
```

Display console messages from the current tab. Shows all logs captured since navigation (via `nav.js`).

## Cookies

```bash
~/.codex/skills/browser/scripts/cookies.js
```

Display all cookies for the current tab including domain, path, httpOnly, and secure flags. Use this to debug authentication issues or inspect session state.

## When to Use

- Testing frontend code in a real browser
- Interacting with pages that require JavaScript
- When user needs to visually see or interact with a page
- Debugging authentication or session issues

## Troubleshooting

### Timing
Add `sleep` between operations for UI updates:
```bash
sleep 0.5 && ~/.codex/skills/browser/scripts/screenshot.js
```
