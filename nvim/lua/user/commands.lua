vim.api.nvim_create_user_command("Pr", function()
  local Job = require "plenary.job"
  local open_pr = Job:new {
    command = "gh",
    args = { "pr", "view", "--web" },
  }

  open_pr:add_on_exit_callback(vim.schedule_wrap(function(_, code)
    if code ~= 0 then
      vim.fn.system "gh pr create --web"
    end
  end))
  open_pr:start()
end, { desc = "Open PR in browser or create a new one if none exists" })

vim.api.nvim_create_user_command("Ctest", function()
  local current_file = vim.fn.expand("%")
  local spec_file = current_file:gsub("^app", "spec"):gsub("%.rb$", "_spec.rb")
  local spec_dir = vim.fn.fnamemodify(spec_file, ":h")
  vim.fn.mkdir(spec_dir, "p")
  vim.cmd("edit " .. spec_file)
end, { desc = "Create a spec file for the current file" })

vim.api.nvim_create_user_command("Strip", function(opts)
  local Job = require "plenary.job"
  local bufnr = vim.api.nvim_get_current_buf()
  local start_line = 0
  local end_line = -1
  if opts.range == 2 then
    start_line = opts.line1 - 1
    end_line = opts.line2
  end

  local lines = vim.api.nvim_buf_get_lines(bufnr, start_line, end_line, false)
  if #lines == 0 then
    return
  end
  local content = table.concat(lines, "\n")
  local strip = Job:new {
    command = "git",
    args = { "stripspace" },
    writer = content,
  }
  strip:sync()
  local result = strip:result()
  if #result > 0 then
    vim.api.nvim_buf_set_lines(bufnr, start_line, end_line, false, result)
    if vim.api.nvim_get_option_value('modified', { buf = bufnr }) then
      vim.cmd('write')
    end
  else
    error("Failed to strip whitespace")
  end
end, { desc = "Remove trailing whitespace from buffer or selection", range = true })
