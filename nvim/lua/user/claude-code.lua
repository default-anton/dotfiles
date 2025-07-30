-- Visual mode mapping to copy line reference to system clipboard
vim.keymap.set('v', 'sl', function()
  local start_line = vim.fn.line("'<")
  local end_line = vim.fn.line("'>")
  local file_path = vim.fn.expand('%')

  local reference
  if start_line == end_line then
    reference = string.format('@%s#L%d', file_path, start_line)
  else
    reference = string.format('@%s#L%d-%d', file_path, start_line, end_line)
  end

  vim.fn.setreg('+', reference)
end, { desc = 'Copy line reference to clipboard' })

-- Normal mode mapping to copy the file reference to system clipboard
vim.keymap.set('n', 'sf', function()
  vim.fn.setreg('+', string.format('@%s', vim.fn.expand('%')))
end, { desc = 'Copy file reference to clipboard' })

-- Normal mode mapping to copy the current line reference to system clipboard
vim.keymap.set('n', 'sl', function()
  vim.fn.setreg('+', string.format('@%s#L%d', vim.fn.expand('%'), vim.fn.line('.')))
end, { desc = 'Copy line reference to clipboard' })
