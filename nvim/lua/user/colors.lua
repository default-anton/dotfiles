local util = require "tokyonight.util"
local colors = require("tokyonight.colors").setup()

require("tokyonight").setup({
  on_colors = function(colors)
    colors.fg_gutter = colors.dark3
    colors.gitSigns.add = "#1cb5af"
    colors.gitSigns.change = "#386cd0"
    colors.gitSigns.delete = "#ca3741"
  end,
})

vim.opt.background = "dark"

vim.cmd "colorscheme tokyonight-storm"

