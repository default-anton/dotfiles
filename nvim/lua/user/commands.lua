vim.api.nvim_create_user_command("Pr", function()
  local Job = require "plenary.job"
  local open_pr = Job:new {
    command = "gh",
    args = { "pr", "view", "--web" },
  }

  open_pr:add_on_exit_callback(vim.schedule_wrap(function(_, code)
    if code ~= 0 then
      vim.fn.system "gh pr create --web"
    end
  end))
  open_pr:start()
end, { desc = "Open PR in browser or create a new one if none exists" })

vim.api.nvim_create_user_command("Ctest", function()
  local current_file = vim.fn.expand("%")
  local spec_file = current_file:gsub("^app", "spec"):gsub("%.rb$", "_spec.rb")
  local spec_dir = vim.fn.fnamemodify(spec_file, ":h")
  vim.fn.mkdir(spec_dir, "p")
  vim.cmd("edit " .. spec_file)
end, { desc = "Create a spec file for the current file" })

vim.api.nvim_create_user_command("Strip", function(opts)
  local Job = require "plenary.job"
  local bufnr = vim.api.nvim_get_current_buf()
  local start_line = 0
  local end_line = -1
  if opts.range == 2 then
    start_line = opts.line1 - 1
    end_line = opts.line2
  end

  local lines = vim.api.nvim_buf_get_lines(bufnr, start_line, end_line, false)
  if #lines == 0 then
    return
  end
  local content = table.concat(lines, "\n")
  local strip = Job:new {
    command = "git",
    args = { "stripspace" },
    writer = content,
  }
  strip:sync()
  local result = strip:result()
  if #result > 0 then
    vim.api.nvim_buf_set_lines(bufnr, start_line, end_line, false, result)
    if vim.api.nvim_get_option_value('modified', { buf = bufnr }) then
      vim.cmd('write')
    end
  else
    error("Failed to strip whitespace")
  end
end, { desc = "Remove trailing whitespace from buffer or selection", range = true })

vim.api.nvim_create_user_command("Commit", function(opts)
  local instructions = opts.args
  if instructions == "" then
    error("Commit: instructions required")
  end

  local system_prompt = [[Git-commit agent. Only use bash. Always inspect git status + diff for requested scope. If staged: read staged diff. If unstaged/paths: read those diffs. Read recent commit messages by current Git user to match style. Then craft commit message + perform commits per instructions. No code edits, no push. If scope unclear, refuse.]]

  local exit_extension = vim.fn.stdpath("config") .. "/lua/user/exit-after-turn.ts"

  local args = {
    "--provider",
    "google-vertex",
    "--model",
    "gemini-3-flash-preview",
    "--thinking",
    "low",
    "--no-session",
    "--no-extensions",
    "--no-skills",
    "--tools",
    "bash",
    "--extension",
    exit_extension,
    "--system-prompt",
    system_prompt,
    instructions,
  }

  local escaped = vim.tbl_map(vim.fn.shellescape, args)
  local cmd = "pi " .. table.concat(escaped, " ")
  vim.cmd("term " .. cmd)
  vim.cmd("startinsert")
end, { desc = "Run pi to prepare git commits", nargs = "+" })

vim.api.nvim_create_user_command("Gq", function()
  local git_root = vim.fn.systemlist("git rev-parse --show-toplevel")[1]
  if vim.v.shell_error ~= 0 or not git_root or git_root == "" then
    error("Gq: not in a Git repo")
  end

  local seen = {}
  local items = {}
  local commands = {
    string.format("git -C %s diff --name-only --diff-filter=AM", vim.fn.shellescape(git_root)),
    string.format("git -C %s diff --cached --name-only --diff-filter=AM", vim.fn.shellescape(git_root)),
    string.format("git -C %s ls-files --others --exclude-standard --full-name", vim.fn.shellescape(git_root)),
  }

  for _, cmd in ipairs(commands) do
    for _, file in ipairs(vim.fn.systemlist(cmd)) do
      if file ~= "" and not seen[file] then
        seen[file] = true
        table.insert(items, { filename = git_root .. "/" .. file, lnum = 1, col = 1 })
      end
    end
  end

  vim.fn.setqflist({}, "r", { title = "Git changed files", items = items })

  if #items == 0 then
    vim.notify("Gq: no modified, added, or untracked files")
    return
  end

  if #vim.api.nvim_list_uis() > 0 then
    vim.cmd.copen()
  end
end, { desc = "Populate quickfix with Git changed files" })
