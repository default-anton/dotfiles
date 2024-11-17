alias dc="docker compose"
alias timestamp="date +'%Y%m%d%H%M%S'"
alias ts=timestamp
alias tf=terraform
alias g=git
alias ll='ls -AlF'
alias l='ls -ACF'
alias activate='[ -d ./venv ] && source ./venv/bin/activate'
alias gg="lazygit -ucd ~/.config/lazygit"
alias ggg="lazydocker"
alias vim=nvim
alias v=nvim
alias p3="ipython3"
alias cat=bat
alias shlint=shellcheck
alias reranker="text-embeddings-router --model-id BAAI/bge-reranker-v2-m3 --revision 12e9746 --port 8787"

uname_out=$(uname -a)
case "${uname_out}" in
  *microsoft*)
    alias open="wslview"
  ;;
  *Linux*)
    alias open=xdg-open
  ;;
  *)
esac
