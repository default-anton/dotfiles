pi() {
  if [ "${1:-}" = "chat" ]; then
    shift
    command pi --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai --model gpt-5.2 "$@"
  elif [ "${1:-}" = "g" ]; then
    shift
    export VERTEX_OPENAI_TOKEN="$(gcloud auth application-default print-access-token)"
    command pi --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider vertex-openai --model google/gemini-3-flash-preview "$@"
  else
    command pi --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md "$@"
  fi
}
