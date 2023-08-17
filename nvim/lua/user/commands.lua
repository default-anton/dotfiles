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
