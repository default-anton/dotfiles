local Job = require('plenary.job')

local FILE_PATH = "/tmp/recording.mp3"
local PROMPT = "Hey, I've been looking at the project implementation details and thinking about our approach. You know, we might need to refactor some of the core modules to improve performance. What are your thoughts on using async patterns for the new features?"

local function send_inference_request(callback)
  Job:new({
    command = "curl",
    args = {
      "https://api.groq.com/openai/v1/audio/transcriptions",
      "-H", "Authorization: bearer " .. (os.getenv("GROQ_API_KEY") or ""),
      "-H", "Content-Type: multipart/form-data",
      "-F", "file=@" .. FILE_PATH,
      "-F", "model=whisper-large-v3-turbo",
      "-F", "temperature=0.0",
      "-F", "response_format=text",
      "-F", "language=en",
      "-F", "prompt=" .. PROMPT,
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

local function run_whisper_transcription()
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

  vim.fn.termopen("sox -q -d -c 1 -t mp3 -C 128.2 " .. FILE_PATH .. " rate 16k", {
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

return {
  run_whisper_transcription = run_whisper_transcription
}

