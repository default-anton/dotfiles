local ts_repeat_move = require "nvim-treesitter.textobjects.repeatable_move"

-- Repeat movement with ; and ,
-- ensure ; goes forward and , goes backward regardless of the last direction
vim.keymap.set({ "n", "x", "o" }, ";", ts_repeat_move.repeat_last_move, { desc = "Repeat last move next" })
vim.keymap.set({ "n", "x", "o" }, ",", ts_repeat_move.repeat_last_move, { desc = "Repeat last move previous" })

-- Optionally, make builtin f, F, t, T also repeatable with ; and ,
vim.keymap.set({ "n", "x", "o" }, "f", ts_repeat_move.builtin_f_expr, { expr = true, desc = "Repeat f" })
vim.keymap.set({ "n", "x", "o" }, "F", ts_repeat_move.builtin_F_expr, { expr = true, desc = "Repeat F" })
vim.keymap.set({ "n", "x", "o" }, "t", ts_repeat_move.builtin_t_expr, { expr = true, desc = "Repeat t" })
vim.keymap.set({ "n", "x", "o" }, "T", ts_repeat_move.builtin_T_expr, { expr = true, desc = "Repeat T" })

-- toggle node under cursor (split if one-line and join if multiline)
vim.keymap.set("n", "gj", require('treesj').toggle, { desc = "Toggle treesj node" })
vim.keymap.set("n", "gJ", function()
  require('treesj').toggle({ split = { recursive = true } })
end, { desc = "Toggle treesj node recursively" })

-- Yank current file path relative to the project root
vim.api.nvim_set_keymap('n', 'gyf', [[:let @+ = expand('%')<CR>]],
  { noremap = true, silent = true, desc = "Yank file path" })

-- Yank current file path with line number relative to the project root
vim.api.nvim_set_keymap('n', 'gyl', [[:let @+ = expand('%') . ':' . line('.')<CR>]],
  { noremap = true, silent = true, desc = "Yank file path with line number" })

function copy_line_nums_to_clipboard()
  local start_line = vim.fn.line("v")
  local end_line = vim.fn.line(".")

  -- Ensure start_line is before end_line
  if start_line > end_line then
    start_line, end_line = end_line, start_line
  end

  local file_path = vim.fn.expand('%')
  local range = string.format('%s:%d-%d', file_path, start_line, end_line)
  vim.fn.setreg('+', range)
end

vim.keymap.set('v', 'gyl', copy_line_nums_to_clipboard,
  { noremap = true, silent = true, desc = "Yank file path with line numbers" })

-- Yank absolute path of current file
vim.api.nvim_set_keymap('n', 'gya', [[:let @+ = expand('%:p')<CR>]],
  { noremap = true, silent = true, desc = "Yank absolute file path" })

vim.api.nvim_set_keymap('n', '<leader>tt', ':TSContextToggle<CR>',
  { noremap = true, silent = true, desc = "Toggle Treesitter context" })

-- Quickfix list navigation
vim.api.nvim_set_keymap('n', '<leader>qo', ':copen<CR>', { noremap = true, silent = true, desc = "Open quickfix list" })
vim.api.nvim_set_keymap('n', '<leader>qd', ':cclose<CR>', { noremap = true, silent = true, desc = "Close quickfix list" })
vim.api.nvim_set_keymap('n', '<leader>qn', ':cn<CR>zz', { noremap = true, silent = true, desc = "Next quickfix item" })
vim.api.nvim_set_keymap('n', '<leader>qp', ':cp<CR>zz',
  { noremap = true, silent = true, desc = "Previous quickfix item" })

-- Run tests
vim.api.nvim_set_keymap('n', '<leader>rf', '<cmd>TestFile<CR>',
  { noremap = true, silent = true, desc = "Run tests in current file" })
vim.api.nvim_set_keymap('n', '<leader>rr', '<cmd>TestNearest<CR>',
  { noremap = true, silent = true, desc = "Run nearest test" })
vim.api.nvim_set_keymap('n', '<leader>rl', '<cmd>TestLast<CR>', { noremap = true, silent = true, desc = "Run last test" })
vim.api.nvim_set_keymap('n', '<leader>ra', '<cmd>TestSuite<CR>',
  { noremap = true, silent = true, desc = "Run all tests" })

-- LazyGit integration
vim.api.nvim_set_keymap('n', '<leader>gg', '<cmd>LazyGit<CR>', { noremap = true, silent = true, desc = "Open LazyGit" })
vim.api.nvim_set_keymap('n', '<leader>gf', '<cmd>LazyGitFilterCurrentFile<CR>',
  { noremap = true, silent = true, desc = "Open LazyGit with current file filter" })

-- Resize splits with Ctrl-Shift-Arrow keys
vim.api.nvim_set_keymap('n', '<C-S-Up>', '<cmd>resize -6<CR>',
  { noremap = true, silent = true, desc = "Decrease window height" })
vim.api.nvim_set_keymap('n', '<C-S-Down>', '<cmd>resize +6<CR>',
  { noremap = true, silent = true, desc = "Increase window height" })
vim.api.nvim_set_keymap('n', '<C-S-Left>', '<cmd>vertical resize -6<CR>',
  { noremap = true, silent = true, desc = "Decrease window width" })
vim.api.nvim_set_keymap('n', '<C-S-Right>', '<cmd>vertical resize +6<CR>',
  { noremap = true, silent = true, desc = "Increase window width" })

-- Enhanced scrolling with Ctrl-d/u
vim.api.nvim_set_keymap('n', '<C-d>', '8jzzzv', { noremap = true, silent = true, desc = "Scroll 8 lines down" })
vim.api.nvim_set_keymap('n', '<C-u>', '8kzzzv', { noremap = true, silent = true, desc = "Scroll 8 lines up" })

local function get_diagnostic_info()
  local diagnostics = vim.diagnostic.get(0)
  if #diagnostics == 0 then
    return "No diagnostics found for current buffer"
  end

  local result = {}
  local processed_lines = {}

  for _, diag in ipairs(diagnostics) do
    if not processed_lines[diag.lnum] then
      local start_line = math.max(0, diag.lnum - 3)
      local end_line = diag.lnum + 3
      local lines = vim.api.nvim_buf_get_lines(0, start_line, end_line + 1, false)

      table.insert(result, string.format(
        "[%s] %s: %s",
        diag.severity and vim.diagnostic.severity[diag.severity] or "UNKNOWN",
        diag.code or "N/A",
        diag.message:gsub("\n", " ")
      ))

      table.insert(result, "Code context:")
      table.insert(result, "```")
      for _, line in ipairs(lines) do
        table.insert(result, line)
      end
      table.insert(result, "```")
      table.insert(result, "")
      processed_lines[diag.lnum] = true
    end
  end

  return table.concat(result, "\n")
end

vim.keymap.set('n', 'gyd', function()
  local diagnostics = get_diagnostic_info()
  vim.fn.setreg('"', diagnostics)
end, { desc = "Copy diagnostic info to default register" })

-- Yank to clipboard
vim.api.nvim_set_keymap('n', '<leader>y', '"+y', { noremap = true, silent = true, desc = "Yank to system clipboard" })
vim.api.nvim_set_keymap('v', '<leader>y', '"+y', { noremap = true, silent = true, desc = "Yank to system clipboard" })

-- Paste from clipboard
vim.api.nvim_set_keymap('n', '<leader>p', '"+p', { noremap = true, silent = true, desc = "Paste from system clipboard" })
vim.api.nvim_set_keymap('v', '<leader>p', '"+p', { noremap = true, silent = true, desc = "Paste from system clipboard" })

vim.api.nvim_set_keymap('i', '<C-o>', '<cmd>Stt<CR>', { noremap = true, silent = true, desc = "Speech to text" })

vim.keymap.set('i', '<C-L>', '<Plug>(copilot-accept-word)', { desc = "Accept copilot word" })

vim.api.nvim_set_keymap('n', 'sm', '<cmd>set opfunc=v:lua.convert_to_mixed_case_opfunc<CR>g@',
  { desc = "Convert to mixed case" })
vim.api.nvim_set_keymap('v', 'sm', '<cmd>set opfunc=v:lua.convert_to_mixed_case_opfunc<CR>g@',
  { desc = "Convert to mixed case" })
vim.api.nvim_set_keymap('n', 'ss', '<cmd>set opfunc=v:lua.convert_to_snake_case_opfunc<CR>g@',
  { desc = "Convert to snake_case" })
vim.api.nvim_set_keymap('v', 'ss', '<cmd>set opfunc=v:lua.convert_to_snake_case_opfunc<CR>g@',
  { desc = "Convert to snake_case" })
vim.api.nvim_set_keymap('n', 's_', '<cmd>set opfunc=v:lua.convert_to_snake_case_opfunc<CR>g@',
  { desc = "Convert to snake_case" })
vim.api.nvim_set_keymap('v', 's_', '<cmd>set opfunc=v:lua.convert_to_snake_case_opfunc<CR>g@',
  { desc = "Convert to snake_case" })
vim.api.nvim_set_keymap('n', 's-', '<cmd>set opfunc=v:lua.convert_to_kebab_case_opfunc<CR>g@',
  { desc = "Convert to kebab-case" })
vim.api.nvim_set_keymap('v', 's-', '<cmd>set opfunc=v:lua.convert_to_kebab_case_opfunc<CR>g@',
  { desc = "Convert to kebab-case" })
vim.api.nvim_set_keymap('n', 'sc', '<cmd>set opfunc=v:lua.convert_to_camel_case_opfunc<CR>g@',
  { desc = "Convert to camelCase" })
vim.api.nvim_set_keymap('v', 'sc', '<cmd>set opfunc=v:lua.convert_to_camel_case_opfunc<CR>g@',
  { desc = "Convert to camelCase" })
