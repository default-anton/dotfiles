local fzf_lua = require "fzf-lua"
local utils = require "fzf-lua.utils"

fzf_lua.setup {
  winopts = {
    preview = {
      vertical = "up:40%",
      horizontal = "right:50%",
      layout = "vertical",
      default = "bat_native",
    },
  },
  files = {
    previewer = false,
    git_icons = false,
  },
  grep = {
    git_icons = false,
  },
  buffers = {
    previewer = false,
    git_icons = false,
  },
  blines = {
    git_icons = false,
  },
}

local global_cd = function(opts)
  opts = opts or {}
  opts.prompt = "Directories> "
  opts.winopts = { width = 0.6, row = 0.6, height = 0.6 }
  opts.actions = {
    ["default"] = function(selected)
      vim.schedule(function()
        vim.cmd("e " .. selected[1])
      end)
    end,
  }
  fzf_lua.fzf_exec("fd '' -t d -d 1 --hidden ~ ~/code .", opts)
end

vim.keymap.set("n", "<leader>cd", global_cd)
vim.keymap.set("n", "<space>m", fzf_lua.live_grep_native)
vim.keymap.set("v", "<space>m", fzf_lua.grep_visual)
vim.keymap.set("n", "<space>w", fzf_lua.grep_cword)
vim.keymap.set("n", "<space><leader>", function()
  fzf_lua.files { winopts = { row = 0.5, height = 0.5 } }
end)
