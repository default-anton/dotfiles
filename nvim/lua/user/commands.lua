vim.api.nvim_create_user_command("Pr", function()
  local Job = require "plenary.job"

  Job:new({
    command = "gh",
    args = { "pr", "view", "-w" },
  }):start()
end, {})

