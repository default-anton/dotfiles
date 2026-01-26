pi() {
  local MODELS="openai/gpt-5.2,openai/gpt-5.2-codex,glm-4.7,glm-4.6v,google-vertex/gemini-3-flash-preview,google-vertex/gemini-3-pro-preview,deepseek-reasoner,deepseek-chat"
  # local PI="npx --prefix $HOME/code/pi-mono/packages/coding-agent tsx $HOME/code/pi-mono/packages/coding-agent/src/cli.ts --models $MODELS"
  local PI="command pi --models $MODELS"
  local selection
  selection=$(printf "%s\n" default chat glm flash-vertex deepseek-reasoner deepseek-chat | fzf --prompt="model> " --height=40% --reverse)

  export PI_SMALL_MODELS="openai>google-vertex/gemini-3-flash-preview:low,zai/glm-4.7:high,google-vertex/gemini-3-flash-preview:low,deepseek/deepseek-chat:off"

  export PI_SMALL_PROVIDER="google-antigravity"
  export PI_SMALL_MODEL="gemini-3-flash"

  if [ "$selection" = "glm" ]; then
    ($PI --provider zai --model glm-4.7 --thinking high "$@")
  elif [ "$selection" = "deepseek-reasoner" ]; then
    ($PI --provider deepseek --model deepseek-reasoner --thinking high "$@")
  elif [ "$selection" = "deepseek-chat" ]; then
    ($PI --provider deepseek --model deepseek-chat --thinking high "$@")
  elif [ "$selection" = "flash-vertex" ]; then
    export PI_SMALL_PROVIDER="google-vertex"
    export PI_SMALL_MODEL="gemini-3-flash-preview"
    ($PI --provider "$PI_SMALL_PROVIDER" --model "$PI_SMALL_MODEL" --thinking high "$@")
  elif [ "$selection" = "chat" ]; then
    export PI_SMALL_PROVIDER="google-vertex"
    export PI_SMALL_MODEL="gemini-3-flash-preview"
    ($PI --provider openai --model gpt-5.2 --thinking medium "$@")
  else
    export PI_SMALL_PROVIDER="google-vertex"
    export PI_SMALL_MODEL="gemini-3-flash-preview"
    ($PI --provider openai --model gpt-5.2-codex --thinking medium "$@")
  fi
}
