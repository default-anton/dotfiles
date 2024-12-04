local builtin = require "telescope.builtin"

vim.keymap.set("n", "<leader>h", builtin.help_tags, {})
vim.keymap.set("n", "<leader>,", builtin.find_files, {})
vim.keymap.set("n", "<leader>m", builtin.live_grep, {})
vim.keymap.set("n", "<leader>w", builtin.grep_string, {})
vim.keymap.set("v", "<leader>w", function()
  local saved_reg = vim.fn.getreg("v")
  vim.cmd('noau normal! "vy"')
  local selection = vim.fn.getreg("v")
  vim.fn.setreg("v", saved_reg)
  builtin.grep_string({ search = selection })
end, {})
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
vim.keymap.set("n", "<leader>n,", function()
  builtin.find_files { search_dirs = { vim.fn.expand "%:h" } }
end, {})
vim.keymap.set("n", "<leader>nm", function()
  builtin.live_grep { search_dirs = { vim.fn.expand "%:h" } }
end, {})

require("telescope").setup {
  defaults = {
    layout_strategy = 'vertical',
    layout_config = { height = 0.95 },
    preview = {
      filesize_limit = 0.1, -- MB
    },
  },
  extensions = {
    fzf = {
      fuzzy = true,
      override_generic_sorter = true,
      override_file_sorter = true,
      case_mode = "smart_case",
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
