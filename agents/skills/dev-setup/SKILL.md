---
name: dev-setup
description: Set up isolated git worktrees and single-command create/start/stop/remove workflows for new or existing projects. Use when creating a project or standardizing its development setup, not for ordinary feature work.
---

# Dev setup

Extend existing scripts and verification instructions rather than adding competing workflows. Adapt to the project; libraries and CLIs may need no server.

Learn Worktrunk using `gh`, starting at https://github.com/max-sixty/worktrunk/blob/main/skills/worktrunk/SKILL.md and following relevant references. Prefer project hooks over wrappers.

## Commands

Provide one command per applicable operation:

- Create: provision a fully working worktree with dependencies, configuration, and local data, ready to run the app and tests. Safe to retry after partial failure.
- Start: idempotently launch the app in the background, wait for usability, and print its URL or connection details. Already ready: tiny warning, same success output. Serialize concurrent starts, recover stale/partial starts, and bound readiness waits with useful failure logs.
- Stop: stop all worktree-owned app processes, including children, and wait for exit. Already stopped succeeds. Leave shared services and other worktrees running.
- Remove: stop the app and delete the worktree and all its owned state, including uncommitted changes. Do not stash, back up, or relocate that state. Preserve shared resources.
- Release: for deployable apps lacking one, recommend and ask before implementing a command covering build, smoke tests, deployment, and monitoring production readiness. Do not deploy to validate this setup.

## Fast, disjoint worktrees

Make worktree creation and recreation as fast as possible without weakening isolation. Measure setup times, identify the project's expensive steps, and share, reuse, or clone anything safe.

### Isolation

No Docker or VMs for isolation on macOS.

- Give each repository/worktree a stable, collision-resistant identity. Isolate mutable data, queues, generated files, logs, and test state, including workers and schedulers.
- Allocate conflict-free ports for every listener, including HMR; propagate them to clients and callbacks. Port hashes alone are insufficient. Readiness must identify this worktree's app, not an unrelated listener.

### Common optimizations

Choose optimizations for the project; these are common examples, not a checklist or exhaustive list.

- Share native database servers, the pnpm store, concurrency-safe caches, and immutable assets. Prefer symlinks, then copy-on-write, then ordinary copies. Do not share mutable build output or dependency trees that installs can alter across branches.
- Reuse existing local data instead of rebuilding and reseeding where faster. Compare database-native cloning, filesystem copy-on-write, and other engine-supported approaches; choose the fastest safe option for the project.

## Document and verify

Document only the commands to create a worktree, start the app, remove the worktree (also stops the app and deletes its state), and stop the app without removing the worktree. Include release if available. Use AGENTS.md or a project-local verification skill (.agents/skills/<name>/SKILL.md), without duplicating instructions.

Keep daily-use instructions minimal: commands and only essential safety caveats, not implementation details. Add: “Run these commands directly; inspect their scripts only when changing or troubleshooting the dev setup.”

Follow project verification instructions and manually check:

1. Create two disposable worktrees; time setup and run the project's tests independently in both.
2. Start both concurrently and exercise a representative flow in each. Confirm separate ports/data; repeat start to check idempotency.
3. Stop one twice. Confirm its processes exit and the other app remains usable.
4. With cleanup confirmation, remove both and check that owned state is gone and shared resources remain. Recreate one, time setup, confirm usability, and clean up.

Report timings, exercised behavior, and unverified paths—not just configuration changes.
