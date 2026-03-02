command -v mise >/dev/null 2>&1 && eval "$($(brew --prefix)/bin/mise activate bash)"

[ -f ~/.local_bash_aliases ] && source ~/.local_bash_aliases
[ -f ~/.fzf.bash ] && source ~/.fzf.bash
[ -f ~/.bash_aliases ] && source ~/.bash_aliases

if [[ $- == *i* ]] && [[ ${TERM:-} != dumb ]] && command -v starship >/dev/null 2>&1; then
  eval "$(starship init bash)"
fi
command -v direnv >/dev/null 2>&1 && eval "$(direnv hook bash)"
