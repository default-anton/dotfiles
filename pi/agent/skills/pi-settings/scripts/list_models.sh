#!/usr/bin/env bash

set -euo pipefail

sub="${1:-}"
if [[ -z "$sub" ]]; then
  echo "usage: $(basename "$0") <substring>" >&2
  exit 2
fi

printf '{"id":"m1","type":"get_available_models"}\n' \
  | pi --mode rpc --no-session \
  | jq --arg sub "$sub" '
      select(.type=="response" and .id=="m1")
      | [ .data.models[]
          | select(("\(.provider)/\(.id)" | ascii_downcase) | contains($sub | ascii_downcase))
        ]
    '
