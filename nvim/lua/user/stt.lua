local Job = require('plenary.job')

local function check_whisper_server()
  vim.fn.system("pgrep -f 'whisper-medium.en.llamafile --server'")
  return vim.v.shell_error == 0
end

local WHISPER_PROMPT = [[
# Software Engineering Transcription
## Common programming languages and frameworks
Java, Python, JavaScript, C++, Ruby, PHP, Swift, Kotlin, Go, Rust, TypeScript
React, Angular, Vue.js, Node.js, Django, Flask, Spring Boot, .NET Core, TensorFlow

## Coding concepts and terminology
Algorithm, API, Git, Docker, Kubernetes, CI/CD, Agile, Scrum, DevOps, Machine Learning
Object-Oriented Programming, Functional Programming, Data Structures, Design Patterns

## Code syntax examples
if (condition) { ... } else { ... }
for (int i = 0; i < n; i++) { ... }
def function_name(parameter1, parameter2):
    return result

## Command line instructions
$ npm install package-name
$ git commit -m "Commit message"
$ docker build -t my-image .

// End of prompt
$$$
]]

local function start_whisper_server()
  local escaped_prompt = vim.fn.shellescape(WHISPER_PROMPT)
  local command = string.format(
    "nohup whisper-medium.en.llamafile --server --port 8432 --prompt %s >/dev/null 2>&1 &",
    escaped_prompt
  )
  vim.fn.jobstart(command, {
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

return {
  run_whisper_transcription = run_whisper_transcription
}
