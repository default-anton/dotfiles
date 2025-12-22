pi() {
  if [ "${1:-}" = "chat" ]; then
    shift
    command pi --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai --model gpt-5.2 "$@"
  else
    command pi --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md "$@"
  fi
}
