local branch = {
  "branch",
  icons_enabled = true,
  icon = "",
}

local mode = {
  "mode",
  fmt = function(str)
    return "-- " .. str .. " --"
  end,
}

local location = {
  "location",
  padding = 0,
}

require('lualine').setup {
  options = {
    icons_enabled = true,
    theme = 'tokyonight',
    component_separators = { left = '', right = '' },
    section_separators = { left = '', right = '' },
    disabled_filetypes = { "NvimTree" },
    always_divide_middle = true,
    globalstatus = false,
  },
  sections = {
    lualine_a = { mode },
    lualine_b = { branch },
    lualine_c = { 'filename' },
    lualine_x = { 'encoding', 'filetype' },
    lualine_y = { 'progress' },
    lualine_z = { location }
  },
  inactive_sections = {
    lualine_a = {},
    lualine_b = {},
    lualine_c = { 'filename' },
    lualine_x = { 'location' },
    lualine_y = {},
    lualine_z = {}
  },
  tabline = {},
  extensions = {}
}
