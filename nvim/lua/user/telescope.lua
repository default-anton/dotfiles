local builtin = require "telescope.builtin"
local file_browser = require("telescope").extensions.file_browser.file_browser

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

require("telescope").setup {
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
    },
  },
}
require("telescope").load_extension "fzf"
require("telescope").load_extension "file_browser"
