pi() {
  local MODELS="gpt-5.2,gpt-5.2-codex,glm-4.7,gemini-3-flash-preview,gemini-3-flash,gemini-3-pro-preview,deepseek-reasoner,deepseek-chat"
  # local PI="npx --prefix $HOME/code/pi-mono/packages/coding-agent tsx $HOME/code/pi-mono/packages/coding-agent/src/cli.ts"
  local PI="command pi --models $MODELS"

  export PI_SMALL_PROVIDER="google-antigravity"
  export PI_SMALL_MODEL="gemini-3-flash"

  if [ "${1:-}" = "glm" ]; then
    shift
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/no_vision_system_prompt.md --provider zai --model glm-4.7 --thinking high "$@")
  elif [ "${1:-}" = "codex" ]; then
    shift
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai-codex --model gpt-5.2-codex --thinking medium "$@")
  elif [ "${1:-}" = "flash" ]; then
    shift
    export PI_SMALL_PROVIDER="google-vertex"
    export PI_SMALL_MODEL="gemini-3-flash-preview"
    (command pi --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider google-vertex --model gemini-3-flash-preview --thinking high "$@")
  else
    export PI_SMALL_PROVIDER="google-vertex"
    export PI_SMALL_MODEL="gemini-3-flash-preview"
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai --model gpt-5.2 --thinking medium "$@")
  fi
}
