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
alias co="codex --yolo"
alias coa="CODEX_HOME=$HOME/.codex-api codex --yolo"
alias cchrome="c --mcp-config ~/.dotfiles/claude/chrome.mcp.json"
alias ge="gemini --model flash --yolo"

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
