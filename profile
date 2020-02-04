# set PATH so it includes user's private bin directories
export PATH="${HOME}/.dotfiles/bin:${HOME}/bin:${HOME}/.local/bin:${PATH}"
export PATH="${PATH}:/usr/local/go/bin"
export PATH="${PATH}:${HOME}/Sources/go/bin"
export PATH="${HOME}/.npm-global/bin:${PATH}"
export GOPATH="${HOME}/Sources/go"
# Add RVM to PATH for scripting. Make sure this is the last PATH variable change.
export PATH="$PATH:$HOME/.rvm/bin"
export EDITOR=nvim

[ -f /home/linuxbrew/.linuxbrew/bin/brew ] && eval $(/home/linuxbrew/.linuxbrew/bin/brew shellenv)

command -v brew >/dev/null 2>&1 && [ -f $(brew --prefix)/etc/bash_completion ] && . $(brew --prefix)/etc/bash_completion
[ -f /usr/local/etc/bash_completion ] && . /usr/local/etc/bash_completion
[ -f ~/.dotfiles/bin/sensible.bash ] && source ~/.dotfiles/bin/sensible.bash
[ -f ~/.bash_aliases ] && source ~/.bash_aliases
[ -f ~/.local_bash_aliases ] && source ~/.local_bash_aliases
[ -f ~/.bashrc ] && source ~/.bashrc

case "$(uname -s)" in
  Linux* | Darwin*)
    for COMPLETION in $(brew --prefix)/etc/bash_completion.d/*
    do
      [[ -f $COMPLETION ]] && source "$COMPLETION"
    done
    if [[ -f $(brew --prefix)/etc/profile.d/bash_completion.sh ]];
    then
      source "$(brew --prefix)/etc/profile.d/bash_completion.sh"
    fi
    ;;
esac

# Use -- as the trigger sequence instead of the default **
export FZF_COMPLETION_TRIGGER='--'
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude ".git"'
export FZF_CTRL_T_COMMAND="${FZF_DEFAULT_COMMAND}"
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

# Load RVM into a shell session *as a function*
[[ -s "$HOME/.rvm/scripts/rvm" ]] && source "$HOME/.rvm/scripts/rvm"

for script in ~/.dotfiles/scripts/*; do
  source "${script}"
done

command -v kubectl >/dev/null 2>&1 && source <(kubectl completion bash)
command -v minikube >/dev/null 2>&1 && source <(minikube completion bash)
command -v helm >/dev/null 2>&1 && source <(helm completion bash)
command -v npm >/dev/null 2>&1 && source <(npm completion)
command -v flutter >/dev/null 2>&1 && source <(flutter bash-completion)
command -v doctl >/dev/null 2>&1 && source <(doctl completion bash)
command -v aws >/dev/null 2>&1 && complete -C 'aws_completer' aws

# This allows you to bookmark your favorite places across the file system
# Define a variable containing a path and you will be able to cd into it regardless of the directory you're in
export dot="$HOME/.dotfiles"
export desk="$HOME/Desktop"
export docs="$HOME/Documents"
export down="$HOME/Downloads"
