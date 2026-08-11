alias dc="docker compose"
alias g=git
alias ll='ls -AlF'
alias l='ls -ACF'
alias gg="lazygit -ucd ~/.config/lazygit"
alias v=nvim
alias cat=bat
alias coa="CODEX_HOME=$HOME/.codex-api codex"
alias r=bin/rails
alias ahaupdate='pnpm install --frozen-lockfile && pnpm rebuild --pending && bundle install && bin/rails db:migrate'
pi() { mise -q exec node@24 -- "$(mise -q which pi)" "$@"; }
codex() { mise -q exec node@24 -- "$(mise -q which codex)" "$@"; }
agent-browser() { mise -q exec node@24 -- "$(mise -q which agent-browser)" "$@"; }
createbr() {
  if (( $# != 1 )); then
    echo "Usage: createbr <Aha! record>" >&2
    return 2
  fi

  local branch
  branch="$(./script/branch_name_for_aha_record.sh "$1")" || return
  wt switch --create "$branch"
}
