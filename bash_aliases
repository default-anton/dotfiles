alias dc=docker-compose
alias timestamp="date +'%Y%m%d%H%M%S'"
alias ts=timestamp
alias tf=terraform
alias g=git
alias en="trans :en"
alias ru="trans :ru"
alias ll='ls -AlF'
alias l='ls -ACF'
alias activate='[ -d ./venv ] && source ./venv/bin/activate'
alias plantuml="java -jar ${HOME}/.vim/plugged/vim-slumlord/plantuml.jar"
alias gg="lazygit -ucd ~/.config/lazygit"
alias gvim="nvim -c GFiles?"

vim() {
  if [ "$#" -gt 0 ]; then
    nvim "$@"
  else
    nvim -c Files
  fi
}

uname_out=$(uname -a)
case "${uname_out}" in
  *microsoft*)
    alias open="wslview"
  ;;
  *Linux*)
    alias open=xdg-open
  ;;
  *)
esac
