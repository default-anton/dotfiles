local nvim_tree = require "nvim-tree"
local tree_cb = require("nvim-tree.config").nvim_tree_callback

local win_height = vim.api.nvim_win_get_height(0)
local win_width = vim.api.nvim_win_get_width(0)
local float_height = math.floor(math.min(70, win_height * 0.7))
local float_width = math.floor(math.min(90, win_width * 0.7))
local float_row = math.floor((vim.api.nvim_win_get_height(0) - float_height) / 2)
local float_col = math.floor((vim.api.nvim_win_get_width(0) - float_width) / 2)

nvim_tree.setup {
  sync_root_with_cwd = true,
  update_focused_file = {
    enable = true,
    update_root = true,
  },
  renderer = {
    full_name = true,
    root_folder_modifier = ":t",
    icons = {
      glyphs = {
        default = "",
        symlink = "",
        folder = {
          arrow_open = "",
          arrow_closed = "",
          default = "",
          open = "",
          empty = "",
          empty_open = "",
          symlink = "",
          symlink_open = "",
        },
        git = {
          unstaged = "",
          staged = "S",
          unmerged = "",
          renamed = "➜",
          untracked = "U",
          deleted = "",
          ignored = "◌",
        },
      },
    },
  },
  diagnostics = {
    enable = false,
    show_on_dirs = true,
    icons = {
      hint = "",
      info = "",
      warning = "",
      error = "",
    },
  },
  view = {
    width = float_width,
    height = float_height,
    side = "left",
    relativenumber = true,
    mappings = {
      list = {
        { key = { "l", "<CR>", "o" }, cb = tree_cb "edit" },
        { key = "h", cb = tree_cb "close_node" },
        { key = "v", cb = tree_cb "vsplit" },
      },
    },
    float = {
      enable = true,
      open_win_config = {
        relative = "editor",
        border = "rounded",
        width = float_width,
        height = float_height,
        row = float_row,
        col = float_col,
      },
    },
  },
  git = {
    ignore = false,
  },
}
