#!/usr/bin/env bash

set -euo pipefail

pane_id=${HERDR_ACTIVE_PANE_ID:-}
herdr_bin=${HERDR_BIN_PATH:-}

if [ -z "$pane_id" ]; then
  printf 'insert-files: HERDR_ACTIVE_PANE_ID is not set\n' >&2
  exit 1
fi

PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.dotfiles/bin:${HOME}/bin:${HOME}/.local/bin:${PATH:-}"
export PATH

require_command() {
  local command_name=$1

  if command -v "$command_name" >/dev/null 2>&1; then
    return 0
  fi

  printf 'insert-files: %s not found on PATH\n' "$command_name" >&2
  exit 1
}

require_command fd

if [ -z "$herdr_bin" ]; then
  require_command herdr
  herdr_bin=$(command -v herdr)
fi

file_command=(fd --type f --hidden --follow --exclude .git)
dir_command=(fd --type d --hidden --follow --exclude .git)

if [ "${HERDR_INSERT_FILES_SELECTION+x}" = x ]; then
  selection=$HERDR_INSERT_FILES_SELECTION
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

shell_escape() {
  local path=$1

  if [[ $path =~ ^[[:alnum:]_@%+=:,./-]+$ ]]; then
    printf '%s' "$path"
  else
    printf '%q' "$path"
  fi
}

selections=()
while IFS= read -r path; do
  selections+=("$path")
done <<< "$selection"
inserted=''

for path in "${selections[@]}"; do
  [ -n "$path" ] || continue
  escaped_path=$(shell_escape "$path")
  inserted+="$escaped_path "
done

if [ -z "$inserted" ]; then
  exit 0
fi

"$herdr_bin" pane send-text "$pane_id" "$inserted"
