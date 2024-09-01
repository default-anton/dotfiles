local stt = require("user.stt")

-- Quickfix list navigation
vim.api.nvim_set_keymap('n', '<leader>qo', ':copen<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>qc', ':cclose<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>qn', ':cn<CR>zz', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>qp', ':cp<CR>zz', { noremap = true, silent = true })

local function yank_files_in_current_dir()
  local current_dir = vim.fn.expand('%:p:h')
  local bash_cmd = { "fd", "", "-tf", current_dir, "-X", "tail", "+1" }
  local result = table.concat(vim.fn.systemlist(bash_cmd), "\n")
  vim.fn.setreg('"', "Here is what I'm working on:\n```\n" .. result .. "\n```", 'l')
end

-- LLM integration
vim.keymap.set('n', '<leader>yd', yank_files_in_current_dir,
  { noremap = true, silent = true, desc = "Yank files in current directory" })
vim.api.nvim_set_keymap('n', '<leader>aa', ':Ask<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>as', ':Ask split<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>av', ':Ask vsplit<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('v', '<leader>aa', ':Ask<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('v', '<leader>as', ':Ask split<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('v', '<leader>av', ':Ask vsplit<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>aff', ':Ask file<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>afs', ':Ask file split<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>afv', ':Ask file vsplit<CR>', { noremap = true, silent = true })

-- Run tests
vim.api.nvim_set_keymap('n', '<leader>rf', '<cmd>TestFile<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>rr', '<cmd>TestNearest<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>rl', '<cmd>TestLast<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>ra', '<cmd>TestSuite<CR>', { noremap = true, silent = true })

-- LazyGit integration
vim.api.nvim_set_keymap('n', '<leader>gg', '<cmd>LazyGit<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>gf', '<cmd>LazyGitFilterCurrentFile<CR>', { noremap = true, silent = true })

-- Resize splits with Ctrl-Shift-Arrow keys
vim.api.nvim_set_keymap('n', '<C-S-Up>', '<cmd>resize -6<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<C-S-Down>', '<cmd>resize +6<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<C-S-Left>', '<cmd>vertical resize -6<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<C-S-Right>', '<cmd>vertical resize +6<CR>', { noremap = true, silent = true })

-- Window navigation using Ctrl + hjkl
vim.api.nvim_set_keymap('n', '<C-k>', '<C-W>k', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<C-j>', '<C-W>j', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<C-h>', '<C-W>h', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<C-l>', '<C-W>l', { noremap = true, silent = true })

-- Enhanced scrolling with Ctrl-d/u
vim.api.nvim_set_keymap('n', '<C-d>', '8jzzzv', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<C-u>', '8kzzzv', { noremap = true, silent = true })

-- Yank to clipboard
vim.api.nvim_set_keymap('n', '<leader>y', '"+y', { noremap = true, silent = true })
vim.api.nvim_set_keymap('v', '<leader>y', '"+y', { noremap = true, silent = true })

-- Paste from clipboard
vim.api.nvim_set_keymap('n', '<leader>p', '"+p', { noremap = true, silent = true })
vim.api.nvim_set_keymap('v', '<leader>p', '"+p', { noremap = true, silent = true })

vim.keymap.set('i', '<C-o>', stt.run_whisper_transcription,
  { noremap = true, silent = true, desc = "Run Whisper transcription" })

vim.api.nvim_set_keymap('n', 'sm', '<cmd>set opfunc=v:lua.convert_snake_to_mixed_opfunc<CR>g@', {})
