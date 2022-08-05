local restart_things = vim.api.nvim_create_augroup("RestartThings", { clear = true })

vim.api.nvim_create_autocmd("BufWritePost", {
  pattern = "skhdrc",
  command = ":Dispatch! brew services restart skhd",
  group = restart_things,
})

vim.api.nvim_create_autocmd("BufWritePost", {
  pattern = "yabairc",
  command = ":Dispatch! brew services restart yabai",
  group = restart_things,
})

vim.api.nvim_create_autocmd("BufWritePost", {
  pattern = "nvimrc, .nvimrc",
  command = ":so %",
  group = restart_things,
})

