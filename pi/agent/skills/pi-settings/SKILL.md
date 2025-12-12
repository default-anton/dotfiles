---
description: List available Pi models and set default provider/model/thinking level
---

# Pi: update agent defaults (provider/model/thinking)

Paths:
- List models: `{baseDir}/scripts/list_models.sh`
- Set defaults: `{baseDir}/scripts/set_default_model.sh`
- Config: `~/.pi/agent/settings.json` (`defaultProvider`, `defaultModel`, `defaultThinkingLevel`)

## Find a model
- CLI (filtered, JSON array): `{baseDir}/scripts/list_models.sh <substring>`

Pick `provider` + `id` from one object.

## Update default provider/model (+ optional thinking level)
Run: `{baseDir}/scripts/set_default_model.sh <provider> <modelId> [thinkingLevel]`

Thinking level allowed values: `off`, `minimal`, `low`, `medium`, `high`.

Or edit `~/.pi/agent/settings.json`:
```json
{
  "defaultProvider": "openai",
  "defaultModel": "gpt-4o-mini",
  "defaultThinkingLevel": "medium"
}
```
