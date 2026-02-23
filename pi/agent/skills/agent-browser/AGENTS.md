- To update agent-browser:
  - install/update the CLI:
    - `mise use --global npm:agent-browser@latest`

  - refresh upstream **references + templates** (keep local `SKILL.md` concise; do not overwrite it):

    ```bash
    set -euo pipefail

    VERSION=v0.14.0
    DEST="$HOME/.dotfiles/pi/agent/skills/agent-browser"
    TMP="$(mktemp -d /tmp/agent-browser-skill.XXXXXX)"

    git clone --depth 1 --branch "$VERSION" https://github.com/vercel-labs/agent-browser.git "$TMP"

    # Sync docs/helpers only. Intentionally keep our SKILL.md (pi skills should be <=500 tokens).
    rsync -a --delete "$TMP/skills/agent-browser/references/" "$DEST/references/"
    rsync -a --delete "$TMP/skills/agent-browser/templates/" "$DEST/templates/"
    chmod +x "$DEST"/templates/*.sh || true

    rm -rf "$TMP"
    ```

  - then run:
    - `cd ~/.dotfiles && ./install --no-brew`
