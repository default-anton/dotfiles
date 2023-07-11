local builtin = require "telescope.builtin"
local extensions = require("telescope").extensions
local file_browser = extensions.file_browser.file_browser
local actions = require "telescope.actions"
local action_state = require "telescope.actions.state"

vim.keymap.set("n", "<space><leader>", builtin.find_files, {})
vim.keymap.set("n", "<space>m", builtin.live_grep, {})
vim.keymap.set("n", "<space>w", builtin.grep_string, {})
vim.keymap.set("n", "<space>.", builtin.buffers, {})
vim.keymap.set("n", "<space>/", builtin.current_buffer_fuzzy_find, {})
vim.keymap.set("n", "<space>c", builtin.resume, {})
vim.keymap.set("n", "<space>o", builtin.lsp_document_symbols, {})
vim.keymap.set("n", "<space>d", builtin.git_status, {})
vim.keymap.set("n", "gr", builtin.lsp_references, {})
vim.keymap.set("n", "gd", builtin.lsp_definitions, {})
vim.keymap.set("n", "gi", builtin.lsp_implementations, {})
vim.keymap.set("n", "gt", builtin.lsp_type_definitions, {})
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
  },
  extensions = {
    fzf = {
      fuzzy = true, -- false will only do exact matching
      override_generic_sorter = true, -- override the generic sorter
      override_file_sorter = true, -- override the file sorter
    },
    file_browser = {
      -- disables netrw and use telescope-file-browser in its place
      hijack_netrw = true,
      git_status = false,
      prompt_path = true,
      mappings = {
        ["n"] = {
          ["<space>m"] = live_grep_in_dir,
          ["<space><leader>"] = find_files_in_dir,
        },
      },
    },
  },
}
require("telescope").load_extension "fzf"
require("telescope").load_extension "file_browser"
