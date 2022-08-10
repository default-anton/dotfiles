local fzf_lua = require("fzf-lua")

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

local fzf_dirs = function(opts)
  opts = opts or {}
  opts.prompt = "Directories> "
  opts.winopts = { width = 0.6, row = 0.6, height = 0.6 }
  opts.actions = {
    ['default'] = function(selected)
      vim.cmd("e " .. selected[1])
    end
  }
  fzf_lua.fzf_exec("fd '' -t d -d 1 --hidden ~ ~/code .", opts)
end

-- or to a keybind, both below are (sort of) equal
vim.keymap.set('n', '<leader>cd', fzf_dirs)
