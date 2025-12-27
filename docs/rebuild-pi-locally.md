# Rebuild pi locally

Use this when the `pi`/coding-agent CLI blows up on missing dist exports (e.g., `modelsAreEqual` from `@mariozechner/pi-ai`, `isCtrlL` from `@mariozechner/pi-tui`).

## Commands

```bash
cd ~/code/pi-mono/packages/ai && npm run build
cd ~/code/pi-mono/packages/tui && npm run build
```

After rebuilding, rerun the CLI (you can stay in any cwd, e.g. `~/Downloads`):

```bash
npx --prefix ~/code/pi-mono/packages/coding-agent tsx ~/code/pi-mono/packages/coding-agent/src/cli.ts -p "say hi and return"
```
