pi() {
  local MODELS="openai-codex/gpt-5.2,openai-codex/gpt-5.2-codex,openai/gpt-5.2,openai/gpt-5.2-codex,glm-4.7,google-vertex/gemini-3-flash-preview,google-vertex/gemini-3-pro-preview,google-antigravity/gemini-3-flash,google-antigravity/gemini-3-pro-high,deepseek-reasoner,deepseek-chat"
  # local PI="npx --prefix $HOME/code/pi-mono/packages/coding-agent tsx $HOME/code/pi-mono/packages/coding-agent/src/cli.ts --models $MODELS"
  local PI="command pi --models $MODELS"
  local selection
  selection=$(printf "%s\n" default glm chat-codex codex flash chat | fzf --prompt="model> " --height=40% --reverse)

  export PI_SMALL_PROVIDER="google-antigravity"
  export PI_SMALL_MODEL="gemini-3-flash"

  if [ "$selection" = "chat-codex" ]; then
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai-codex --model gpt-5.2 --thinking medium "$@")
  elif [ "$selection" = "codex" ]; then
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai-codex --model gpt-5.2-codex --thinking medium "$@")
  elif [ "$selection" = "flash" ]; then
    (command pi --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider "$PI_SMALL_PROVIDER" --model "$PI_SMALL_MODEL" --thinking high "$@")
  elif [ "$selection" = "chat" ]; then
    export PI_SMALL_PROVIDER="google-vertex"
    export PI_SMALL_MODEL="gemini-3-flash-preview"
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai --model gpt-5.2 --thinking medium "$@")
  elif [ "$selection" = "glm" ]; then
    export PI_SMALL_PROVIDER="google-vertex"
    export PI_SMALL_MODEL="gemini-3-flash-preview"
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/no_vision_system_prompt.md --provider zai --model glm-4.7 --thinking high "$@")
  else
    export PI_SMALL_PROVIDER="google-vertex"
    export PI_SMALL_MODEL="gemini-3-flash-preview"
    ($PI --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai --model gpt-5.2-codex --thinking medium "$@")
  fi
}
