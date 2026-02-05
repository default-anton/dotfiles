# Proxy Support

Proxy configuration for geo-testing, rate limiting avoidance, and corporate environments.

**Related**: [commands.md](commands.md) for global options, [SKILL.md](../SKILL.md) for quick start.

## Contents

- [Basic Proxy Configuration](#basic-proxy-configuration)
- [Authenticated Proxy](#authenticated-proxy)
- [SOCKS Proxy](#socks-proxy)
- [Proxy Bypass](#proxy-bypass)
- [Common Use Cases](#common-use-cases)
- [Verifying Proxy Connection](#verifying-proxy-connection)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Basic Proxy Configuration

Prefer the built-in `--proxy` option (or `AGENT_BROWSER_PROXY`) over generic `HTTP_PROXY`/`HTTPS_PROXY` env vars.

```bash
# One-off invocation
agent-browser --proxy "http://proxy.example.com:8080" open https://example.com

# Or via environment variable
export AGENT_BROWSER_PROXY="http://proxy.example.com:8080"
agent-browser open https://example.com
```

## Authenticated Proxy

```bash
# Include credentials in the proxy URL
agent-browser --proxy "http://username:password@proxy.example.com:8080" open https://example.com
```

## SOCKS Proxy

```bash
# SOCKS5 proxy
agent-browser --proxy "socks5://proxy.example.com:1080" open https://example.com

# SOCKS5 with auth
agent-browser --proxy "socks5://user:pass@proxy.example.com:1080" open https://example.com
```

## Proxy Bypass

Skip proxy for specific domains/hosts using `--proxy-bypass` (or `AGENT_BROWSER_PROXY_BYPASS`).

```bash
agent-browser \
  --proxy "http://proxy.example.com:8080" \
  --proxy-bypass "localhost,127.0.0.1,*.internal.company.com" \
  open https://internal.company.com
```

## Common Use Cases

### Geo-Location Testing

```bash
#!/bin/bash
# Test site from different regions using geo-located proxies

set -euo pipefail

PROXIES=(
  "http://us-proxy.example.com:8080"
  "http://eu-proxy.example.com:8080"
  "http://asia-proxy.example.com:8080"
)

mkdir -p ./screenshots

for proxy in "${PROXIES[@]}"; do
  export AGENT_BROWSER_PROXY="$proxy"

  # Any naming scheme works; keep it deterministic.
  region=$(echo "$proxy" | sed -E 's#^http://([^:]+).*#\1#')
  echo "Testing from: $region ($proxy)"

  agent-browser --session "$region" open https://example.com
  agent-browser --session "$region" screenshot "./screenshots/$region.png"
  agent-browser --session "$region" close

  unset AGENT_BROWSER_PROXY
done
```

### Rotating Proxies for Scraping

```bash
#!/bin/bash
# Rotate through a proxy list to avoid rate limiting

set -euo pipefail

PROXY_LIST=(
  "http://proxy1.example.com:8080"
  "http://proxy2.example.com:8080"
  "http://proxy3.example.com:8080"
)

URLS=(
  "https://site.com/page1"
  "https://site.com/page2"
  "https://site.com/page3"
)

for i in "${!URLS[@]}"; do
  proxy_index=$((i % ${#PROXY_LIST[@]}))
  export AGENT_BROWSER_PROXY="${PROXY_LIST[$proxy_index]}"

  agent-browser open "${URLS[$i]}"
  agent-browser get text body > "output-$i.txt"
  agent-browser close

  sleep 1  # polite delay
  unset AGENT_BROWSER_PROXY
done
```

### Corporate Network Access

```bash
#!/bin/bash
set -euo pipefail

export AGENT_BROWSER_PROXY="http://corpproxy.company.com:8080"
export AGENT_BROWSER_PROXY_BYPASS="localhost,127.0.0.1,*.company.com"

# External sites go through proxy
agent-browser open https://external-vendor.com

# Internal sites bypass proxy
agent-browser open https://intranet.company.com
```

## Verifying Proxy Connection

```bash
# Check your apparent IP
agent-browser open https://httpbin.org/ip
agent-browser get text body
# Should show proxy's IP, not your real IP
```

## Troubleshooting

### Proxy Connection Failed

```bash
# Validate proxy connectivity first
curl -x http://proxy.example.com:8080 https://httpbin.org/ip

# Check if proxy requires auth
agent-browser --proxy "http://user:pass@proxy.example.com:8080" open https://example.com
```

### SSL/TLS Errors Through Proxy

Some proxies perform SSL inspection. If you encounter certificate errors:

```bash
# For testing only
agent-browser --ignore-https-errors open https://example.com
```

### Slow Performance

```bash
# Bypass proxy for noisy hosts when possible
export AGENT_BROWSER_PROXY_BYPASS="*.cdn.com,*.static.com"
```

## Best Practices

1. Prefer `--proxy` / `AGENT_BROWSER_PROXY` to reduce ambiguity.
2. Avoid hardcoding proxy credentials in committed scripts.
3. Set bypass hosts for local/internal domains to reduce latency.
4. Handle proxy failures with retries/backoff for scraping workloads.
