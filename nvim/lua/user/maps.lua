vim.api.nvim_set_keymap('n', '<leader>qo', ':copen<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>qc', ':cclose<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>qn', ':cn<CR>zz', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>qp', ':cp<CR>zz', { noremap = true, silent = true })

vim.api.nvim_set_keymap('n', '<leader>ao', '<cmd>Ask<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('v', '<leader>ao', ':\'<,\'>Ask<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>ac', '<cmd>Ask claude-3-opus-20240229<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('v', '<leader>ac', ':\'<,\'>Ask claude-3-opus-20240229<CR>', { noremap = true, silent = true })
