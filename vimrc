set nocompatible
filetype off

set rtp+=~/.vim/bundle/Vundle.vim
call vundle#begin()

Plugin 'VundleVim/Vundle.vim'
Plugin 'altercation/vim-colors-solarized'
Plugin 'junegunn/fzf', { 'do': './install --all' }
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
Plugin 'tpope/vim-abolish'
Plugin 'tpope/vim-dadbod'
Plugin 'tpope/vim-rhubarb'
Plugin 'raimondi/delimitmate'
Plugin 'pbrisbin/vim-mkdir'
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
Plugin 'ntpeters/vim-better-whitespace'
Plugin 'junegunn/vim-easy-align'
Plugin 'pangloss/vim-javascript'
Plugin 'mxw/vim-jsx'
Plugin 'hashivim/vim-terraform'
Plugin 'w0rp/ale'
Plugin 'xavierchow/vim-sequence-diagram'
Plugin 'wannesm/wmgraphviz.vim'
Plugin 'roxma/nvim-yarp'
Plugin 'roxma/vim-hug-neovim-rpc'
Plugin 'SirVer/ultisnips'
Plugin 'airblade/vim-rooter'
Plugin 'jparise/vim-graphql'
Plugin 'schickling/vim-bufonly'
Plugin 'amadeus/vim-mjml'
Plugin 'autozimu/LanguageClient-neovim', {
      \ 'branch': 'next',
      \ 'do': 'bash install.sh',
      \ }

call vundle#end()
filetype plugin indent on

let g:is_posix = 1
let mapleader = ","
let g:mapleader = ","

set nobackup
set nowritebackup
set noswapfile
set history=50
set ruler         " show the cursor position all the time
set showcmd       " display incomplete commands
set laststatus=2  " Always display the status line
set exrc
set secure
set autoread
set autowrite
set tabstop=2
set shiftwidth=2
set shiftround
set expandtab
set ai "Auto indent
set si "Smart indent

" Switch syntax highlighting on, when the terminal has colors
" Also switch on highlighting the last used search pattern.
if (&t_Co > 2 || has("gui_running")) && !exists("syntax_on")
  "syntax enable
endif
syntax on


"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" => VIM UI
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
let g:markdown_syntax_conceal = 0

let g:LanguageClient_serverCommands = {
      \ 'go': ['go-langserver', '-gocodecompletion'],
      \ 'javascript': ['javascript-typescript-stdio'],
      \ 'javascript.jsx': ['javascript-typescript-stdio'],
      \ }
nnoremap <silent> K :call LanguageClient#textDocument_hover()<CR>
nnoremap <silent> gd :call LanguageClient#textDocument_definition()<CR>
nnoremap <silent> <F2> :call LanguageClient#textDocument_rename()<CR>
nnoremap <silent> gi :call LanguageClient#textDocument_implementation()<CR>
nnoremap <silent> gl :call LanguageClient#textDocument_documentSymbol()<CR>
nnoremap <silent> gr :call LanguageClient#textDocument_references()<CR>
nnoremap <space><space> :FZF<CR>
setlocal omnifunc=LanguageClient#complete

let g:rooter_patterns = [
      \ 'package.json', 'Rakefile', 'Makefile', 'requirements.txt',
      \ 'Gemfile', '.git', '.git/', '_darcs/', '.hg/', '.bzr/', '.svn/'
      \ ]
let g:rooter_use_lcd = 0
let g:rooter_silent_chdir = 1
let g:rooter_resolve_links = 1

let g:UltiSnipsExpandTrigger="<c-k>"
let g:UltiSnipsJumpForwardTrigger="<c-j>"
let g:UltiSnipsJumpBackwardTrigger="<c-l>"
let g:UltiSnipsSnippetsDir="~/.vim/UltiSnips"

let g:airline_powerline_fonts = 1
let g:airline_solarized_bg='dark'
let g:airline_theme='solarized'
let g:airline#extensions#ale#enabled = 1
let g:airline#extensions#branch#enabled = 1
let g:airline#extensions#tabline#enabled = 1
let g:solarized_termcolors=256
let g:indentLine_color_term = 239

let g:jsx_ext_required = 0

let g:ale_fixers = {}
let g:ale_fixers['javascript'] = ['prettier', 'eslint']
let g:ale_fixers['ruby'] = ['rubocop']
let g:ale_fix_on_save = 1
let g:ale_lint_on_text_changed = 'never'
let g:ale_lint_on_enter = 0
let g:ale_javascript_prettier_use_local_config = 1

let g:terraform_fmt_on_save = 1
let g:terraform_align=1

let g:markdown_fenced_languages = ['html', 'python', 'bash=sh', 'css', 'erb=ruby', 'javascript.jsx', 'javascript', 'js=javascript.jsx', 'json=javascript', 'ruby', 'xml']
au BufWritePost *.markdown,*.md silent! !grip --user-content --context=KeyweeLabs/post-malone --norefresh --quiet --export % > /dev/null 2>&1 && mv %:r.html /tmp/md-%:r.html && xdg-open /tmp/md-%:r.html > /dev/null 2>&1

set t_Co=256
set t_ut=
set background=dark
colorscheme solarized
" No annoying sound on errors
set noerrorbells
set novisualbell
set t_vb=
set tm=500
" Add a bit extra margin to the left
set foldcolumn=1
" Set x lines to the cursor - when moving vertically using j/k
set so=7
set wildmenu
set clipboard=unnamedplus
set wildignore=*.o,*~,*.pyc
set wildignore+=*/tmp/*,*.so,*.swp,*.zip
set wildignore+=*/.git/*,*/.hg/*,*/.svn/*,*/.DS_Store
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
set showmatch
" How many tenths of a second to blink when matching brackets
set mat=2
" Use one space, not two, after punctuation.
set nojoinspaces
" Make it obvious where 100 characters is
set textwidth=120
set colorcolumn=+1
" Numbers
set number
set numberwidth=4
set encoding=utf8
set ffs=unix,dos,mac
" Treat <li> and <p> tags like the block tags they are
let g:html_indent_tags = 'li\|p'
" Open new split panes to right and bottom, which feels more natural
set splitbelow
set splitright



""""""""""""""""""""""""""""""
" => Ruby section
""""""""""""""""""""""""""""""

""""""""""""""""""""""""""""""
let g:rubycomplete_buffer_loading = 1
let g:rubycomplete_classes_in_global = 1
let g:rubycomplete_include_object = 1
let g:rubycomplete_include_objectspace = 1


" => Python section
""""""""""""""""""""""""""""""
let python_highlight_all = 1
au FileType python syn keyword pythonDecorator True None False self
au BufNewFile,BufRead *.jinja set syntax=htmljinja
au BufNewFile,BufRead *.mako set ft=mako
au FileType python set cindent
au FileType python set cinkeys-=0#
au FileType python set indentkeys-=0#


""""""""""""""""""""""""""""""
" => Go section
""""""""""""""""""""""""""""""

" all lists will be of type quickfix
let g:go_def_mapping_enabled = 0
let g:go_doc_keywordprg_enabled = 0
let g:go_list_type = "quickfix"
let g:go_test_timeout = '10s'
let g:go_fmt_command = "goimports"
let g:go_highlight_types = 1
let g:go_highlight_functions = 1
let g:go_highlight_methods = 1
let g:go_highlight_function_calls = 1
let g:go_highlight_build_constraints = 1
let g:go_highlight_generate_tags = 1
let g:go_updatetime = 100
let g:go_jump_to_error = 0
let g:go_metalinter_autosave = 1
let g:go_metalinter_deadline = "5s"
let g:go_metalinter_enabled = ['vet', 'golint', 'errcheck']
let g:go_metalinter_autosave_enabled = ['vet', 'golint']
let g:go_gocode_unimported_packages = 1

autocmd FileType go nmap <leader>gr <Plug>(go-run-split)
autocmd FileType go nmap <leader>gb :<C-u>call <SID>build_go_files()<CR>
autocmd FileType go nmap <leader>e <Plug>(go-rename)
autocmd FileType go nmap <leader>rf <Plug>(go-test)
autocmd FileType go nmap <leader>rs <Plug>(go-test-func)
autocmd FileType go nmap <leader>atj :GoAddTags json<cr>
autocmd FileType go nmap <leader>atd :GoAddTags db<cr>
autocmd FileType go nmap <leader>rtj :GoRemoveTags json<cr>
autocmd FileType go nmap <leader>rtd :GoRemoveTags db<cr>
autocmd FileType go nmap <leader>rt :GoRemoveTags<cr>
autocmd FileType go nmap <Leader>rc <Plug>(go-coverage-toggle)
autocmd FileType go nmap <Leader>rcb :GoCoverageBrowser<cr>
autocmd FileType go nmap <Leader>d <Plug>(go-doc)
autocmd FileType go nmap <Leader>i <Plug>(go-implements)
autocmd FileType go nmap <Leader>q <Plug>(go-info)
autocmd FileType go nmap <Leader>de :GoDecls<cr>
autocmd FileType go nmap <Leader>ded :GoDeclsDir<cr>
autocmd FileType go nmap <Leader>fc <Plug>(go-callers)
autocmd FileType go nmap <Leader>fb <Plug>(go-callstack)
autocmd FileType go nmap <Leader>we :GoWhicherrs<cr>
autocmd FileType go nmap <Leader>sk :GoKeyify<cr>
autocmd FileType go nmap <Leader>sf :GoFillStruct<cr>
autocmd FileType go vmap <leader>p :GoPlay<cr>
autocmd Filetype go command! -bang A call go#alternate#Switch(<bang>0, 'edit')
autocmd Filetype go command! -bang AV call go#alternate#Switch(<bang>0, 'vsplit')
autocmd Filetype go command! -bang AS call go#alternate#Switch(<bang>0, 'split')
autocmd Filetype go command! -bang AT call go#alternate#Switch(<bang>0, 'tabe')
autocmd BufNewFile,BufRead *.go setlocal noexpandtab tabstop=4 shiftwidth=4



let g:ruby_indent_block_style = 'do'
let ruby_spellcheck_strings = 1

autocmd FileType ruby compiler ruby
autocmd FileType ruby let b:delimitMate_quotes = "\" ' ` |"
autocmd BufEnter * EnableStripWhitespaceOnSave
" Return to last edit position when opening files (You want this!)
autocmd BufReadPost *
      \ if line("'\"") > 0 && line("'\"") <= line("$") |
      \   exe "normal! g`\"" |
      \ endif

" source .vimrc after cd project/
autocmd User RooterChDir silent! source .vimrc
" Remember info about open buffers on close
set viminfo^=%



"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" => Maps
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" Switch CWD to the directory of the open buffer
map <leader>cd :cd %:p:h<cr>:pwd<cr>

" Visual mode pressing * or # searches for the current selection
vnoremap <silent> * :<C-u>call VisualSelection('', '')<CR>/<C-R>=@/<CR><CR>
vnoremap <silent> # :<C-u>call VisualSelection('', '')<CR>?<C-R>=@/<CR><CR>

let g:WMGraphviz_output = 'png'
" Sequence diagram
nmap <unique> <leader>ds <Plug>GenerateDiagram
" Flow diagram
nmap <silent> <leader>df :GraphvizCompile<cr>:silent :GraphvizShow<cr>

map <Leader>rf :call RunCurrentSpecFile()<CR>
map <Leader>rs :call RunNearestSpec()<CR>
map <Leader>rl :call RunLastSpec()<CR>
map <Leader>ra :call RunAllSpecs()<CR>

map <Leader>n :NERDTreeToggle<CR>
map <Leader>nf :NERDTreeFind<CR>

let g:splitjoin_split_mapping = ''
let g:splitjoin_join_mapping = ''
let g:splitjoin_ruby_hanging_args = 0
let g:splitjoin_ruby_curly_braces = 0

nmap <Leader>j :SplitjoinJoin<cr>
nmap <Leader>s :SplitjoinSplit<cr>

xmap ga <Plug>(EasyAlign)
nmap ga <Plug>(EasyAlign)

" Smart way to move between windows
map <C-j> <C-W>j
map <C-k> <C-W>k
map <C-h> <C-W>h
map <C-l> <C-W>l
imap kj <Esc>

map <leader>k :setlocal spell! spelllang=en_us<cr>
" Yank file path with line number
nnoremap <leader>yl :let @+=expand("%") . ':' . line(".")<CR>

" Tab completion
" will insert tab at beginning of line,
" will use completion if not at beginning
set wildmode=list:longest,list:full

" n always search forward and N backward
nnoremap <expr> n  'Nn'[v:searchforward]
nnoremap <expr> N  'nN'[v:searchforward]

" recall the command-line whose beginning matches the current command-line.
" E.g. :echo <up> may change to :echo "Vim rocks!"
cnoremap <c-n>  <down>
cnoremap <c-p>  <up>

" Get off my lawn
nnoremap <Left> :echoe "Use h"<CR>
nnoremap <Right> :echoe "Use l"<CR>
nnoremap <Up> :echoe "Use k"<CR>
nnoremap <Down> :echoe "Use j"<CR>

" Close all the buffers except the current buffer.
map <leader>bo :BufOnly<CR>
" Close the current buffer
map <silent> <leader>bd :Bclose<CR>
" Close all the buffers
map <leader>ba :bufdo bd<CR>
map <leader>. :bnext<CR>
map <leader>m :bprevious<CR>

" Specify the behavior when switching between buffers
try
  set switchbuf=useopen,usetab,newtab
  set stal=2
catch
endtry



"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" => Search
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
cnoreabbrev Ack Ack!
if executable('ag')
  let g:ackprg = 'ag --vimgrep'
endif

let $FZF_DEFAULT_COMMAND = 'ag --ignore-case --nocolor --hidden --depth 100 -g ""'
let g:fzf_layout = { 'window': 'enew' }
let g:fzf_history_dir = '~/.local/share/fzf-history'
let g:fzf_colors =
\ { 'fg':      ['fg', 'Normal'],
  \ 'bg':      ['bg', 'Normal'],
  \ 'hl':      ['fg', 'Comment'],
  \ 'fg+':     ['fg', 'CursorLine', 'CursorColumn', 'Normal'],
  \ 'bg+':     ['bg', 'CursorLine', 'CursorColumn'],
  \ 'hl+':     ['fg', 'Statement'],
  \ 'info':    ['fg', 'PreProc'],
  \ 'border':  ['fg', 'Ignore'],
  \ 'prompt':  ['fg', 'Conditional'],
  \ 'pointer': ['fg', 'Exception'],
  \ 'marker':  ['fg', 'Keyword'],
  \ 'spinner': ['fg', 'Label'],
  \ 'header':  ['fg', 'Comment'] }


"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" => Helper functions
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
function! VisualSelection(direction, extra_filter) range
  let l:saved_reg = @"
  execute "normal! vgvy"

  let l:pattern = escape(@", "\\/.*'$^~[]")
  let l:pattern = substitute(l:pattern, "\n$", "", "")

  if a:direction == 'gv'
    call CmdLine("Ack '" . l:pattern . "' " )
  elseif a:direction == 'replace'
    call CmdLine("%s" . '/'. l:pattern . '/')
  endif

  let @/ = l:pattern
  let @" = l:saved_reg
endfunction

" run :GoBuild or :GoTestCompile based on the go file
function! s:build_go_files()
  let l:file = expand('%')
  if l:file =~# '^\f\+_test\.go$'
    call go#test#Test(0, 1)
  elseif l:file =~# '^\f\+\.go$'
    call go#cmd#Build(0)
  endif
endfunction
