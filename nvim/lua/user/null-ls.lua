local null_ls = require "null-ls"

-- https://github.com/jose-elias-alvarez/null-ls.nvim/tree/main/lua/null-ls/builtins/formatting
local formatting = null_ls.builtins.formatting
-- https://github.com/jose-elias-alvarez/null-ls.nvim/tree/main/lua/null-ls/builtins/diagnostics
local diagnostics = null_ls.builtins.diagnostics

local conditional = function(fn)
  local utils = require("null-ls.utils").make_conditional_utils()
  return fn(utils)
end

null_ls.setup {
  debug = false,
  sources = {
    formatting.prettier,
    formatting.isort,
    formatting.black.with { extra_args = { "--fast" } },
    formatting.stylua,
    formatting.shfmt,
    diagnostics.flake8,
    diagnostics.shellcheck,
    conditional(function(utils)
      return utils.root_has_file "Gemfile"
          and null_ls.builtins.formatting.rubocop.with {
            command = "bundle",
            args = vim.list_extend({ "exec", "rubocop" }, null_ls.builtins.formatting.rubocop._opts.args),
          }
        or null_ls.builtins.formatting.rubocop
    end),
  },
}
