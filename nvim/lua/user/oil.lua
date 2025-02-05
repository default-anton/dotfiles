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

local add_to_llm_context = {
  desc = "Add to LLM context",
  callback = function(_)
    local entry = oil.get_cursor_entry()
    local cwd = oil.get_current_dir()
    if entry and cwd then
      local full_path = vim.fn.fnameescape(cwd .. entry.parsed_name)
      vim.cmd('Add ' .. full_path)
    end
  end,
}

local start_new_coding_session_with_llm = {
  desc = "Start new coding session with LLM",
  callback = function(_)
    local entry = oil.get_cursor_entry()
    local cwd = oil.get_current_dir()
    if entry and cwd then
      vim.cmd('Code')
      vim.schedule(function()
        local full_path = vim.fn.fnameescape(cwd .. entry.parsed_name)
        vim.cmd('Add ' .. full_path)
      end)
    end
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
    ["<C-a>"] = add_to_llm_context,
    ["<leader>lk"] = start_new_coding_session_with_llm,
    ["<leader>kl"] = start_new_coding_session_with_llm,
  },
})

vim.keymap.set("n", "<leader>nn", "<CMD>Oil<CR>", {})
