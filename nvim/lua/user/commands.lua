vim.api.nvim_create_user_command("Pr", function()
  local Job = require "plenary.job"

  Job:new({
    command = "gh",
    args = { "pr", "view", "--web" },
  }):start()
end, {})

local code_system_prompt = [[
As an expert Full Stack Developer with over a decade of experience, demonstrating mastery in %s, your role is to assist me. When coding, deliver clean, efficient, and commented code according to best industry practices. Your tasks will include creating and debugging software and offering solutions to programming challenges.
]]

local ask_system_prompt = [[
As an expert Full Stack Developer with over a decade of experience, demonstrating mastery in %s, your role is to assist me. When answering my questions, ensure that you provide comprehensive, precise, and easy-to-understand responses. When coding, deliver clean, efficient, and commented code according to best industry practices. You will also be expected to explain complex concepts in a simple, accessible way. Your tasks will include creating and debugging software, offering solutions to programming challenges, and giving advice on the optimal use of the technologies mentioned. In addition, be ready to guide me step-by-step through each coding process.
]]

local languages = {
  { cmd = "Ruby", code = "ruby", technologies = "Ruby on Rails and RSpec" },
  { cmd = "Lua", code = "lua", technologies = "Neovim and Lua" },
  { cmd = "React", code = "tsx", technologies = "React, CSS and TypeScript" },
  {
    cmd = "Electron",
    code = "tsx",
    technologies = "Electron, React, TypeScript, Ant Design, CSS, SCSS, and fluent-ffmpeg",
  },
}

for _, language in ipairs(languages) do
  vim.api.nvim_create_user_command(language.cmd, function(opts)
    --luarocks install lua-openai
    local openai = require "openai"
    local client = openai.new(os.getenv "OPENAI_API_KEY")

    local prompt = opts.args

    if opts.range == 2 then
      local lines = vim.api.nvim_buf_get_lines(0, opts.line1 - 1, opts.line2, false)
      local context = table.concat(lines, "\n")

      prompt = "Context: ```" .. language.code .. "\n" .. context .. "\n```\n\n" .. prompt
    end

    local status, res = client:chat({
      {
        role = "system",
        content = string.format(ask_system_prompt, language.technologies),
      },
      { role = "user", content = prompt },
    }, {
      model = "gpt-3.5-turbo-0613",
      temperature = 0.5,
    })

    if status == 200 then
      if res.choices[1].message.content == nil then
        vim.print("\nNo content found. Response:\n" .. vim.inspect(res))
        return
      end

      vim.print(res.choices[1].message.content)
    else
      vim.print("\nError: " .. vim.inspect(res))
    end
  end, { range = true, nargs = "+" })

  vim.api.nvim_create_user_command(language.cmd .. "e", function(opts)
    --luarocks install lua-openai
    local openai = require "openai"
    local client = openai.new(os.getenv "OPENAI_API_KEY")

    local prompt = opts.args

    if opts.range == 2 then
      local lines = vim.api.nvim_buf_get_lines(0, opts.line1 - 1, opts.line2, false)
      local context = table.concat(lines, "\n")

      prompt = "Context: ```" .. language.code .. "\n" .. context .. "\n```\n\n" .. prompt
    end

    local status, res = client:chat({
      {
        role = "system",
        content = string.format(code_system_prompt, language.technologies),
      },
      { role = "user", content = prompt },
    }, {
      model = "gpt-3.5-turbo-0613",
      temperature = 0.5,
      functions = {
        {
          name = "return_code_to_user",
          description = "Return the code to the user",
          parameters = {
            type = "object",
            properties = {
              code = { type = "string", description = "The code to return" },
            },
          },
          required = { "code" },
        },
      },
      function_call = { name = "return_code_to_user" },
    })

    if status == 200 then
      if res.choices[1].message.function_call == nil then
        vim.print "\nNo function call found. Response:\n"
        vim.print(vim.inspect(res))
        return
      end

      local function_call = res.choices[1].message.function_call

      local ok, arguments = pcall(vim.json.decode, function_call.arguments)

      if ok then
        vim.fn.setreg('+', arguments.code)
        vim.print(arguments.code)
      else
        vim.print "\nError decoding arguments. Function call:\n"
        vim.print(vim.inspect(function_call))
      end
    else
      vim.print("\nError: " .. vim.inspect(res))
    end
  end, { range = true, nargs = "+" })
end
