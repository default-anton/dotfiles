## Code Consistency
**MANDATORY - Non-negotiable rule**: Never create new files in isolation.

Before creating ANY new file (model, controller, test, component, etc.), you MUST:
1. Examine 2-3 existing files of the same type to identify established patterns
2. Match their structure, style, and conventions exactly

Exception: ad hoc one-off artifacts (e.g., RCA write-ups, investigation notes, planning docs) — no pattern review required; keep them token-efficient.

Code comments should be minimal, professional, and strictly high-value, avoiding conversational filler or explanations of obvious logic, assuming a senior developer audience.

## Available CLI Tools
ast-grep, direnv, fd, fzf, gcc, gh, git, go, jq, mise, ripgrep, uv, tmux.

## Add .gemini/settings In The CWD When I Ask To Install Gemini

.gemini/settings:
```json
{
  "general": {
    "preferredEditor": "nvim",
    "previewFeatures": true
  }
}
```
