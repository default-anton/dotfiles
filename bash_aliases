alias dc="docker compose"
alias g=git
alias ll='ls -AlF'
alias l='ls -ACF'
alias activate='[ -d ./venv ] && source ./venv/bin/activate'
alias gg="lazygit -ucd ~/.config/lazygit"
alias ggg="lazydocker"
alias vim=nvim
alias v=nvim
alias cat=bat
alias ,envkeys="env | cut -d= -f1"
alias reranker="text-embeddings-router --model-id BAAI/bge-reranker-v2-m3 --revision 12e9746 --port 8787"
alias c="claude --dangerously-skip-permissions"
alias cchrome="c --mcp-config ~/.dotfiles/claude/chrome.mcp.json"
alias ge="gemini --model pro --yolo"
alias pir="~/.pi/agent/skills/pi-settings/scripts/set_default_model.sh deepseek deepseek-reasoner low 2>/dev/null && pi"
alias pin="~/.pi/agent/skills/pi-settings/scripts/set_default_model.sh deepseek deepseek-chat off 2>/dev/null && pi"

uname_out=$(uname -a)
case "${uname_out}" in
*microsoft*)
  alias open="wslview"
  ;;
*Linux*)
  alias open=xdg-open
  ;;
*) ;;
esac
