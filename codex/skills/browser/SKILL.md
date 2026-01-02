---
name: browser
description: Minimal Chrome DevTools Protocol tools for browser automation and scraping. Use when you need to start Chrome, navigate pages, execute JavaScript, take screenshots, or interactively pick DOM elements.
---

# Browser Tools

Minimal CDP tools for collaborative site exploration and scraping.

**IMPORTANT**: All scripts are located in `~/.codex/skills/browser/` and must be called with full paths.

## Setup

Assume packages are already installed. If not, run once:

```bash
cd ~/.codex/skills/browser/
npm install
```

## Start Chrome

```bash
~/.codex/skills/browser/start.js              # Fresh profile
~/.codex/skills/browser/start.js --profile    # Copy user's profile (cookies, logins)
```

Start Chrome on `:9222` with remote debugging.

## Navigate

```bash
~/.codex/skills/browser/nav.js https://example.com
~/.codex/skills/browser/nav.js https://example.com --new
```

Navigate current tab or open new tab.

## Evaluate JavaScript

```bash
~/.codex/skills/browser/eval.js 'document.title'
~/.codex/skills/browser/eval.js 'document.querySelectorAll("a").length'
```

Execute JavaScript in active tab. Code is wrapped in `return (${code})` — expressions or IIFE for multiple statements:

```bash
# ✅ Works
~/.codex/skills/browser/eval.js 'document.title'
~/.codex/skills/browser/eval.js '(() => { const x = 1; return x + 1; })()'

# ❌ Fails
~/.codex/skills/browser/eval.js 'const btn = document.querySelector("button")'
```

## Screenshot

```bash
~/.codex/skills/browser/screenshot.js
```

Screenshot current viewport, returns temp file path.

## Pick Elements

```bash
~/.codex/skills/browser/pick.js "Click the submit button"
```

**IMPORTANT**: Use this tool when the user wants to select specific DOM elements on the page. This launches an interactive picker that lets the user click elements to select them. The user can select multiple elements (Cmd/Ctrl+Click) and press Enter when done. The tool returns CSS selectors for the selected elements.

Common use cases:
- User says "I want to click that button" → Use this tool to let them select it
- User says "extract data from these items" → Use this tool to let them select the elements
- When you need specific selectors but the page structure is complex or ambiguous

## Cookies

```bash
~/.codex/skills/browser/cookies.js
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
sleep 0.5 && ~/.codex/skills/browser/screenshot.js
```
