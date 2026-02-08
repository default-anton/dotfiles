# Librarian Extension

GitHub-focused research subagent for pi.

## What it does

- Adds a `librarian` tool.
- Uses a dedicated subagent session with a strict turn budget.
- Searches GitHub with `gh search code` (`github_code_search`).
- Fetches only selected files into a temporary cache (`github_fetch_file`).
- Forces path-first output: repository paths, local cache paths, line ranges, concise evidence.

## Why this shape

- **Fast broad search:** indexed GitHub code search first.
- **Large repo friendly:** no full clone by default, fetch only target files.
- **Token efficient:** returns citations and file paths, not full-file dumps.
- **Main-agent friendly:** fetched files are written to a temp workspace and can be read directly by the main agent using `read`.

## Tool interface

```ts
librarian({
  query: string,
  repos?: string[],
  owners?: string[],
  maxSearchResults?: number,
  maxTurns?: number,
})
```

## Sub-tools used internally

- `github_code_search({ query, repos?, owners?, limit?, match? })`
- `github_fetch_file({ repo, path, ref?, sha? })`
- built-in `read`
- built-in `bash` (for local cache refinement with `rg`/`fd`/`ls`)

## Output contract

The subagent is instructed to return:

1. Summary
2. Findings (`owner/repo:path`)
3. Cached files (absolute local path + source)
4. Evidence (`local/path:lineStart-lineEnd` + GitHub URL)
5. Searched queries/filters
6. Optional next steps

## Requirements

- GitHub CLI installed and authenticated:

```bash
gh auth login
```

The extension checks auth at runtime and fails early with an actionable error if auth is missing.
