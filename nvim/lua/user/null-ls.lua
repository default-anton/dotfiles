local null_ls = require("null-ls")

-- https://github.com/jose-elias-alvarez/null-ls.nvim/tree/main/lua/null-ls/builtins/formatting
local formatting = null_ls.builtins.formatting
-- https://github.com/jose-elias-alvarez/null-ls.nvim/tree/main/lua/null-ls/builtins/diagnostics
local diagnostics = null_ls.builtins.diagnostics

null_ls.setup({
  debug = false,
  sources = {
    formatting.prettier,
    formatting.isort,
    formatting.black.with({ extra_args = { "--fast" } }),
    formatting.stylua,
    formatting.rubocop,
    formatting.shfmt,
    diagnostics.flake8,
    diagnostics.rubocop,
    diagnostics.shellcheck,
  },
})
