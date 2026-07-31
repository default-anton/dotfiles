local M = {}

local CLIS = {
  { name = "pi",     prefix = "" },
  -- { name = "pi-mono/packages/coding-agent/src/cli.ts", prefix = "" },
  { name = "codex",  prefix = "" },
  { name = "claude", prefix = "@" },
}

local function decode_json(output)
  local ok, value = pcall(vim.json.decode, output)
  if ok then
    return value
  end
end

local function current_herdr_tab()
  if not vim.env.HERDR_ENV then
    return nil
  end

  local pane_id = vim.env.HERDR_PANE_ID
  if pane_id and pane_id ~= "" then
    local output = vim.fn.system({ "herdr", "pane", "current", "--pane", pane_id })
    if vim.v.shell_error == 0 then
      local response = decode_json(output)
      local pane = response and response.result and response.result.pane
      if pane and pane.tab_id then
        return pane.tab_id
      end
    end
  end

  local tab_id = vim.env.HERDR_TAB_ID
  if tab_id and tab_id ~= "" then
    return tab_id
  end
end

local function herdr_targets(tab_id)
  local output = vim.fn.system({ "herdr", "agent", "list" })
  if vim.v.shell_error ~= 0 then
    return {}
  end

  local response = decode_json(output)
  local agents = response and response.result and response.result.agents
  if type(agents) ~= "table" then
    return {}
  end

  local targets = {}
  for _, cli in ipairs(CLIS) do
    for _, agent in ipairs(agents) do
      if agent.tab_id == tab_id and agent.agent == cli.name then
        table.insert(targets, { pane = agent.pane_id, prefix = cli.prefix })
      end
    end
  end

  return targets
end

local function active_targets()
  local herdr_tab = current_herdr_tab()
  return herdr_tab and herdr_targets(herdr_tab) or {}
end

local function send_text(target, text)
  vim.fn.system({ "herdr", "pane", "send-text", target.pane, text })
end

function M.send_file_references(paths)
  if type(paths) ~= "table" then
    paths = { paths }
  end

  for _, target in ipairs(active_targets()) do
    local relative_paths = vim.tbl_map(function(path)
      return (target.prefix or "") .. vim.fn.fnamemodify(path, ":.")
    end, paths)
    send_text(target, table.concat(relative_paths, ", ") .. ", ")
  end
end

-- Set up an autocmd to run when entering buffers
vim.api.nvim_create_autocmd({ "BufEnter", "BufWinEnter" }, {
  callback = function()
    local opts = { noremap = true, silent = true, buffer = vim.api.nvim_get_current_buf() }
    -- Check if current buffer is not a telescope prompt
    if vim.bo.filetype ~= "TelescopePrompt" and vim.bo.filetype ~= "oil" then
      vim.keymap.set('n', '<C-a>', function()
        M.send_file_references({ vim.fn.expand('%') })
      end, vim.tbl_extend('force', opts, { desc = 'Send file reference to AI coding agents' }))

      vim.keymap.set('v', '<C-a>', function()
        -- Get the current visual selection positions
        local start_line = vim.fn.line("v")
        local end_line = vim.fn.line(".")
        -- Ensure start_line is before end_line
        if start_line > end_line then
          start_line, end_line = end_line, start_line
        end
        local file_path = vim.fn.expand('%')

        local reference
        if start_line == end_line then
          reference = string.format('%s:%d, ', file_path, start_line)
        else
          reference = string.format('%s:%d-%d, ', file_path, start_line, end_line)
        end

        for _, target in ipairs(active_targets()) do
          send_text(target, (target.prefix or "") .. reference)
        end
      end, vim.tbl_extend('force', opts, { desc = 'Send line reference to AI coding agents' }))
    end
  end,
})

return M
