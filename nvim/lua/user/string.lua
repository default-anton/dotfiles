local M = {}

local function snake_to_mixed(text)
  local parts = vim.split(text, '_')
  for i, part in ipairs(parts) do
    if #part > 0 then
      parts[i] = part:sub(1, 1):upper() .. part:sub(2)
    end
  end
  return table.concat(parts, '')
end

_G.convert_snake_to_mixed_opfunc = function(motion_type)
  vim.print("Function called with motion_type: " .. motion_type)
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
      local converted_text = snake_to_mixed(text_to_convert)
      vim.api.nvim_buf_set_text(0, line - 1, start_char - 1, line - 1, end_char, { converted_text })
    end
    return
  else
    print("Unsupported motion type: " .. motion_type)
    return
  end

  local text = vim.api.nvim_buf_get_text(0, start_pos[2] - 1, start_pos[3] - 1, end_pos[2] - 1, end_pos[3], {})[1]
  local converted_text = snake_to_mixed(text)
  vim.api.nvim_buf_set_text(0, start_pos[2] - 1, start_pos[3] - 1, end_pos[2] - 1, end_pos[3], { converted_text })
end

return M
