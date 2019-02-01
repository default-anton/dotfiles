function alias_completion {
  # keep global namespace clean
  local cmd completion

  # determine first word of alias definition
  # NOTE: This is really dirty. Is it possible to use
  #       readline's shell-expand-line or alias-expand-line?
  cmd=$(alias "$1" | sed 's/^alias .*='\''//;s/\( .\+\|'\''\)//')

  # determine completion function
  completion=$(complete -p "$1" 2>/dev/null)

  # run _completion_loader only if necessary
  [[ -n $completion ]] || {

    # load completion
  _completion_loader "$cmd"

  # detect completion
  completion=$(complete -p "$cmd" 2>/dev/null)
}

# ensure completion was detected
[[ -n $completion ]] || return 1

# configure completion
eval "$(sed "s/$cmd\$/$1/" <<<"$completion")"
}

alias dc=docker-compose
alias timestamp="date +'%Y%M%d%H%M%S'"
alias ts=timestamp
alias tf=terraform
alias g=git
alias cf="g st -s | ag -v -s D | cut -d' ' -f3"
alias en="trans :en"
alias ru="trans :ru"
alias ll='ls -AlF'
alias l='ls -ACF'

function resize {
  eval $(resize.py)
}

if [ "$(expr substr $(uname -s) 1 5)" == "Linux" ]; then
  alias open=xdg-open
  alias copy="xclip -selection c"
  alias webcam=v4l2-ctl
# aliases to load completion for
  aliases=(dc ts open tf g)

  for a in "${aliases[@]}"; do
    alias_completion "$a"
  done

# clean up after ourselves
  unset a aliases
fi
