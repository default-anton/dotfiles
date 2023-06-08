vim.api.nvim_create_user_command("pr", function()
  local Job = require "plenary.job"

  Job:new({
    command = "gh",
    args = { "pr", "view", "--web" },
  }):start()
end, {})
