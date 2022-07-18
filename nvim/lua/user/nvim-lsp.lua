require('nvim-lsp-installer').setup {
  automatic_installation = true
}

local lspconfig = require('lspconfig')
local capabilities = require('cmp_nvim_lsp').update_capabilities(vim.lsp.protocol.make_client_capabilities())
capabilities.textDocument.completion.completionItem.snippetSupport = true

-- Use an on_attach function to only map the following keys
-- after the language server attaches to the current buffer
local on_attach = function(client, bufnr)
  -- See `:help vim.lsp.*` for documentation on any of the below functions
  local bufopts = { noremap = true, silent = true, buffer = bufnr }
  vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, bufopts)
  vim.keymap.set('n', '[e', vim.diagnostic.goto_prev, bufopts)
  vim.keymap.set('n', ']e', vim.diagnostic.goto_next, bufopts)
  vim.keymap.set('n', 'gD', vim.lsp.buf.declaration, bufopts)
  vim.keymap.set('n', 'K', vim.lsp.buf.hover, bufopts)
  vim.keymap.set('n', 'gs', vim.lsp.buf.signature_help, bufopts)
  vim.keymap.set('n', '<leader>rn', vim.lsp.buf.rename, bufopts)
  vim.keymap.set('n', '<leader>da', vim.lsp.buf.code_action, bufopts)
  vim.keymap.set('n', '<leader>f', vim.lsp.buf.formatting, bufopts)
end

lspconfig.jsonls.setup {
  on_attach = on_attach,
  capabilities = capabilities,
  settings = {
    json = {
      schemas = require('schemastore').json.schemas(),
      validate = { enable = true },
    },
  },
}
lspconfig.cssls.setup { on_attach = on_attach, capabilities = capabilities }
lspconfig.bashls.setup { on_attach = on_attach, capabilities = capabilities }
lspconfig.dockerls.setup { on_attach = on_attach, capabilities = capabilities }
lspconfig.gopls.setup {
  on_attach = on_attach,
  capabilities = capabilities,
  settings = {
    gopls = {
      experimentalPostfixCompletions = true,
      analyses = {
        unusedparams = true,
        shadow = true,
      },
      staticcheck = true,
    },
  },
  init_options = {
    usePlaceholders = true,
  }
}
lspconfig.pyright.setup { on_attach = on_attach, capabilities = capabilities }
lspconfig.html.setup { on_attach = on_attach, capabilities = capabilities }
lspconfig.terraformls.setup { on_attach = on_attach, capabilities = capabilities }
lspconfig.vimls.setup { on_attach = on_attach, capabilities = capabilities }
lspconfig.solargraph.setup { on_attach = on_attach, capabilities = capabilities }
lspconfig.sqlls.setup { on_attach = on_attach, capabilities = capabilities }
lspconfig.sumneko_lua.setup { on_attach = on_attach, capabilities = capabilities }
lspconfig.tsserver.setup { on_attach = on_attach, capabilities = capabilities }
