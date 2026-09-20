#!/usr/bin/env bash

set -euo pipefail

mode=${1:-switch}

case $mode in
  switch|new) ;;
  *)
    printf 'spaces: usage: %s [switch|new]\n' "$0" >&2
    exit 2
    ;;
esac

PATH="${PATH:-}:/opt/homebrew/bin:/usr/local/bin:${HOME}/.dotfiles/bin:${HOME}/bin:${HOME}/.local/bin"
export PATH

for dependency in herdr fzf jq; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    printf 'spaces: %s not found on PATH\n' "$dependency" >&2
    exit 1
  fi
done

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
