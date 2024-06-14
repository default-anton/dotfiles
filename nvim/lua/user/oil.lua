local telescope = require "telescope.builtin"
local oil = require("oil")

local live_grep_in_dir = {
  desc = "Live grep in directory",
  callback = function(opts)
    telescope.live_grep { search_dirs = { oil.get_current_dir() } }
  end,
}

local find_files_in_dir = {
  desc = "Find files in directory",
  callback = function(opts)
    telescope.find_files { search_dirs = { oil.get_current_dir() } }
  end,
}

oil.setup({
  win_options = {
    wrap = true,
  },
  delete_to_trash = true,
  skip_confirm_for_simple_edits = true,
  view_options = {
    show_hidden = true,
    is_always_hidden = function(name, bufnr)
      if name == ".." or name == ".git" then
        return true
      end
    end,
  },
  keymaps = {
    ["<leader>m"] = live_grep_in_dir,
    ["<leader>,"] = find_files_in_dir,
  },
})
