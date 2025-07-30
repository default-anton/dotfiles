-- Visual mode mapping to send line reference to closest tmux pane running claude
vim.keymap.set('v', 'sl', function()
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
    reference = string.format('@%s#L%d, ', file_path, start_line)
  else
    reference = string.format('@%s#L%d-%d, ', file_path, start_line, end_line)
  end

  -- Get the closest tmux pane running claude
  local tmux_pane = vim.trim(vim.fn.system('tmux-find-claude'))
  if tmux_pane ~= '' then
    vim.fn.system(string.format('tmux send-keys -t %s "%s"', tmux_pane, reference))
  end
end, { desc = 'Send line reference to claude tmux pane' })

-- Normal mode mapping to send file reference to closest tmux pane running claude
vim.keymap.set('n', 'sf', function()
  local reference = string.format('@%s, ', vim.fn.expand('%'))

  -- Get the closest tmux pane running claude
  local tmux_pane = vim.trim(vim.fn.system('tmux-find-claude'))
  if tmux_pane ~= '' then
    vim.fn.system(string.format('tmux send-keys -t %s "%s"', tmux_pane, reference))
  end
end, { desc = 'Send file reference to claude tmux pane' })

-- Normal mode mapping to send current line reference to closest tmux pane running claude
vim.keymap.set('n', 'sl', function()
  local reference = string.format('@%s#L%d, ', vim.fn.expand('%'), vim.fn.line('.'))

  -- Get the closest tmux pane running claude
  local tmux_pane = vim.trim(vim.fn.system('tmux-find-claude'))
  if tmux_pane ~= '' then
    vim.fn.system(string.format('tmux send-keys -t %s "%s"', tmux_pane, reference))
  end
end, { desc = 'Send line reference to claude tmux pane' })
