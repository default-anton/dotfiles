---
name: brave-search
description: Web search via Brave Search API. Use for searching documentation, facts, or any web content. Lightweight, no browser required.
---

# Brave Search

Headless web search and content extraction using Brave Search. No browser required.

## Setup

Assume packages are already installed. If not, run once:

```bash
cd {baseDir}/brave-search
npm ci
```

## Search

```bash
# Basic search (5 results)
./search.js "query"
# More results
./search.js "query" -n 10
```

## Extract Page Content

```bash
read_web_page <url>
```

Fetches a URL and extracts readable content as markdown.

## When to Use

- Searching for documentation or API references
- Looking up facts or current information
- Fetching content from specific URLs
- Any task requiring web search without interactive browsing
