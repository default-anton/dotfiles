-- This file can be loaded by calling `lua require('plugins')` from your init.vim

local ensure_packer = function()
  local fn = vim.fn
  local install_path = fn.stdpath "data" .. "/site/pack/packer/start/packer.nvim"
  if fn.empty(fn.glob(install_path)) > 0 then
    fn.system { "git", "clone", "--depth", "1", "https://github.com/wbthomason/packer.nvim", install_path }
    vim.cmd [[packadd packer.nvim]]
    return true
  end
  return false
end

local packer_bootstrap = ensure_packer()

return require("packer").startup(function(use)
  use "wbthomason/packer.nvim"

  use "nvim-lua/plenary.nvim"
  use "neovim/nvim-lspconfig"
  use "williamboman/nvim-lsp-installer"
  use "hrsh7th/nvim-cmp"
  use "hrsh7th/cmp-nvim-lsp"
  use "hrsh7th/cmp-nvim-lua"
  use "hrsh7th/cmp-buffer"
  use "hrsh7th/cmp-path"
  use "hrsh7th/cmp-cmdline"
  use "hrsh7th/cmp-nvim-lsp-signature-help"
  use "onsails/lspkind.nvim"
  use "b0o/schemastore.nvim"
  use "SirVer/ultisnips"
  use "quangnguyen30192/cmp-nvim-ultisnips"
  use { "nvim-treesitter/nvim-treesitter", run = ":TSUpdate" }
  use "nvim-treesitter/nvim-treesitter-context"
  use "nvim-treesitter/nvim-treesitter-textobjects"
  use "nvim-tree/nvim-web-devicons"
  use "lewis6991/gitsigns.nvim"
  use "nvim-lualine/lualine.nvim"
  use "lukas-reineke/indent-blankline.nvim"
  use "notjedi/nvim-rooter.lua"
  use "jose-elias-alvarez/null-ls.nvim"
  use "kdheepak/lazygit.nvim"
  use { "folke/tokyonight.nvim", branch = "main" }
  use "andymass/vim-matchup"
  use "ruifm/gitlinker.nvim"
  use { "j-hui/fidget.nvim", tag = "legacy" }
  use "github/copilot.vim"
  use {
    "nvim-telescope/telescope.nvim",
    tag = "0.1.2",
    requires = { { "nvim-lua/plenary.nvim" } },
  }
  use { "nvim-telescope/telescope-fzf-native.nvim", run = "make" }
  use {
    "nvim-telescope/telescope-file-browser.nvim",
    requires = { "nvim-telescope/telescope.nvim", "nvim-lua/plenary.nvim" },
  }
  use '~/code/gpt-sidekick'

  use "AndrewRadev/splitjoin.vim"
  use "preservim/nerdcommenter"
  use "junegunn/vim-easy-align"
  use "vim-test/vim-test"
  use "schickling/vim-bufonly"
  use "tpope/vim-dispatch"
  use "tpope/vim-projectionist"
  use "tpope/vim-surround"
  use "tpope/vim-repeat"
  use "tpope/vim-eunuch"
  use "tpope/vim-abolish"
  use "pbrisbin/vim-mkdir"
  use "pangloss/vim-javascript"
  use "peitalin/vim-jsx-typescript"
  use "leafgarland/typescript-vim"
  use "moll/vim-node"
  use "hashivim/vim-terraform"
  use "tpope/vim-rails"
  use "tpope/vim-bundler"
  use "editorconfig/editorconfig-vim"

  use_rocks { "lua-openai", env = { OPENSSL_DIR = "/opt/homebrew/opt/openssl" } }

  -- Automatically set up your configuration after cloning packer.nvim
  -- Put this at the end after all plugins
  if packer_bootstrap then
    require("packer").sync()
  end
end)
