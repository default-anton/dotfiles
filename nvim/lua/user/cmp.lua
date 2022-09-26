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
    ["<Tab>"] = cmp.mapping(function(fallback)
      cmp_ultisnips_mappings.expand_or_jump_forwards(fallback)
    end, {
      "i",
      "s", --[[ "c" (to enable the mapping in command mode) ]]
    }),
    ["<S-Tab>"] = cmp.mapping(function(fallback)
      cmp_ultisnips_mappings.jump_backwards(fallback)
    end, {
      "i",
      "s", --[[ "c" (to enable the mapping in command mode) ]]
    }),
    ["<C-l>"] = cmp.mapping(function(fallback)
      local fallback_key = vim.api.nvim_replace_termcodes("<Tab>", true, true, true)
      local resolved_key = vim.fn["copilot#Accept"](fallback)
      if fallback_key == resolved_key then
        cmp.confirm { select = true }
      else
        vim.api.nvim_feedkeys(resolved_key, "n", true)
      end
    end, {
      "i",
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
    -- { name = 'vsnip' }, -- For vsnip users.
    -- { name = 'luasnip' }, -- For luasnip users.
    -- { name = 'snippy' }, -- For snippy users.
  }),
  formatting = {
    fields = { "kind", "abbr", "menu" },
    format = lspkind.cmp_format {
      mode = "symbol",
      menu = {
        nvim_lsp_signature_help = "[sig]",
        nvim_lsp = "[lsp]",
        nvim_lua = "[lsp]",
        ultisnips = "[snip]",
        buffer = "[buf]",
        path = "[path]",
      },
    },
  },
  confirm_opts = {
    behavior = cmp.ConfirmBehavior.Replace,
    select = false,
  },
  window = {
    documentation = {
      border = { "╭", "─", "╮", "│", "╯", "─", "╰", "│" },
    },
  },
  experimental = {
    native_menu = false,

    ghost_text = false, -- this feature conflict with copilot.vim's preview.
  },
}

-- Use buffer source for `/` (if you enabled `native_menu`, this won't work anymore).
cmp.setup.cmdline("/", {
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
})
