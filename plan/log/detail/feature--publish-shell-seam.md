# Detailed development log: `feature/publish-shell-seam`

- **Branch:** `feature/publish-shell-seam`
- **Started:** 2026-08-24
- **Base:** `main`

## 2026-08-24 — `./shell`: giving the host-neutral surface a door

### Prompt

From the moonlab side: a console built on exotui needs the presenter seam, the shell painters, the theme catalog and the
window host. Reaching into a dependency's `src/` is not acceptable, so widen the published surface and cut a release.

### Response and strategy

**The gap was smaller than the request assumed, and worth measuring first.** Probing the _published_ 0.6.0 rather than
the working tree showed that most of the seam already escapes:

| Already public at 0.6.0                                            | Via                                                      |
| ------------------------------------------------------------------ | -------------------------------------------------------- |
| `webPresenter`, `runWebShellApp`                                   | `./web` — `src/web/mod.ts` re-exports `web_presenter.ts` |
| `consolePresenter`, `runConsoleShellApp`                           | `./runtime` — same pattern                               |
| `ShellApp`, `ShellPresenter`, `ShellPresentedFrame`, `runShellApp` | `./web`, transitively                                    |
| the workbench window host                                          | `./web`, transitively                                    |

Genuinely unreachable: `workbench_shell.ts` (the painters) and `shell_theme.ts` (the catalog). And the seam types, while
reachable, were reachable only through `./web` — the wrong door for a terminal application, and an accident of one
barrel importing another rather than a decision.

So this is less "publish the seam" than "give the host-neutral half a home of its own and finish the job". `./shell`
carries the seam, the painters, the theme catalog, the window host, and the backgrounds. The presenters keep their
existing homes, because they are the host-_specific_ half — that split is the whole architecture, and the export map
should show it.

Additive throughout: nothing moved, and `./web` still re-exports what it did.

**The API governance did its job.** Adding an entrypoint is not one edit. The change is only complete once `deno.jsonc`,
the closed union types and manifest in `src/api_stability.ts`, `docs/api-stability-and-packaging.md`, the ordered
expectations in `tests/api_stability.test.ts` (both the valid _and_ the invalid export-map fixtures), and the
`budgets/entrypoints.json` baseline all agree. Three tests failed until they did, which is the machinery working rather
than getting in the way.

`mod.shell.ts` was also added to `scripts/update_entrypoint_budgets.ts`. The updater's list is hardcoded, so a new
entrypoint is otherwise invisible to the budget gate — a new public surface arriving unmonitored is exactly what that
gate exists to prevent.

**Verification.** `deno task health` is the gate and its exit code is the signal. Also checked from the consumer side
against this branch: the seam types, `runShellApp`, `shellPresentedCell`, the seventeen-theme catalog with
`shellThemeById`/`shellActiveTitlebarForeground`, `paintShellWindowChrome`, and `createWorkbenchWindowHostController`
all import and evaluate from `./shell`.

Version bumped to 0.7.0 with a CHANGELOG entry. **Not published** — that is the user's call.
