vim.api.nvim_create_user_command("Annotate", function(opts)
  local path = vim.api.nvim_buf_get_name(0)
  if vim.bo.buftype ~= "" or path == "" then
    vim.notify("Annotate requires a saved file", vim.log.levels.ERROR)
    return
  end
  if vim.bo.modified then
    vim.notify("Save the file before annotating", vim.log.levels.WARN)
    return
  end
  if vim.fn.executable("annotate") ~= 1 then
    vim.notify("annotate is not on PATH", vim.log.levels.ERROR)
    return
  end

  local command = { "annotate", path }
  if opts.range > 0 then
    vim.list_extend(command, { tostring(opts.line1), tostring(opts.line2) })
  end
  vim.system(command, { text = true }, function(result)
    if result.code ~= 0 then
      vim.schedule(function()
        local message = vim.trim(result.stderr or "")
        if message == "" then
          message = "command exited with status " .. result.code
        end
        vim.notify("Annotate: " .. message, vim.log.levels.ERROR)
      end)
    end
  end)
end, { desc = "Annotate the saved file or selected lines in Herdr", range = true })
