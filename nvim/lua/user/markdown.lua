--set to 1, the nvim will auto close current preview window when change
--from markdown buffer to another buffer
--default: 1
vim.g.mkdp_auto_close = 0

--set to 1, the vim will refresh markdown when save the buffer or
--leave from insert mode, default 0 is auto refresh markdown as you edit or
--move the cursor
--default: 0
vim.g.mkdp_refresh_slow = 1

--options for markdown render
--mkit: markdown-it options for render
--katex: katex options for math
--uml: markdown-it-plantuml options
--maid: mermaid options
--disable_sync_scroll: if disable sync scroll, default 0
--sync_scroll_type: 'middle', 'top' or 'relative', default value is 'middle'
  --middle: mean the cursor position alway show at the middle of the preview page
  --top: mean the vim top viewport alway show at the top of the preview page
  --relative: mean the cursor position alway show at the relative positon of the preview page
--hide_yaml_meta: if hide yaml metadata, default is 1
--sequence_diagrams: js-sequence-diagrams options
--content_editable: if enable content editable for preview page, default: v:false
--disable_filename: if disable filename header for preview page, default: 0
vim.g.mkdp_preview_options = {
  mkit = vim.empty_dict(),
  katex = vim.empty_dict(),
  uml = vim.empty_dict(),
  maid = vim.empty_dict(),
  disable_sync_scroll = 0,
  sync_scroll_type = "middle",
  hide_yaml_meta = 1,
  sequence_diagrams = { theme = "simple" },
  flowchart_diagrams = vim.empty_dict(),
  content_editable = false,
  disable_filename = 0,
  toc = vim.empty_dict(),
}
