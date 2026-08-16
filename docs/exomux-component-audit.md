# Exomux ↔ exotui component audit

A control-by-control audit of the entire **exomux** app (`packages/exomux/`) against the parent **exotui** component
library (`src/`), to decide where exomux should adopt exotui components, where it should stay bespoke, and — most
importantly — **which exomux widgets should be back-fed to exotui and made richer/more robust.**

## How to read this

Every exomux control gets one of four verdicts:

|    | Verdict                     | Meaning                                                                 |
| -- | --------------------------- | ----------------------------------------------------------------------- |
| ✅ | **Driven by exotui**        | A real exotui component (or the workbench projection) backs it.         |
| 🔧 | **Hack — component exists** | Hand-rolled where an exotui component should have been used/composited. |
| 🆕 | **No exotui equivalent**    | Nothing comparable exists in exotui; candidate to _create_.             |
| ⭐ | **exomux is richer**        | exomux's version exceeds the exotui equivalent; _back-feed_ the extras. |

Many entries carry a **primary verdict + a ⭐ back-feed note** (e.g. "should be a `List`, and its transparency is richer
than `List` — feed it back"). Line numbers are approximate (this file drifts); treat them as anchors.

**Refreshed Aug 14 2026** against the current `app.ts`, folding in the Aug 13–14 mouse/cursor work and the first landed
WS items from [plan/todo/done/031](../plan/todo/done/031-exomux-exotui-widget-sync.md): WS-001 (`WidgetSurface` promoted —
`widget_surface.ts` is now a thin alias of `@ubernaut/deno-tui/app`'s `WidgetSurface`) and WS-006 (SCP password →
composited `ExomuxInputField`) are **done**; WS-003 is library-half done (`List.rowStyle`).

## The one architectural fact that colors everything

The exomux desktop is **a single retained exotui draw object** — `ExomuxDesktopDrawObject` (`app.ts:~5059`) inside
`ExomuxDesktopSurface` (`app.ts:~5025`). Terminal cell grids, animated backgrounds, window chrome, modals, and the mouse
cursor are all **rasterized by hand** through one `DesktopPainter` (`app.ts:4881-5017`) into that one grid, which then
diff-blits. This is _why_ most chrome is hand-drawn — it is the price of compositing live terminals + translucent
windows + GPU backgrounds into one surface, not laziness.

The important exception is the proven **"composite a real component" path**: `ExomuxWidgetSurface` (`widget_surface.ts`)
mounts a real exotui component on a headless `Tui`/`MemoryCanvasSink`, renders it off-screen, and blits its cells back
with `painter.rawCell` — with an async-snapshot + hand-drawn-fallback guarantee so nothing is ever blank. The settings
window and background-config modal already use this for `List`/`Cycler`/`CheckBox`/ `Button`/`Input`. **The central
recommendation of this audit is: extend that path to the panels/modals/menus that have exotui equivalents, and push
exomux's bespoke richness (transparency, terminal rendering, backgrounds, the compositing surface itself) up into
exotui.**

---

## 1. Top bar (`row 0`)

| Control                                                                                                | Rendering                                                                                                                                                 | Verdict                  | Rationale                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Start button** `≡ Exomux ▾` (`app.ts:2978`)                                                          | Hand-drawn label on `theme.accent`; flips to `≡ PREFIX ▾` + `theme.warning` when a prefix key is pending                                                  | 🔧 _(low priority)_ + ⭐ | It is a menu-trigger `Button`. A composited `Button` would fit, but for a one-cell static label hand-drawing is defensible. The ⭐ is the **dual-role prefix indicator** — a "mode/prefix" affordance no exotui component offers. |
| **Window taskbar / shelf** (`projectExomuxTerminalBar` `app.ts:305`, `paintTerminalBar` `app.ts:3661`) | Uses the **real** workbench button-row layout helpers (`layoutWorkbenchButtonRowInto`, `workbenchButtonRowRenderCommandsInto`) then hand-paints the cells | ✅ _(layout)_ + ⭐       | Correct seam: geometry from the library, paint by exomux for compositing. ⭐ the **collapsed `Terminals (N) ▾` fallback** when entries overflow, and the minimized `▁` prefix, are richer than the raw button row.                |
| **Quit button** `[ ✕ ]` (`app.ts:2991`)                                                                | Hand-drawn on `theme.danger`                                                                                                                              | 🔧 _(low priority)_      | A `Button` with a danger tone. Same story as the start button — trivial static label; fine hand-drawn, but it _is_ a Button.                                                                                                      |

---

## 2. Window chrome (`paintWindow` `app.ts:3363`)

exomux drives all window state/layout from exotui's **`WorkbenchWindowHostController`** — a big ✅ — and hand-paints the
projection it returns.

| Control                                                                                 | Rendering                                                                                                             | Verdict | Rationale                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Window frame / border** (`app.ts:3376`, `borderBox` + `exomuxBorderGlyphs`)           | Hand-drawn from the window-host projection; focus shown by color+bold, border glyphs user-configurable                | ✅ + ⭐ | Model is exotui (window host). ⭐ the **configurable border style** and focus-by-color exceed exotui's standalone `Frame` (which only has sharp/rounded). Feed a `borderStyle`/token-driven focus look into `Frame` / the window-host chrome.                                                                                                  |
| **Title bar + title text** (`app.ts:3400`)                                              | Hand-drawn from `createWorkbenchTitlebarLayout`; adds placement glyph + baked-in `[SCROLL]` / `[NO MOUSE]` state tags | ✅ + ⭐ | Titlebar layout is exotui. ⭐ the **live state tags** in the title are an exomux idea the workbench titlebar could adopt as first-class "status adornments".                                                                                                                                                                                   |
| **Double-click title bar → maximize** (`app.ts:1628`, `titleBarWindowAt` `app.ts:5233`) | exomux-added gesture over the hand-drawn title bar                                                                    | ⭐      | Pure back-feed: **the window host should own double-click-to-maximize** so every consumer gets it, not just exomux.                                                                                                                                                                                                                            |
| **Titlebar buttons** close/min/max/restore/**config** (`app.ts:3415`)                   | Rects/labels/**tones** from the workbench titlebar projection; hand-painted                                           | ✅ + 🔧 | Buttons themselves are exotui (projection). 🔧 **exomux drops the projection's `tone` metadata** — only `close` is specially danger-colored; success/warning/muted for max/min/restore are ignored (`app.ts:3416`). Easy fix: honor `control.tone`. The **`config` button** is a clean use of the host's `windowConfigButton` extension point. |
| **Tiling separators** (`app.ts:3037`)                                                   | Hand-drawn fills from `projection.separators`; drag-resize by the host                                                | ✅      | Window host owns it.                                                                                                                                                                                                                                                                                                                           |
| **Snap preview** (`app.ts:3072`)                                                        | Hand-drawn dotted frame from `projection.snapPreview`                                                                 | ✅      | Window host projection.                                                                                                                                                                                                                                                                                                                        |
| **Window switcher** (`paintSwitcher` `app.ts:3685`)                                     | Hand-drawn `#`-framed list from `projection.switcher`                                                                 | ✅      | Window host projection; hand-painted list overlay.                                                                                                                                                                                                                                                                                             |

---

## 3. Panels & terminal content

| Control                                                     | Rendering                                                                                                                                                                                               | Verdict            | Rationale                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sessions panel** (`paintSessionManager` `app.ts:3514`)    | Hand-drawn selectable list: selection marker, `[LIVE]`/`[HOLD]` status tags, opaque-accent selected row, unselected rows drawn **through the window ground** (transparency), selection-following scroll | 🔧 **(high)** + ⭐ | It is a selectable list and should be a **composited `List`/`Table`** (exactly like the settings pickers). Converting it also **fixes the wheel-changes-selection bug you just hit** — the real `List` scrolls its viewport without moving the selection. ⭐ back-feed: **row transparency (render through a ground), status-tag columns, and the opaque-selected block** are richer than today's `List`/`Table`. |
| **Network panel** (`paintNetworkPanel` `app.ts:3464`)       | Hand-drawn **tree** via `controller.networkTree` (`visible/selected/move/toggleActive`, `TreeRow`, depth-0 headings, fold/unfold, online/offline, `note:` rows, open/spawn/ssh activation)              | 🔧 **(high)** + ⭐ | It is a tree and exotui has a real **`Tree`** component. Should be a composited `Tree`. ⭐ back-feed: **per-node status (online/offline), metadata, `note` rows, and pluggable activation** (open session / spawn shell / SSH) are all things `Tree`/`FileExplorer` lack.                                                                                                                                         |
| **Terminal window content** (`paintTerminal` `app.ts:3588`) | Hand-painted cell grid from the PTY screen model: xterm-256 palette + WCAG contrast lift (`terminal_palette.ts`), dim-inactive, transparency blend, inverted cursor cell, bottom warning line           | 🆕 **+ ⭐ (big)**  | exotui has **no terminal-screen renderer** (only the line-oriented `TerminalOutput` _controller_). This is exomux's crown jewel. Back-feed a real **`TerminalScreen` component** + the **`terminal_palette` contrast utilities** — broadly useful to any TUI embedding a PTY.                                                                                                                                     |
| **Text cursor** (inverted cell, `app.ts:3624`)              | Part of terminal rendering                                                                                                                                                                              | 🆕                 | Belongs with the `TerminalScreen` back-feed above.                                                                                                                                                                                                                                                                                                                                                                |
| **Warning line** (terminal bottom row, `app.ts:3651`)       | Hand-drawn `! {warning}`                                                                                                                                                                                | 🔧 _(low)_         | A one-line inline status; `StatusBar`/`Text` would cover it, but it is trivial.                                                                                                                                                                                                                                                                                                                                   |
| **Status line / footer**                                    | **Does not exist** (`FOOTER_ROWS = 0`); `controller.status` only feeds reactivity                                                                                                                       | —                  | Deliberately removed; the prefix cue moved onto the start button. Nothing to classify — but if a status line returns, exotui **`StatusBar`** is the component.                                                                                                                                                                                                                                                    |

---

## 4. Modals & menus (all hand-drawn via `DesktopPainter`)

exotui ships a real **`Modal` + `ModalController`** (title, body, `tone` info/confirm/success/warning/error, `actions[]`
with `default`/`destructive`/`disabled`, `closeOnEscape`, `onAction`) and **`bindModalFocus`**. Almost none of exomux's
modals use it.

| Modal / menu                                                             | Controls                                                                                                                               | Verdict                                                   | Rationale                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Start-menu dropdown** (`paintStartMenu` `app.ts:3112`)                 | 6 command rows incl. a `danger` Quit; anchor-aware placement, cursor-anchored on right-click                                           | 🔧 + ⭐                                                   | It is a **`ContextMenu`** (selectable list, disabled/separator support). Should be composited. ⭐ back-feed: **danger/destructive item tone** and **cursor-anchored, clamped-on-screen placement** to `ContextMenu`.                                                                          |
| **Kill confirmation** (`paintKillConfirmation` `app.ts:3758`)            | Title, detail, `[ Cancel ]`, `[ Kill ]` (danger)                                                                                       | 🔧 **(high)** + ⭐                                        | Textbook **`Modal`** with a destructive action. ⭐ back-feed: **`modalButtonRects` responsive stacking** (buttons stack vertically when the box is narrow, reducing mis-hits on the destructive choice) — the exotui `Modal` doesn't do this.                                                 |
| **Quit modal** (`paintQuitModal` `app.ts:3795`)                          | Title, detail, `[ Cancel ]` / `[ Detach ]` (accent) / `[ Terminate ]` (danger)                                                         | 🔧 **(high)**                                             | Three-action **`Modal`** (mixed accent + destructive tones).                                                                                                                                                                                                                                  |
| **SCP modal** (`paintScpModal`)                                          | Title, detail, **composited masked password field**, `[ Cancel ]` / `[ Paste path ]` / `[ Send ]`                                      | ✅ _(field — WS-006 done Aug 14 2026)_ + 🔧 _(container)_ | The password field now composites a real `Input(password)` via the reusable **`ExomuxInputField`** (`input_field.ts`), with a controller-accumulation fallback for keystrokes that beat the async mount. The modal _container_ is still hand-drawn — migrate with the other dialogs (WS-005). |
| **Help modal** (`paintHelp` `app.ts:3719`)                               | 15 hand-drawn key-reference lines + `[ Close ]`                                                                                        | 🔧 _(med)_                                                | exotui has **`KeyHelp`** (key-binding rows) and **`Markdown`**; wrap either in a **`Modal`**.                                                                                                                                                                                                 |
| **Per-window config modal** (`paintWindowConfigModal` `app.ts:4631`)     | Value rows (`> label` + right-aligned value, cycle-on-click), detail, `[ Reset ]`, `[ Close ]` — **hand-drawn, no composited widgets** | 🔧 **(high — inconsistency)**                             | The **same codebase** composites real `Cycler`/`CheckBox` in the settings window, but here reimplements value rows by hand. Should use the **composited option-control host** (`ExomuxSettingsOptions`) + a `Modal`. Straight consistency win.                                                |
| **Background-config modal** (`paintBackgroundConfigModal` `app.ts:4114`) | Hand-drawn frame/title/header; **real composited `List` + `Cycler`/`CheckBox` + `Button`** (view-only)                                 | ✅ _(controls)_ + 🔧 _(container)_                        | The **right pattern** for the controls. Only the modal _frame_ is hand-drawn — wrap it in **`Modal`** for the last mile. Good template for fixing the modals above.                                                                                                                           |

---

## 5. Composited exotui widgets — the good path (settings + background config)

All ✅. These prove the compositing pattern works end-to-end (async snapshot + hand-drawn fallback, geometry/theme
signature gating, two-way binding for the interactive ones).

| Widget                                | Component                                           | Interactive?                                                  | File                         |
| ------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- | ---------------------------- |
| Theme picker                          | `List` (`selectedStyle` + `scrollbar`)              | Yes — click/scroll/keys forwarded, two-way bound to `themeId` | `settings_surface.ts:249`    |
| Background picker                     | `List`                                              | Yes — bound to `backgroundId`                                 | `settings_surface.ts:259`    |
| Settings option rows                  | `Cycler` / `CheckBox`                               | View-only (routing cycles the value)                          | `settings_options.ts:96,104` |
| "Background config" / "Close" buttons | `Button`                                            | View-only (routing handles clicks)                            | `settings_widgets.ts:89`     |
| Session-name field                    | `Input` (validator, cursor)                         | Yes — typeable, forwarded                                     | `session_name_field.ts:141`  |
| Background preset/image list          | `List` (custom `markerFor`: `>` cursor, `·` active) | View-only                                                     | `background_list.ts:103`     |
| Background option rows                | `Cycler` / `CheckBox`                               | View-only                                                     | reuses `settings_options.ts` |
| Background "Close" button             | `Button`                                            | View-only                                                     | reuses `settings_widgets.ts` |

**Note (a real inconsistency worth fixing):** the settings pickers are _interactive_ (real events synthesized via
`createTestMousePress/Scroll/KeyPress` and `component.emit`, plus two-way binding), while the option rows / buttons /
background list are _view-only_ mirrors driven by controller routing. Two forwarding models coexist. Unifying on the
interactive model (forward real events into the components, bind their state) would delete a lot of the parallel routing
code.

---

## 6. Cursor, overlays & backgrounds

| Control                                                                                                                            | Rendering                                                                                                                                                                                                                                                                                                       | Verdict                                     | Rationale                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Block mouse cursor** `█` (`exomuxBlockCursorRender` `app.ts:~5606`)                                                              | Hand-drawn at the tracked mouse cell; **blinks at 2 Hz** and turns into a **contextual resize/move glyph** over a floating window's drag border (`resizeGlyphAt` `app.ts:~5582`); any-motion tracking (`\x1b[?1003h`) enabled + re-asserted on a keepalive + torn down (`app.ts:~711-735`, `terminal_modes.ts`) | 🆕 + ⭐                                     | No exotui equivalent. Back-feed a **`SoftwareCursor` overlay** (blink + contextual glyph resolution) **+ an any-motion-tracking helper** (mode-1003 enable/keepalive/teardown) — useful to any app that wants a drawn pointer.  |
| **Wheel-under-pointer routing** (`wheelDeltaAt`/`scrollWindowAt` `app.ts:~1594`, listbox-wheel `app.ts:~1889`)                     | The wheel scrolls the viewport **under the pointer** without moving selection, and routes to the control under the cursor, not the focused one; full-screen alt-screen children get cursor-key fallback bytes (`wheelFallbackKeyBytes` `app.ts:~3019`)                                                          | ⭐                                          | A general **interaction contract** worth promoting alongside the richer `List`: "wheel scrolls what it hovers; selection only moves on explicit input."                                                                         |
| **Pincushion pointer warp** (`exomuxPincushionSource` `ghostty.ts:~216`)                                                           | Maps a reported mouse cell → visual cell through the active display-distortion shader before hit-testing                                                                                                                                                                                                        | _(exomux-local)_ + ⭐ idea                  | Ghostty-specific, but the **"pointer-transform hook before hit-testing"** pattern (undo a display distortion) could be a general input-pipeline extension point.                                                                |
| **F1 → help, debug overlay/logging**                                                                                               | exomux-local conveniences                                                                                                                                                                                                                                                                                       | —                                           | Not component candidates.                                                                                                                                                                                                       |
| **Animated backgrounds** (metaballs, butterchurn, matrix, fire, ivy, circuit, rainy-windows, skull, vaporwave, turbulence, image…) | Hand-drawn / GPU fields rasterized to cells                                                                                                                                                                                                                                                                     | 🆕 + ⭐                                     | exotui has `ThreeAscii` (3D) but no 2-D animated-field library. Back-feed an **`AnimatedBackground` family** — the **butterchurn GPU (WebGPU/WGSL) pipeline** especially is a large, reusable asset.                            |
| **`WidgetSurface` compositing pattern** (`widget_surface.ts`)                                                                      | Headless `Tui` + `MemoryCanvasSink` → off-screen render → `rawCell` blit with async snapshot + fallback                                                                                                                                                                                                         | ✅ **(promoted Aug 14 2026 — WS-001 done)** | **The highest-leverage back-feed — landed.** Lives in exotui as `WidgetSurface` (`src/app/widget_surface.ts`, exported from `mod.app.ts`, built on `Canvas.rerenderAll()`); exomux's `ExomuxWidgetSurface` is now a thin alias. |

---

## Scoreboard

| Verdict                         | Count (approx.) | Where                                                                                                                                                                                                 |
| ------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Driven by exotui             | ~15             | All window-host chrome (frame, titlebar, separators, snap, switcher, taskbar layout) + all 8 composited settings/background widgets                                                                   |
| 🔧 Hack — component exists      | ~9              | Sessions panel, network panel, start menu, kill/quit/scp/help/window-config modals, titlebar tones, (minor: start/quit buttons)                                                                       |
| 🆕 No exotui equivalent         | ~4              | Terminal screen renderer, block cursor, animated backgrounds, the widget-surface pattern                                                                                                              |
| ⭐ exomux is richer (back-feed) | ~10 overlaps    | Terminal palette/contrast, list transparency, tree status/activation, modal button stacking, menu danger tone, prefix indicator, state-tag titles, double-click maximize, backgrounds, widget surface |

Your instinct is right: **a lot should flow back to exotui.** The panels/modals are 🔧 _and_ ⭐ at once — they should
adopt an exotui component **and** hand it new capabilities on the way up.

---

## Back-feed roadmap (highest leverage first)

1. **`WidgetSurface` / `CompositeSurface` in exotui** ⭐⭐ — **done Aug 14 2026 (WS-001)**: `WidgetSurface` in
   `src/app/widget_surface.ts`, exported from `mod.app.ts`, built on `Canvas.rerenderAll()`; exomux consumes it via a
   thin alias. _Foundational — unblocked everything below._
2. **`TerminalScreen` component + `terminal_palette` utilities** 🆕⭐ — **done Aug 14 2026 (WS-002).** a real PTY
   cell-grid renderer with xterm-256, WCAG contrast lift, dim-inactive, transparency, cursor. exotui only has line-level
   `TerminalOutput` today. Biggest net-new capability.
3. **Richer `List` / `Table`** ⭐ — **done Aug 14 2026 (WS-003).** _library half done Aug 14 2026_: `List.rowStyle`
   (per-row reactive foreground/background tracking the scroll window) landed in `src/components/list.ts`. Remaining:
   **convert the Sessions panel to a composited `List`/`Table`** — which _also fixes wheel-changes-selection_ for free —
   including per-cell ground-blend against the desktop backdrop for reduced-opacity windows.
4. **Richer `Tree`** ⭐ — **done Aug 14 2026 (WS-004).** per-node status (online/offline), metadata, `note` rows,
   pluggable activation. Then **convert the Network panel to a composited `Tree`.**
5. **`Modal` upgrades + migrate the dialogs** ⭐🔧 — **done Aug 14 2026 (WS-005/WS-011/WS-012).** add responsive button
   stacking (`modalButtonRects`), then move Kill / Quit / SCP / Help / Window-config onto `Modal` + `ModalController`.
   The **SCP password field → `Input` (password)** proof point is **done Aug 14 2026 (WS-006)** via the reusable
   `ExomuxInputField`; next, migrate the session-name editor onto it and delete `session_name_field.ts` (WS-010).
6. **`ContextMenu` upgrades + migrate the start menu** ⭐🔧 — **done Aug 14 2026 (WS-007).** destructive-item tone +
   cursor-anchored clamped placement, then composite the start menu on it.
7. **Window-host niceties** ⭐ — **done Aug 14 2026 (WS-008).** double-click-to-maximize, title "status adornments",
   honoring `control.tone` on the titlebar buttons (a bug in exomux today), configurable border style.
8. **`AnimatedBackground` family + `SoftwareCursor` / any-motion helper** 🆕⭐ — **contract + cursor done Aug 14 2026
   (WS-009); field relocation tracked as WS-013.** package exomux's fields (incl. the butterchurn GPU pipeline) and the
   drawn cursor (2 Hz blink + contextual resize/move glyph via `resizeGlyphAt`) + mode-1003 enable/keepalive/teardown as
   reusable exotui features. Consider the **wheel-under-pointer** routing contract alongside the richer `List`.

### Straight bug/consistency fixes inside exomux (no new exotui work)

- Honor `control.tone` when painting titlebar buttons (max/min/restore currently lose their success/warning/muted colors
  — `app.ts:3416`).
- Make the **per-window config modal** use the composited `Cycler`/`CheckBox` host it already has, instead of
  hand-drawing value rows — the settings window and this modal disagree today.
- Unify the two compositing-forwarding models (interactive vs view-only) on the interactive one to delete parallel
  routing code.
