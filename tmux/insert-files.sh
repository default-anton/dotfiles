#!/usr/bin/env bash

set -euo pipefail

pane_id=${1:-}

if [ -z "$pane_id" ]; then
  printf 'Usage: %s <pane-id>\n' "$0" >&2
  exit 2
fi

PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.dotfiles/bin:${HOME}/bin:${HOME}/.local/bin:${PATH:-}"
export PATH

report_error() {
  local message=$1

  if command -v tmux >/dev/null 2>&1; then
    tmux display-message "$message"
  fi

  printf '%s\n' "$message" >&2
}

require_command() {
  local command_name=$1

  if command -v "$command_name" >/dev/null 2>&1; then
    return 0
  fi

  report_error "insert-files: $command_name not found on PATH"
  exit 1
}

require_command tmux
require_command fd

file_command=(fd --type f --hidden --follow --exclude .git)
dir_command=(fd --type d --hidden --follow --exclude .git)

if [ "${TMUX_INSERT_FILES_SELECTION+x}" = x ]; then
  selection=$TMUX_INSERT_FILES_SELECTION
else
  require_command fzf

  set +e
  selection=$("${file_command[@]}" | fzf \
    -m \
    --border \
    --layout=reverse-list \
    --style=minimal \
    --prompt 'files> ' \
    --bind "ctrl-d:reload(${dir_command[*]})+change-prompt(dirs> )" \
    --bind "ctrl-f:reload(${file_command[*]})+change-prompt(files> )")
  status=$?
  set -e

  case $status in
    0) ;;
    1|130) exit 0 ;;
    *) exit $status ;;
  esac
fi

if [ -z "$selection" ]; then
  exit 0
fi

selections=()
while IFS= read -r path; do
  selections+=("$path")
done <<< "$selection"
inserted=''

for path in "${selections[@]}"; do
  [ -n "$path" ] || continue
  printf -v escaped_path '%q ' "$path"
  inserted+="$escaped_path"
done

if [ -z "$inserted" ]; then
  exit 0
fi

tmux send-keys -t "$pane_id" -l "$inserted"
