#!/usr/bin/env bash
set -euo pipefail

SUBWF_VERSION="0.1.0"
SUBWF_DEFAULT_TIMEOUT_SECONDS=$((4 * 60 * 60))
SUBWF_POLL_SECONDS=1

SUBWF_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUBWF_RUNNER="$SUBWF_SCRIPT_DIR/subwf-step-runner"
SUBWF_DEFAULT_EXTENSION="$(cd "$SUBWF_SCRIPT_DIR/../extensions" && pwd)/subagent-run-bridge.ts"

RUN_DIR="${SUBWF_RUN_DIR:-}"
JSON_OUTPUT=0
QUIET=0

usage() {
  cat <<'EOF'
Usage:
  subwf [global flags] <command> [args]

Commands:
  init [--tmux-session <name>]
  start <step-id> --prompt "..."|--prompt-file <file> [--ro|--rw] [--input <path>...]
  run <step-id> --prompt "..."|--prompt-file <file> [--ro|--rw] [--input <path>...] [--timeout <duration>]
  wait <step-id>... [--timeout <duration>]
  status [<step-id>...]
  paths <step-id>

Global flags:
  --run-dir <dir>
  --json
  -q, --quiet
  -h, --help
  --version

Durations: <number>[s|m|h], e.g. 30s, 20m, 4h
EOF
}

die() {
  local message="$1"
  local code="${2:-1}"
  echo "subwf: ${message}" >&2
  exit "$code"
}

require_cmd() {
  local name="$1"
  command -v "$name" >/dev/null 2>&1 || die "missing required command: ${name}" 5
}

validate_step_id() {
  local step_id="$1"
  [[ "$step_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "invalid step id '${step_id}'"
}

abs_path() {
  local value="$1"
  if [[ "$value" = /* ]]; then
    printf '%s\n' "$value"
  else
    printf '%s\n' "$PWD/${value#./}"
  fi
}

duration_to_seconds() {
  local value="$1"
  if [[ "$value" =~ ^([0-9]+)([smh]?)$ ]]; then
    local n="${BASH_REMATCH[1]}"
    local unit="${BASH_REMATCH[2]}"
    case "$unit" in
      ""|s) printf '%s\n' "$n" ;;
      m) printf '%s\n' "$((n * 60))" ;;
      h) printf '%s\n' "$((n * 60 * 60))" ;;
      *) die "invalid duration: ${value}" 2 ;;
    esac
    return
  fi
  die "invalid duration: ${value}" 2
}

ensure_run_layout() {
  mkdir -p "$RUN_DIR/artifacts" "$RUN_DIR/status" "$RUN_DIR/wrappers" "$RUN_DIR/meta"
}

require_initialized_run_dir() {
  [[ -n "$RUN_DIR" ]] || die "missing run dir. Run 'subwf init' first or set --run-dir / SUBWF_RUN_DIR" 6
  RUN_DIR="$(abs_path "$RUN_DIR")"
  [[ -d "$RUN_DIR/artifacts" && -d "$RUN_DIR/status" && -d "$RUN_DIR/wrappers" && -d "$RUN_DIR/meta" ]] || {
    die "run dir is not initialized: ${RUN_DIR}" 6
  }
}

get_run_id() {
  local file="$RUN_DIR/meta/run-id"
  if [[ -f "$file" ]]; then
    cat "$file"
    return
  fi

  local id
  id="$(date -u +"%Y%m%dT%H%M%SZ")-$(openssl rand -hex 4)"
  printf '%s\n' "$id" > "$file"
  printf '%s\n' "$id"
}

get_tmux_session_default() {
  local run_id="$1"
  local file="$RUN_DIR/meta/tmux-session"

  if [[ -f "$file" ]]; then
    cat "$file"
  elif [[ -n "${SUBWF_TMUX_SESSION:-}" ]]; then
    printf '%s\n' "$SUBWF_TMUX_SESSION"
  elif [[ -n "${TMUX:-}" ]]; then
    tmux display-message -p '#S'
  else
    printf 'subwf-%s\n' "$run_id"
  fi
}

persist_tmux_session() {
  local session="$1"
  printf '%s\n' "$session" > "$RUN_DIR/meta/tmux-session"
}

write_status_json() {
  local status_file="$1"
  local status="$2"
  local step_id="$3"
  local run_id="$4"
  local stop_reason="$5"
  local error_message="$6"
  local output_file="$7"

  local tmp="${status_file}.tmp.$$"
  jq -n \
    --arg status "$status" \
    --arg stepId "$step_id" \
    --arg runId "$run_id" \
    --arg stopReason "$stop_reason" \
    --arg errorMessage "$error_message" \
    --arg outputFile "$output_file" \
    --arg finishedAt "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    '{
      status: $status,
      stepId: $stepId,
      runId: $runId,
      stopReason: $stopReason,
      errorMessage: (if $errorMessage == "" then null else $errorMessage end),
      outputFile: $outputFile,
      finishedAt: $finishedAt
    }' > "$tmp"
  mv "$tmp" "$status_file"
}

status_row() {
  local step_id="$1"
  local artifact_file="$RUN_DIR/artifacts/${step_id}.md"
  local status_file="$RUN_DIR/status/${step_id}.status.json"

  if [[ ! -f "$status_file" ]]; then
    printf '%s\tpending\tunknown\t\t\t%s\t%s\n' "$step_id" "$artifact_file" "$status_file"
    return
  fi

  if ! jq -r --arg step "$step_id" --arg artifact "$artifact_file" --arg statusFile "$status_file" '
      [
        $step,
        (.status // "invalid"),
        (.stopReason // "unknown"),
        ((.errorMessage // "") | tostring | gsub("[\\t\\n\\r]"; " ")),
        (.finishedAt // ""),
        $artifact,
        $statusFile
      ] | @tsv
    ' "$status_file" 2>/dev/null; then
    printf '%s\tinvalid\tunknown\tinvalid status file\t\t%s\t%s\n' "$step_id" "$artifact_file" "$status_file"
  fi
}

rows_to_json() {
  jq -Rn '
    [inputs
      | select(length > 0)
      | split("\t")
      | {
          stepId: .[0],
          status: .[1],
          stopReason: .[2],
          errorMessage: (if .[3] == "" then null else .[3] end),
          finishedAt: (if .[4] == "" then null else .[4] end),
          artifactFile: .[5],
          statusFile: .[6]
        }
    ]
  '
}

create_step_wrapper() {
  local step_id="$1"
  local run_id="$2"
  local access_mode="$3"
  local capture_mode="$4"
  local prompt_file="$5"
  local artifact_file="$6"
  local status_file="$7"
  local extension_file="$8"
  local pi_bin="$9"
  local inputs_file="${10}"

  local wrapper_file="$RUN_DIR/wrappers/${step_id}.sh"
  {
    echo '#!/usr/bin/env bash'
    echo 'set -euo pipefail'
    printf 'export SUBWF_STEP_ID=%q\n' "$step_id"
    printf 'export SUBWF_RUN_ID=%q\n' "$run_id"
    printf 'export SUBWF_ACCESS_MODE=%q\n' "$access_mode"
    printf 'export SUBWF_CAPTURE_MODE=%q\n' "$capture_mode"
    printf 'export SUBWF_PROMPT_FILE=%q\n' "$prompt_file"
    printf 'export SUBWF_OUTPUT_FILE=%q\n' "$artifact_file"
    printf 'export SUBWF_STATUS_FILE=%q\n' "$status_file"
    printf 'export SUBWF_EXTENSION_FILE=%q\n' "$extension_file"
    printf 'export SUBWF_PI_BIN=%q\n' "$pi_bin"
    printf 'export SUBWF_INPUTS_FILE=%q\n' "$inputs_file"
    printf 'exec %q\n' "$SUBWF_RUNNER"
  } > "$wrapper_file"

  chmod +x "$wrapper_file"
  printf '%s\n' "$wrapper_file"
}

launch_in_tmux() {
  local session_name="$1"
  local window_name="$2"
  local wrapper_file="$3"

  require_cmd tmux
  local command
  command="bash -lc $(printf '%q' "$wrapper_file")"

  local window_id
  if tmux has-session -t "$session_name" 2>/dev/null; then
    window_id="$(tmux new-window -dP -F '#{window_id}' -t "$session_name:" -n "$window_name" "$command")"
  else
    window_id="$(tmux new-session -dP -F '#{window_id}' -s "$session_name" -n "$window_name" "$command")"
  fi

  tmux set-window-option -t "$window_id" remain-on-exit off >/dev/null 2>&1 || true
}

ensure_dependencies() {
  require_cmd jq
  require_cmd fd
  require_cmd rg
  require_cmd openssl
  [[ -x "$SUBWF_RUNNER" ]] || die "runner script missing or not executable: ${SUBWF_RUNNER}" 1
}
