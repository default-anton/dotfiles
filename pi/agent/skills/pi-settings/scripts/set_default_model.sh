#!/usr/bin/env bash
set -euo pipefail

provider="${1:-}"
modelId="${2:-}"
thinking="${3:-}"

if [[ -z "$provider" || -z "$modelId" ]]; then
  echo "usage: $(basename "$0") <provider> <modelId> [thinkingLevel]" >&2
  exit 2
fi

if [[ -n "$thinking" ]]; then
  case "$thinking" in
    off|minimal|low|medium|high) ;;
    *)
      echo "invalid thinking level: $thinking (allowed: off|minimal|low|medium|high)" >&2
      exit 2
      ;;
  esac
fi

settings="${HOME}/.pi/agent/settings.json"

tmp="$(mktemp)"
if [[ -f "$settings" ]]; then
  jq --arg p "$provider" --arg m "$modelId" --arg t "$thinking" \
    '.defaultProvider=$p | .defaultModel=$m | (if $t=="" then . else .defaultThinkingLevel=$t end)' \
    "$settings" > "$tmp"
else
  jq -n --arg p "$provider" --arg m "$modelId" --arg t "$thinking" \
    '{defaultProvider:$p, defaultModel:$m} | (if $t=="" then . else . + {defaultThinkingLevel:$t} end)' \
    > "$tmp"
fi

cat "$tmp" > "$settings"
rm "$tmp"
echo "Updated $settings" >&2
echo "defaultProvider=$provider" >&2
echo "defaultModel=$modelId" >&2
if [[ -n "$thinking" ]]; then
  echo "defaultThinkingLevel=$thinking" >&2
fi
