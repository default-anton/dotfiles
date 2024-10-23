local telescope = require "telescope.builtin"
local oil = require("oil")

local get_dir_under_cursor = function()
  local entry = oil.get_cursor_entry()
  local cwd = oil.get_current_dir()

  if entry and cwd then
    if entry.type == "directory" then
      return cwd .. entry.parsed_name
    else
      return cwd
    end
  end

  return nil
end

local live_grep_in_dir = {
  desc = "Live grep in directory",
  callback = function(_)
    local search_dirs = {}
    local dir = get_dir_under_cursor()
    if dir then
      search_dirs = { dir }
    end
    telescope.live_grep { search_dirs = search_dirs }
  end,
}

local find_files_in_dir = {
  desc = "Find files in directory",
  callback = function(_)
    local search_dirs = {}
    local dir = get_dir_under_cursor()
    if dir then
      search_dirs = { dir }
    end
    telescope.find_files { search_dirs = search_dirs }
  end,
}

local function add_files_under_cursor_to_llm_context(entry, cwd)
  if entry and cwd then
    if entry.type ~= "directory" then
      local full_path = vim.fn.fnameescape(cwd .. entry.parsed_name)
      vim.cmd('Add ' .. full_path)
      return
    end
    local path = cwd .. entry.parsed_name

    local function add_files_recursively(dir)
      local handle = vim.loop.fs_scandir(dir)
      if not handle then return end

      while true do
        local name, type = vim.loop.fs_scandir_next(handle)
        if not name then break end

        local full_path = vim.fn.fnameescape(dir .. '/' .. name)
        if type == 'file' then
          vim.cmd('Add ' .. full_path)
        elseif type == 'directory' then
          add_files_recursively(dir .. '/' .. name)
        end
      end
    end

    add_files_recursively(path)
  end
end

local add_to_llm_context = {
  desc = "Add to LLM context",
  callback = function(_)
    local entry = oil.get_cursor_entry()
    local cwd = oil.get_current_dir()
    
    if not vim.g.llm_sidekick_last_ask_buffer or not vim.api.nvim_buf_is_valid(vim.g.llm_sidekick_last_ask_buffer) then
      vim.cmd('Code')
      -- Schedule to ensure the buffer is ready
      vim.schedule(function()
        add_files_under_cursor_to_llm_context(entry, cwd)
      end)
      return
    end
    add_files_under_cursor_to_llm_context(entry, cwd)
  end,
}

oil.setup({
  win_options = {
    wrap = true,
  },
  delete_to_trash = true,
  skip_confirm_for_simple_edits = true,
  view_options = {
    show_hidden = true,
    is_always_hidden = function(name, _)
      if name == ".." or name == ".git" then
        return true
      end
    end,
  },
  keymaps = {
    ["<leader>m"] = live_grep_in_dir,
    ["<leader>,"] = find_files_in_dir,
    ["<leader>ad"] = add_to_llm_context,
  },
})

vim.keymap.set("n", "<leader>nn", "<CMD>Oil<CR>", {})
