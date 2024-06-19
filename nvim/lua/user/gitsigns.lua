local gs = require "gitsigns"

gs.setup {
  on_attach = function(bufnr)
    local function map(mode, l, r, opts)
      opts = opts or {}
      opts.buffer = bufnr
      vim.keymap.set(mode, l, r, opts)
    end

    -- Navigation
    map('n', ']c', function()
      if vim.wo.diff then
        vim.cmd.normal({ ']c', bang = true })
      else
        gs.nav_hunk('next')
      end
    end)

    map('n', '[c', function()
      if vim.wo.diff then
        vim.cmd.normal({ '[c', bang = true })
      else
        gs.nav_hunk('prev')
      end
    end)

    -- Actions
    map("n", "<leader>ht", gs.toggle_signs)
    map("n", "<leader>hs", gs.stage_hunk)
    map("n", "<leader>hr", gs.reset_hunk)
    map('v', '<leader>hs', function() gs.stage_hunk { vim.fn.line('.'), vim.fn.line('v') } end)
    map('v', '<leader>hr', function() gs.reset_hunk { vim.fn.line('.'), vim.fn.line('v') } end)
    map("n", "<leader>hS", gs.stage_buffer)
    map("n", "<leader>hR", gs.reset_buffer)
    map("n", "<leader>hu", gs.undo_stage_hunk)
    map("n", "<leader>hp", gs.preview_hunk)
    map('n', '<leader>hb', function() gs.blame_line { full = true } end)
  end
}
