local null_ls = require "null-ls"
local h = require "null-ls.helpers"
local utils = require("null-ls.utils").make_conditional_utils()

-- https://github.com/jose-elias-alvarez/null-ls.nvim/tree/main/lua/null-ls/builtins/formatting
local formatting = null_ls.builtins.formatting
-- https://github.com/jose-elias-alvarez/null-ls.nvim/tree/main/lua/null-ls/builtins/diagnostics
local diagnostics = null_ls.builtins.diagnostics

local function generic_issue(message)
  return {
    message = message,
    row = 1,
    source = "rubocop",
    severity = h.diagnostics.severities.error,
  }
end

null_ls.setup {
  debug = false,
  sources = {
    formatting.prettier.with {
      command = "pnpm",
      extra_args = { "exec", "prettier" },
      prepend_extra_args = true,
    },
    formatting.isort,
    formatting.black.with { extra_args = { "--fast" } },
    formatting.stylua,
    formatting.rubocop.with {
      command = utils.has_file "bin/rubocop" and "bin/rubocop" or "rubocop",
    },
    formatting.gofmt,
    formatting.goimports,
    formatting.shfmt,
    diagnostics.eslint.with {
      command = "pnpm",
      extra_args = { "exec", "eslint" },
      prepend_extra_args = true,
    },
    diagnostics.flake8,
    diagnostics.shellcheck,
    diagnostics.golangci_lint,
    diagnostics.rubocop.with {
      command = utils.has_file "bin/rubocop" and "bin/rubocop" or "rubocop",
      generator_opts = vim.tbl_extend("force", diagnostics.rubocop._opts, {
        format = "raw",
        on_output = function(params, done)
          local output = params.output
          if not output then
            return done {}
          end

          local issues = {}
          local json_index, _ = params.output:find "{"

          if not json_index then
            table.insert(issues, generic_issue(params.output))
            return done(issues)
          end

          local maybe_json_string = params.output:sub(json_index)
          local ok, decoded = pcall(vim.json.decode, maybe_json_string)

          -- decoding broke, so give up and return the original output
          if not ok then
            table.insert(issues, generic_issue(params.output))
            return done(issues)
          end

          return done(diagnostics.rubocop._opts.on_output(vim.tbl_extend("force", params, { output = decoded })))
        end,
      }),
    },
  },
}
