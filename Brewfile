#!/usr/bin/env bash

# nnn dependencies
brew install moreutils
brew install fzy
brew install atool
brew install exiftool
brew install trash-cli
brew install coreutils
brew install nnn
brew install ffmpeg
brew install dep
brew install fd
brew install rclone
brew install tmux
brew install kubectl
brew install doctl
brew install git
brew install git-standup
brew install tig
brew install hub
brew install htop
brew install tree
brew install wget
brew install links
brew install bash-completion@2
brew install bundler-completion
brew install docker-completion
brew install docker-compose
brew install docker-compose-completion
brew install gem-completion
brew install rails-completion
brew install rake-completion
brew install ruby-completion
brew install gcc
brew install imagemagick
brew install jq
brew install ctags
brew install colordiff
brew install fzf
brew install gawk
brew install graphviz
brew install pandoc
brew install the_silver_searcher
brew install ack
brew install terraform
brew install kubernetes-helm
brew install node@10
brew link --force node@10
curl -o- -L https://yarnpkg.com/install.sh | bash

case "$(uname -s)" in
  Linux*)
    brew unlink bash
    brew unlink curl
    sudo apt install curl
    # nnn dependencies
    sudo apt install patool vlock
    ;;
  Darwin*)
    brew install curl
    brew install vim
    brew install bash
    ;;
  *)
esac

npm i -g vmd
npm i -g textlint \
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
