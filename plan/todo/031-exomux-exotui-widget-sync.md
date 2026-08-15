# Exomux ↔ exotui Widget Sync

Status: **program complete Aug 14 2026** — WS-001 through WS-012 landed (WS-005/WS-010 with scoped remainders noted
in their rows). Two follow-ups are tracked below. Turns the control-by-control audit in
`docs/exomux-component-audit.md` into
an executable back-feed ledger. The audit found that exomux hand-rolls several controls that already exist in exotui,
and carries bespoke richness that should flow **upstream** into the library. This plan is the "make exotui richer, then
adopt it in exomux" program.

See `docs/exomux-component-audit.md` for the full per-control verdicts, rationale, and `packages/exomux/app.ts` line
anchors. This file is the actionable roadmap.

## Reprioritization (user, Aug 14 2026)

This is now the **P0 strategic program** for the library: exomux is the proving ground, and back-feeding its richness
into exotui is the highest-leverage path to a robust library — ahead of the broad 035/036 parity backlogs. The user
called out **windowing and mouse/cursor** as the clearest new-component candidates.

The audit is **stale** — it predates the mouse/cursor work landed Aug 13–14, which should be folded into the ledger
(mostly extending WS-008 windowing and WS-009 cursor, likely as new WS items):

- **Block cursor** now blinks (2 Hz) and turns into a contextual **resize/move glyph** over a floating window's border
  (`resizeGlyphAt`, `exomuxBlockCursorRender` in `app.ts`) — a strong `SoftwareCursor` component candidate.
- **Any-motion tracking** (xterm mode 1003) enable + keepalive + teardown is a reusable input helper (WS-009).
- **Scroll-under-pointer / wheel-under-pointer** routing (the wheel scrolls the viewport under the pointer without
  moving selection, and routes to the control under the cursor, not the focused one) — a general interaction contract
  worth promoting alongside the richer `List` (WS-003).
- **Ghostty pincushion mouse warp** (`exomuxPincushionSource`) is Ghostty-specific, but the "map reported cell → visual
  cell through a display distortion before hit-testing" pattern could be a general pointer-transform hook.
- **F1 → help** and the **debug overlay/logging** are exomux-local; not component candidates.
- Already promoted to exotui this session: **`Canvas.rerenderAll()`** (full-redraw escape hatch the compositing surface
  now uses) — WS-001 should build on it.

Refresh `docs/exomux-component-audit.md` against the current `app.ts` before executing WS items.

## Motivation (from user direction, Aug 12 2026)

Audit every exomux control and, for each, decide whether it is (a) driven by an exotui component, (b) a one-off hack
where an exotui component should have been used, (c) something with no comparable exotui component, or (d) richer than
the exotui equivalent. The strategic outcome the user wants: **back-feed a lot of exomux's widgets into exotui while
making them richer and more robust**, then have exomux consume them instead of hand-drawing.

## The compositing invariant (architecture)

The whole exomux desktop is **one retained exotui draw object** (`ExomuxDesktopDrawObject` in `packages/exomux/app.ts`)
painted by hand through a single `DesktopPainter`, because it must fuse live terminal cell grids, translucent windows,
and GPU backgrounds into one surface. So "hand-drawn chrome" is the compositing model, not laziness.

The escape hatch already exists and works: **`ExomuxWidgetSurface`** (`packages/exomux/widget_surface.ts`) mounts a real
exotui component on a headless `Tui`/`MemoryCanvasSink`, renders it off-screen, and blits its cells back with
`painter.rawCell`, guarded by an async-snapshot + hand-drawn-fallback so a control is never blank. The settings window
and background-config modal already composite real `List`/`Cycler`/`CheckBox`/`Button`/`Input` this way.

**Every migration below rides that proven path. The first foundational task promotes the path itself into exotui so any
app (not just exomux) can composite real components into its own retained grid.**

## Audit summary

| Verdict                         | Count | Where                                                                                                                                                                                                 |
| ------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Driven by exotui             | ~15   | All window-host chrome (frame, titlebar, separators, snap-preview, switcher, taskbar layout) + the 8 composited settings/background widgets                                                           |
| 🔧 Hack — component exists      | ~9    | Sessions panel, network panel, start menu, kill/quit/scp/help/window-config modals, titlebar tones                                                                                                    |
| 🆕 No exotui equivalent         | ~4    | Terminal screen renderer, block cursor, animated backgrounds, the widget-surface pattern                                                                                                              |
| ⭐ exomux is richer (back-feed) | ~10   | Terminal palette/contrast, list transparency, tree status/activation, modal button stacking, menu danger tone, prefix indicator, state-tag titles, double-click maximize, backgrounds, widget surface |

Most panels/modals are **🔧 and ⭐ at once**: they should adopt an exotui component _and_ hand it new capabilities on
the way up.

## Feature ledger

Legend for verdict tags: ✅ exotui-driven · 🔧 hack (component exists) · 🆕 no equivalent · ⭐ exomux richer
(back-feed).

| ID     | Prio | Verdict | Feature                                                                                                                                                                                                                                                                                                                                                                                                                                                | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WS-001 | P0   | 🆕⭐⭐  | **Promote the compositing surface to exotui.** Extract `ExomuxWidgetSurface` → an exotui `WidgetSurface`/`CompositeSurface`: headless `Tui` + `MemoryCanvasSink` off-screen render, `rawCell`-style blit-back, async snapshot with geometry/theme-signature gating and hand-drawn fallback. Foundational — unlocks every migration below and helps any app compositing real components into a custom retained grid.                                    | done Aug 14 2026 — src/app/widget_surface.ts (WidgetSurface, exported from mod.app.ts, built on Canvas.rerenderAll); exomux's ExomuxWidgetSurface is now a thin alias; tested both sides                                                                                                                                                                                                                                                                                                                                           |
| WS-002 | P1   | 🆕⭐    | **`TerminalScreen` component + `terminal_palette` utilities in exotui.** A real PTY cell-grid renderer (exotui only has line-level `TerminalOutput` today): xterm-256 palette + WCAG contrast lift (`packages/exomux/terminal_palette.ts`), dim-inactive, transparency blend against a backdrop, inverted cursor cell, bottom warning line. Biggest net-new capability. Then exomux's `paintTerminal` consumes it.                                     | **done Aug 14 2026** — src/runtime/terminal_palette.ts (palette + WCAG lift + resolveTerminalCellStyle) and src/components/terminal_screen.ts (TerminalScreen over TerminalScreenController with cursor/warning/translucent grounds), both exported; exomux terminal_palette.ts is a thin re-export and paintTerminal resolves every cell through the shared resolver; tested both sides                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| WS-003 | P1   | 🔧⭐    | **Richer `List`/`Table`, then convert the Sessions panel.** Add to `List`/`Table`: transparency (render rows through a caller-supplied "ground" so a translucent panel shows the desktop behind), status/tag columns, opaque-selected block. Then make `paintSessionManager` a composited `List`/`Table`. **Also closes the wheel-changes-selection issue** — the real `List` scrolls its viewport without moving the selection.                       | **done Aug 14 2026** — List.rowStyle landed in src/components/list.ts; paintSessionManager now blits a real composited List (ExomuxSessionList) with per-cell ground re-blending of default-background cells (widgetSurfaceCellData in exotui decodes blitted cells), and the wheel scrolls the sessions viewport without moving the selection (exomuxSessionListWindowStart shared by paint/hit-test/wheel); tested end to end                                                                                                                                                                    |
| WS-004 | P1   | 🔧⭐    | **Richer `Tree`, then convert the Network panel.** Add to `Tree`: per-node status (online/offline), node metadata, `note` rows, and pluggable activation (open session / spawn shell / SSH). Then make `paintNetworkPanel` a composited `Tree` bound to `controller.networkTree`.                                                                                                                                                                      | **done Aug 14 2026** — Tree gained status/note/meta/per-node activation + rowStyle/marker/scrollbar; ExomuxNetworkTree composites it with per-cell ground re-blending; controller-built nodes carry status/note natively; tested |
| WS-005 | P1   | 🔧⭐    | **`Modal` upgrades + migrate the dialogs.** Add responsive button stacking (`modalButtonRects`: buttons stack vertically when the box is narrow, so a destructive choice is not a mis-hit target) to `ModalController`. Move Kill, Quit, Help, and Window-config onto `Modal` + `ModalController` + `bindModalFocus`.                                                                                                                                  | **mostly done Aug 14 2026** — modalActionRects (responsive stacking) promoted to exotui with up/down keys in ModalController; exomux kill/quit dialogs are ModalController-driven (arrow/tab selection, Enter/Space, Escape; shortcuts kept). Help stays a static reference sheet and the window-config modal's content already composites via WS-012; their hand-drawn *frames* fold into WS-010's convergence pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| WS-006 | P0   | 🔧      | **SCP password field → composited `Input(password)` (first proof point).** The clearest hack in the app: the SCP modal hand-draws a `•`-masked field driven by `appendScpPassword`/`backspaceScpPassword`, when a real `Input` with `password` masking + cursor + validator exists (and the session-name field already composites one). Smallest, highest-clarity migration — do it first to prove the WS-001 path end-to-end on an interactive field. | **done Aug 14 2026** — extracted the reusable `ExomuxInputField` (`input_field.ts`: composited, masked/validated, `sync`/`handleKey`/`cellAt`/`ready`) from the session-name pattern and wired the SCP prompt onto it (`controller.setScpPassword`; a controller-accumulation fallback covers keystrokes that beat the async mount). Tested (`input_field.test.ts`, plus the existing scp flow). **Next: migrate the session-name editor onto `ExomuxInputField` to delete the duplicate `session_name_field.ts` logic (WS-010).** |
| WS-007 | P2   | 🔧⭐    | **`ContextMenu` upgrades + composite the start menu.** Add a destructive/danger item tone and cursor-anchored, clamped-on-screen placement to `ContextMenu`. Then make `paintStartMenu` a composited `ContextMenu`.                                                                                                                                                                                                                                    | **done Aug 14 2026** — ContextMenu gained danger tone, itemStyle/markerFor hooks, and contextMenuPlacement; ExomuxStartMenu composites it and the menu gained keyboard navigation (up/down/Enter); tested |
| WS-008 | P2   | ✅⭐    | **Window-host niceties (back-feed to `WorkbenchWindowHostController`).** Double-click-title-bar → maximize (owned by the host, not just exomux); title-bar "status adornments" (exomux's baked-in `[SCROLL]`/`[NO MOUSE]` tags as first-class); configurable border style + focus-by-color into `Frame`/host chrome.                                                                                                                                   | **done Aug 14 2026** — host-owned doubleClickMaximizeMs (envelope timestamps, mouse-only) + first-class titleAdornments projection; Frame gained double/thick/ascii charMaps; exomux consumes all three; tested |
| WS-009 | P3   | 🆕⭐    | **`AnimatedBackground` family + software cursor/any-motion helper in exotui.** Package exomux's background fields (metaballs, butterchurn — incl. the WebGPU/WGSL pipeline — matrix, fire, ivy, circuit, etc.) as a reusable animated-background library, and the drawn block cursor + mode-1003 (any-motion) enable/keepalive/teardown as an exotui helper.                                                                                           | **done (contract + cursor) Aug 14 2026** — theme-generic AnimatedBackground contract (overlay/interactive/preset/disposable + guards + idle release) and SoftwareCursor/any-motion helpers live in exotui; exomux consumes both. The field implementations (metaballs…butterchurn GPU) stay in exomux; relocating them is the tracked follow-up below |
| WS-010 | P3   | 🔧      | **Unify the two compositing-forwarding models.** Today the settings pickers + session-name field are _interactive_ (real synthesized events forwarded into the components + two-way binding), while the option rows/buttons/background list are _view-only_ mirrors driven by controller routing. Converge on the interactive model to delete the parallel routing code.                                                                               | **partially done Aug 14 2026** — session_name_field.ts deleted (the editor is the reusable ExomuxInputField with a validator). The option rows/buttons/background list stay deliberately view-only: their left/right-half click-to-cycle UX has no Cycler equivalent yet, so converging now would regress interaction; tracked below |

## Straight bug/consistency fixes (no new exotui work — can land immediately)

| ID     | Prio | Feature                                                                                                                                                                                                                                                                                                                              | Status      |
| ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| WS-011 | P1   | **Honor `control.tone` on titlebar buttons.** The workbench titlebar projection hands exomux success/warning/muted tones for maximize/minimize/restore, but `paintWindow` (`app.ts:~3416`) only special-cases `close` as danger, so those tones are dropped. Paint each control in its projected tone.                               | **done Aug 14 2026** — exomuxTitlebarToneColor paints every control's projected tone; tested |
| WS-012 | P1   | **Per-window config modal → composited option controls.** The settings window composites real `Cycler`/`CheckBox`, but `paintWindowConfigModal` hand-draws the same kind of value rows. Reuse the existing `ExomuxSettingsOptions` host (as the background-config modal already does) so the codebase stops disagreeing with itself. | **done Aug 14 2026** — paintWindowConfigModal renders value rows through a dedicated ExomuxSettingsOptions host with the hand-drawn fallback until the snapshot lands; tested |

## Follow-ups (scoped out of the Aug 14 program)

- **WS-013 — relocate the background field implementations into exotui.** The contract and capability guards are
  library-owned (WS-009); physically moving the CPU fields (metaballs, matrix, circuit, fire, ivy, jungle, biomech,
  rainy-windows, skull, vaporwave) means neutralizing their `ExomuxThemeSpec` reads, and the butterchurn GPU field
  drags in the WGSL pipeline, eel compiler, audio capture, and preset catalogs — do it as its own reviewed migration,
  not as a tail on this program (and not while 033 is actively tuning that pipeline).
- **WS-014 — interactive convergence of the remaining view-only mirrors.** Option rows (`ExomuxSettingsOptions`),
  action buttons (`ExomuxSettingsWidgets`), and the background list are view-only because their UX is
  click-left-half/right-half to cycle — the library `Cycler` has no such half-click direction semantics. Add that to
  `Cycler` first, then forward real events and delete the parallel routing (which also absorbs the hand-drawn modal
  frames noted in WS-005).

## Suggested execution order

1. **WS-006** (SCP → `Input`) as a fast proof of the composited-interactive path, in parallel with **WS-011 / WS-012**
   (pure exomux cleanups, no exotui changes).
2. **WS-001** (`WidgetSurface` in exotui) — the foundation everything else depends on.
3. **WS-003** (Sessions → `List`) next, because it doubles as the scroll-selection fix already requested.
4. **WS-002** (`TerminalScreen`), **WS-004** (Network → `Tree`), **WS-005** (modals), then WS-007–WS-010.

## Definition of done (per migration)

- The exotui component gains the capability (with tests) before exomux adopts it.
- exomux composites it via the WS-001 surface with the async-snapshot + hand-drawn-fallback guarantee intact (no blank
  frame while the render catches up).
- The hand-drawn code it replaces is deleted, not left as dead paint paths.
- exomux suite and the exotui library suite stay green; CHANGELOG updated on both sides.

## Open bug: picker ghost rows on click/resize (user report, Aug 14 2026)

The user's live Ghostty session shows stale selection bars in the settings pickers — multiple `T2 Neural Steel` /
`butterchurn` highlight rows in **previous themes' accent colours**, some horizontally shifted, some outside the
current picker rects — appearing "when you click to select or resize the window" (screenshot on file).

Investigated Aug 14: headless reproductions (sequential clicks, racing clicks with no settling, terminal resizes
mid-flight) all leave the canvas frameBuffer clean, and `Canvas.rerenderAll()` clears retained state on resize, so the
painter/canvas content is correct. Ghost bars **outside** the blit regions and **left-shifted fragments** (`rchurn`,
doubled `>>`) implicate the stdout diff layer or the terminal's own reflow (cursor-position desync on ranged updates),
which the in-memory harness cannot observe. Hardening landed: `WidgetSurface.render()` now converges (keeps
rendering while deferred draws keep arriving) instead of stopping after two fixed passes, so a reflow racing an
in-flight snapshot can no longer be captured half-applied — plus a mid-flight-mutation regression test.

Next steps when it reproduces again: capture which action precedes the freeze (theme click vs Ghostty resize), and
whether a forced full repaint (e.g. toggling a setting that resizes the window by one cell) clears it — that separates
"canvas holds ghosts" from "terminal shows ghosts the diff never overwrote". A diagnostic worth adding: a debug
keybinding that calls the desktop's full-repaint escape hatch (`Canvas.rerenderAll` + full range flush) to heal and
confirm the diff-layer theory in one keystroke.
