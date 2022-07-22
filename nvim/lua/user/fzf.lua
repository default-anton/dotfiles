require 'fzf-lua'.setup {
  winopts = {
    preview = {
      vertical = 'up:40%',
      horizontal = 'right:50%',
      layout = 'vertical',
      default = 'bat_native',
    },
  },
  files = {
    previewer = false,
    git_icons = false,
  },
  grep = {
    git_icons = false,
  },
  buffers = {
    previewer = false,
    git_icons = false,
  },
  blines = {
    git_icons = false,
  },
}
