## Tool: `gh_scout` (GitHub dependency scout)

### Query format
- Repo: `owner/repo`
- Query: what to find or verify
- Ref (optional): branch/tag/sha; if omitted, gh_scout resolves the default branch

### Guidelines
- Use `gh_scout` for external GitHub repos (install docs, usage, debugging, API hints).
- Output follows Finder structure: Summary, Locations, Evidence, Searched, Next steps.
- gh_scout caches relevant files under `/tmp/gh_scout/...`; read those paths for full context.
- Locations use cached local paths with line ranges (example: `/tmp/gh_scout/owner/repo/ref/README.md:12-30`).
