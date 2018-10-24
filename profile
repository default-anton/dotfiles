# ~/.profile: executed by the command interpreter for login shells.
# This file is not read by bash(1), if ~/.bash_profile or ~/.bash_login
# exists.
# see /usr/share/doc/bash/examples/startup-files for examples.
# the files are located in the bash-doc package.

# the default umask is set in /etc/profile; for setting the umask
# for ssh logins, install and configure the libpam-umask package.
#umask 022

# set PATH so it includes user's private bin directories
export PATH="${HOME}/bin:${HOME}/.local/bin:${PATH}:${HOME}/.dotfiles/bin"
export PATH="${PATH}:/usr/local/go/bin"
export PATH="${PATH}:${HOME}/Sources/go/bin"
export PATH="${HOME}/.npm-global/bin:$PATH"
export GOPATH="${HOME}/Sources/go"
export FZF_DEFAULT_COMMAND="ag --smart-case --hidden --depth 100 --ignore .git"
export FZF_CTRL_T_COMMAND='${FZF_DEFAULT_COMMAND} -g ""'

# if running bash
if [ -n "${BASH_VERSION}" ]; then
    # include .bashrc if it exists
    if [ -f "${HOME}/.bashrc" ]; then
      . "${HOME}/.bashrc"
    fi
fi

if [ -f "${HOME}/.local_bash_aliases" ]; then
  . "${HOME}/.local_bash_aliases"
fi

if [ -f "${HOME}/.local/lib/python2.7/site-packages/powerline/bindings/bash/powerline.sh" ]; then
  source "${HOME}/.local/lib/python2.7/site-packages/powerline/bindings/bash/powerline.sh"
fi

command -v kubectl >/dev/null 2>&1 && source <(kubectl completion bash)
command -v minikube >/dev/null 2>&1 && source <(minikube completion bash)
command -v helm >/dev/null 2>&1 && source <(helm completion bash)
command -v npm >/dev/null 2>&1 && source <(npm completion)
command -v flutter >/dev/null 2>&1 && source <(flutter bash-completion)
