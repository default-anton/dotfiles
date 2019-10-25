if empty(glob('~/.vim/autoload/plug.vim'))
  silent !curl -fLo ~/.vim/autoload/plug.vim --create-dirs
    \ https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
  autocmd VimEnter * PlugInstall --sync | source $MYVIMRC
endif

call plug#begin('~/.vim/plugged')
Plug 'VundleVim/Vundle.vim'
Plug 'danielwe/base16-vim'
Plug 'junegunn/fzf', { 'dir': '~/.fzf', 'do': './install --all' }
Plug 'junegunn/fzf.vim'
Plug 'vim-ruby/vim-ruby'
Plug 'tpope/vim-fugitive'
Plug 'tpope/vim-bundler'
Plug 'tpope/vim-projectionist'
Plug 'tpope/vim-rake'
Plug 'tpope/vim-rails'
Plug 'tpope/vim-endwise'
Plug 'tpope/vim-surround'
Plug 'tpope/vim-repeat'
Plug 'tpope/vim-haml'
Plug 'tpope/vim-eunuch'
Plug 'tpope/vim-markdown'
Plug 'tpope/vim-abolish'
Plug 'tpope/vim-dadbod'
Plug 'tpope/vim-rhubarb'
Plug 'tpope/vim-cucumber'
Plug 'tpope/vim-dispatch'
Plug 'raimondi/delimitmate'
Plug 'pbrisbin/vim-mkdir'
Plug 'janko-m/vim-test'
Plug 'scrooloose/nerdtree'
Plug 'scrooloose/nerdcommenter'
Plug 'vim-airline/vim-airline'
Plug 'vim-airline/vim-airline-themes'
Plug 'fatih/vim-go'
Plug 'jeffkreeftmeijer/vim-numbertoggle'
Plug 'roman/golden-ratio'
Plug 'yggdroot/indentline'
Plug 'airblade/vim-gitgutter'
Plug 'AndrewRadev/splitjoin.vim'
Plug 'mileszs/ack.vim'
Plug 'vim-scripts/matchit.zip'
Plug 'ntpeters/vim-better-whitespace'
Plug 'junegunn/vim-easy-align'
Plug 'pangloss/vim-javascript'
Plug 'mxw/vim-jsx'
Plug 'hashivim/vim-terraform'
Plug 'dense-analysis/ale'
Plug 'xavierchow/vim-sequence-diagram'
Plug 'wannesm/wmgraphviz.vim'
Plug 'SirVer/ultisnips'
Plug 'airblade/vim-rooter'
Plug 'jparise/vim-graphql'
Plug 'schickling/vim-bufonly'
Plug 'amadeus/vim-mjml'
Plug 'leafgarland/typescript-vim'
Plug 'dart-lang/dart-vim-plugin'
Plug 'kana/vim-textobj-user'
Plug 'nelstrom/vim-textobj-rubyblock'
Plug 'danchoi/ri.vim'
Plug 'neoclide/coc.nvim', {'tag': '*', 'branch': 'release'}
Plug 'BurntSushi/erd'
Plug 'uarun/vim-protobuf'
Plug 'mustache/vim-mustache-handlebars'
Plug 'rhysd/vim-grammarous'
Plug 'cespare/vim-toml'
call plug#end()

set nocompatible
filetype plugin indent on

let g:is_posix = 1
let mapleader = ","
let g:mapleader = ","

set nobackup
set nowritebackup
set noswapfile
if &history < 1000
  set history=1000
endif
if &tabpagemax < 50
  set tabpagemax=50
endif
set ruler         " show the cursor position all the time
set showcmd       " display incomplete commands
set display+=lastline
set laststatus=2  " Always display the status line
set exrc
set nrformats-=octal
set secure
set autoread
set autowrite
set tabstop=2
set shiftwidth=2
set shiftround
set expandtab
set autoindent
set smartindent
set redrawtime=10000
set sessionoptions-=options

" Using vim with Russian keyboard
set keymap=russian-jcukenwin
set iminsert=0
set imsearch=0
highlight lCursor guifg=NONE guibg=Cyan

syntax on

if &listchars ==# 'eol:$'
  set listchars=tab:>\ ,trail:-,extends:>,precedes:<,nbsp:+
endif

if v:version > 703 || v:version == 703 && has("patch541")
  set formatoptions+=j " Delete comment character when joining commented lines
endif


"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" => VIM UI
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
execute "set <M-j>=\ej"
execute "set <M-k>=\ek"

let g:markdown_syntax_conceal = 0

au BufNewFile,BufRead Dockerfile* set syntax=dockerfile

let g:rooter_patterns = [
  \'pubspec.lock',
  \'package.json',
  \'Rakefile',
  \'Gemfile',
  \'Gopkg.toml',
  \'requirements/',
  \'requirements.txt',
\]
let g:rooter_use_lcd = 0
let g:rooter_silent_chdir = 1
let g:rooter_resolve_links = 1

let g:UltiSnipsExpandTrigger="<c-k>"
let g:UltiSnipsJumpForwardTrigger="<c-j>"
let g:UltiSnipsJumpBackwardTrigger="<c-l>"
let g:UltiSnipsSnippetsDir="~/.vim/UltiSnips"

let g:jsx_ext_required = 0

let g:ale_fixers = {
  \'javascript': ['eslint'],
  \'ruby': ['rubocop'],
  \'python': ['yapf', 'isort'],
\}
let g:ale_linters = {
  \'sh': ['language_server'],
  \'go': ['govet', 'golint'],
  \'python': ['flake8'],
  \'javascript': ['eslint'],
\ }
let g:ale_fix_on_save = 1
let g:ale_lint_on_text_changed = 0
let g:ale_lint_on_enter = 0
let g:ale_javascript_prettier_use_local_config = 1
let g:ale_echo_cursor = 1

nmap <silent> [e <Plug>(ale_previous_wrap)
nmap <silent> ]e <Plug>(ale_next_wrap)

let g:mustache_abbreviations = 1

let g:terraform_fmt_on_save = 1
let g:terraform_align = 1

let dart_format_on_save = 1

let g:markdown_fenced_languages = ['html', 'python', 'bash=sh', 'css', 'erb=ruby', 'javascript.jsx', 'javascript', 'js=javascript.jsx', 'json=javascript', 'ruby', 'xml', 'go', 'terraform', 'sh', 'yaml']

set t_Co=16
set t_ut=
set termguicolors
set background=dark
colorscheme base16-onedark


let g:airline#extensions#tabline#formatter = 'unique_tail_improved'
let g:airline_powerline_fonts = 1
let g:airline_theme='onedark'
let g:airline_base16_improved_contrast=1
let g:airline#extensions#ale#enabled = 1
let g:airline#extensions#branch#enabled = 1
let g:airline#extensions#tabline#enabled = 1
let g:airline#extensions#coc#enabled = 1


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
if !&scrolloff
  set scrolloff=3
endif
if !&sidescrolloff
  set sidescrolloff=5
endif
if has("macunix")
  set clipboard=unnamed
else
  set clipboard=unnamedplus
endif
set wildignore=*.o,*~,*.pyc
set wildignore+=*/tmp/*,*.so,*.swp,*.zip
set wildignore+=*/.git/*,*/.hg/*,*/.svn/*,*/.DS_Store
set cmdheight=2
" A buffer becomes hidden when it is abandoned
set hidden
set shortmess=atToOFc
" Configure backspace so it acts as it should act
set backspace=indent,eol,start
set whichwrap+=<,>,h,l
" Ignore case when searching
set ignorecase
" When searching try to be smart about cases
set smartcase
" Be smart when using tabs ;)
set smarttab
" Highlight search results
set hlsearch
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
" => JavaScript section
""""""""""""""""""""""""""""""

""""""""""""""""""""""""""""""

augroup FiletypeGroup
  autocmd!
  au BufNewFile,BufRead *.jsx set filetype=javascript.jsx
augroup END


""""""""""""""""""""""""""""""
" => Ruby section
""""""""""""""""""""""""""""""

""""""""""""""""""""""""""""""
autocmd FileType ruby,eruby let g:rubycomplete_buffer_loading = 1
autocmd FileType ruby,eruby let g:rubycomplete_classes_in_global = 1
autocmd FileType ruby,eruby let g:rubycomplete_rails = 1
autocmd FileType ruby,eruby let g:rubycomplete_include_object = 1
autocmd FileType ruby,eruby let g:rubycomplete_include_objectspace = 1

autocmd BufNewFile *.rb call append(0, "# frozen_string_literal: true")
autocmd BufNewFile *.rb call append(line('$'), "")
au FileType ruby nmap <leader>tt :Dispatch! ripper-tags -R --exclude=vendor --tag-relative --tag-file .tags<cr>

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
let g:go_jump_to_error = 0
let g:go_metalinter_autosave = 0
let g:go_metalinter_enabled = []
let g:go_metalinter_autosave_enabled = []
let g:go_gocode_unimported_packages = 1
let g:go_decls_mode = 'fzf'

au FileType go nmap <leader>gr <Plug>(go-run-split)
au FileType go nmap <leader>gb :<C-u>call <SID>build_go_files()<CR>
au FileType go nmap <leader>rf <Plug>(go-test)
au FileType go nmap <leader>rs <Plug>(go-test-func)
au FileType go nmap <leader>tax :GoAddTags xml<cr>
au FileType go nmap <leader>taj :GoAddTags json<cr>
au FileType go nmap <leader>tab :GoAddTags bson<cr>:GoAddTags bson,omitempty<cr>
au FileType go nmap <leader>tad :GoAddTags dynamo<cr>
au FileType go nmap <leader>trx :GoRemoveTags xml<cr>
au FileType go nmap <leader>trj :GoRemoveTags json<cr>
au FileType go nmap <leader>trb :GoRemoveTags bson<cr>
au FileType go nmap <leader>trd :GoRemoveTags dynamo<cr>
au FileType go nmap <leader>tr :GoRemoveTags<cr>
au FileType go nmap <leader>rc <Plug>(go-coverage-toggle)
au FileType go nmap <leader>rcb :GoCoverageBrowser<cr>
au FileType go nmap <leader>de :GoDecls<cr>
au FileType go nmap <leader>ded :GoDeclsDir<cr>
au FileType go nmap <leader>fc <Plug>(go-callers)
au FileType go nmap <leader>fb <Plug>(go-callstack)
au FileType go nmap <leader>i <Plug>(go-implements)
au FileType go nmap <leader>we :GoWhicherrs<cr>
au FileType go nmap <leader>sk :GoKeyify<cr>
au FileType go nmap <leader>sf :GoFillStruct<cr>
au FileType go vmap <leader>p :GoPlay<cr>
au Filetype go command! -bang A call go#alternate#Switch(<bang>0, 'edit')
au Filetype go command! -bang AV call go#alternate#Switch(<bang>0, 'vsplit')
au Filetype go command! -bang AS call go#alternate#Switch(<bang>0, 'split')
au Filetype go command! -bang AT call go#alternate#Switch(<bang>0, 'tabe')
au BufNewFile,BufRead *.go setlocal noexpandtab tabstop=4 shiftwidth=4

let g:ruby_indent_block_style = 'do'
let ruby_spellcheck_strings = 1

autocmd FileType ruby compiler ruby
autocmd FileType ruby let b:delimitMate_quotes = "\" ' ` |"
" Return to last edit position when opening files (You want this!)
autocmd BufReadPost *
      \ if line("'\"") > 0 && line("'\"") <= line("$") |
      \   exe "normal! g`\"" |
      \ endif

let g:better_whitespace_enabled=1
let g:strip_whitespace_on_save = 1

" source .vimrc after cd project/
autocmd User RooterChDir silent! source .vimrc
" Remember info about open buffers on close
set viminfo^=%

set tags=./tags;tags;./.tags;.tags

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
nmap <silent> <leader>ds <Plug>GenerateDiagram
" Flow diagram
nmap <silent> <leader>df :GraphvizCompile<cr>:silent :GraphvizShow<cr>
" Entity diagram
nmap <silent> <leader>de :!erd -i design/initial_entities.er -f png -o /tmp/erd.png && xdg-open /tmp/erd.png<cr>

let test#strategy = {
  \ 'nearest': 'dispatch',
  \ 'file':    'dispatch',
  \ 'suite':   'dispatch',
\}
let test#ruby#bundle_exec = 0
map <Leader>rf :TestFile<CR>
map <Leader>rs :TestNearest<CR>
map <Leader>rl :TestLast<CR>
map <Leader>ra :TestSuite<CR>

map <Leader>n :NERDTreeToggle<CR>
map <Leader>nf :NERDTreeFind<CR>

let g:NERDSpaceDelims = 1
let g:NERDTreeAutoDeleteBuffer = 1

" Start NERDTree automatically when vim starts up if no files were specified
autocmd StdinReadPre * let s:std_in=1
autocmd VimEnter * if argc() == 0 && !exists("s:std_in") | NERDTree | endif

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

" Yank file path with line number
nnoremap <leader>yl :let @+=expand("%") . ':' . line(".")<CR>

" Tab completion
" will insert tab at beginning of line,
" will use completion if not at beginning
set wildmode=list:longest,list:full
set completeopt-=preview

augroup vimrc-incsearch-highlight
  autocmd!
  autocmd CmdlineEnter [/\?] :set hlsearch
  autocmd CmdlineLeave [/\?] :set nohlsearch
augroup END

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
map <silent> <leader>bd :bd<CR>
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

" Use ctrl+j to trigger coc completion
inoremap <silent><expr> <c-j> coc#refresh()
" Close preview window when completion is done.
autocmd! CompleteDone * if pumvisible() == 0 | pclose | endif

" Remap keys for gotos
nmap <silent> gd <Plug>(coc-definition)
nmap <silent> gy <Plug>(coc-type-definition)
nmap <silent> gi <Plug>(coc-implementation)
nmap <silent> gr <Plug>(coc-references)

let g:coc_global_extensions = [
  \'coc-json',
  \'coc-tsserver',
  \'coc-html',
  \'coc-css',
  \'coc-solargraph',
  \'coc-yaml',
  \'coc-python',
  \'coc-emmet',
  \'coc-ultisnips',
  \'coc-lists',
  \'coc-svg',
  \'coc-emoji',
  \'coc-tag',
  \'coc-omni',
  \'coc-syntax',
\]

au FileType dart,json,sh,go,python,javascript,javascript.jsx nmap <leader>q :call CocAction('showSignatureHelp')<cr>
" Use K for show documentation in preview window
au FileType dart,json,sh,go,python,javascript,javascript.jsx nnoremap <silent> K :call <SID>show_documentation()<CR>

function! s:show_documentation()
  if &filetype == 'vim'
    execute 'h '.expand('<cword>')
  else
    call CocAction('doHover')
  endif
endfunction

" Remap for rename current word
nmap <leader>rn <Plug>(coc-rename)

" Remap for do codeAction of selected region, ex: `<leader>aap` for current paragraph
vmap <leader>aa  <Plug>(coc-codeaction-selected)
nmap <leader>aa  <Plug>(coc-codeaction-selected)

" Remap for do codeAction of current line
nmap <leader>ac  <Plug>(coc-codeaction)


"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" => Search
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
cnoreabbrev Ack Ack!
if executable('rg')
  let g:ackprg = 'rg --vimgrep'
endif

let g:ack_mappings = { "o": "<CR>zz" }
let g:ackhighlight = 1
let g:ack_autoclose = 1

let $FZF_DEFAULT_COMMAND = "fd --type f --hidden --follow --ignore-case --exclude '.git'"
let g:fzf_layout = { 'up': '70%' }
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

nnoremap <space><space> :FZF<cr>
nnoremap <space>d :GFiles?<cr>
nnoremap <space>b :Buffers<cr>
nnoremap <space>k :Tags<cr>
nnoremap <space>/ :BLines<cr>

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
