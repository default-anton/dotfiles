#!/usr/bin/env bash

set -euo pipefail

background=false
log_file=
if [ "${1:-}" = --background ]; then
  background=true
  log_file=$2
  shift 2
fi

if [ "$#" -gt 1 ]; then
  printf 'Usage: %s [feature-or-pr-url]\n' "$0" >&2
  exit 2
fi

record_url=${1:-}
if [ "$#" -eq 0 ]; then
  printf 'Create an Aha! feature or GitHub PR space\n\nPaste the feature or pull request URL. Leave blank or press Ctrl+C to cancel.\n\n'
  IFS= read -e -r -p 'Feature or PR URL: ' record_url || exit 0
fi
[ -n "$record_url" ] || exit 0

finish() {
  local status=$?

  if [ "$background" = true ]; then
    if [ "$status" -eq 0 ]; then
      herdr notification show 'Space ready' --body "${branch:-$record_url}" --sound none || true
    else
      printf '\nSpace creation failed (exit %s).\n' "$status" >&2
      herdr notification show 'Space creation failed' --body "See $log_file" --sound none || true
    fi
    exit "$status"
  fi
  if [ "$status" -eq 130 ]; then
    exit "$status"
  fi
  if [ "$status" -ne 0 ]; then
    printf '\nSpace creation failed. See the error above.\n' >&2
  fi
  if [ "$status" -ne 0 ] && [ -t 0 ]; then
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

case "$record_url" in
  https://big.aha.io/*) url_kind=feature ;;
  https://github.com/*/*/pull/[0-9]*) url_kind=pr ;;
  *)
    printf 'Expected an Aha! feature URL or GitHub pull request URL.\n' >&2
    exit 2
    ;;
esac

dependencies=(git wt jq herdr)
if [ "$url_kind" = pr ]; then
  dependencies+=(gh)
fi

for dependency in "${dependencies[@]}"; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    printf 'Required command not found on PATH: %s\n' "$dependency" >&2
    exit 1
  fi
done

if [ "$background" = false ]; then
  log_directory="${XDG_STATE_HOME:-$HOME/.local/state}/herdr"
  mkdir -p "$log_directory"
  log_file=$(mktemp "$log_directory/feature-space.XXXXXX")
  nohup bash "$0" --background "$log_file" "$record_url" >"$log_file" 2>&1 </dev/null &
  exit 0
fi

repo_root="$HOME/code/aha-app"
cd "$repo_root"
printf '\nResolving branch...\n'
if [ "$url_kind" = pr ]; then
  branch=$(gh pr view "$record_url" --json headRefName --jq .headRefName)
else
  branch=$(./script/branch_name_for_aha_record.sh "$record_url")
fi
if [[ "$branch" == -* ]] || ! git check-ref-format --branch "$branch" >/dev/null; then
  printf 'Could not resolve a branch from this URL. Check the URL and your credentials.\n' >&2
  exit 2
fi

worktree_path=$(git worktree list --porcelain -z | jq -Rrs --arg branch "refs/heads/$branch" '
  [split("\u0000\u0000")[] | split("\u0000")
    | select(index("branch " + $branch))
    | .[0] | ltrimstr("worktree ")][0] // empty
')

if [ -n "$worktree_path" ]; then
  panes=$(herdr pane list)
  workspace_id=$(jq -r --arg path "$worktree_path" '
    [.result.panes[]
      | (.foreground_cwd // .cwd // "") as $cwd
      | select($cwd == $path or ($cwd | startswith($path + "/")))
      | .workspace_id][0] // empty
  ' <<< "$panes")
  if [ -n "$workspace_id" ]; then
    printf '\nWorktree: %s\nExisting workspace: %s (focus unchanged)\n' "$worktree_path" "$workspace_id"
    exit 0
  fi
else
  printf 'Preparing worktree for %s...\n' "$branch"
  if [ "$url_kind" = pr ]; then
    switch_result=$(wt -C "$repo_root" --yes switch --format json --no-cd "$record_url")
  elif git show-ref --verify --quiet "refs/heads/$branch" ||
    git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    switch_result=$(wt -C "$repo_root" --yes switch --format json --no-cd "$branch")
  else
    switch_result=$(wt -C "$repo_root" --yes switch --create --base master --format json --no-cd "$branch")
  fi
  worktree_path=$(jq -er '.path' <<< "$switch_result")
fi

printf 'Creating workspace...\n'
workspace_result=$(herdr workspace create --cwd "$worktree_path" --label "$branch" --no-focus)
jq -e '.result.workspace' <<< "$workspace_result" >/dev/null

printf '\nWorktree: %s\nWorkspace: %s\n' "$worktree_path" "$branch"
