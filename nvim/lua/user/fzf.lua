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
      vim.cmd("cd " .. selected[1] .. " | e " .. selected[1])
    end,
  }
  fzf_lua.fzf_exec("fd '' -t d -d 1 --hidden ~ ~/code .", opts)
end

vim.keymap.set("n", "<leader>cd", global_cd)

local select_cwd = function(callback)
  local opts = {}
  opts.prompt = "Directories> "
  opts.winopts = { width = 0.6, row = 0.6, height = 0.6 }
  opts.actions = {
    ["default"] = function(selected)
      callback(selected)
    end,
  }

  fzf_lua.fzf_exec("fd -t d --no-ignore --hidden -E .git -E node_modules", opts)
end

vim.keymap.set("n", "<space>m", fzf_lua.live_grep_native)
vim.keymap.set("n", "<space><space>m", function()
  select_cwd(function(selected)
    fzf_lua.live_grep_native { cwd = selected[1] }
  end)
end)
vim.keymap.set("v", "<space>m", fzf_lua.grep_visual)
vim.keymap.set("v", "<space><space>m", function()
  local search = utils.get_visual_selection()

  select_cwd(function(selected)
    fzf_lua.grep { search = search, cwd = selected[1] }
  end)
end)
vim.keymap.set("n", "<space>w", fzf_lua.grep_cword)
vim.keymap.set("n", "<space><space>w", function()
  select_cwd(function(selected)
    fzf_lua.grep_cword { cwd = selected[1] }
  end)
end)
vim.keymap.set("n", "<space><leader>", function()
  fzf_lua.files { winopts = { row = 0.5, height = 0.5 } }
end)
vim.keymap.set("n", "<space><space><leader>", function()
  select_cwd(function(selected)
    fzf_lua.files { cwd = selected[1], winopts = { row = 0.5, height = 0.5 } }
  end)
end)
