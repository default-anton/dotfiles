local restart_things = vim.api.nvim_create_augroup("RestartThings", { clear = true })

vim.api.nvim_create_autocmd("BufWritePost", {
  pattern = "nvimrc, .nvimrc",
  command = ":so %",
  group = restart_things,
  desc = "Reload nvimrc on write",
})

local yank_group = vim.api.nvim_create_augroup("HighlightYank", { clear = true })

vim.api.nvim_create_autocmd("TextYankPost", {
  group = yank_group,
  callback = function()
    vim.highlight.on_yank {
      higroup = "IncSearch",
      timeout = 150,
    }
  end,
  desc = "Highlight yanked text for 150ms",
})

local terminal_group = vim.api.nvim_create_augroup("Terminal", { clear = true })

vim.api.nvim_create_autocmd('TermClose', {
  group = terminal_group,
  callback = function(event)
    local lines = vim.api.nvim_buf_get_lines(0, 0, -1, false)

    if vim.v.event.status ~= 0 then
      local output = vim.trim(table.concat(lines, '\n'))
      local command = event.file:match("^term:[^:]+:(.*)$")

      vim.fn.setreg('t', table.concat({
        "Command: " .. command,
        "Output:",
        "````",
        output,
        "````",
      }, '\n'))
    end
  end,
  desc = "Copy terminal output to t register on error",
})
