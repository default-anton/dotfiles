vim.g.mapleader = " "
vim.g.maplocalleader = " "

vim.opt.completeopt = { "menu", "menuone", "noselect" }
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.splitbelow = true
vim.opt.exrc = true
vim.opt.secure = true
vim.opt.backup = false
vim.opt.swapfile = false
vim.opt.smartindent = true
vim.opt.wrap = true
vim.opt.expandtab = true
vim.opt.termguicolors = true
vim.opt.ignorecase = true
vim.opt.smartcase = true
vim.opt.hlsearch = false
vim.opt.signcolumn = "yes"
vim.opt.colorcolumn = "+1"
vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.opt.softtabstop = 2
vim.opt.scrolloff = 8
vim.opt.sidescrolloff = 16
vim.opt.scroll = 8
vim.opt.updatetime = 50
vim.opt.cursorline = true
vim.opt.cursorlineopt = { "number" }
vim.opt.mouse = ""
vim.opt.showmode = false
vim.opt.undofile = true
vim.opt.splitright = true
vim.opt.splitbelow = true
vim.opt.inccommand = 'split'
vim.opt.grepprg = "rg --vimgrep --no-heading --smart-case"

-- Don't pass messages to |ins-completion-menu|.
vim.opt.shortmess:append "c"

-- disable netrw at the very start of your init.lua (strongly advised)
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1
