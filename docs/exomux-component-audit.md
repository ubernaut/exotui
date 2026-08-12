# Exomux ↔ exotui component audit

A control-by-control audit of the entire **exomux** app (`packages/exomux/`) against the parent **exotui**
component library (`src/`), to decide where exomux should adopt exotui components, where it should stay bespoke,
and — most importantly — **which exomux widgets should be back-fed to exotui and made richer/more robust.**

## How to read this

Every exomux control gets one of four verdicts:

| | Verdict | Meaning |
|---|---|---|
| ✅ | **Driven by exotui** | A real exotui component (or the workbench projection) backs it. |
| 🔧 | **Hack — component exists** | Hand-rolled where an exotui component should have been used/composited. |
| 🆕 | **No exotui equivalent** | Nothing comparable exists in exotui; candidate to *create*. |
| ⭐ | **exomux is richer** | exomux's version exceeds the exotui equivalent; *back-feed* the extras. |

Many entries carry a **primary verdict + a ⭐ back-feed note** (e.g. "should be a `List`, and its transparency is
richer than `List` — feed it back"). Line numbers are approximate (this file drifts); treat them as anchors.

## The one architectural fact that colors everything

The exomux desktop is **a single retained exotui draw object** — `ExomuxDesktopDrawObject` (`app.ts:~5059`) inside
`ExomuxDesktopSurface` (`app.ts:~5025`). Terminal cell grids, animated backgrounds, window chrome, modals, and the
mouse cursor are all **rasterized by hand** through one `DesktopPainter` (`app.ts:4881-5017`) into that one grid,
which then diff-blits. This is *why* most chrome is hand-drawn — it is the price of compositing live terminals +
translucent windows + GPU backgrounds into one surface, not laziness.

The important exception is the proven **"composite a real component" path**: `ExomuxWidgetSurface`
(`widget_surface.ts`) mounts a real exotui component on a headless `Tui`/`MemoryCanvasSink`, renders it off-screen,
and blits its cells back with `painter.rawCell` — with an async-snapshot + hand-drawn-fallback guarantee so nothing
is ever blank. The settings window and background-config modal already use this for `List`/`Cycler`/`CheckBox`/
`Button`/`Input`. **The central recommendation of this audit is: extend that path to the panels/modals/menus that
have exotui equivalents, and push exomux's bespoke richness (transparency, terminal rendering, backgrounds, the
compositing surface itself) up into exotui.**

---

## 1. Top bar (`row 0`)

| Control | Rendering | Verdict | Rationale |
|---|---|---|---|
| **Start button** `≡ Exomux ▾` (`app.ts:2978`) | Hand-drawn label on `theme.accent`; flips to `≡ PREFIX ▾` + `theme.warning` when a prefix key is pending | 🔧 *(low priority)* + ⭐ | It is a menu-trigger `Button`. A composited `Button` would fit, but for a one-cell static label hand-drawing is defensible. The ⭐ is the **dual-role prefix indicator** — a "mode/prefix" affordance no exotui component offers. |
| **Window taskbar / shelf** (`projectExomuxTerminalBar` `app.ts:305`, `paintTerminalBar` `app.ts:3661`) | Uses the **real** workbench button-row layout helpers (`layoutWorkbenchButtonRowInto`, `workbenchButtonRowRenderCommandsInto`) then hand-paints the cells | ✅ *(layout)* + ⭐ | Correct seam: geometry from the library, paint by exomux for compositing. ⭐ the **collapsed `Terminals (N) ▾` fallback** when entries overflow, and the minimized `▁` prefix, are richer than the raw button row. |
| **Quit button** `[ ✕ ]` (`app.ts:2991`) | Hand-drawn on `theme.danger` | 🔧 *(low priority)* | A `Button` with a danger tone. Same story as the start button — trivial static label; fine hand-drawn, but it *is* a Button. |

---

## 2. Window chrome (`paintWindow` `app.ts:3363`)

exomux drives all window state/layout from exotui's **`WorkbenchWindowHostController`** — a big ✅ — and hand-paints
the projection it returns.

| Control | Rendering | Verdict | Rationale |
|---|---|---|---|
| **Window frame / border** (`app.ts:3376`, `borderBox` + `exomuxBorderGlyphs`) | Hand-drawn from the window-host projection; focus shown by color+bold, border glyphs user-configurable | ✅ + ⭐ | Model is exotui (window host). ⭐ the **configurable border style** and focus-by-color exceed exotui's standalone `Frame` (which only has sharp/rounded). Feed a `borderStyle`/token-driven focus look into `Frame` / the window-host chrome. |
| **Title bar + title text** (`app.ts:3400`) | Hand-drawn from `createWorkbenchTitlebarLayout`; adds placement glyph + baked-in `[SCROLL]` / `[NO MOUSE]` state tags | ✅ + ⭐ | Titlebar layout is exotui. ⭐ the **live state tags** in the title are an exomux idea the workbench titlebar could adopt as first-class "status adornments". |
| **Double-click title bar → maximize** (`app.ts:1628`, `titleBarWindowAt` `app.ts:5233`) | exomux-added gesture over the hand-drawn title bar | ⭐ | Pure back-feed: **the window host should own double-click-to-maximize** so every consumer gets it, not just exomux. |
| **Titlebar buttons** close/min/max/restore/**config** (`app.ts:3415`) | Rects/labels/**tones** from the workbench titlebar projection; hand-painted | ✅ + 🔧 | Buttons themselves are exotui (projection). 🔧 **exomux drops the projection's `tone` metadata** — only `close` is specially danger-colored; success/warning/muted for max/min/restore are ignored (`app.ts:3416`). Easy fix: honor `control.tone`. The **`config` button** is a clean use of the host's `windowConfigButton` extension point. |
| **Tiling separators** (`app.ts:3037`) | Hand-drawn fills from `projection.separators`; drag-resize by the host | ✅ | Window host owns it. |
| **Snap preview** (`app.ts:3072`) | Hand-drawn dotted frame from `projection.snapPreview` | ✅ | Window host projection. |
| **Window switcher** (`paintSwitcher` `app.ts:3685`) | Hand-drawn `#`-framed list from `projection.switcher` | ✅ | Window host projection; hand-painted list overlay. |

---

## 3. Panels & terminal content

| Control | Rendering | Verdict | Rationale |
|---|---|---|---|
| **Sessions panel** (`paintSessionManager` `app.ts:3514`) | Hand-drawn selectable list: selection marker, `[LIVE]`/`[HOLD]` status tags, opaque-accent selected row, unselected rows drawn **through the window ground** (transparency), selection-following scroll | 🔧 **(high)** + ⭐ | It is a selectable list and should be a **composited `List`/`Table`** (exactly like the settings pickers). Converting it also **fixes the wheel-changes-selection bug you just hit** — the real `List` scrolls its viewport without moving the selection. ⭐ back-feed: **row transparency (render through a ground), status-tag columns, and the opaque-selected block** are richer than today's `List`/`Table`. |
| **Network panel** (`paintNetworkPanel` `app.ts:3464`) | Hand-drawn **tree** via `controller.networkTree` (`visible/selected/move/toggleActive`, `TreeRow`, depth-0 headings, fold/unfold, online/offline, `note:` rows, open/spawn/ssh activation) | 🔧 **(high)** + ⭐ | It is a tree and exotui has a real **`Tree`** component. Should be a composited `Tree`. ⭐ back-feed: **per-node status (online/offline), metadata, `note` rows, and pluggable activation** (open session / spawn shell / SSH) are all things `Tree`/`FileExplorer` lack. |
| **Terminal window content** (`paintTerminal` `app.ts:3588`) | Hand-painted cell grid from the PTY screen model: xterm-256 palette + WCAG contrast lift (`terminal_palette.ts`), dim-inactive, transparency blend, inverted cursor cell, bottom warning line | 🆕 **+ ⭐ (big)** | exotui has **no terminal-screen renderer** (only the line-oriented `TerminalOutput` *controller*). This is exomux's crown jewel. Back-feed a real **`TerminalScreen` component** + the **`terminal_palette` contrast utilities** — broadly useful to any TUI embedding a PTY. |
| **Text cursor** (inverted cell, `app.ts:3624`) | Part of terminal rendering | 🆕 | Belongs with the `TerminalScreen` back-feed above. |
| **Warning line** (terminal bottom row, `app.ts:3651`) | Hand-drawn `! {warning}` | 🔧 *(low)* | A one-line inline status; `StatusBar`/`Text` would cover it, but it is trivial. |
| **Status line / footer** | **Does not exist** (`FOOTER_ROWS = 0`); `controller.status` only feeds reactivity | — | Deliberately removed; the prefix cue moved onto the start button. Nothing to classify — but if a status line returns, exotui **`StatusBar`** is the component. |

---

## 4. Modals & menus (all hand-drawn via `DesktopPainter`)

exotui ships a real **`Modal` + `ModalController`** (title, body, `tone` info/confirm/success/warning/error,
`actions[]` with `default`/`destructive`/`disabled`, `closeOnEscape`, `onAction`) and **`bindModalFocus`**. Almost
none of exomux's modals use it.

| Modal / menu | Controls | Verdict | Rationale |
|---|---|---|---|
| **Start-menu dropdown** (`paintStartMenu` `app.ts:3112`) | 6 command rows incl. a `danger` Quit; anchor-aware placement, cursor-anchored on right-click | 🔧 + ⭐ | It is a **`ContextMenu`** (selectable list, disabled/separator support). Should be composited. ⭐ back-feed: **danger/destructive item tone** and **cursor-anchored, clamped-on-screen placement** to `ContextMenu`. |
| **Kill confirmation** (`paintKillConfirmation` `app.ts:3758`) | Title, detail, `[ Cancel ]`, `[ Kill ]` (danger) | 🔧 **(high)** + ⭐ | Textbook **`Modal`** with a destructive action. ⭐ back-feed: **`modalButtonRects` responsive stacking** (buttons stack vertically when the box is narrow, reducing mis-hits on the destructive choice) — the exotui `Modal` doesn't do this. |
| **Quit modal** (`paintQuitModal` `app.ts:3795`) | Title, detail, `[ Cancel ]` / `[ Detach ]` (accent) / `[ Terminate ]` (danger) | 🔧 **(high)** | Three-action **`Modal`** (mixed accent + destructive tones). |
| **SCP modal** (`paintScpModal` `app.ts:4706`) | Title, detail, **hand-drawn masked password field** (`•` mask), `[ Cancel ]` / `[ Paste path ]` / `[ Send ]` | 🔧 **(highest clarity)** | **The clearest hack in the app.** exotui `Input` already does `password` masking, cursor, validator — but the field is plain painter text driven by `appendScpPassword`/`backspaceScpPassword` (`app.ts:2357`). Use a composited **`Input`** (like the session-name field already does) inside a **`Modal`**. |
| **Help modal** (`paintHelp` `app.ts:3719`) | 15 hand-drawn key-reference lines + `[ Close ]` | 🔧 *(med)* | exotui has **`KeyHelp`** (key-binding rows) and **`Markdown`**; wrap either in a **`Modal`**. |
| **Per-window config modal** (`paintWindowConfigModal` `app.ts:4631`) | Value rows (`> label` + right-aligned value, cycle-on-click), detail, `[ Reset ]`, `[ Close ]` — **hand-drawn, no composited widgets** | 🔧 **(high — inconsistency)** | The **same codebase** composites real `Cycler`/`CheckBox` in the settings window, but here reimplements value rows by hand. Should use the **composited option-control host** (`ExomuxSettingsOptions`) + a `Modal`. Straight consistency win. |
| **Background-config modal** (`paintBackgroundConfigModal` `app.ts:4114`) | Hand-drawn frame/title/header; **real composited `List` + `Cycler`/`CheckBox` + `Button`** (view-only) | ✅ *(controls)* + 🔧 *(container)* | The **right pattern** for the controls. Only the modal *frame* is hand-drawn — wrap it in **`Modal`** for the last mile. Good template for fixing the modals above. |

---

## 5. Composited exotui widgets — the good path (settings + background config)

All ✅. These prove the compositing pattern works end-to-end (async snapshot + hand-drawn fallback, geometry/theme
signature gating, two-way binding for the interactive ones).

| Widget | Component | Interactive? | File |
|---|---|---|---|
| Theme picker | `List` (`selectedStyle` + `scrollbar`) | Yes — click/scroll/keys forwarded, two-way bound to `themeId` | `settings_surface.ts:249` |
| Background picker | `List` | Yes — bound to `backgroundId` | `settings_surface.ts:259` |
| Settings option rows | `Cycler` / `CheckBox` | View-only (routing cycles the value) | `settings_options.ts:96,104` |
| "Background config" / "Close" buttons | `Button` | View-only (routing handles clicks) | `settings_widgets.ts:89` |
| Session-name field | `Input` (validator, cursor) | Yes — typeable, forwarded | `session_name_field.ts:141` |
| Background preset/image list | `List` (custom `markerFor`: `>` cursor, `·` active) | View-only | `background_list.ts:103` |
| Background option rows | `Cycler` / `CheckBox` | View-only | reuses `settings_options.ts` |
| Background "Close" button | `Button` | View-only | reuses `settings_widgets.ts` |

**Note (a real inconsistency worth fixing):** the settings pickers are *interactive* (real events synthesized via
`createTestMousePress/Scroll/KeyPress` and `component.emit`, plus two-way binding), while the option rows / buttons /
background list are *view-only* mirrors driven by controller routing. Two forwarding models coexist. Unifying on the
interactive model (forward real events into the components, bind their state) would delete a lot of the parallel
routing code.

---

## 6. Cursor, overlays & backgrounds

| Control | Rendering | Verdict | Rationale |
|---|---|---|---|
| **Block mouse cursor** `█` (`app.ts:3097`) | Hand-drawn at the tracked mouse cell; any-motion tracking (`\x1b[?1003h`) with a 1 s keepalive | 🆕 + ⭐ | No exotui equivalent. Back-feed a **software cursor overlay + an any-motion-tracking helper** (mode-1003 enable/keepalive/teardown) — useful to any app that wants a drawn pointer. |
| **Animated backgrounds** (metaballs, butterchurn, matrix, fire, ivy, circuit, rainy-windows, skull, vaporwave, turbulence, image…) | Hand-drawn / GPU fields rasterized to cells | 🆕 + ⭐ | exotui has `ThreeAscii` (3D) but no 2-D animated-field library. Back-feed an **`AnimatedBackground` family** — the **butterchurn GPU (WebGPU/WGSL) pipeline** especially is a large, reusable asset. |
| **`ExomuxWidgetSurface` compositing pattern** (`widget_surface.ts`) | Headless `Tui` + `MemoryCanvasSink` → off-screen render → `rawCell` blit with async snapshot + fallback | 🆕 + ⭐⭐ | **The highest-leverage back-feed.** Any app compositing real components into its own retained grid (games, dashboards, custom canvases) wants this. Promote it to an exotui **`WidgetSurface` / `CompositeSurface`** utility, with the snapshot/fallback machinery built in. |

---

## Scoreboard

| Verdict | Count (approx.) | Where |
|---|---|---|
| ✅ Driven by exotui | ~15 | All window-host chrome (frame, titlebar, separators, snap, switcher, taskbar layout) + all 8 composited settings/background widgets |
| 🔧 Hack — component exists | ~9 | Sessions panel, network panel, start menu, kill/quit/scp/help/window-config modals, titlebar tones, (minor: start/quit buttons) |
| 🆕 No exotui equivalent | ~4 | Terminal screen renderer, block cursor, animated backgrounds, the widget-surface pattern |
| ⭐ exomux is richer (back-feed) | ~10 overlaps | Terminal palette/contrast, list transparency, tree status/activation, modal button stacking, menu danger tone, prefix indicator, state-tag titles, double-click maximize, backgrounds, widget surface |

Your instinct is right: **a lot should flow back to exotui.** The panels/modals are 🔧 *and* ⭐ at once — they should
adopt an exotui component **and** hand it new capabilities on the way up.

---

## Back-feed roadmap (highest leverage first)

1. **`WidgetSurface` / `CompositeSurface` in exotui** ⭐⭐ — promote `ExomuxWidgetSurface` (headless render → `rawCell`
   blit → async snapshot + fallback). Unlocks every other composited-component migration below and helps any app with
   a custom retained grid. *Foundational.*
2. **`TerminalScreen` component + `terminal_palette` utilities** 🆕⭐ — a real PTY cell-grid renderer with xterm-256,
   WCAG contrast lift, dim-inactive, transparency, cursor. exotui only has line-level `TerminalOutput` today. Biggest
   net-new capability.
3. **Richer `List` / `Table`** ⭐ — transparency (render rows through a ground), status/tag columns, opaque-selected
   block. Then **convert the Sessions panel to a composited `List`/`Table`** — which *also fixes wheel-changes-
   selection* for free.
4. **Richer `Tree`** ⭐ — per-node status (online/offline), metadata, `note` rows, pluggable activation. Then
   **convert the Network panel to a composited `Tree`.**
5. **`Modal` upgrades + migrate the dialogs** ⭐🔧 — add responsive button stacking (`modalButtonRects`), then move
   Kill / Quit / SCP / Help / Window-config onto `Modal` + `ModalController`. The **SCP password field → `Input`
   (password)** is the single clearest, smallest, highest-clarity fix; do it first as a proof point.
6. **`ContextMenu` upgrades + migrate the start menu** ⭐🔧 — destructive-item tone + cursor-anchored clamped
   placement, then composite the start menu on it.
7. **Window-host niceties** ⭐ — double-click-to-maximize, title "status adornments", honoring `control.tone` on the
   titlebar buttons (a bug in exomux today), configurable border style.
8. **`AnimatedBackground` family + software block cursor / any-motion helper** 🆕⭐ — package exomux's fields
   (incl. the butterchurn GPU pipeline) and the drawn-cursor/mode-1003 tracking as reusable exotui features.

### Straight bug/consistency fixes inside exomux (no new exotui work)

- Honor `control.tone` when painting titlebar buttons (max/min/restore currently lose their success/warning/muted
  colors — `app.ts:3416`).
- Make the **per-window config modal** use the composited `Cycler`/`CheckBox` host it already has, instead of
  hand-drawing value rows — the settings window and this modal disagree today.
- Unify the two compositing-forwarding models (interactive vs view-only) on the interactive one to delete parallel
  routing code.
