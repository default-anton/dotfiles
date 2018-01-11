# ~/.profile: executed by the command interpreter for login shells.
# This file is not read by bash(1), if ~/.bash_profile or ~/.bash_login
# exists.
# see /usr/share/doc/bash/examples/startup-files for examples.
# the files are located in the bash-doc package.

# the default umask is set in /etc/profile; for setting the umask
# for ssh logins, install and configure the libpam-umask package.
#umask 022

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

if [ $TILIX_ID ] || [ $VTE_VERSION ]; then
  source /etc/profile.d/vte.sh
fi

if [ -f "${HOME}/.local/lib/python2.7/site-packages/powerline/bindings/bash/powerline.sh" ]; then
  powerline-daemon -q
  export POWERLINE_BASH_CONTINUATION=1
  export POWERLINE_BASH_SELECT=1
  source "${HOME}/.local/lib/python2.7/site-packages/powerline/bindings/bash/powerline.sh"
fi

# set PATH so it includes user's private bin directories
export PATH="${HOME}/bin:${HOME}/.local/bin:${PATH}:${HOME}/.dotfiles/bin"
export PATH="${PATH}:/usr/local/go/bin"
export PATH="${PATH}:${HOME}/Sources/go/bin"
export GOPATH="${HOME}/Sources/go"

command -v kubectl >/dev/null 2>&1 && source <(kubectl completion bash)
command -v minikube >/dev/null 2>&1 && source <(minikube completion bash)
command -v helm >/dev/null 2>&1 && source <(helm completion bash)
