#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/subwf-utils.sh"

wait_for_steps() {
  local timeout_seconds="$1"
  shift
  [[ $# -gt 0 ]] || die "wait requires at least one step id" 2

  local -a steps=("$@")
  local step
  for step in "${steps[@]}"; do
    validate_step_id "$step"
  done

  require_initialized_run_dir
  local run_id
  run_id="$(get_run_id)"

  local start_time="$SECONDS"
  local timed_out=0

  while true; do
    local -a pending=()
    for step in "${steps[@]}"; do
      [[ -f "$RUN_DIR/status/${step}.status.json" ]] || pending+=("$step")
    done

    if [[ ${#pending[@]} -eq 0 ]]; then
      break
    fi

    if (( SECONDS - start_time >= timeout_seconds )); then
      timed_out=1
      local pending_step
      for pending_step in "${pending[@]}"; do
        local artifact_file="$RUN_DIR/artifacts/${pending_step}.md"
        local status_file="$RUN_DIR/status/${pending_step}.status.json"
        if [[ ! -f "$artifact_file" ]]; then
          cat > "$artifact_file" <<EOF
# Subagent step timed out

- step: ${pending_step}
- status: timeout
- timeoutSeconds: ${timeout_seconds}
EOF
        fi
        write_status_json "$status_file" "timeout" "$pending_step" "$run_id" "unknown" "Timed out after ${timeout_seconds}s waiting for completion." "$artifact_file"
      done
      break
    fi

    sleep "$SUBWF_POLL_SECONDS"
  done

  local rows=""
  local success_count=0
  local failed_count=0
  local pending_count=0

  for step in "${steps[@]}"; do
    local row
    row="$(status_row "$step")"
    rows+="$row"$'\n'

    local status
    status="$(printf '%s\n' "$row" | cut -f2)"
    case "$status" in
      success) success_count=$((success_count + 1)) ;;
      pending) pending_count=$((pending_count + 1)) ;;
      *) failed_count=$((failed_count + 1)) ;;
    esac
  done

  local overall="success"
  if (( failed_count > 0 )); then
    overall="failed"
  elif (( pending_count > 0 )); then
    overall="pending"
  fi

  if [[ "$JSON_OUTPUT" -eq 1 ]]; then
    local steps_json
    steps_json="$(printf '%s' "$rows" | rows_to_json)"
    jq -n \
      --arg runDir "$RUN_DIR" \
      --arg overall "$overall" \
      --argjson timedOut "$([ "$timed_out" -eq 1 ] && echo true || echo false)" \
      --argjson success "$success_count" \
      --argjson failed "$failed_count" \
      --argjson pending "$pending_count" \
      --argjson steps "$steps_json" \
      '{
        runDir: $runDir,
        overall: $overall,
        timedOut: $timedOut,
        counts: { success: $success, failed: $failed, pending: $pending },
        steps: $steps
      }'
  elif [[ "$QUIET" -eq 0 ]]; then
    while IFS= read -r line; do
      [[ -n "$line" ]] || continue
      local row_step row_status row_reason row_error
      row_step="$(printf '%s' "$line" | cut -f1)"
      row_status="$(printf '%s' "$line" | cut -f2)"
      row_reason="$(printf '%s' "$line" | cut -f3)"
      row_error="$(printf '%s' "$line" | cut -f4)"
      if [[ -n "$row_error" ]]; then
        printf '%s %-12s (%s) %s\n' "$row_step" "$row_status" "$row_reason" "$row_error"
      else
        printf '%s %-12s (%s)\n' "$row_step" "$row_status" "$row_reason"
      fi
    done <<< "$rows"
    printf 'overall: %s\n' "$overall"
  fi

  if [[ "$timed_out" -eq 1 ]]; then
    return 3
  fi
  if (( failed_count > 0 )); then
    return 4
  fi
  return 0
}

start_or_run() {
  local command="$1"
  shift

  [[ $# -gt 0 ]] || die "${command} requires <step-id>" 2
  local step_id="$1"
  shift
  validate_step_id "$step_id"

  local prompt=""
  local prompt_file=""
  local access_mode="rw"
  local capture_mode="interactive"
  local rerun=0
  local tmux_session_override=""
  local window_name="$step_id"
  local extension_file="${SUBWF_EXTENSION:-$SUBWF_DEFAULT_EXTENSION}"
  local pi_bin="${SUBWF_PI_BIN:-pi}"
  local timeout_seconds="$(duration_to_seconds "${SUBWF_TIMEOUT:-4h}")"
  local -a inputs=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --prompt)
        [[ $# -ge 2 ]] || die "--prompt requires value" 2
        prompt="$2"
        shift 2
        ;;
      --prompt-file)
        [[ $# -ge 2 ]] || die "--prompt-file requires path" 2
        prompt_file="$2"
        shift 2
        ;;
      --input)
        [[ $# -ge 2 ]] || die "--input requires path" 2
        inputs+=("$2")
        shift 2
        ;;
      --ro)
        access_mode="ro"
        shift
        ;;
      --rw)
        access_mode="rw"
        shift
        ;;
      --rerun)
        rerun=1
        shift
        ;;
      --tmux-session)
        [[ $# -ge 2 ]] || die "--tmux-session requires value" 2
        tmux_session_override="$2"
        shift 2
        ;;
      --window-name)
        [[ $# -ge 2 ]] || die "--window-name requires value" 2
        window_name="$2"
        shift 2
        ;;
      --capture-mode)
        [[ $# -ge 2 ]] || die "--capture-mode requires value" 2
        capture_mode="$2"
        shift 2
        ;;
      --extension)
        [[ $# -ge 2 ]] || die "--extension requires path" 2
        extension_file="$2"
        shift 2
        ;;
      --pi-bin)
        [[ $# -ge 2 ]] || die "--pi-bin requires value" 2
        pi_bin="$2"
        shift 2
        ;;
      --timeout)
        [[ $# -ge 2 ]] || die "--timeout requires value" 2
        timeout_seconds="$(duration_to_seconds "$2")"
        shift 2
        ;;
      *)
        die "unknown flag for ${command}: $1" 2
        ;;
    esac
  done

  [[ -n "$prompt" || -n "$prompt_file" ]] || die "missing prompt. Use --prompt or --prompt-file" 2
  [[ -z "$prompt" || -z "$prompt_file" ]] || die "use only one of --prompt or --prompt-file" 2

  case "$capture_mode" in
    interactive|print) ;;
    *) die "invalid --capture-mode '${capture_mode}' (expected interactive|print)" 2 ;;
  esac

  require_initialized_run_dir
  local run_id
  run_id="$(get_run_id)"

  local tmux_session
  if [[ -n "$tmux_session_override" ]]; then
    tmux_session="$tmux_session_override"
  else
    tmux_session="$(get_tmux_session_default "$run_id")"
  fi
  persist_tmux_session "$tmux_session"

  local artifact_file="$RUN_DIR/artifacts/${step_id}.md"
  local status_file="$RUN_DIR/status/${step_id}.status.json"
  local saved_prompt="$RUN_DIR/meta/${step_id}.prompt.md"
  local inputs_file="$RUN_DIR/meta/${step_id}.inputs"

  if [[ "$rerun" -eq 0 ]]; then
    [[ ! -f "$artifact_file" ]] || die "artifact already exists for ${step_id}. Use --rerun to overwrite."
    [[ ! -f "$status_file" ]] || die "status already exists for ${step_id}. Use --rerun to overwrite."
  else
    rm -f "$artifact_file" "$status_file" "$RUN_DIR/wrappers/${step_id}.sh" "$saved_prompt" "$inputs_file"
  fi

  if [[ -n "$prompt_file" ]]; then
    [[ -f "$prompt_file" ]] || die "prompt file not found: ${prompt_file}"
    prompt="$(cat "$prompt_file")"
  fi
  printf '%s\n' "$prompt" > "$saved_prompt"

  if [[ "$capture_mode" == "interactive" ]]; then
    extension_file="$(abs_path "$extension_file")"
    [[ -f "$extension_file" ]] || die "extension file not found: ${extension_file}"
  fi

  : > "$inputs_file"
  local input
  for input in "${inputs[@]}"; do
    printf '%s\n' "$(abs_path "$input")" >> "$inputs_file"
  done

  local wrapper_file
  wrapper_file="$(create_step_wrapper \
    "$step_id" \
    "$run_id" \
    "$access_mode" \
    "$capture_mode" \
    "$(abs_path "$saved_prompt")" \
    "$(abs_path "$artifact_file")" \
    "$(abs_path "$status_file")" \
    "$extension_file" \
    "$pi_bin" \
    "$(abs_path "$inputs_file")")"

  launch_in_tmux "$tmux_session" "$window_name" "$wrapper_file"

  if [[ "$command" == "run" ]]; then
    wait_for_steps "$timeout_seconds" "$step_id"
    return
  fi

  if [[ "$JSON_OUTPUT" -eq 1 ]]; then
    jq -n \
      --arg runDir "$RUN_DIR" \
      --arg runId "$run_id" \
      --arg stepId "$step_id" \
      --arg tmuxSession "$tmux_session" \
      --arg windowName "$window_name" \
      --arg artifactFile "$artifact_file" \
      --arg statusFile "$status_file" \
      --arg wrapperFile "$wrapper_file" \
      '{
        runDir: $runDir,
        runId: $runId,
        stepId: $stepId,
        tmuxSession: $tmuxSession,
        windowName: $windowName,
        artifactFile: $artifactFile,
        statusFile: $statusFile,
        wrapperFile: $wrapperFile,
        started: true
      }'
  elif [[ "$QUIET" -eq 0 ]]; then
    printf '%s started in tmux session %s (window %s)\n' "$step_id" "$tmux_session" "$window_name"
  fi
}

cmd_init() {
  local tmux_override=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tmux-session)
        [[ $# -ge 2 ]] || die "--tmux-session requires value" 2
        tmux_override="$2"
        shift 2
        ;;
      *) die "unknown flag for init: $1" 2 ;;
    esac
  done

  if [[ -z "$RUN_DIR" ]]; then
    RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/subwf.XXXXXX")"
  fi

  RUN_DIR="$(abs_path "$RUN_DIR")"
  ensure_run_layout

  local run_id
  run_id="$(get_run_id)"

  local tmux_session
  if [[ -n "$tmux_override" ]]; then
    tmux_session="$tmux_override"
  else
    tmux_session="$(get_tmux_session_default "$run_id")"
  fi
  persist_tmux_session "$tmux_session"

  if [[ "$JSON_OUTPUT" -eq 1 ]]; then
    jq -n \
      --arg runDir "$RUN_DIR" \
      --arg runId "$run_id" \
      --arg tmuxSession "$tmux_session" \
      --arg artifactsDir "$RUN_DIR/artifacts" \
      --arg statusDir "$RUN_DIR/status" \
      '{ runDir: $runDir, runId: $runId, tmuxSession: $tmuxSession, artifactsDir: $artifactsDir, statusDir: $statusDir }'
  else
    printf '%s\n' "$RUN_DIR"
  fi
}

cmd_wait() {
  local timeout_seconds="$(duration_to_seconds "${SUBWF_TIMEOUT:-4h}")"
  local -a steps=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --timeout)
        [[ $# -ge 2 ]] || die "--timeout requires value" 2
        timeout_seconds="$(duration_to_seconds "$2")"
        shift 2
        ;;
      --*) die "unknown flag for wait: $1" 2 ;;
      *) steps+=("$1") ; shift ;;
    esac
  done

  wait_for_steps "$timeout_seconds" "${steps[@]}"
}

cmd_status() {
  require_initialized_run_dir
  local -a steps=()

  if [[ $# -eq 0 ]]; then
    local file
    while IFS= read -r file; do
      steps+=("$(basename "$file" .status.json)")
    done < <(fd -t f '*.status.json' "$RUN_DIR/status" | sort)
  else
    steps=("$@")
  fi

  local rows=""
  local step
  for step in "${steps[@]}"; do
    validate_step_id "$step"
    rows+="$(status_row "$step")"$'\n'
  done

  local overall="success"
  if printf '%s' "$rows" | cut -f2 | rg -q '^pending$'; then
    overall="pending"
  fi
  if printf '%s' "$rows" | cut -f2 | rg -q '^(error|aborted|no_output|process_error|timeout|invalid)$'; then
    overall="failed"
  fi

  if [[ "$JSON_OUTPUT" -eq 1 ]]; then
    local steps_json
    steps_json="$(printf '%s' "$rows" | rows_to_json)"
    jq -n --arg runDir "$RUN_DIR" --arg overall "$overall" --argjson steps "$steps_json" '{ runDir: $runDir, overall: $overall, steps: $steps }'
  elif [[ "$QUIET" -eq 0 ]]; then
    if [[ -z "$rows" ]]; then
      echo "no step statuses found"
      return 0
    fi
    while IFS= read -r line; do
      [[ -n "$line" ]] || continue
      local row_step row_status row_reason row_error
      row_step="$(printf '%s' "$line" | cut -f1)"
      row_status="$(printf '%s' "$line" | cut -f2)"
      row_reason="$(printf '%s' "$line" | cut -f3)"
      row_error="$(printf '%s' "$line" | cut -f4)"
      if [[ -n "$row_error" ]]; then
        printf '%s %-12s (%s) %s\n' "$row_step" "$row_status" "$row_reason" "$row_error"
      else
        printf '%s %-12s (%s)\n' "$row_step" "$row_status" "$row_reason"
      fi
    done <<< "$rows"
    printf 'overall: %s\n' "$overall"
  fi
}

cmd_paths() {
  [[ $# -eq 1 ]] || die "paths requires exactly one <step-id>" 2
  local step_id="$1"
  validate_step_id "$step_id"
  require_initialized_run_dir

  local artifact="$RUN_DIR/artifacts/${step_id}.md"
  local status="$RUN_DIR/status/${step_id}.status.json"
  local wrapper="$RUN_DIR/wrappers/${step_id}.sh"
  local prompt="$RUN_DIR/meta/${step_id}.prompt.md"

  if [[ "$JSON_OUTPUT" -eq 1 ]]; then
    jq -n --arg stepId "$step_id" --arg artifactFile "$artifact" --arg statusFile "$status" --arg wrapperFile "$wrapper" --arg promptFile "$prompt" \
      '{ stepId: $stepId, artifactFile: $artifactFile, statusFile: $statusFile, wrapperFile: $wrapperFile, promptFile: $promptFile }'
  else
    printf 'artifact: %s\nstatus: %s\nwrapper: %s\nprompt: %s\n' "$artifact" "$status" "$wrapper" "$prompt"
  fi
}

subwf_main() {
  ensure_dependencies

  local command=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run-dir)
        [[ $# -ge 2 ]] || die "--run-dir requires value" 2
        RUN_DIR="$2"
        shift 2
        ;;
      --json)
        JSON_OUTPUT=1
        shift
        ;;
      -q|--quiet)
        QUIET=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      --version)
        echo "$SUBWF_VERSION"
        exit 0
        ;;
      init|start|run|wait|status|paths)
        command="$1"
        shift
        break
        ;;
      *)
        die "unknown argument: $1" 2
        ;;
    esac
  done

  [[ -n "$command" ]] || {
    usage
    exit 2
  }

  case "$command" in
    init) cmd_init "$@" ;;
    start) start_or_run "start" "$@" ;;
    run) start_or_run "run" "$@" ;;
    wait) cmd_wait "$@" ;;
    status) cmd_status "$@" ;;
    paths) cmd_paths "$@" ;;
    *) die "unknown command: ${command}" 2 ;;
  esac
}
