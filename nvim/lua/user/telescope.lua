local builtin = require "telescope.builtin"
local extensions = require("telescope").extensions
local file_browser = extensions.file_browser.file_browser
local fb_actions = extensions.file_browser.actions

local actions = require "telescope.actions"
local action_state = require "telescope.actions.state"

vim.keymap.set("n", "<space>h", builtin.help_tags, {})
vim.keymap.set("n", "<space><leader>", builtin.find_files, {})
vim.keymap.set("n", "<space>m", builtin.live_grep, {})
vim.keymap.set("n", "<space>w", builtin.grep_string, {})
vim.keymap.set("n", "<space>.", builtin.buffers, {})
vim.keymap.set("n", "<space>/", function()
  builtin.current_buffer_fuzzy_find(require('telescope.themes').get_dropdown {
    previewer = false,
    layout_config = {
      height = function(_, _, max_lines)
        return math.min(max_lines, 30)
      end,
    },
  })
end, {})
vim.keymap.set("n", "<space>c", builtin.resume, {})
vim.keymap.set("n", "<space>d", builtin.git_status, {})
vim.keymap.set("n", "<space>nn", file_browser, {})
vim.keymap.set("n", "<space>nf", function()
  file_browser { path = vim.fn.expand "%:p:h", select_buffer = true }
end, {})

local function live_grep_in_dir(prompt_bufnr)
  local entry_path = action_state.get_selected_entry().Path
  local path = entry_path:is_dir() and entry_path:absolute() or entry_path:parent():absolute()

  actions.close(prompt_bufnr)
  builtin.live_grep { search_dirs = { path } }
end

local function find_files_in_dir(prompt_bufnr)
  local entry_path = action_state.get_selected_entry().Path
  local path = entry_path:is_dir() and entry_path:absolute() or entry_path:parent():absolute()

  actions.close(prompt_bufnr)
  builtin.find_files { search_dirs = { path } }
end

require("telescope").setup {
  defaults = {
    layout_config = {
      horizontal = { width = 0.9 },
      vertical = { width = 0.9 },
    },
    preview = {
      filesize_limit = 0.1, -- MB
    },
    file_previewer = function(_)
      return false
    end,
  },
  extensions = {
    fzf = {
      fuzzy = true,                   -- false will only do exact matching
      override_generic_sorter = true, -- override the generic sorter
      override_file_sorter = true,    -- override the file sorter
    },
    file_browser = {
      -- disables netrw and use telescope-file-browser in its place
      hijack_netrw = true,
      prompt_path = true,
      hidden = { file_browser = true, folder_browser = true },
      hide_parent_dir = true,
      mappings = {
        ["i"] = {
          ["<C-r>"] = fb_actions.rename,
          ["<C-y>"] = fb_actions.copy,
          ["<C-d>"] = fb_actions.remove,
        },
        ["n"] = {
          ["<space>m"] = live_grep_in_dir,
          ["<space><leader>"] = find_files_in_dir,
        },
      },
    },
    ['ui-select'] = {
      require('telescope.themes').get_dropdown(),
    },
  },
}

require("telescope").load_extension "fzf"
require("telescope").load_extension "file_browser"
require('telescope').load_extension "ui-select"
