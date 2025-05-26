local disabled_langs = { "ruby" }

require("nvim-treesitter.configs").setup {
  -- A list of parser names, or "all"
  ensure_installed = {
    "vimdoc",
    "query",
    "html",
    "ruby",
    "lua",
    "bash",
    "python",
    "comment",
    "dockerfile",
    "gitattributes",
    "gitignore",
    "go",
    "gomod",
    "graphql",
    "hcl",
    "javascript",
    "jsdoc",
    "json",
    "make",
    "markdown",
    "proto",
    "scss",
    "sql",
    "toml",
    "tsx",
    "typescript",
    "vim",
    "yaml",
  },
  highlight = {
    enable = true,
    disable = function(lang, buf)
      if vim.tbl_contains(disabled_langs, lang) then
        return true
      end

      local max_filesize = 100 * 1024 -- 100 KB
      local ok, stats = pcall(vim.loop.fs_stat, vim.api.nvim_buf_get_name(buf))
      if ok and stats and stats.size > max_filesize then
        return true
      end
    end,
  },
  autopairs = {
    enable = true,
  },
  textobjects = {
    enable = true,

    move = {
      enable = true,
      set_jumps = true,

      goto_next_start = {
        ["]f"] = "@function.outer",
        ["]]"] = "@class.outer",
        ["]b"] = { query = "@local.scope", query_group = "locals", desc = "Next scope" },
      },
      goto_previous_start = {
        ["[f"] = "@function.outer",
        ["[["] = "@class.outer",
        ["[b"] = { query = "@local.scope", query_group = "locals", desc = "Previous scope" },
      },
    },

    select = {
      enable = true,

      -- Automatically jump forward to textobj, similar to targets.vim
      lookahead = true,

      keymaps = {
        -- You can use the capture groups defined in textobjects.scm
        ["af"] = "@function.outer",
        ["if"] = "@function.inner",
        ["ac"] = "@class.outer",
        ["ic"] = "@class.inner",
        ["ab"] = { query = "@local.scope", query_group = "locals", desc = "Select language scope" },
      },

      selection_modes = {
        ["@function.outer"] = "v",
        ["@class.outer"] = "V",
        ["@local.scope"] = "v",
      },

      include_surrounding_whitespace = true,
    },
  },
  indent = {
    enable = true,
  },
  matchup = {
    enable = true, -- mandatory, false will disable the whole extension
    disable = {},  -- optional, list of language that will be disabled
  },
}
