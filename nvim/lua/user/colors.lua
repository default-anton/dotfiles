local util = require "tokyonight.util"
local colors = require("tokyonight.colors").setup()

vim.g.tokyonight_lualine_bold = 1
vim.opt.background = "dark"

local git_signs = { add = "#164846", change = "#394b70", delete = "#823c41" }

vim.g.tokyonight_colors = {
  fg_gutter = colors.dark3,
  gitSigns = {
    add = util.brighten(git_signs.add, 0.4),
    change = util.brighten(git_signs.change, 0.4),
    delete = util.brighten(git_signs.delete, 0.4),
  },
}

vim.cmd "colorscheme tokyonight"

util.highlight("CursorLineNr", { fg = util.darken(colors.yellow, 0.8) })
