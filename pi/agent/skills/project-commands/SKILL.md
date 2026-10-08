---
name: project-commands
description: Add or change commands in the Herdr command picker, either globally for all projects or locally for one project.
---

# Project commands

Herdr `prefix+space` opens `~/.dotfiles/herdr/launch.py` in a popup.

## Add a command

`<project>` is the root of the project you’re adding commands to, not this dotfiles repo.

Global commands live in `~/.dotfiles/herdr/commands/`; project commands
live in `<project>/.commands/`. Each directory has `commands.toml`:

```toml
[review-pr]
name = "Review PR"
description = "Review queue with Pi"
```

Add an executable named `review-pr` beside the manifest, with a shebang
for any installed interpreter; use `chmod +x`. IDs are lowercase kebab-case.
Name and description are required, nonempty, single-line text. Names longer
than 24 characters are truncated in the picker.

fzf matches both the visible name and description, not the command ID. Keep
names clear and action-oriented (verb + object, e.g. "Open PR"). Use a short
description to clarify the target or context. Shared words are fine; prioritize
readability over unique search cues, and never make labels cryptic for fuzzy matching.

`.commands` is already globally gitignored; no project `.gitignore` edit needed.
New worktrees created with `wt` share the primary checkout's commands via symlink.

## Behavior

- Global and project commands form one list; project commands override matching IDs.
- Commands run at the project root. `LAUNCH_CWD` preserves the original cwd.
- Scripts own additional fzf steps, prompts, and browser launches. Reuse the popup
  terminal; start persistent agents in ordinary Herdr panes/tabs.
