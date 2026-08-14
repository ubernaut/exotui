# Deno TUI Robust Library Plan

This plan tracks the remaining work to make this fork a robust curses-style TUI library for Deno while keeping the
browser build in parity with the terminal interface.

## Operating Rules

- Keep active work items in `plan/todo/`.
- Move completed work items into `plan/todo/done/` when the acceptance checks pass.
- Make a local commit at each clean breaking point.
- Push after externally useful milestones, starting with web parity plus the GitHub Pages build.
- Prefer reusable library APIs over demo-local behavior.

## Current Priorities (reprioritized Aug 14 2026)

The web parity, GitHub Pages, windowing/workbench, forms, theming, performance, and portability work that opened this
plan has shipped (see `todo/done/001`–`022`, and `027` active backgrounds). The strategic focus now is **back-feeding
exomux's proven, battle-tested richness into exotui as first-class components**: exomux has become the proving ground,
and its compositing surface, windowing, mouse/cursor, terminal rendering, and background families are the
highest-leverage additions to the library.

1. **`028` Exomux ↔ exotui widget sync (P0).** Promote the compositing surface (`WidgetSurface`), then richer
   `List`/`Tree`/`Modal`/`Input`/`ContextMenu`, a real `TerminalScreen`, window-host niceties, and the
   animated-background + software-cursor/any-motion helpers into exotui, and have exomux consume them instead of
   hand-drawing. Concrete and bounded (10 WS items) versus the broad aspirational backlogs. Windowing and mouse/cursor
   are the clearest wins — and the mouse/cursor surface has grown well past the Aug 12 audit (block-cursor blink,
   resize-edge glyph, any-motion tracking, scroll/wheel-under-pointer routing, pincushion mouse warp), so refresh
   `docs/exomux-component-audit.md` before executing.
2. **`023` / `024` library feature parity (P1, reference backlog).** Textual/OpenTUI parity and the 200-feature program
   are the durable backlog; pull specific items forward when 028 or a demo needs them rather than running top-to-bottom.
3. **`025` production demo showcases (P2).** Exercise the library as a system; strongest once 028 has landed the
   components they would build on.
4. **`026` exomux network menu (P2).** MVP shipped; Phase 2 (OSC 7 cwd tracking, capability/provider manifest, remote
   session discovery) is exomux-specific polish, not library-building.
5. **Top-level research plans (P3, opportunistic).** `html-css-layout-engine.md` (partial),
   `kitty-graphics-integration.md` (not started). `tailscale-integration.md` is superseded by `026` and can be archived
   once 026 completes.
6. **Exomux butterchurn polish (P2, exomux-specific).** `030` GPU render-fidelity — two systematic fixes landed (wave
   colour floor + waveform ribbon), lifting the GPU auto-cycle rotation 306 → 369 of 472; a residual ~28 shader-heavy
   presets remain black and are characterised for a later pass. `029` right-click "bg settings"/favorite menu and a
   favorites-only cycle toggle for both butterchurns — **done** (`todo/done/029`).

## Completion Standard

A task is complete when its todo file acceptance checks pass, relevant tests or build checks pass, and the work has a
commit that can be reviewed independently.
