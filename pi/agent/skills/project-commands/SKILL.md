---
name: project-commands
description: Add or change commands in the fzf project launcher, including project-local actions and Herdr shortcuts.
---

# Project commands

Herdr `prefix+space` opens `~/.dotfiles/herdr/launch.py` in a popup.
The launcher requires Python 3.11+, Git, and fzf.

## Add a command

Global commands live in `~/.dotfiles/herdr/commands/`; project commands
live in `<project>/.commands/`. Each directory has `commands.toml`:

```toml
[review-pr]
name = "Review PR"
description = "Select PRs needing your attention and review with Pi"
```

Add an executable named `review-pr` beside the manifest, with a shebang
for any installed interpreter. Use lowercase kebab-case IDs, and required,
nonempty, single-line names and descriptions. No other metadata fields.
Make the file executable with `chmod +x`.

## Behavior

- The nearest ancestor `.commands/` selects the project root. Otherwise,
  use the Git worktree root, falling back to the launcher's working directory.
- Global and project entries form one list. Project entries override matching
  global IDs, retaining their own executable paths.
- Commands run at the project root. `LAUNCH_CWD` preserves the original cwd.
- Discovery reads TOML only; it never sources or executes project code.
  Selecting a command executes it, so only run commands from trusted projects.
- Invalid manifests or nonexecutable commands show an error. Escape cancels;
  command failures remain visible until dismissed.
- Commands own their workflow: more fzf steps, prompts, browser launches,
  or Herdr pane/tab creation. Reuse the popup terminal rather than nesting popups.
  Start persistent agents in ordinary panes/tabs.

Keep the launcher generic. Put project-specific logic in commands, not in
launcher options or a workflow schema. Manually check changed behavior;
do not add automated tests for these scripts.
