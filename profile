#!/usr/bin/env bash

export PATH="${HOME}/.dotfiles/bin:${HOME}/bin:${HOME}/.local/bin:${PATH}"
export GOPATH="${HOME}/code/.go"
export GOBIN="${GOPATH}/bin"
export PATH="${PATH}:${GOBIN}"
export PATH="${PATH}:/usr/local/go/bin"
export EDITOR=nvim

command -v rbenv >/dev/null 2>&1 && eval "$(rbenv init - bash)"
# If running interactively
case $- in
  *i*) [ -f ~/.dotfiles/bin/sensible.bash ] && source ~/.dotfiles/bin/sensible.bash ;;
esac

bash_completion="$(brew --prefix)/etc/profile.d/bash_completion.sh"
[ -f "${bash_completion}" ] && source "${bash_completion}"

export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude ".git"'
export FZF_CTRL_T_COMMAND="${FZF_DEFAULT_COMMAND}"
export FZF_TMUX_OPTS="-p80%,50%"
export FZF_ALT_C_COMMAND="fd '' -t d --hidden -d 1 ~/ ~/code . -x echo {/}"
export RIPGREP_CONFIG_PATH="${HOME}/.ripgreprc"

export PI_CACHE_RETENTION=long
export PI_FINDER_MODELS=openai-codex/gpt-5.3-codex-spark:medium
export PI_LIBRARIAN_MODELS=openai-codex/gpt-5.3-codex-spark:medium

# Use fd (https://github.com/sharkdp/fd) instead of the default find
# command for listing path candidates.
# - The first argument to the function ($1) is the base path to start traversal
# - See the source code (completion.{bash,zsh}) for the details.
_fzf_compgen_path() {
  fd --hidden --follow --exclude ".git" . "$1"
}

# Use fd to generate the list for directory completion
_fzf_compgen_dir() {
  fd --type d --hidden --follow --exclude ".git" . "$1"
}
