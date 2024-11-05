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

vim.api.nvim_create_user_command("Ctest", function()
  local current_file = vim.fn.expand("%")
  local spec_file = current_file:gsub("^app", "spec"):gsub("%.rb$", "_spec.rb")
  local spec_dir = vim.fn.fnamemodify(spec_file, ":h")
  vim.fn.mkdir(spec_dir, "p")
  vim.cmd("edit " .. spec_file)
end, { desc = "Create a spec file for the current file" })
