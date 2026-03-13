local M = {}

local DEFAULT_ATTEMPTS = 20

function M.open_review_diff(bufnr, attempts_left)
  bufnr = bufnr or vim.api.nvim_get_current_buf()
  attempts_left = attempts_left or DEFAULT_ATTEMPTS

  if vim.api.nvim_get_current_buf() ~= bufnr then
    return
  end

  if vim.b[bufnr].gitsigns_status_dict ~= nil then
    require('gitsigns').diffthis()
    return
  end

  if attempts_left <= 0 then
    vim.notify('Review diff: gitsigns did not attach to current buffer', vim.log.levels.WARN)
    return
  end

  vim.defer_fn(function()
    M.open_review_diff(bufnr, attempts_left - 1)
  end, 50)
end

return M
