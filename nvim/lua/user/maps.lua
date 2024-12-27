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
vim.api.nvim_set_keymap('n', '<leader>qp', ':cp<CR>zz',
  { noremap = true, silent = true, desc = "Previous quickfix item" })

local function prompt_for_model(aliases)
  local model_map = {}
  for _, alias in ipairs(aliases) do
    local first_char = alias:sub(1, 1):lower()
    model_map[first_char] = model_map[first_char] or {}
    table.insert(model_map[first_char], alias)
  end

  local options = { "" } -- Start with empty line
  for key, values in pairs(model_map) do
    table.insert(options, string.format("[%s] %s", key:lower(), table.concat(values, ", ")))
  end

  -- Display with proper highlighting
  vim.api.nvim_echo({
    { "┌─ Select a model ─────────────────", "Title" }, -- Header
    { table.concat(options, "\n") .. "\n└───────────────────────────────", "Normal" }, -- Options
    { "Type letter to select (any invalid input cancels): ", "Question" } -- Input prompt
  }, false, {})
  local model_char_code = vim.fn.getchar()
  local model_char = string.char(model_char_code):lower()
  vim.api.nvim_echo({}, false, {})

  local matches = model_map[model_char]
  if not matches then
    return nil
  end

  if #matches == 1 then
    return matches[1]
  end

  options = { "" } -- Start with empty line
  for i, match in ipairs(matches) do
    table.insert(options, string.format('%d. %s', i, match))
  end

  -- Clear the prompt line
  -- Display with proper highlighting
  vim.api.nvim_echo({
    { "\n\n┌─ Multiple models found. Select a model ─────────────────", "Title" }, -- Header
    { table.concat(options, "\n") .. "\n└───────────────────────────────", "Normal" }, -- Options
    { "Type number to select (any invalid input cancels): ", "Question" } -- Input prompt
  }, false, {})

  local number = tonumber(string.char(vim.fn.getchar()))
  vim.api.nvim_echo({}, false, {})

  if not number or number < 1 or number > #matches then
    return nil
  end

  return matches[number]
end

local function execute_llm_command(cmd)
  local aliases = require("llm-sidekick.settings").get_aliases()
  local model = prompt_for_model(aliases)

  if not model then
    return
  end

  local mode = vim.fn.mode()
  if mode == 'n' then
    vim.cmd(string.format('%s %s split', cmd, model))
  elseif mode == 'v' or mode == 'V' then
    -- Get the current visual selection positions
    local start_line = vim.fn.line("v")
    local end_line = vim.fn.line(".")

    -- Ensure start_line is before end_line
    if start_line > end_line then
      start_line, end_line = end_line, start_line
    end

    local range = string.format('%d,%d', start_line, end_line)
    vim.cmd(string.format('%s:%s split %s', range, cmd, model))
  end
end

vim.keymap.set('n', '<leader>la', function() execute_llm_command('Ask %') end,
  { silent = true, desc = "Ask LLM about current buffer" })
vim.keymap.set('v', '<leader>la', function() execute_llm_command('Ask') end,
  { silent = true, desc = "Ask LLM about selection" })
vim.keymap.set('n', '<leader>lc', function() execute_llm_command('Code %') end,
  { silent = true, desc = "Start coding with LLM on current buffer" })
vim.keymap.set('v', '<leader>lc', function() execute_llm_command('Code') end,
  { silent = true, desc = "Start coding with LLM on selection" })
vim.keymap.set('n', '<leader>ll', function() execute_llm_command('Yolo %') end,
  { silent = true, desc = "Start coding with LLM on current buffer" })
vim.keymap.set('v', '<leader>ll', function() execute_llm_command('Yolo') end,
  { silent = true, desc = "Start coding with LLM on selection" })
vim.keymap.set('n', '<leader>ld', function() execute_llm_command('Code %:h') end,
  { silent = true, desc = "Start coding with LLM on current buffer" })
vim.api.nvim_set_keymap('n', '<leader>lp', ':Apply all<CR>',
  { noremap = true, silent = true, desc = "Apply all LLM changes" })
vim.api.nvim_set_keymap('n', '<leader>ad', ':Add<CR>', { noremap = true, silent = true, desc = "Add context to LLM" })
vim.api.nvim_set_keymap('v', '<leader>ad', ':Add<CR>',
  { noremap = true, silent = true, desc = "Add selected context to LLM" })

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

-- Yank to clipboard
vim.api.nvim_set_keymap('n', '<leader>y', '"+y', { noremap = true, silent = true, desc = "Yank to system clipboard" })
vim.api.nvim_set_keymap('v', '<leader>y', '"+y', { noremap = true, silent = true, desc = "Yank to system clipboard" })

-- Paste from clipboard
vim.api.nvim_set_keymap('n', '<leader>p', '"+p', { noremap = true, silent = true, desc = "Paste from system clipboard" })
vim.api.nvim_set_keymap('v', '<leader>p', '"+p', { noremap = true, silent = true, desc = "Paste from system clipboard" })

vim.api.nvim_set_keymap('i', '<C-o>', '<cmd>Stt<CR>', { noremap = true, silent = true, desc = "Speech to text" })

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
