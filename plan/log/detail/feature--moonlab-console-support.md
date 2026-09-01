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

## 2026-08-25 — Verification sweep: no merge breakage found

### Prompt

"I think earlier merges broke a bunch of stuff."

### Response and strategy

Ran the real gates rather than guessing, across both repositories:

| Suite                                | Result                                  |
| ------------------------------------ | --------------------------------------- |
| exotui `main`, `deno test -A`        | 3683 passed, 0 failed                   |
| exomux on `main`                     | 548 passed, 0 failed                    |
| exotui `main` entrypoint budget gate | passes                                  |
| this branch, `deno task health`      | EXIT=0, 140/140 steps                   |
| moonlab full `ctest`                 | 184/185, matching its recorded baseline |

No breakage. The single moonlab failure is `webgpu_unified_smoke`, which needs the Emscripten SDK and has failed for
that reason since before any of this work; all 185 registered tests ran, none silently gated out.

The 0.7.0 merge survived intact on `main` — tag, `mod.shell.ts`, and the manifest entry are all present — and the two
merges that landed after it (exomux-remote-session, unclosable-terminal-window) touched nothing in the shell surface.

One thing looked like damage and was not. `budgets/entrypoints.json` on `main` records a different size for
`src/api_stability.ts` than v0.7.0 does, while `git diff` shows the file itself unchanged between the two — which reads
like a stale baseline merged over a newer one. It is measurement noise from `deno info`, and `main`'s budget gate
passes. Worth knowing before someone else treats that diff as evidence.

Also noticed: a stale, prunable worktree named `bisect` from a different agent session, which suggests someone was
bisecting this repository for a regression. Left alone -- not this session's to clean up -- but it is the best lead if
the breakage was real and is somewhere these gates do not reach.

## 2026-08-26 — `focus()`, the last thing the console reached around

### Prompt

Audit the local exotui dependency and consider whether more features are needed before cutting a release to support the
moonlab interface.

### Response and strategy

The audit is small because the console's import surface is small: three entrypoints (`./shell`, `./runtime`, `./web`)
and, after the two `./shell` completeness fixes on this branch, exactly one workaround left in its code — `web.ts`
querying `body > textarea` and focusing it by hand, because nothing public could.

That is the same shape of gap as the other two, and found the same way: by building something real and noticing where it
had to reach past the API. The machinery already existed — `BrowserInputSource` keeps a `#keyboardTarget` and already
focuses it on pointerdown — so this exposes what was there rather than adding behaviour. `InputSource.focus?()` is
optional because a terminal source reads stdin and has nothing to focus.

Also confirmed while auditing: the kitty _graphics_ surface (`createKittyGraphicsSurface`,
`detectKittyGraphicsCapability`) was already public through `./runtime` and needed nothing. My earlier claim that the
console presenter exposed no image channel was wrong — it was a grep of one file, not a survey.

Nothing else the console needs is missing. The remaining exotui work it would benefit from is
`bug/kitty-chained-placement-anchor`, which is another branch's and touches `src/runtime/kitty_passthrough.ts` — the
same passthrough path the console's image layer uses under tmux.
