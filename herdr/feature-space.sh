#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -gt 1 ]; then
  printf 'Usage: %s [feature-url]\n' "$0" >&2
  exit 2
fi

feature_url=${1:-}
if [ "$#" -eq 0 ]; then
  printf 'Create an Aha! feature space\n\nPaste the feature URL. Leave blank or press Ctrl+C to cancel.\n\n'
  IFS= read -e -r -p 'Feature URL: ' feature_url || exit 0
fi
[ -n "$feature_url" ] || exit 0

finish() {
  local status=$?

  if [ "$status" -eq 130 ]; then
    exit "$status"
  fi
  if [ "$status" -ne 0 ]; then
    printf '\nFeature space creation failed. See the error above.\n' >&2
  fi
  if [ -t 0 ]; then
    printf '\nPress Enter to close.'
    IFS= read -r _ || true
  fi
  exit "$status"
}

trap finish EXIT
trap 'exit 130' INT

PATH="${PATH:-}:${HOME}/.local/share/mise/shims:/opt/homebrew/bin:/usr/local/bin:${HOME}/.dotfiles/bin:${HOME}/bin:${HOME}/.local/bin"
export PATH

if [ "${HERDR_ENV:-}" != 1 ]; then
  printf 'Run this command inside Herdr.\n' >&2
  exit 1
fi

case "$feature_url" in
  https://big.aha.io/*) ;;
  *)
    printf 'Expected an Aha! feature URL starting with https://big.aha.io/\n' >&2
    exit 2
    ;;
esac

for dependency in git wt jq herdr; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    printf 'Required command not found on PATH: %s\n' "$dependency" >&2
    exit 1
  fi
done

repo_root="$HOME/code/aha-app"
cd "$repo_root"
printf '\nResolving feature branch...\n'
branch=$(./script/branch_name_for_aha_record.sh "$feature_url")
if [[ "$branch" == -* ]] || ! git check-ref-format --branch "$branch" >/dev/null; then
  printf 'Could not resolve a branch from this URL. Check the URL and your Aha! credentials.\n' >&2
  exit 2
fi

printf 'Preparing worktree for %s...\n' "$branch"
if git show-ref --verify --quiet "refs/heads/$branch" ||
  git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
  switch_result=$(wt -C "$repo_root" --yes switch --format json --no-cd "$branch")
else
  switch_result=$(wt -C "$repo_root" --yes switch --create --base master --format json --no-cd "$branch")
fi
worktree_path=$(jq -er '.path' <<< "$switch_result")

printf 'Creating workspace...\n'
workspace_result=$(herdr workspace create --cwd "$worktree_path" --label "$branch" --no-focus)
jq -e '.result.workspace' <<< "$workspace_result" >/dev/null

printf '\nWorktree: %s\nWorkspace: %s\n' "$worktree_path" "$branch"
