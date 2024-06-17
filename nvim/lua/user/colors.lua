require("tokyonight").setup({
  style = "storm",
  lualine_bold = true,
  dim_inactive = true,
  on_colors = function(colors)
    colors.fg_gutter = colors.dark3
  end,
  on_highlights = function(highlights, colors)
    highlights.CursorLineNr = {
      fg = colors.fg_dark,
    }
  end,
})

vim.cmd.colorscheme 'tokyonight'
