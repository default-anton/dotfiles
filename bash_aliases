alias dc="docker compose"
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
alias ,envkeys="env | cut -d= -f1"
alias reranker="text-embeddings-router --model-id BAAI/bge-reranker-v2-m3 --revision 12e9746 --port 8787"
alias ,extract-expenses="llm -m gemini-2.0-pro-exp-02-05 --schema-multi \"date_created_or_issued,item_description,price_with_currency_before_tax,gst_amount_with_currency_if_present,total_tax_amount_with_currency_if_present\" \"extract expenses from the invoice\""
alias cccost="npx ccusage@latest"
alias c="claude --dangerously-skip-permissions"
alias cm="c --model haiku"
alias ge="gemini --model pro --yolo"

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
