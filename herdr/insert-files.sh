#!/usr/bin/env bash

set -euo pipefail

pane_id=${HERDR_ACTIVE_PANE_ID:-}
mode=${1:-files}

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

require_command herdr
herdr_bin=$(command -v herdr)

case $mode in
  files)
    require_command fd
    file_command=(fd --type f --hidden --follow --exclude .git)
    dir_command=(fd --type d --hidden --follow --exclude .git)
    ;;
  changed)
    require_command git
    if ! git_prefix=$(git rev-parse --show-prefix 2>/dev/null); then
      printf 'insert-files: current directory is not inside a Git worktree\n' >&2
      exit 1
    fi
    ;;
  *)
    printf 'insert-files: usage: %s [files|changed]\n' "$0" >&2
    exit 2
    ;;
esac

changed_files() {
  local record status path

  while IFS= read -r -d '' record; do
    status=${record:0:2}
    path=${record:3}

    if [[ $status == *R* || $status == *C* ]]; then
      IFS= read -r -d '' path || return 1
    fi

    if [ -n "$git_prefix" ]; then
      case $path in
        "$git_prefix"*) path=${path#"$git_prefix"} ;;
      esac
    fi

    [[ $status == *D* ]] || printf '%s\0' "$path"
  done < <(git status --porcelain=v1 --untracked-files=all -z)
}

if [ "${HERDR_INSERT_FILES_SELECTION+x}" = x ]; then
  selection=$HERDR_INSERT_FILES_SELECTION
else
  require_command fzf

  set +e
  case $mode in
    files)
      selection=$("${file_command[@]}" | fzf \
        -m \
        --border \
        --layout=reverse-list \
        --style=minimal \
        --prompt 'files> ' \
        --bind "ctrl-d:reload(${dir_command[*]})+change-prompt(dirs> )" \
        --bind "ctrl-f:reload(${file_command[*]})+change-prompt(files> )")
      ;;
    changed)
      selection=$(changed_files | fzf \
        -m \
        --read0 \
        --border \
        --layout=reverse-list \
        --style=minimal \
        --prompt 'changed> ')
      ;;
  esac
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

response=$("$herdr_bin" pane send-text "$pane_id" "$inserted" 2>&1) || {
  status=$?
  printf 'insert-files: Herdr failed to send text:\n%s\n' "$response" >&2
  exit "$status"
}
