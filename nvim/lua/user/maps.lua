-- Yank current file path relative to the project root
vim.api.nvim_set_keymap('n', '<leader>yf', [[:let @+ = expand('%')<CR>]],
  { noremap = true, silent = true, desc = "Yank file path" })

-- Yank current file path with line number relative to the project root
vim.api.nvim_set_keymap('n', '<leader>yl', [[:let @+ = expand('%') . ':' . line('.')<CR>]],
  { noremap = true, silent = true, desc = "Yank file path with line number" })

-- Yank absolute path of current file
vim.api.nvim_set_keymap('n', '<leader>ya', [[:let @+ = expand('%:p')<CR>]],
  { noremap = true, silent = true, desc = "Yank absolute file path" })

-- Quickfix list navigation
vim.api.nvim_set_keymap('n', '<leader>qo', ':copen<CR>', { noremap = true, silent = true, desc = "Open quickfix list" })
vim.api.nvim_set_keymap('n', '<leader>qc', ':cclose<CR>', { noremap = true, silent = true, desc = "Close quickfix list" })
vim.api.nvim_set_keymap('n', '<leader>qn', ':cn<CR>zz', { noremap = true, silent = true, desc = "Next quickfix item" })
vim.api.nvim_set_keymap('n', '<leader>qp', ':cp<CR>zz', { noremap = true, silent = true, desc = "Previous quickfix item" })

-- LLM integration
vim.api.nvim_set_keymap('n', '<leader>la', ':Ask split file<CR>', { noremap = true, silent = true, desc = "Ask LLM about current buffer" })
vim.api.nvim_set_keymap('v', '<leader>la', ':Ask split<CR>', { noremap = true, silent = true, desc = "Ask LLM about selection" })
vim.api.nvim_set_keymap('n', '<leader>lc', ':Code split file<CR>', { noremap = true, silent = true, desc = "Start coding with LLM on current buffer" })
vim.api.nvim_set_keymap('v', '<leader>lc', ':Code split<CR>', { noremap = true, silent = true, desc = "Start coding with LLM on selection" })
vim.api.nvim_set_keymap('n', '<leader>lp', ':Apply all<CR>', { noremap = true, silent = true, desc = "Apply all LLM changes" })
vim.api.nvim_set_keymap('n', '<leader>ad', ':Add<CR>', { noremap = true, silent = true, desc = "Add context to LLM" })
vim.api.nvim_set_keymap('v', '<leader>ad', ':Add<CR>', { noremap = true, silent = true, desc = "Add selected context to LLM" })

-- Run tests
vim.api.nvim_set_keymap('n', '<leader>rf', '<cmd>TestFile<CR>', { noremap = true, silent = true, desc = "Run tests in current file" })
vim.api.nvim_set_keymap('n', '<leader>rr', '<cmd>TestNearest<CR>', { noremap = true, silent = true, desc = "Run nearest test" })
vim.api.nvim_set_keymap('n', '<leader>rl', '<cmd>TestLast<CR>', { noremap = true, silent = true, desc = "Run last test" })
vim.api.nvim_set_keymap('n', '<leader>ra', '<cmd>TestSuite<CR>', { noremap = true, silent = true, desc = "Run all tests" })

-- LazyGit integration
vim.api.nvim_set_keymap('n', '<leader>gg', '<cmd>LazyGit<CR>', { noremap = true, silent = true, desc = "Open LazyGit" })
vim.api.nvim_set_keymap('n', '<leader>gf', '<cmd>LazyGitFilterCurrentFile<CR>', { noremap = true, silent = true, desc = "Open LazyGit with current file filter" })

-- Resize splits with Ctrl-Shift-Arrow keys
vim.api.nvim_set_keymap('n', '<C-S-Up>', '<cmd>resize -6<CR>', { noremap = true, silent = true, desc = "Decrease window height" })
vim.api.nvim_set_keymap('n', '<C-S-Down>', '<cmd>resize +6<CR>', { noremap = true, silent = true, desc = "Increase window height" })
vim.api.nvim_set_keymap('n', '<C-S-Left>', '<cmd>vertical resize -6<CR>', { noremap = true, silent = true, desc = "Decrease window width" })
vim.api.nvim_set_keymap('n', '<C-S-Right>', '<cmd>vertical resize +6<CR>', { noremap = true, silent = true, desc = "Increase window width" })

-- Window navigation using Ctrl + hjkl
vim.api.nvim_set_keymap('n', '<C-k>', '<C-W>k', { noremap = true, silent = true, desc = "Move to window above" })
vim.api.nvim_set_keymap('n', '<C-j>', '<C-W>j', { noremap = true, silent = true, desc = "Move to window below" })
vim.api.nvim_set_keymap('n', '<C-h>', '<C-W>h', { noremap = true, silent = true, desc = "Move to left window" })
vim.api.nvim_set_keymap('n', '<C-l>', '<C-W>l', { noremap = true, silent = true, desc = "Move to right window" })

-- Enhanced scrolling with Ctrl-d/u
vim.api.nvim_set_keymap('n', '<C-d>', '8jzzzv', { noremap = true, silent = true, desc = "Scroll 8 lines down" })
vim.api.nvim_set_keymap('n', '<C-u>', '8kzzzv', { noremap = true, silent = true, desc = "Scroll 8 lines up" })

-- Yank to clipboard
vim.api.nvim_set_keymap('n', '<leader>y', '"+y', { noremap = true, silent = true, desc = "Yank to system clipboard" })
vim.api.nvim_set_keymap('v', '<leader>y', '"+y', { noremap = true, silent = true, desc = "Yank to system clipboard" })

-- Paste from clipboard
vim.api.nvim_set_keymap('n', '<leader>p', '"+p', { noremap = true, silent = true, desc = "Paste from system clipboard" })
vim.api.nvim_set_keymap('v', '<leader>p', '"+p', { noremap = true, silent = true, desc = "Paste from system clipboard" })

vim.api.nvim_set_keymap('i', '<C-o>', '<cmd>Stt<CR>', { noremap = true, silent = true, desc = "Speech to text" })

vim.api.nvim_set_keymap('n', 'sm', '<cmd>set opfunc=v:lua.convert_to_mixed_case_opfunc<CR>g@', { desc = "Convert to mixed case" })
vim.api.nvim_set_keymap('v', 'sm', '<cmd>set opfunc=v:lua.convert_to_mixed_case_opfunc<CR>g@', { desc = "Convert to mixed case" })
vim.api.nvim_set_keymap('n', 'ss', '<cmd>set opfunc=v:lua.convert_to_snake_case_opfunc<CR>g@', { desc = "Convert to snake_case" })
vim.api.nvim_set_keymap('v', 'ss', '<cmd>set opfunc=v:lua.convert_to_snake_case_opfunc<CR>g@', { desc = "Convert to snake_case" })
vim.api.nvim_set_keymap('n', 's_', '<cmd>set opfunc=v:lua.convert_to_snake_case_opfunc<CR>g@', { desc = "Convert to snake_case" })
vim.api.nvim_set_keymap('v', 's_', '<cmd>set opfunc=v:lua.convert_to_snake_case_opfunc<CR>g@', { desc = "Convert to snake_case" })
vim.api.nvim_set_keymap('n', 's-', '<cmd>set opfunc=v:lua.convert_to_kebab_case_opfunc<CR>g@', { desc = "Convert to kebab-case" })
vim.api.nvim_set_keymap('v', 's-', '<cmd>set opfunc=v:lua.convert_to_kebab_case_opfunc<CR>g@', { desc = "Convert to kebab-case" })
vim.api.nvim_set_keymap('n', 'sc', '<cmd>set opfunc=v:lua.convert_to_camel_case_opfunc<CR>g@', { desc = "Convert to camelCase" })
vim.api.nvim_set_keymap('v', 'sc', '<cmd>set opfunc=v:lua.convert_to_camel_case_opfunc<CR>g@', { desc = "Convert to camelCase" })

