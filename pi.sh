pi() {
  if [ "${1:-}" = "chat" ]; then
    shift
    command pi --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider openai --model gpt-5.2 "$@"
  elif [ "${1:-}" = "flash" ]; then
    shift
    (cd /Users/akuzmenko/code/pi-mono/packages/coding-agent && npx tsx src/cli.ts --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider google-vertex --model gemini-3-flash-preview "$@")
  elif [ "${1:-}" = "pro" ]; then
    shift
    (cd /Users/akuzmenko/code/pi-mono/packages/coding-agent && npx tsx src/cli.ts --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider google-vertex --model gemini-3-pro-preview "$@")
  else
    command pi --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md "$@"
  fi
}
