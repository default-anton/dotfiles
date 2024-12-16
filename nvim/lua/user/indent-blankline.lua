vim.g.indent_blankline_buftype_exclude = { "terminal", "nofile" }
vim.g.indent_blankline_filetype_exclude = {
  "help",
}
vim.wo.colorcolumn = "99999"

require("ibl").setup {
  scope = { enabled = true },
}
