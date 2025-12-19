local builtin = require "telescope.builtin"
local ai_coders = require("user.ai-coders")

vim.keymap.set("n", "<leader>,", builtin.find_files, {})
vim.keymap.set("n", "<leader>m", builtin.live_grep, {})
vim.keymap.set("n", "<leader>w", builtin.grep_string, {})
vim.keymap.set("v", "<leader>m", function()
  local saved_reg = vim.fn.getreg("v")
  vim.cmd('noau normal! "vy"')
  local selection = vim.fn.getreg("v")
  vim.fn.setreg("v", saved_reg)
  builtin.grep_string({ search = selection })
end, {})
vim.keymap.set("v", "<leader>,", function()
  local saved_reg = vim.fn.getreg("v")
  vim.cmd('noau normal! "vy"')
  local selection = vim.fn.getreg("v")
  vim.fn.setreg("v", saved_reg)
  builtin.find_files { default_text = selection }
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

require("telescope").setup {
  defaults = {
    layout_strategy = 'vertical',
    layout_config = { height = 0.95 },
    preview = {
      filesize_limit = 0.1, -- MB
    },
    mappings = {
      i = {
        ["<C-a>"] = function(prompt_bufnr)
          local action_state = require("telescope.actions.state")

          local picker = action_state.get_current_picker(prompt_bufnr)
          local multi_selections = picker:get_multi_selection()

          if vim.tbl_isempty(multi_selections) then
            local selected_entry = action_state.get_selected_entry()
            if selected_entry and selected_entry.path then
              local filepath = selected_entry.path
              ai_coders.send_file_references(filepath)
            else
              vim.notify("No selection")
            end
          else
            local files = vim.tbl_map(function(s) return s.path end, multi_selections)
            ai_coders.send_file_references(files)
          end

          return true
        end,
      },
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
