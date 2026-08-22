# One app, two presentations: a web build with zero additional code paths

## Outcome

An application written purely against Deno and exotui produces a working web build with no application-side branching:
one codebase, one set of components and state, and two presentation implementations underneath — the console and the
browser — selected at the entry point. The maintainer's test: someone can build a fun, terminal-feeling application with
windows, themes, backgrounds, and WebGPU workloads, and ship it to a URL by changing the build target, not the code.
exomux is explicitly out of scope (a terminal multiplexer needs PTYs and process control the browser cannot have); the
target is the wide class of applications that don't.

## Context

The desktop-shell branch proved most of the thesis empirically before this plan was written. The same
`WorkbenchWindowHost` drives windows in exomux and in a browser; the same shell painters draw the chrome, switcher,
menus and tabs into a terminal `DesktopPainter` and a browser cell grid through the three-method `ShellSurface`; the
same theme catalog (`SHELL_THEMES`) and the same eleven background simulations (`SHELL_BACKGROUND_FIELDS`, including the
WebGPU turbulence field) run on both hosts; `AnimatedBackground<TTheme>` was already the common interface, and
`shellGpuDevice()` acquires WebGPU identically from Deno's `navigator.gpu` and the browser's. What remains is not
proving the seam exists — it is closing the last host-specific gaps and making the seam the _default entry_, so an
application never touches either side directly.

**Where the two paths still diverge today** (the actual work):

1. **Entry and runtime assembly.** Console apps call `createTerminalApp` (tui, input reader, terminal backend,
   signal/resize handling); web pages call `createWebTui` (canvas sink, BrowserPlatform) and hand-wire a paint loop. The
   web desktop still composes ANSI row strings into `TextObject`s per frame — workable, but a bespoke loop every page
   rebuilds.
2. **Input delivery.** Both hosts already emit the same `KeyPressEvent`/`PointerInputEvent` envelope (the browser
   platform normalizes; the host consumed CDP-driven pointer events without adaptation). But subscription wiring differs
   (`handleInput`/reader loop vs `host.on(...)`).
3. **Storage.** The runtime `AsyncStore` abstraction exists; Deno backs it with the filesystem, and the browser needs a
   first-class IndexedDB implementation so `storageKey`-style persistence (workspaces, saved themes) works unchanged.
4. **Fonts/metrics.** The terminal owns its glyph grid; the browser sink needs its font/cell metrics chosen once,
   correctly (the 16px-in-9px-cells trail bug is the cautionary tale — the sink now clips, but metrics should be
   derived, not hand-tuned per page).
5. **Capabilities that exist on one side only.** Process spawning, PTYs, raw filesystem, OS clipboard beyond the async
   clipboard API. These need a capability surface that reports absence honestly (the exomonitor pattern: feeds a host
   cannot supply are not pushed, and the UI says "waiting", never fakes).

## Plan

**Phase 1 — the `Presenter` seam.** Define one interface owning what both hosts already provide behind different names:
a cell surface (the `ShellSurface` contract plus size signal and frame scheduling), the input event stream
(key/pointer/paste/focus in the existing envelope), a clock, an `AsyncStore` factory, and a capability record
(`{ gpu, audioInput, processes, fileSystem, ... }` — booleans resolved by probing, exomux-style, not by sniffing user
agents). Implement it twice from existing parts: `consolePresenter()` wrapping the tui/input-reader/terminal backend,
and `webPresenter(root)` wrapping `createWebTui` + BrowserPlatform + the cell canvas sink. No new rendering code — this
phase is naming and assembly.

**Phase 2 — the app entry.** `createShellApp(presenter, app)` — the window host, shell painters, theme catalog,
background host, and paint scheduling assembled once in the library, replacing the web desktop's bespoke loop and the
equivalent exomux-side composition _for new apps_ (exomux keeps its own compositor; it is the power-user consumer, not
the template). The web desktop page becomes the reference consumer: its desktop logic moves above the seam, its page
file shrinks to `createShellApp(webPresenter(root), desktop)`, and a new `examples/desktop_console.ts` runs the same
desktop object in a terminal — the zero-extra-code-paths proof, in-repo, gated.

**Phase 3 — storage and workloads.** IndexedDB `AsyncStore` (same contract the kernel already persists workspaces
through); `shellGpuDevice` stays the single WebGPU door; audio input follows the browser-monitor pattern behind the
capability record. Persisted state round-trips between hosts where ids allow (a workspace saved in the terminal opens on
the web).

**Phase 4 — the ratchets.** The `web-pages-build` probe gate already pins the web surface's Deno references; add the
inverse for the seam: the reference desktop's app module must bundle for the browser with zero Deno references and
type-check for Deno with zero DOM references — one module, both oracles, in CI. A `capability honesty` test asserts
every capability the record reports absent renders as "waiting/unavailable" UI, never a crash.

## Acceptance checks

- [x] `examples/web/desktop_page.ts` and `examples/desktop_console.ts` run the same `createDesktopApp` object with no
      host branching in `examples/web/desktop_app.ts` (grep-verified by `tests/desktop_presentation.test.ts`).
- [x] Both oracles in CI: `web-pages-build` probe-bundles `desktop_app.ts` at ZERO Deno references, and the
      `desktop-console` health gate boots the same module under Deno (`--smoke` paints frames and exits).
- [x] Theme/background/settings persist through the presenter's `AsyncStore` — IndexedDB in the browser,
      `~/.exotui/desktop.json` on the console — and the load path is pinned by the Dracula round-trip test. (Workspace
      snapshots joining the same store is follow-up scope.)
- [x] The capability/service record gates the monitor and the three overlay: absent services render "no live sources on
      this host" / "webgpu unavailable" — never a crash. Turbulence runs wherever `navigator.gpu` answers the probe.
- [x] exomux is untouched: its suite passed unchanged through every slice of this plan.

## Notes

- **Delivered shape vs the sketch:** Phase 2 sketched `createShellApp` assembling the window host and painters inside
  the library; what shipped is the leaner cut — `runShellApp(presenter, app)` owns the loop, and the reference desktop
  keeps its own composition above the seam. The acceptance checks held without the mega-assembler; promote one only when
  a second application wants the same assembly.
- **Follow-up scope:** window-workspace snapshots joining the persisted settings store; a Deno-side audio source behind
  `capabilities.audioInput` so the monitor lights up on the console too.

- The shell painters, theme catalog, background fields, GPU door, and window host are already shared and live on both
  hosts as of the desktop-shell branch — this plan is the remaining fifth of the work, not the first four.
- Butterchurn and image backgrounds stay application-side hosts for now (audio pipeline and file access); they slot
  behind the capability record later.
- The presenter should not try to abstract the _terminal emulator_ (scrollback, PTY sessions) — that is exomux's domain
  and exactly what the maintainer excluded.
