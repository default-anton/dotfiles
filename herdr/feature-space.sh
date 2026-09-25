#!/usr/bin/env bash

set -euo pipefail

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

record_url=${record_url%%\?*}
record_url=${record_url%%\#*}
record_url=${record_url%/}
if [[ "$record_url" =~ ^https://github.com/([^/]+)/([^/]+)/pull/([0-9]+)(/.*)?$ ]]; then
  url_kind=pr
  repository=$(printf '%s/%s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" | tr '[:upper:]' '[:lower:]')
  pr_number=${BASH_REMATCH[3]}
  record_url="https://github.com/$repository/pull/$pr_number"
elif [[ "$record_url" == https://big.aha.io/* ]] &&
  [[ "${record_url##*/}" =~ ^([A-Za-z]+-[A-Za-z0-9]+-[0-9]+|[A-Za-z]+-[0-9]+(-[0-9]+)?|[0-9]+)$ ]]; then
  url_kind=feature
else
  printf 'Expected an Aha! feature URL or GitHub pull request URL.\n' >&2
  exit 2
fi

dependencies=(git jq herdr)
if [ "$url_kind" = pr ]; then
  dependencies+=(gh)
fi
for dependency in "${dependencies[@]}"; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    printf 'Required command not found on PATH: %s\n' "$dependency" >&2
    exit 1
  fi
done

repo_root="$HOME/code/aha-app"
cd "$repo_root"
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
    herdr workspace focus "$workspace_id" >/dev/null
    exit 0
  fi
fi

if [ "$url_kind" = pr ]; then
  printf -v setup_command 'wt switch %q' "$record_url"
elif git show-ref --verify --quiet "refs/heads/$branch" ||
  git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
  printf -v setup_command 'wt switch %q' "$branch"
else
  printf -v setup_command 'wt switch --create --base master %q' "$branch"
fi

workspace_result=$(herdr workspace create --cwd "$repo_root" --focus)
pane_id=$(jq -er '.result.root_pane.pane_id' <<< "$workspace_result")
herdr pane run "$pane_id" "$setup_command" >/dev/null
