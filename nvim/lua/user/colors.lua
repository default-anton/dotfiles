local util = require "tokyonight.util"

vim.g.tokyonight_lualine_bold = 1
vim.opt.background = "dark"

local git_signs = { add = "#164846", change = "#394b70", delete = "#823c41" }

vim.g.tokyonight_colors = {
  fg_gutter = "#545c7e",
  gitSigns = {
    add = util.brighten(git_signs.add, 0.4),
    change = util.brighten(git_signs.change, 0.4),
    delete = util.brighten(git_signs.delete, 0.4),
  },
}

vim.cmd "colorscheme tokyonight"
