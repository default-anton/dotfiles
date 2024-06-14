local builtin = require "telescope.builtin"

vim.keymap.set("n", "<leader>h", builtin.help_tags, {})
vim.keymap.set("n", "<leader>,", builtin.find_files, {})
vim.keymap.set("n", "<leader>m", builtin.live_grep, {})
vim.keymap.set("n", "<leader>w", builtin.grep_string, {})
vim.keymap.set("n", "<leader>.", builtin.buffers, {})
vim.keymap.set("n", "<leader>/", function()
  builtin.current_buffer_fuzzy_find(require('telescope.themes').get_dropdown {
    previewer = false,
    layout_config = {
      height = function(_, _, max_lines)
        return math.min(max_lines, 30)
      end,
    },
  })
end, {})
vim.keymap.set("n", "<leader>co", builtin.resume, {})
vim.keymap.set("n", "<leader>d", builtin.git_status, {})
vim.keymap.set("n", "<leader>nf", function()
  local telescope = require "telescope.builtin"
  telescope.live_grep { search_dirs = { vim.fn.expand "%:h" } }
end, {})

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
  pickers = {
    live_grep = false,
    find_files = false,
  },
  extensions = {
    fzf = {
      fuzzy = true,                   -- false will only do exact matching
      override_generic_sorter = true, -- override the generic sorter
      override_file_sorter = true,    -- override the file sorter
    },
    ['ui-select'] = {
      require('telescope.themes').get_dropdown(),
    },
    ast_grep = {
      command = {
        "sg",
        "--json=stream",
      },
      grep_open_files = false,
      lang = nil,
    }
  },
}

require("telescope").load_extension "fzf"
require('telescope').load_extension "ui-select"
require('telescope').load_extension "ast_grep"
