command -v mise >/dev/null 2>&1 && eval "$($(brew --prefix)/bin/mise activate bash)"

[ -f ~/.local_bash_aliases ] && source ~/.local_bash_aliases
[ -f ~/.fzf.bash ] && source ~/.fzf.bash
[ -f ~/.bash_aliases ] && source ~/.bash_aliases

if [[ $- == *i* ]] && [[ ${TERM:-} != dumb ]] && command -v starship >/dev/null 2>&1; then
  eval "$(starship init bash)"
fi
command -v direnv >/dev/null 2>&1 && eval "$(direnv hook bash)"

if [[ $- == *i* ]] && [[ -n ${TMUX:-} ]]; then
  __tmux_alert_min_seconds="${TMUX_ALERT_MIN_SECONDS:-5}"
  __tmux_alert_command_start=

  __tmux_alert_preexec() {
    __tmux_alert_command_start=$SECONDS
  }

  __tmux_alert_precmd() {
    local status=$?

    if [[ -n ${__tmux_alert_command_start:-} ]]; then
      local elapsed=$((SECONDS - __tmux_alert_command_start))

      if (( elapsed >= __tmux_alert_min_seconds )); then
        printf '\a'
      fi
    fi

    __tmux_alert_command_start=
    return "$status"
  }

  PS0="${PS0}"'$(__tmux_alert_preexec)'
  PROMPT_COMMAND="${PROMPT_COMMAND:+${PROMPT_COMMAND}; }__tmux_alert_precmd"
fi
