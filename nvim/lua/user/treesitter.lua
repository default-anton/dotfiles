local parsers = {
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
}

local disabled_langs = {}
local max_filesize = 100 * 1024
local treesitter_group = vim.api.nvim_create_augroup("UserTreesitter", { clear = true })

local function should_enable(bufnr, lang)
  if vim.tbl_contains(disabled_langs, lang) then
    return false
  end

  local name = vim.api.nvim_buf_get_name(bufnr)
  local ok, stats = pcall(vim.loop.fs_stat, name)
  if ok and stats and stats.size > max_filesize then
    return false
  end

  return true
end

local function start_treesitter(bufnr)
  if vim.bo[bufnr].buftype ~= "" then
    return
  end

  local filetype = vim.bo[bufnr].filetype
  if filetype == "" then
    return
  end

  local lang = vim.treesitter.language.get_lang(filetype) or filetype
  if not should_enable(bufnr, lang) then
    return
  end

  local ok = pcall(vim.treesitter.start, bufnr, lang)
  if not ok then
    return
  end

  vim.bo[bufnr].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
end

local ts = require("nvim-treesitter")
if ts.setup then
  ts.setup {}
end

if ts.install then
  ts.install(parsers)
else
  require("nvim-treesitter.configs").setup {
    ensure_installed = parsers,
  }
end

local ok_ts_textobjects, ts_textobjects = pcall(require, "nvim-treesitter-textobjects")
if ok_ts_textobjects and ts_textobjects.setup then
  ts_textobjects.setup {
    select = {
      lookahead = true,
      selection_modes = {
        ["@function.outer"] = "v",
        ["@class.outer"] = "V",
        ["@local.scope"] = "v",
      },
    },
    move = {
      set_jumps = true,
    },
  }
else
  require("nvim-treesitter.configs").setup {
    textobjects = {
      move = {
        enable = true,
        set_jumps = true,
      },
      select = {
        enable = true,
        lookahead = true,
        keymaps = {},
        selection_modes = {
          ["@function.outer"] = "v",
          ["@class.outer"] = "V",
          ["@local.scope"] = "v",
        },
      },
    },
  }
end

vim.api.nvim_create_autocmd("FileType", {
  group = treesitter_group,
  callback = function(args)
    start_treesitter(args.buf)
  end,
  desc = "Start treesitter for supported buffers",
})

require('treesitter-context').setup {
  multiline_threshold = 5,
}
