# Detailed development log: `feature/moonlab-console-support`

- **Branch:** `feature/moonlab-console-support`
- **Started:** 2026-08-25
- **Base:** `main`

Changes exotui needs in order to be usable by moonlab's exomoonlab console, the first consumer of the shell surface from
outside this repository.

## 2026-08-25 — `./shell` could not build a window host

### Prompt

Start moonlab's phase 3 against the local exotui worktree, on a branch for the moonlab-driven changes.

### Response and strategy

The first thing phase 3 does is construct a window host, and it could not. `./shell` exports
`createWorkbenchWindowHostController`, whose options require a `TiledWorkspaceController`, but not
`createTiledWorkspaceController` — so the entrypoint shipped a constructor without its mandatory argument. The only way
through was to also import `./app`, which is terminal-tagged and therefore the wrong door for a host-neutral surface.

Exporting `src/layout/tiled_workspace.ts` from `mod.shell.ts` closes it. The module was already reachable transitively
through the window host, so `budgets/entrypoints.json` is unchanged at 82 modules for this entrypoint; only the export
declaration moved. No manifest or entrypoint-list change was needed either, since no new entrypoint appeared.

Worth noting how this was missed the first time: `./shell` was assembled by listing the _modules_ a console would want
rather than by building something with it. A surface can look complete module-by-module and still be unusable, because
what a caller needs is whole operations. exomoonlab constructing a window host is the check that found it.
