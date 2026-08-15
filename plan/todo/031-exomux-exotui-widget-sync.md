# Exomux ↔ exotui Widget Sync

Status: in progress Aug 14 2026 (WS-001 and WS-006 done, WS-003 library half landed). Turns the control-by-control
audit in `docs/exomux-component-audit.md` into
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
| WS-002 | P1   | 🆕⭐    | **`TerminalScreen` component + `terminal_palette` utilities in exotui.** A real PTY cell-grid renderer (exotui only has line-level `TerminalOutput` today): xterm-256 palette + WCAG contrast lift (`packages/exomux/terminal_palette.ts`), dim-inactive, transparency blend against a backdrop, inverted cursor cell, bottom warning line. Biggest net-new capability. Then exomux's `paintTerminal` consumes it.                                     | not started                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| WS-003 | P1   | 🔧⭐    | **Richer `List`/`Table`, then convert the Sessions panel.** Add to `List`/`Table`: transparency (render rows through a caller-supplied "ground" so a translucent panel shows the desktop behind), status/tag columns, opaque-selected block. Then make `paintSessionManager` a composited `List`/`Table`. **Also closes the wheel-changes-selection issue** — the real `List` scrolls its viewport without moving the selection.                       | library half done Aug 14 2026 — List.rowStyle (per-row reactive style: foreground/background, tracks the scroll window; covers status colour + ground backgrounds) in src/components/list.ts, tested. Adoption pending: convert paintSessionManager to a composited List (needs per-cell ground-blend against the desktop backdrop for reduced-opacity windows)                                                                                                                                                                    |
| WS-004 | P1   | 🔧⭐    | **Richer `Tree`, then convert the Network panel.** Add to `Tree`: per-node status (online/offline), node metadata, `note` rows, and pluggable activation (open session / spawn shell / SSH). Then make `paintNetworkPanel` a composited `Tree` bound to `controller.networkTree`.                                                                                                                                                                      | not started                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| WS-005 | P1   | 🔧⭐    | **`Modal` upgrades + migrate the dialogs.** Add responsive button stacking (`modalButtonRects`: buttons stack vertically when the box is narrow, so a destructive choice is not a mis-hit target) to `ModalController`. Move Kill, Quit, Help, and Window-config onto `Modal` + `ModalController` + `bindModalFocus`.                                                                                                                                  | not started                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| WS-006 | P0   | 🔧      | **SCP password field → composited `Input(password)` (first proof point).** The clearest hack in the app: the SCP modal hand-draws a `•`-masked field driven by `appendScpPassword`/`backspaceScpPassword`, when a real `Input` with `password` masking + cursor + validator exists (and the session-name field already composites one). Smallest, highest-clarity migration — do it first to prove the WS-001 path end-to-end on an interactive field. | **done Aug 14 2026** — extracted the reusable `ExomuxInputField` (`input_field.ts`: composited, masked/validated, `sync`/`handleKey`/`cellAt`/`ready`) from the session-name pattern and wired the SCP prompt onto it (`controller.setScpPassword`; a controller-accumulation fallback covers keystrokes that beat the async mount). Tested (`input_field.test.ts`, plus the existing scp flow). **Next: migrate the session-name editor onto `ExomuxInputField` to delete the duplicate `session_name_field.ts` logic (WS-010).** |
| WS-007 | P2   | 🔧⭐    | **`ContextMenu` upgrades + composite the start menu.** Add a destructive/danger item tone and cursor-anchored, clamped-on-screen placement to `ContextMenu`. Then make `paintStartMenu` a composited `ContextMenu`.                                                                                                                                                                                                                                    | not started                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| WS-008 | P2   | ✅⭐    | **Window-host niceties (back-feed to `WorkbenchWindowHostController`).** Double-click-title-bar → maximize (owned by the host, not just exomux); title-bar "status adornments" (exomux's baked-in `[SCROLL]`/`[NO MOUSE]` tags as first-class); configurable border style + focus-by-color into `Frame`/host chrome.                                                                                                                                   | not started                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| WS-009 | P3   | 🆕⭐    | **`AnimatedBackground` family + software cursor/any-motion helper in exotui.** Package exomux's background fields (metaballs, butterchurn — incl. the WebGPU/WGSL pipeline — matrix, fire, ivy, circuit, etc.) as a reusable animated-background library, and the drawn block cursor + mode-1003 (any-motion) enable/keepalive/teardown as an exotui helper.                                                                                           | not started                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| WS-010 | P3   | 🔧      | **Unify the two compositing-forwarding models.** Today the settings pickers + session-name field are _interactive_ (real synthesized events forwarded into the components + two-way binding), while the option rows/buttons/background list are _view-only_ mirrors driven by controller routing. Converge on the interactive model to delete the parallel routing code.                                                                               | not started                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Straight bug/consistency fixes (no new exotui work — can land immediately)

| ID     | Prio | Feature                                                                                                                                                                                                                                                                                                                              | Status      |
| ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| WS-011 | P1   | **Honor `control.tone` on titlebar buttons.** The workbench titlebar projection hands exomux success/warning/muted tones for maximize/minimize/restore, but `paintWindow` (`app.ts:~3416`) only special-cases `close` as danger, so those tones are dropped. Paint each control in its projected tone.                               | not started |
| WS-012 | P1   | **Per-window config modal → composited option controls.** The settings window composites real `Cycler`/`CheckBox`, but `paintWindowConfigModal` hand-draws the same kind of value rows. Reuse the existing `ExomuxSettingsOptions` host (as the background-config modal already does) so the codebase stops disagreeing with itself. | not started |

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
