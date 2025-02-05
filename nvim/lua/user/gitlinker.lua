require("gitlinker").setup {
  mappings = nil,
}

vim.api.nvim_set_keymap(
  "n",
  "gyr",
  '<cmd>lua require"gitlinker".get_buf_range_url("n")<cr>',
  { silent = true, desc = "Copy git link for current line" }
)

vim.api.nvim_set_keymap(
  "v",
  "gyr",
  '<cmd>lua require"gitlinker".get_buf_range_url("v")<cr>',
  { desc = "Copy git link for selected lines" }
)
