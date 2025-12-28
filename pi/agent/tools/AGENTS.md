## Custom tool gotchas
- Build Markdown themes for custom tool output from the `theme` passed into `renderResult` instead of `getMarkdownTheme()`; the global theme can be undefined for tools and will crash expanded Ctrl+O output.
