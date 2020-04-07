set runtimepath^=~/.vim runtimepath+=~/.vim/after
let &packpath = &runtimepath
source ~/.dotfiles/nvim/nvimrc

if !empty(glob("~/.nvimrc"))
  source ~/.nvimrc
endif
