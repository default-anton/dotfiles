#!/usr/bin/env bash

export PATH="${HOME}/.dotfiles/bin:${HOME}/bin:${HOME}/.local/bin:${PATH}"
export GOPATH="${HOME}/code/.go"
export GOBIN="${GOPATH}/bin"
export PATH="${PATH}:${GOBIN}"
export PATH="${PATH}:/usr/local/go/bin"
export EDITOR=nvim

command -v brew >/dev/null 2>&1 && [ -f $(brew --prefix)/etc/bash_completion ] && . $(brew --prefix)/etc/bash_completion
[ -f /usr/local/etc/bash_completion ] && . /usr/local/etc/bash_completion
# If running interactively
case $- in
  *i*) [ -f ~/.dotfiles/bin/sensible.bash ] && source ~/.dotfiles/bin/sensible.bash ;;
esac

case "$(uname -s)" in
  Linux* | Darwin*)
    if command -v brew >/dev/null 2>&1; then
      for COMPLETION in $(brew --prefix)/etc/bash_completion.d/*
      do
        [[ -f $COMPLETION ]] && source "$COMPLETION"
      done
      if [[ -f $(brew --prefix)/etc/profile.d/bash_completion.sh ]];
      then
        source "$(brew --prefix)/etc/profile.d/bash_completion.sh"
      fi
    fi
    ;;
esac

# Use -- as the trigger sequence instead of the default **
export FZF_COMPLETION_TRIGGER='--'
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude ".git"'
export FZF_CTRL_T_COMMAND="${FZF_DEFAULT_COMMAND}"
export FZF_TMUX_OPTS="-p 80%,50%"
export FZF_ALT_C_COMMAND="fd '' -t d --hidden -d 1 ~/ ~/code . -x echo {/}"
export RIPGREP_CONFIG_PATH="${HOME}/.ripgreprc"

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

command -v kubectl >/dev/null 2>&1 && source <(kubectl completion bash)
command -v minikube >/dev/null 2>&1 && source <(minikube completion bash)
command -v helm >/dev/null 2>&1 && source <(helm completion bash)
command -v npm >/dev/null 2>&1 && source <(npm completion)
command -v flutter >/dev/null 2>&1 && source <(flutter bash-completion)
command -v doctl >/dev/null 2>&1 && source <(doctl completion bash)
command -v aws >/dev/null 2>&1 && complete -C 'aws_completer' aws
command -v pdm >/dev/null 2>&1 && source <(pdm --pep582)

