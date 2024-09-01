local function to_snake_case(text)
  -- Handle camelCase and PascalCase
  text = text:gsub('(%u)(%u%l)', '%1_%2'):gsub('(%l)(%u)', '%1_%2')
  -- Convert to lowercase
  text = text:lower()
  -- Replace non-alphanumeric characters with underscores
  text = text:gsub('[^%w]+', '_')
  -- Remove leading/trailing underscores
  text = text:gsub('^_+', ''):gsub('_+$', '')
  -- Replace consecutive underscores with a single underscore
  text = text:gsub('_+', '_')
  return text
end

local function to_mixed_case(text)
  -- Split the text by non-alphanumeric characters
  local parts = vim.split(text, '[^%w]+')
  for i, part in ipairs(parts) do
    if #part > 0 then
      -- Lowercase the entire part, then uppercase the first letter
      parts[i] = part:lower():sub(1, 1):upper() .. part:sub(2)
    end
  end
  return table.concat(parts, '')
end

local function to_camel_case(text)
  local mixed_case = to_mixed_case(text)
  return mixed_case:sub(1, 1):lower() .. mixed_case:sub(2)
end

_G.convert_to_mixed_case_opfunc = function(motion_type)
  local start_pos, end_pos

  if motion_type == 'char' then
    start_pos = vim.fn.getpos("'[")
    end_pos = vim.fn.getpos("']")
  elseif motion_type == 'line' then
    start_pos = { vim.fn.line("'["), 1, 0, 0 }
    end_pos = { vim.fn.line("']"), vim.fn.col("$"), 0, 0 }
  elseif motion_type == 'block' then
    -- For block selections, we'll convert each line separately
    local start_line = vim.fn.line("'[")
    local end_line = vim.fn.line("']")
    local start_col = vim.fn.col("'[")
    local end_col = vim.fn.col("']")
    for line = start_line, end_line do
      local line_text = vim.fn.getline(line)
      local start_char = math.max(start_col, 1)
      local end_char = math.min(end_col, #line_text)
      local text_to_convert = line_text:sub(start_char, end_char)
      local converted_text = to_mixed_case(text_to_convert)
      vim.api.nvim_buf_set_text(0, line - 1, start_char - 1, line - 1, end_char, { converted_text })
    end
    return
  else
    vim.api.nvim_err_writeln("Unsupported motion type: " .. motion_type)
    return
  end

  local text = vim.api.nvim_buf_get_text(0, start_pos[2] - 1, start_pos[3] - 1, end_pos[2] - 1, end_pos[3], {})[1]
  local converted_text = to_mixed_case(text)
  vim.api.nvim_buf_set_text(0, start_pos[2] - 1, start_pos[3] - 1, end_pos[2] - 1, end_pos[3], { converted_text })
end

_G.convert_to_snake_case_opfunc = function(motion_type)
  local start_pos, end_pos
  if motion_type == 'char' then
    start_pos = vim.fn.getpos("'[")
    end_pos = vim.fn.getpos("']")
  elseif motion_type == 'line' then
    start_pos = { vim.fn.line("'["), 1, 0, 0 }
    end_pos = { vim.fn.line("']"), vim.fn.col("$"), 0, 0 }
  elseif motion_type == 'block' then
    -- For block selections, we'll convert each line separately
    local start_line = vim.fn.line("'[")
    local end_line = vim.fn.line("']")
    local start_col = vim.fn.col("'[")
    local end_col = vim.fn.col("']")
    for line = start_line, end_line do
      local line_text = vim.fn.getline(line)
      local start_char = math.max(start_col, 1)
      local end_char = math.min(end_col, #line_text)
      local text_to_convert = line_text:sub(start_char, end_char)
      local converted_text = to_snake_case(text_to_convert)
      vim.api.nvim_buf_set_text(0, line - 1, start_char - 1, line - 1, end_char, { converted_text })
    end
    return
  else
    vim.api.nvim_err_writeln("Unsupported motion type: " .. motion_type)
    return
  end
  local text = vim.api.nvim_buf_get_text(0, start_pos[2] - 1, start_pos[3] - 1, end_pos[2] - 1, end_pos[3], {})[1]
  local converted_text = to_snake_case(text)
  vim.api.nvim_buf_set_text(0, start_pos[2] - 1, start_pos[3] - 1, end_pos[2] - 1, end_pos[3], { converted_text })
end

_G.convert_to_camel_case_opfunc = function(motion_type)
  local start_pos, end_pos
  if motion_type == 'char' then
    start_pos = vim.fn.getpos("'[")
    end_pos = vim.fn.getpos("']")
  elseif motion_type == 'line' then
    start_pos = { vim.fn.line("'["), 1, 0, 0 }
    end_pos = { vim.fn.line("']"), vim.fn.col("$"), 0, 0 }
  elseif motion_type == 'block' then
    -- For block selections, we'll convert each line separately
    local start_line = vim.fn.line("'[")
    local end_line = vim.fn.line("']")
    local start_col = vim.fn.col("'[")
    local end_col = vim.fn.col("']")
    for line = start_line, end_line do
      local line_text = vim.fn.getline(line)
      local start_char = math.max(start_col, 1)
      local end_char = math.min(end_col, #line_text)
      local text_to_convert = line_text:sub(start_char, end_char)
      local converted_text = to_camel_case(text_to_convert)
      vim.api.nvim_buf_set_text(0, line - 1, start_char - 1, line - 1, end_char, { converted_text })
    end
    return
  else
    vim.api.nvim_err_writeln("Unsupported motion type: " .. motion_type)
    return
  end
  local text = vim.api.nvim_buf_get_text(0, start_pos[2] - 1, start_pos[3] - 1, end_pos[2] - 1, end_pos[3], {})[1]
  local converted_text = to_camel_case(text)
  vim.api.nvim_buf_set_text(0, start_pos[2] - 1, start_pos[3] - 1, end_pos[2] - 1, end_pos[3], { converted_text })
end
