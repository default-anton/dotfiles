pi() {
  local MODELS="gpt-5.1-codex-max:high,gpt-5.2:high,gemini-3-flash-preview:high,gemini-3-pro-preview:high"
  local PI="npx --prefix $HOME/code/pi-mono/packages/coding-agent tsx $HOME/code/pi-mono/packages/coding-agent/src/cli.ts"
  # local PI="command pi"

  if [ "${1:-}" = "chat" ]; then
    shift
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai --model gpt-5.2 --models "$MODELS" "$@")
  elif [ "${1:-}" = "flash" ]; then
    shift
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider google-vertex --model gemini-3-flash-preview --models "$MODELS" "$@")
  elif [ "${1:-}" = "pro" ]; then
    shift
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider google-vertex --model gemini-3-pro-preview --models "$MODELS" "$@")
  elif [ "${1:-}" = "glm" ]; then
    shift
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/no_vision_system_prompt.md --provider zai --model glm-4.7 --models glm-4.7:high --tool "$HOME/.dotfiles/pi/agent/vision_tool/index.ts" "$@")
  else
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai --model gpt-5.1-codex-max --models "$MODELS" "$@")
  fi
}
