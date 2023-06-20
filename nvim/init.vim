set runtimepath+=~/.config/nvim
let &packpath = &runtimepath

source ~/.dotfiles/nvim/nvimrc

if !empty(glob("~/.nvimrc"))
  source ~/.nvimrc
endif
