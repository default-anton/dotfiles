#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_DIR="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
REPO_URL="https://github.com/vercel-labs/agent-browser.git"
TMP_DIR=

fail() {
  printf 'update-agent-browser: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
}

cleanup() {
  if [[ -n "${TMP_DIR}" && -d "${TMP_DIR}" ]]; then
    rm -rf "${TMP_DIR}"
  fi
}

trap cleanup EXIT

for command_name in awk git mise mktemp rsync; do
  require_command "${command_name}"
done

version="$({
  git ls-remote --tags --sort='version:refname' "${REPO_URL}" |
    awk -F/ '/refs\/tags\/v[0-9]/{tag=$3} END { sub(/\^\{\}$/, "", tag); print tag }'
} )"

[[ -n "${version}" ]] || fail "could not determine latest release tag"

expected_version="${version#v}"

echo "[agent-browser] installing CLI"
mise use --global "npm:agent-browser@${expected_version}"

resolved_agent_browser="$(mise which agent-browser)"
[[ -x "${resolved_agent_browser}" ]] || fail "mise did not resolve agent-browser"
resolved_version="$("${resolved_agent_browser}" --version | awk '{print $2}')"
[[ "${resolved_version}" == "${expected_version}" ]] || fail "installed CLI ${resolved_version}, expected ${expected_version}"
echo "[agent-browser] installed CLI ${resolved_version} at ${resolved_agent_browser}"

TMP_DIR="$(mktemp -d /tmp/agent-browser-skill.XXXXXX)"
echo "[agent-browser] cloning ${REPO_URL} @ ${version}"
git clone --depth 1 --branch "${version}" "${REPO_URL}" "${TMP_DIR}"

UPSTREAM_SKILL_DIR="${TMP_DIR}/skills/agent-browser"
[[ -d "${UPSTREAM_SKILL_DIR}/references" ]] || fail "missing upstream references directory"
[[ -d "${UPSTREAM_SKILL_DIR}/templates" ]] || fail "missing upstream templates directory"

echo "[agent-browser] syncing references"
rsync -a --delete "${UPSTREAM_SKILL_DIR}/references/" "${SCRIPT_DIR}/references/"

echo "[agent-browser] syncing templates"
rsync -a --delete "${UPSTREAM_SKILL_DIR}/templates/" "${SCRIPT_DIR}/templates/"
chmod +x "${SCRIPT_DIR}"/templates/*.sh || true

echo "[agent-browser] reinstalling local pi config"
(
  cd "${DOTFILES_DIR}"
  ./install --no-brew
)

echo "[agent-browser] updated to ${version}"
