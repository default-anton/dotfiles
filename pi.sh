pi() {
  if [ "${1:-}" = "chat" ]; then
    shift
    (npx --prefix ~/code/pi-mono/packages/coding-agent tsx ~/code/pi-mono/packages/coding-agent/src/cli.ts --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai --model gpt-5.2 "$@")
  elif [ "${1:-}" = "flash" ]; then
    shift
    (npx --prefix ~/code/pi-mono/packages/coding-agent tsx ~/code/pi-mono/packages/coding-agent/src/cli.ts --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider google-vertex --model gemini-3-flash-preview "$@")
  elif [ "${1:-}" = "pro" ]; then
    shift
    (npx --prefix ~/code/pi-mono/packages/coding-agent tsx ~/code/pi-mono/packages/coding-agent/src/cli.ts --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider google-vertex --model gemini-3-pro-preview "$@")
  elif [ "${1:-}" = "glm" ]; then
    shift
    (npx --prefix ~/code/pi-mono/packages/coding-agent tsx ~/code/pi-mono/packages/coding-agent/src/cli.ts --append-system-prompt ~/.dotfiles/pi/agent/no_vision_system_prompt.md --provider zai --model glm-4.7 "$@")
  else
    (npx --prefix ~/code/pi-mono/packages/coding-agent tsx ~/code/pi-mono/packages/coding-agent/src/cli.ts --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md "$@")
  fi
}
