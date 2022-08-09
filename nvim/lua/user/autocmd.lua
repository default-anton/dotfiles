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

local resize_nvim_tree = vim.api.nvim_create_augroup("ResizeNvimTree", { clear = true })
vim.api.nvim_create_autocmd("VimResized", {
  command = ":so " .. os.getenv "HOME" .. "/.dotfiles/nvim/lua/user/nvim-tree.lua",
  group = resize_nvim_tree,
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
