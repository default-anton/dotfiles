local telescope = require 'telescope'
local actions = require 'telescope.actions'

telescope.setup {
  defaults = {
    prompt_prefix = " ",
    selection_caret = " ",
    path_display = { "truncate" },

    mappings = {
      i = {
        ["<C-n>"] = actions.cycle_history_next,
        ["<C-p>"] = actions.cycle_history_prev,

        ["<C-j>"] = actions.move_selection_next,
        ["<C-k>"] = actions.move_selection_previous,

        ["<C-c>"] = actions.close,
        ["<C-u>"] = false,
      },

    },
    vimgrep_arguments = {
      "rg",
      "--color=never",
      "--no-heading",
      "--with-filename",
      "--line-number",
      "--column",
      "--smart-case",
      "--trim" -- add this value
    },
  },
  extensions = {
    fzf = {
      fuzzy = true, -- false will only do exact matching
      override_generic_sorter = true, -- override the generic sorter
      override_file_sorter = true, -- override the file sorter
      case_mode = "smart_case", -- or "ignore_case" or "respect_case"
      -- the default case_mode is "smart_case"
    }
  },
  pickers = {
    find_files = {
      previewer = false,
      find_command = { "fd", "--type", "f", "--strip-cwd-prefix" },
      debounce = 50,
      layout_config = {
        height = 0.8,
      },
    },
    buffers = {
      previewer = false,
      layout_config = {
        height = 0.8,
      },
    },
    live_grep = {
      theme = "ivy",
      debounce = 50,
      layout_config = {
        height = 0.5,
      }
    },
    grep_string = {
      theme = "ivy",
      debounce = 50,
      layout_config = {
        height = 0.5,
      }
    },
    git_branches = {
      previewer = false,
      theme = "ivy",
    },
    current_buffer_fuzzy_find = {
      theme = "ivy",
      layout_config = {
        height = 0.5,
      }
    },
    lsp_document_symbols = {
      theme = "dropdown",
      layout_config = {
        height = 0.6,
      }
    },
    lsp_references = {
      theme = "ivy",
      layout_config = {
        height = 0.5,
      }
    },
    lsp_definitions = {
      theme = "cursor",
    },
    lsp_implementations = {
      theme = "cursor",
    },
    lsp_type_definitions = {
      theme = "cursor",
    }
  },
}

telescope.load_extension('fzf')
