local restart_things = vim.api.nvim_create_augroup("RestartThings", { clear = true })

vim.api.nvim_create_autocmd("BufWritePost", {
  pattern = "nvimrc, .nvimrc",
  command = ":so %",
  group = restart_things,
})

local yank_group = vim.api.nvim_create_augroup("HighlightYank", { clear = true })

vim.api.nvim_create_autocmd("TextYankPost", {
  group = yank_group,
  callback = function()
    vim.highlight.on_yank {
      higroup = "IncSearch",
      timeout = 120,
    }
  end,
})
