set nocompatible
filetype off                  " required
set nobackup
set nowritebackup
set noswapfile    " http://robots.thoughtbot.com/post/18739402579/global-gitignore#comment-458413287
set history=50
set ruler         " show the cursor position all the time
set showcmd       " display incomplete commands
set laststatus=2  " Always display the status line

" Allow per-project configuration files
set exrc
" Disable unsafe commands in your project-specific .vimrc files
set secure

" Set to auto read when a file is changed from the outside
set autoread

" set the runtime path to include Vundle and initialize
set rtp+=~/.vim/bundle/Vundle.vim
call vundle#begin()
" alternatively, pass a path where Vundle should install plugins
"call vundle#begin('~/some/path/here')

" let Vundle manage Vundle, required
Plugin 'VundleVim/Vundle.vim'
Plugin 'altercation/vim-colors-solarized'
Plugin 'ctrlpvim/ctrlp.vim'
Bundle 'vim-ruby/vim-ruby'
Plugin 'tpope/vim-fugitive'
Plugin 'tpope/vim-bundler'
Plugin 'tpope/vim-projectionist'
Plugin 'tpope/vim-rake'
Plugin 'tpope/vim-rails'
Plugin 'tpope/vim-endwise'
Plugin 'tpope/vim-surround'
Plugin 'tpope/vim-repeat'
Plugin 'tpope/vim-haml'
Plugin 'tpope/vim-eunuch'
Plugin 'tpope/vim-markdown'
Plugin 'pbrisbin/vim-mkdir'
Plugin 'raimondi/delimitmate'
Plugin 'thoughtbot/vim-rspec'
Plugin 'scrooloose/nerdtree'
Plugin 'scrooloose/nerdcommenter'
Plugin 'vim-airline/vim-airline'
Plugin 'vim-airline/vim-airline-themes'
Plugin 'ecomba/vim-ruby-refactoring'
Plugin 'fatih/vim-go'
Plugin 'jeffkreeftmeijer/vim-numbertoggle'
Plugin 'roman/golden-ratio'
Plugin 'yggdroot/indentline'
Plugin 'airblade/vim-gitgutter'
Plugin 'AndrewRadev/splitjoin.vim'
Plugin 'mileszs/ack.vim'
Plugin 'rbgrouleff/bclose.vim'
Plugin 'matchit.zip'


" All of your Plugins must be added before the following line
call vundle#end()            " required
filetype plugin indent on    " required
autocmd FileType ruby compiler ruby

" Switch syntax highlighting on, when the terminal has colors
" Also switch on highlighting the last used search pattern.
if (&t_Co > 2 || has("gui_running")) && !exists("syntax_on")
  syntax enable
endif

" Enable 256 colors palette in Gnome Terminal
let g:solarized_termcolors=256
set t_Co=256
set t_ut=
set background=dark
colorscheme solarized

" When the type of shell script is /bin/sh, assume a POSIX-compatible
" shell for syntax highlighting purposes.
let g:is_posix = 1

if filereadable(expand("~/.vimrc.bundles"))
  source ~/.vimrc.bundles
endif

" Softtabs, 2 spaces
set tabstop=2
set shiftwidth=2
set shiftround
set expandtab

set ai "Auto indent
set si "Smart indent

" With a map leader it's possible to do extra key combinations
" like <leader>w saves the current file
let mapleader = ","
let g:mapleader = ","

"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" => VIM user interface
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" Set x lines to the cursor - when moving vertically using j/k
set so=5

" Turn on the WiLd menu
set wildmenu
set clipboard=unnamedplus

" Ignore compiled files
set wildignore=*.o,*~,*.pyc
set wildignore+=*/tmp/*,*.so,*.swp,*.zip

" Height of the command bar
set cmdheight=2

" A buffer becomes hidden when it is abandoned
set hid

" Configure backspace so it acts as it should act
set backspace=eol,start,indent
set whichwrap+=<,>,h,l

" Ignore case when searching
set ignorecase

" When searching try to be smart about cases
set smartcase

" Be smart when using tabs ;)
set smarttab

" Highlight search results
set hlsearch
highlight Search guibg=NONE guifg=NONE gui=underline ctermfg=NONE ctermbg=NONE cterm=underline
highlight IncSearch guibg=NONE guifg=NONE gui=underline ctermfg=NONE ctermbg=NONE cterm=underline

" Disable highlight when <leader><leader> is pressed
map <silent> <leader><leader> :noh<cr>

" Makes search act like search in modern browsers
set incsearch

" Don't redraw while executing macros (good performance config)
set lazyredraw

set cursorline

" Show matching brackets when text indicator is over them
set showmatch
" How many tenths of a second to blink when matching brackets
set mat=2

cnoreabbrev Ack Ack!
if executable('ag')
  let g:ackprg = 'ag --vimgrep'

  " Use ag in CtrlP for listing files. Lightning fast and respects .gitignore
  let g:ctrlp_user_command = 'ag %s -l --ignore-case --nocolor --hidden --depth 100 -g ""'

  " ag is fast enough that CtrlP doesn't need to cache
  let g:ctrlp_use_caching = 0
endif

" Smart way to move between windows
map <C-j> <C-W>j
map <C-k> <C-W>k
map <C-h> <C-W>h
map <C-l> <C-W>l
imap jj <Esc>

" Fast saving
nmap <leader>w :w!<cr>
map <leader>k :setlocal spell! spelllang=en_us<cr>

" Yank file path with line number
nnoremap <leader>yl :let @+=expand("%") . ':' . line(".")<CR>

" No annoying sound on errors
set noerrorbells
set novisualbell
set t_vb=
set tm=500
let g:indentLine_color_term = 239

" Use one space, not two, after punctuation.
set nojoinspaces

" Make it obvious where 100 characters is
set textwidth=120
set colorcolumn=+1

" Numbers
set number
set numberwidth=4

" Tab completion
" will insert tab at beginning of line,
" will use completion if not at beginning
set wildmode=list:longest,list:full
function! InsertTabWrapper()
  let col = col('.') - 1
  if !col || getline('.')[col - 1] !~ '\k'
    return "\<tab>"
  else
    return "\<c-p>"
  endif
endfunction
inoremap <Tab> <c-r>=InsertTabWrapper()<cr>
inoremap <S-Tab> <c-n>

" Get off my lawn
nnoremap <Left> :echoe "Use h"<CR>
nnoremap <Right> :echoe "Use l"<CR>
nnoremap <Up> :echoe "Use k"<CR>
nnoremap <Down> :echoe "Use j"<CR>

" Close the current buffer
map <silent> <leader>bd :Bclose<CR>
" Close all the buffers
map <leader>ba :bufdo bd<cr>
map <leader>l :bnext<cr>
map <leader>h :bprevious<cr>

" Useful mappings for managing tabs
map <leader>tc :tabnew<cr>
map <leader>to :tabonly<cr>
map <leader>td :tabclose<cr>
map <leader>tm :tabmove
map <leader>tt :tabnext<cr>

" Opens a new tab with the current buffer's path
" Super useful when editing files in the same directory
map <leader>te :tabedit <c-r>=expand("%:p:h")<cr>/

" Specify the behavior when switching between buffers
try
  set switchbuf=useopen,usetab,newtab
  set stal=2
catch
endtry

" Automatically displays all buffers when there's only one tab open
let g:airline_powerline_fonts = 1
let g:airline#extensions#tabline#enabled = 1
let g:airline_powerline_fonts = 1
let g:airline#extensions#branch#enabled = 1
let g:airline_theme='solarized'
let g:airline_solarized_bg='dark'

" Set utf8 as standard encoding and en_US as the standard language
set encoding=utf8

" Use Unix as the standard file type
set ffs=unix,dos,mac

" Treat <li> and <p> tags like the block tags they are
let g:html_indent_tags = 'li\|p'

" Open new split panes to right and bottom, which feels more natural
set splitbelow
set splitright

" RSpec.vim mappings
map <Leader>rf :call RunCurrentSpecFile()<CR>
map <Leader>rs :call RunNearestSpec()<CR>
map <Leader>rl :call RunLastSpec()<CR>
map <Leader>ra :call RunAllSpecs()<CR>

map <Leader>n :NERDTreeToggle<CR>
map <Leader>nf :NERDTreeFind<CR>

let g:splitjoin_split_mapping = ''
let g:splitjoin_join_mapping = ''

nmap <Leader>j :SplitjoinJoin<cr>
nmap <Leader>s :SplitjoinSplit<cr>

" Return to last edit position when opening files (You want this!)
autocmd BufReadPost *
      \ if line("'\"") > 0 && line("'\"") <= line("$") |
      \   exe "normal! g`\"" |
      \ endif
" Remember info about open buffers on close
set viminfo^=%

" Local config
if filereadable($HOME . "/.vimrc.local")
  source ~/.vimrc.local
endif

"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" => Helper functions
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" Returns true if paste mode is enabled
function! HasPaste()
  if &paste
    return 'PASTE MODE  '
  endif
  return ''
endfunction

let g:ctrlp_cmd = 'CtrlPMixed'
let g:ctrlp_max_files = 0
let g:ctrlp_max_depth = 100
let g:ctrlp_root_markers = ['Gemfile', '.git']
let g:ctrlp_working_path_mode = 'ra'
let g:ctrlp_custom_ignore = '\v[\/]\.(git|hg|svn)$'
let g:ctrlp_custom_ignore = {
      \ 'dir':  '\v[\/]\.(git|hg|svn)$',
      \ 'file': '\v\.(exe|so|dll)$',
      \ 'link': 'some_bad_symbolic_links',
      \ }

