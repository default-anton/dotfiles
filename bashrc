[ -f ~/.local_bash_aliases ] && source ~/.local_bash_aliases
[ -f ~/.fzf.bash ] && source ~/.fzf.bash
[ -f ~/.nvm/nvm.sh ] && source ~/.nvm/nvm.sh
[ -f ~/.bash_aliases ] && source ~/.bash_aliases

command -v starship >/dev/null 2>&1 && eval "$(starship init bash)"
command -v direnv >/dev/null 2>&1 && eval "$(direnv hook bash)"
