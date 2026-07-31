alias dc="docker compose"
alias g=git
alias ll='ls -AlF'
alias l='ls -ACF'
alias gg="lazygit -ucd ~/.config/lazygit"
alias v=nvim
alias cat=bat
alias coa="CODEX_HOME=$HOME/.codex-api codex"
pi() { mise -q exec node@24 -- "$(mise -q which pi)" "$@"; }
codex() { mise -q exec node@24 -- "$(mise -q which codex)" "$@"; }
agent-browser() { mise -q exec node@24 -- "$(mise -q which agent-browser)" "$@"; }
