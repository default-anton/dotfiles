#!/usr/bin/env bash

set -euo pipefail

mode=${1:-switch}

case $mode in
  switch|new) ;;
  open)
    if [ "$#" -ne 2 ] || [ ! -d "$2" ]; then
      printf 'spaces: open requires a project directory\n' >&2
      exit 2
    fi
    ;;
  *)
    printf 'spaces: usage: %s [switch|new|open DIRECTORY]\n' "$0" >&2
    exit 2
    ;;
esac

PATH="${PATH:-}:/opt/homebrew/bin:/usr/local/bin:${HOME}/.dotfiles/bin:${HOME}/bin:${HOME}/.local/bin"
export PATH

dependencies=(herdr jq)
[ "$mode" = open ] || dependencies+=(fzf)

for dependency in "${dependencies[@]}"; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    printf 'spaces: %s not found on PATH\n' "$dependency" >&2
    exit 1
  fi
done

if [ "$mode" = open ]; then
  project_path=$(cd "$2" && pwd -P)
  panes=$(herdr pane list)
  workspace_id=$(jq -r --arg path "$project_path" '
    [.result.panes[]
      | (.foreground_cwd // .cwd // "") as $cwd
      | select($cwd == $path or ($cwd | startswith($path + "/")))
      | .workspace_id][0] // empty
  ' <<< "$panes")

  if [ -n "$workspace_id" ]; then
    herdr workspace focus "$workspace_id" >/dev/null
  else
    herdr workspace create --cwd "$project_path" --label "${project_path##*/}" --focus >/dev/null
  fi
  exit 0
fi

project_directories() {
  local path

  for path in "$HOME/.dotfiles" "$HOME"/code/*; do
    [ -d "$path" ] || continue
    printf '%s\0' "${path#"$HOME"/}"
  done
}

case $mode in
  switch)
    workspaces=$(herdr workspace list)
    candidates=$(jq -r '.result.workspaces[] | [.workspace_id, .label] | @tsv' <<< "$workspaces")
    picker=(fzf --delimiter=$'\t' --with-nth=2.. --prompt 'spaces> ')
    ;;
  new)
    picker=(fzf --read0 --prompt 'new space> ')
    ;;
esac

set +e
case $mode in
  switch)
    selection=$(printf '%s\n' "$candidates" | "${picker[@]}" --no-multi --border --layout=reverse-list --style=minimal)
    ;;
  new)
    selection=$(project_directories | "${picker[@]}" --no-multi --border --layout=reverse-list --style=minimal)
    ;;
esac
status=$?
set -e

case $status in
  0) ;;
  1|130) exit 0 ;;
  *) exit "$status" ;;
esac

[ -n "$selection" ] || exit 0

case $mode in
  switch)
    herdr workspace focus "${selection%%$'\t'*}" >/dev/null
    ;;
  new)
    herdr workspace create --cwd "$HOME/$selection" --label "${selection##*/}" --focus >/dev/null
    ;;
esac
