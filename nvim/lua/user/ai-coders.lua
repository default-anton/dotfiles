local M = {}

local CLIS = {
  { name = "bin/pi", prefix = "@" },
  { name = "claude", prefix = "@" },
  { name = "gemini", prefix = "@" },
  { name = "codex",  prefix = "" },
}

function M.get_active_cli()
  for _, cli in ipairs(CLIS) do
    local tmux_pane = vim.trim(vim.fn.system("tmux-find " .. cli.name))
    if tmux_pane ~= "" then
      return tmux_pane, cli.prefix
    end
  end
  return nil, nil
end

function M.send_file_references(paths)
  if type(paths) ~= "table" then
    paths = { paths }
  end

  local tmux_pane, reference_prefix = M.get_active_cli()

  if tmux_pane then
    local relative_paths = vim.tbl_map(function(path)
      return (reference_prefix or "") .. vim.fn.fnamemodify(path, ":.")
    end, paths)
    local references = table.concat(relative_paths, ", ")
    vim.fn.system(string.format('tmux send-keys -t %s "%s"', tmux_pane, references .. ", "))
  end
end

-- Set up an autocmd to run when entering buffers
vim.api.nvim_create_autocmd({ "BufEnter", "BufWinEnter" }, {
  callback = function()
    local opts = { noremap = true, silent = true, buffer = vim.api.nvim_get_current_buf() }
    -- Check if current buffer is not a telescope prompt
    if vim.bo.filetype ~= "TelescopePrompt" and vim.bo.filetype ~= "oil" then
      vim.keymap.set('n', '<C-a>', function()
        M.send_file_references({ vim.fn.expand('%') })
      end, vim.tbl_extend('force', opts, { desc = 'Send file reference to AI CLI tmux pane' }))

      vim.keymap.set('v', '<C-a>', function()
        -- Get the current visual selection positions
        local start_line = vim.fn.line("v")
        local end_line = vim.fn.line(".")
        -- Ensure start_line is before end_line
        if start_line > end_line then
          start_line, end_line = end_line, start_line
        end
        local file_path = vim.fn.expand('%')

        local reference
        if start_line == end_line then
          reference = string.format('%s#L%d, ', file_path, start_line)
        else
          reference = string.format('%s#L%d-%d, ', file_path, start_line, end_line)
        end

        local tmux_pane, reference_prefix = M.get_active_cli()

        if tmux_pane then
          reference = (reference_prefix or "") .. reference
          vim.fn.system(string.format('tmux send-keys -t %s "%s"', tmux_pane, reference))
        end
      end, vim.tbl_extend('force', opts, { desc = 'Send line reference to AI CLI tmux pane' }))
    end
  end,
})

return M
