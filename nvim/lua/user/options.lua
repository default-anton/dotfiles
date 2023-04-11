vim.g.mapleader = ","

local opt = vim.opt

opt.completeopt = { "menu", "menuone", "noselect" }
opt.number = true
opt.relativenumber = true
opt.splitbelow = true
opt.exrc = true
opt.secure = true
opt.backup = false
opt.swapfile = false
opt.smartindent = true
opt.expandtab = true
opt.termguicolors = true
opt.ignorecase = true
opt.smartcase = true
opt.hlsearch = false
opt.clipboard = "unnamed"
opt.signcolumn = "yes"
opt.colorcolumn = "+1"
opt.textwidth = 120
opt.tabstop = 2
opt.shiftwidth = 2
opt.softtabstop = 2
opt.scrolloff = 3
opt.sidescrolloff = 5
opt.scroll = 8
opt.updatetime = 50
opt.cursorline = true
opt.cursorlineopt = { "number" }
opt.mouse = ""

-- Don't pass messages to |ins-completion-menu|.
opt.shortmess:append "c"

vim.g.markdown_fenced_languages = {
  "python",
  "bash=sh",
  "html",
  "css",
  "json",
  "javascript",
  "js=javascript",
  "yaml",
  "dockerfile",
}

-- disable netrw at the very start of your init.lua (strongly advised)
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1
