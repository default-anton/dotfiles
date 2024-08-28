local Job = require('plenary.job')

-- Quickfix list navigation
vim.api.nvim_set_keymap('n', '<leader>qo', ':copen<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>qc', ':cclose<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>qn', ':cn<CR>zz', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>qp', ':cp<CR>zz', { noremap = true, silent = true })

local function yank_files_in_current_dir()
  local current_dir = vim.fn.expand('%:p:h')
  local bash_cmd = { "fd", "", "-tf", current_dir, "-X", "tail", "+1" }
  local result = table.concat(vim.fn.systemlist(bash_cmd), "\n")
  vim.fn.setreg('"', "Here is what I'm working on:\n```\n" .. result .. "\n```", 'l')
end

-- LLM integration
vim.keymap.set('n', '<leader>yd', yank_files_in_current_dir,
  { noremap = true, silent = true, desc = "Yank files in current directory" })
vim.api.nvim_set_keymap('n', '<leader>aa', ':Ask<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>as', ':Ask split<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>av', ':Ask vsplit<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('v', '<leader>aa', ':Ask<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('v', '<leader>as', ':Ask split<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('v', '<leader>av', ':Ask vsplit<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>aff', ':Ask file<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>afs', ':Ask file split<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>afv', ':Ask file vsplit<CR>', { noremap = true, silent = true })

-- Run tests
vim.api.nvim_set_keymap('n', '<leader>rf', '<cmd>TestFile<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>rr', '<cmd>TestNearest<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>rl', '<cmd>TestLast<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>ra', '<cmd>TestSuite<CR>', { noremap = true, silent = true })

-- LazyGit integration
vim.api.nvim_set_keymap('n', '<leader>gg', '<cmd>LazyGit<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader>gf', '<cmd>LazyGitFilterCurrentFile<CR>', { noremap = true, silent = true })

-- Resize splits with Ctrl-Shift-Arrow keys
vim.api.nvim_set_keymap('n', '<C-S-Up>', '<cmd>resize -6<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<C-S-Down>', '<cmd>resize +6<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<C-S-Left>', '<cmd>vertical resize -6<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<C-S-Right>', '<cmd>vertical resize +6<CR>', { noremap = true, silent = true })

-- Window navigation using Ctrl + hjkl
vim.api.nvim_set_keymap('n', '<C-k>', '<C-W>k', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<C-j>', '<C-W>j', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<C-h>', '<C-W>h', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<C-l>', '<C-W>l', { noremap = true, silent = true })

-- Enhanced scrolling with Ctrl-d/u
vim.api.nvim_set_keymap('n', '<C-d>', '8jzzzv', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<C-u>', '8kzzzv', { noremap = true, silent = true })

-- Yank to clipboard
vim.api.nvim_set_keymap('n', '<leader>y', '"+y', { noremap = true, silent = true })
vim.api.nvim_set_keymap('v', '<leader>y', '"+y', { noremap = true, silent = true })

-- Paste from clipboard
vim.api.nvim_set_keymap('n', '<leader>p', '"+p', { noremap = true, silent = true })
vim.api.nvim_set_keymap('v', '<leader>p', '"+p', { noremap = true, silent = true })

local function check_whisper_server()
  vim.fn.system("pgrep -f 'whisper-medium.en.llamafile --server'")
  return vim.v.shell_error == 0
end

local function start_whisper_server()
  vim.fn.jobstart("nohup whisper-medium.en.llamafile --server --port 8432 >/dev/null 2>&1 &", {
    detach = true
  })
end

local function send_inference_request(callback)
  Job:new({
    command = "curl",
    args = {
      "127.0.0.1:8432/inference",
      "-H", "Content-Type: multipart/form-data",
      "-F", "file=@/tmp/recording.wav",
      "-F", "temperature=0.0",
      "-F", "temperature_inc=0.2",
      "-F", "response_format=text"
    },
    on_exit = function(j, return_val)
      if return_val == 0 then
        local lines = vim.tbl_map(vim.trim, j:result())
        callback(lines)
      else
        vim.schedule(function()
          vim.notify("Error: " .. table.concat(j:stderr_result(), "\n"), vim.log.levels.ERROR)
        end)
      end
    end,
  }):start()
end

local function record_audio()
  local buf = vim.api.nvim_create_buf(false, true)
  local width = math.floor(vim.o.columns * 0.4)
  local height = math.floor(vim.o.lines * 0.3)

  local win = vim.api.nvim_open_win(buf, true, {
    relative = 'editor',
    width = width,
    height = height,
    col = (vim.o.columns - width) / 2,
    row = (vim.o.lines - height) / 2,
    style = 'minimal',
    border = 'rounded'
  })

  vim.fn.termopen("sox -q -d -b 16 -c 1 /tmp/recording.wav rate 16k", {
    on_exit = function(_, exit_code)
      vim.api.nvim_win_close(win, true)
      if exit_code == 0 then
        send_inference_request(function(lines)
          vim.schedule(function()
            local cursor_pos = vim.api.nvim_win_get_cursor(0)
            local row, col = cursor_pos[1], cursor_pos[2]
            vim.api.nvim_buf_set_text(0, row - 1, col, row - 1, col, lines)
            -- Move the cursor to the end of the inserted text
            vim.api.nvim_win_set_cursor(0, { row, col + #(lines[#lines] or "") })
          end)
        end)
      else
        vim.schedule(function()
          vim.notify("Error recording audio", vim.log.levels.ERROR)
        end)
      end
    end
  })

  vim.cmd('startinsert')
end

local function run_whisper_transcription()
  if not check_whisper_server() then
    start_whisper_server()
  end

  record_audio()
end

vim.keymap.set('i', '<C-o>', run_whisper_transcription,
  { noremap = true, silent = true, desc = "Run Whisper transcription" })
