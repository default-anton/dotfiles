pi() {
  local MODELS="gpt-5.2,gpt-5.2-codex,gemini-3-flash-preview,gemini-3-pro-preview,deepseek-reasoner,deepseek-chat"
  # local PI="npx --prefix $HOME/code/pi-mono/packages/coding-agent tsx $HOME/code/pi-mono/packages/coding-agent/src/cli.ts"
  local PI="command pi"

  if [ "${1:-}" = "chat" ]; then
    shift
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai --model gpt-5.2 --thinking medium --models "$MODELS" "$@")
  elif [ "${1:-}" = "pro" ]; then
    shift
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider google-vertex --model gemini-3-pro-preview --thinking high --models "$MODELS" "$@")
  elif [ "${1:-}" = "glm" ]; then
    shift
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/no_vision_system_prompt.md --provider zai --model glm-4.7 --models glm-4.7:high "$@")
  elif [ "${1:-}" = "codex" ]; then
    shift
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai-codex --model gpt-5.2-codex --thinking medium --models "$MODELS" "$@")
  else
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai --model gpt-5.2 --thinking medium --models "$MODELS" "$@")
  fi
}
