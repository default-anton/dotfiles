local cmp = require "cmp"
local lspkind = require "lspkind"
local cmp_ultisnips_mappings = require "cmp_nvim_ultisnips.mappings"

vim.g.UltiSnipsSnippetDirectories = { os.getenv "HOME" .. "/.dotfiles/UltiSnips" }

require("cmp_nvim_ultisnips").setup {}

cmp.setup {
  snippet = {
    -- REQUIRED - you must specify a snippet engine
    expand = function(args)
      -- vim.fn["vsnip#anonymous"](args.body) -- For `vsnip` users.
      -- require('luasnip').lsp_expand(args.body) -- For `luasnip` users.
      -- require('snippy').expand_snippet(args.body) -- For `snippy` users.
      vim.fn["UltiSnips#Anon"](args.body) -- For `ultisnips` users.
    end,
  },
  mapping = cmp.mapping.preset.insert {
    ["<C-Space>"] = cmp.mapping.complete(),
    ["<C-c>"] = cmp.mapping {
      i = cmp.mapping.abort(),
      c = cmp.mapping.close(),
    },
    ["<C-y>"] = cmp.mapping.confirm { select = true, behavior = cmp.ConfirmBehavior.Replace },
    ["<C-j>"] = cmp.mapping(function(fallback)
      cmp_ultisnips_mappings.expand_or_jump_forwards(fallback)
    end, {
      "i",
      "s", --[[ "c" (to enable the mapping in command mode) ]]
    }),
  },
  sources = cmp.config.sources({
    { name = "nvim_lsp_signature_help" },
  }, {
    { name = "nvim_lsp" },
    { name = "nvim_lua" },
    { name = "ultisnips" }, -- For ultisnips users.
    { name = "buffer", keyword_length = 3 },
    { name = "path" },
  }),
  formatting = {
    fields = { 'abbr', 'icon', 'kind', 'menu' },
    format = lspkind.cmp_format({
      maxwidth = {
        -- prevent the popup from showing more than provided characters (e.g 50 will not show more than 50 characters)
        -- can also be a function to dynamically calculate max width such as
        -- menu = function() return math.floor(0.45 * vim.o.columns) end,
        menu = 50, -- leading text (labelDetails)
        abbr = 50, -- actual suggestion item
      },
      ellipsis_char = '...', -- when popup menu exceed maxwidth, the truncated part would show ellipsis_char instead (must define maxwidth first)
      show_labelDetails = true -- show labelDetails in menu. Disabled by default
    })
  }
}

-- Use buffer source for `/` (if you enabled `native_menu`, this won't work anymore).
cmp.setup.cmdline({ '/', '?' }, {
  mapping = cmp.mapping.preset.cmdline(),
  sources = {
    { name = "buffer" },
  },
})

-- Use cmdline & path source for ':' (if you enabled `native_menu`, this won't work anymore).
cmp.setup.cmdline(":", {
  mapping = cmp.mapping.preset.cmdline(),
  sources = cmp.config.sources({
    { name = "path" },
  }, {
    { name = "cmdline" },
  }),
  matching = { disallow_symbol_nonprefix_matching = false }
})
