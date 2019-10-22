#!/usr/bin/env bash

brew_packages=$(cat <<EOF
moreutils
fzy
atool
exiftool
trash-cli
coreutils
nnn
ffmpeg
dep
fd
ripgrep
rclone
tmux
kubectl
doctl
git
git-standup
tig
hub
htop
tree
wget
links
bash-completion@2
bundler-completion
docker-completion
docker-compose
docker-compose-completion
gem-completion
rails-completion
rake-completion
ruby-completion
gcc
imagemagick
jq
ctags
colordiff
fzf
gawk
graphviz
pandoc
the_silver_searcher
ack
terraform
kubernetes-helm
node
EOF
)

brew install $brew_packages

case "$(uname -s)" in
  Linux*)
    sudo apt install vim-gtk3 curl python3 python3-pip
    # nnn dependencies
    sudo apt install patool vlock
    ;;
  Darwin*)
    brew install curl vim bash
    ;;
  *)
esac

pip3 install --user powerline-shell

## Install yarn
curl -o- -L https://yarnpkg.com/install.sh | bash

npm i -g \
  vmd \
  textlint \
  textlint-rule-no-todo \
  textlint-rule-no-start-duplicated-conjunction \
  textlint-rule-terminology \
  textlint-rule-spelling \
  dictionary-en-us \
  dictionary-ru \
  dictionary-uk \
  textlint-rule-abbr-within-parentheses \
  textlint-rule-common-misspellings \
  textlint-rule-ginger \
  textlint-rule-spellchecker \
  textlint-rule-apostrophe \
  textlint-rule-diacritics \
  textlint-rule-stop-words \
  textlint-rule-en-capitalization

$(brew --prefix)/opt/fzf/install
