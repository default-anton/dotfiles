local brew_svc_group = vim.api.nvim_create_augroup("BrewServices", { clear = true })

vim.api.nvim_create_autocmd("BufWritePost", {
  pattern = "skhdrc",
  command = ":Dispatch! brew services restart skhd",
  group = brew_svc_group,
})

vim.api.nvim_create_autocmd("BufWritePost", {
  pattern = "yabairc",
  command = ":Dispatch! brew services restart yabai",
  group = brew_svc_group,
})
