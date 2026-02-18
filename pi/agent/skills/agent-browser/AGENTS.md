- To update agent-browser:
  - install/update the CLI:
    - `mise use --global npm:agent-browser@latest`
  - refresh this skill directory (SKILL.md + references/ + templates/) from upstream (keeps this AGENTS.md):

    ```bash
    set -euo pipefail

    VERSION=v0.10.0
    DEST="$HOME/.dotfiles/pi/agent/skills/agent-browser"
    TMP="$(mktemp -d /tmp/agent-browser-skill.XXXXXX)"

    git clone --depth 1 --branch "$VERSION" https://github.com/vercel-labs/agent-browser.git "$TMP"
    rsync -a --delete --exclude 'AGENTS.md' "$TMP/skills/agent-browser/" "$DEST/"
    chmod +x "$DEST"/templates/*.sh || true

    rm -rf "$TMP"
    ```

  - then run:
    - `cd ~/.dotfiles && ./install --no-brew`
