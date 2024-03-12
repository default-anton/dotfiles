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
end, {})

-- Replace a string in all files in the current directory
vim.api.nvim_create_user_command("Replace", function()
  local replace = vim.fn.input "Replace: "
  if vim.trim(replace) == "" then
    return
  end

  local with = vim.fn.input "With: "
  if vim.trim(with) == "" then
    return
  end

  local rg_command = string.format("rg -w '%s' -l", replace)
  local rg_output = vim.fn.systemlist(rg_command)

  vim.cmd("args " .. table.concat(rg_output, " "))

  vim.cmd(string.format(
    "argdo %%s/%s/%s/ge | update",
    replace,
    with
  ))
end, { nargs = 0 })
