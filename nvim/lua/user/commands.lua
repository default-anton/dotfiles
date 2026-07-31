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

vim.api.nvim_create_user_command("Br", function(opts)
  local branch = opts.args
  if branch == "" then
    vim.notify("Branch name or URL is required", vim.log.levels.ERROR)
    return
  end

  vim.fn.system "cd /Users/akuzmenko/code/aha-dev-cli && git pull --rebase && bundle"

  local Job = require "plenary.job"
  local create_branch = Job:new {
    command = "aha",
    args = { "branch", branch },
  }

  create_branch:sync(10000)

  vim.notify("Branch created: " .. branch, vim.log.levels.INFO)
end, { nargs = 1, desc = "Create a new branch using aha-dev-cli" })

vim.api.nvim_create_user_command("Feat", function()
  local current_branch = vim.fn.system("git rev-parse --abbrev-ref HEAD"):gsub("\n", "")
  local feature_key = string.match(current_branch, "[A-Z]+%-%d+%-%d+")
  if feature_key == nil then
    feature_key = string.match(current_branch, "[A-Z]+%-%d+")
    if feature_key == nil then
      vim.api.nvim_echo({ { "No feature key found." } }, true, {})
      return
    end

    vim.fn.system("open https://" .. vim.env.AHA_DOMAIN .. ".aha.io/features/" .. feature_key)
  else
    vim.fn.system("open https://" .. vim.env.AHA_DOMAIN .. ".aha.io/requirements/" .. feature_key)
  end
end, { nargs = 0 })
