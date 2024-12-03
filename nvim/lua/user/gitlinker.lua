require("gitlinker").setup {
  mappings = nil,
}

vim.api.nvim_set_keymap(
  "n",
  "<leader>yr",
  '<cmd>lua require"gitlinker".get_buf_range_url("n")<cr>',
  { silent = true, desc = "Copy git link for current line" }
)

vim.api.nvim_set_keymap(
  "v",
  "<leader>yr",
  '<cmd>lua require"gitlinker".get_buf_range_url("v")<cr>',
  { desc = "Copy git link for selected lines" }
)

vim.api.nvim_set_keymap(
  "n",
  "<leader>gr",
  '<cmd>lua require"gitlinker".get_buf_range_url("n", {action_callback = require"gitlinker.actions".open_in_browser})<cr><cr>',
  { silent = true, desc = "Open git link for current line in browser" }
)

vim.api.nvim_set_keymap(
  "v",
  "<leader>gr",
  '<cmd>lua require"gitlinker".get_buf_range_url("v", {action_callback = require"gitlinker.actions".open_in_browser})<cr><cr>',
  { desc = "Open git link for selected lines in browser" }
)
