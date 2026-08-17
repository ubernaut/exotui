# Demo QA pass — drive and visually inspect every demo

Status: complete, August 17 2026 — sweep covered every target; all 25 findings closed (21 fixed, 4 by-design/invalid).
User direction: "go through every single exotui demo and visually check it and also drive it to search for issues. I
think you'll find a lot."

Method: every interactive demo runs in an isolated tmux socket (`tmux -L exotui-qa`, 140×40), settled, captured, driven
with its own advertised keys, re-captured, and quit; report-style demos run to stdout with exit codes and stderr
checked. Frames are read, not just diffed. Findings land here with repro keys; fixes follow slice discipline.

## Targets

Interactive: api-workbench, monitor, neon-exodus, showcase, workspace-launcher, actions, app-shell, command-search,
dashboard, data-query, form, pipeline, polygons, resource, runtime-workloads, table-selection, terminal-command,
theme-bindings, theme-engine-commands, theme-engines, theme-pipeline, theme-resolver, theme-workspace, window-manager,
worker, terminal-app, demo, three-ascii, exomux.

Reports: adopter, batteries, capabilities, components, gallery, layout-recipe, plugins, theme-gallery, theme-manifest,
api-inventory, benchmark, health (separately — it is the long gate).

## Findings

### app-shell (`./visualization app-shell`, 140×40)

- [x] **QA-001 (P1)** Route header is stale: pressing `2`/palette navigation changes the route (stepper, radio, and
      toasts all agree) but the title bar stays "Deno TUI app shell / Overview" and the summary line stays "Route:
      Overview". Repro: launch, press `2`.
- [x] **QA-002 (P1)** Closing the command palette leaves ghost rows: after `p`, type `over`, Enter — palette region
      keeps "`> over`" / "`> Go to Overview`" fragments and the stepper renders "Runtimeme" (stale-width residue).
- [x] **QA-003 (P2)** The main frame's right border only renders on ~4 of 30 rows; the rest are blank or overdrawn by
      the right-hand panels.
- [x] **QA-004 (P2)** Context menu (`c`) opens flush against the right screen edge: no frame, items clipped by the edge,
      floating "──" separator.
- [x] **QA-005 (P3)** Right-panel copy hard-clips mid-word with no ellipsis ("without co", "trap a", "can ren").

### dashboard

- [x] **QA-006 (P2)** Bar-chart labels collide with the legend: rows render "sample 60synthetic metrics" — two strings
      jammed together with no separator.
- [x] **QA-007 (P2)** The sparkline pads its right ~60% with a constant flat tail (uninitialized window fill) — persists
      across live updates; also ~24 blank rows below the two widgets.

### monitor

- [x] **QA-008 (P1)** Enter on a focused pane sets the header to "LAYOUT SINGLE(MONITOR)" but the tiled grid stays fully
      visible — nothing maximizes.
- [x] **QA-009 (P3)** Help modal's top border is unfilled between "╭─HELP" and "─╮" (gap instead of ─ fill); one item
      clips mid-word ("ORDE").
- [x] **QA-010 (P3)** CPU legend columns go ragged when percentages vary in width (9.9% vs 15.0%).

### polygons

- [x] **QA-011 (P1)** Esc does not exit although the header advertises "Esc / Ctrl+C to exit" (Ctrl+C works).
- [x] **QA-012 (P2)** Long preset values overflow the controls panel and eat its right border ("OpenTUI Blocks");
      shorter values fit.
- [x] **QA-013 (P3)** `M` (header: "M controls") does not hide the controls panel.

### showcase

- [x] **QA-014 (P2)** Panel title collides with status badges when width is tight: the THREE section renders "WIREFRAME
      LATTICE CHA NOISE WARN" — title hard-clipped mid-word, jammed against the badges with no separator. The same
      title/badge pair fits fine at neon-exodus panel widths. Filter+maximize+quit all work.

### api-workbench

- [x] **QA-015 (P1)** Escape is dead app-wide: it does not close menu dropdowns (File, Panels), does not exit F6 layout
      mode (only F6 does), and does not cancel the THREE RENDERER CONFIG dialog (the activity log records no cancel on
      Esc; only `G` toggles it closed).
- [x] **QA-016 (P1)** Toggling a panel from the Panels dropdown moves focus to the spawned panel and orphans the
      still-open dropdown: F10 and Escape no longer dismiss it; only an unrelated arrow-key interaction clears it. The
      menubar highlight (`[Panels]`) also stays bracketed after the dropdown is gone, and `[File]` renders bracketed at
      launch while focus is actually on the workspace.
- [x] **QA-017 (P2)** The status bar's left segment hard-clips mid-word against the keymap hints ("diag 2 wa") when the
      focus label lengthens (e.g. the "LAYOUT · " prefix); no ellipsis, no reflow.
- [x] **QA-018 (P3)** THREE panel stats row reports "rows 34/33" — the row counter exceeds its own capacity denominator
      (off-by-one or stale denominator after retile).
- [x] **QA-019 (P2)** No keyboard quit: the status bar advertises no quit key and `q`/Ctrl+Q do nothing; only the mouse
      `[x]` or Ctrl+C exit.
- [x] **QA-020 (P3)** Advertised hints are inert or context-dependent: `N` ("panels") produces no visible effect and
      logs nothing; `G` ("config") only works while a Neon 3D panel has focus but is advertised globally.

### neon-exodus

- [x] **QA-021 (P2)** "ESC,T RETURN" is half-false in the maximized view: Esc does not return to the grid (T does).
      Everything else driven works: arrows, 1–5 filters, Enter/F maximize, B/G/M styles, O/W/E suites, Q exits 0.

### workspace-launcher

- [x] **QA-022 (P3)** Preview-card caption wraps out of its column: the Three ASCII card renders the two-column
      art|caption row "…##== | glyph style:" and then "mixed-best" flush-left on the next row instead of aligned under
      the caption column. Everything else driven works: Enter open, F fullscreen, M hide, R restore, Esc cancels the
      quit modal, Q→Y exits 0.

### terminal-app (`deno task terminal-app`)

- [x] **QA-023 (P3)** Space does not activate the focused button (Enter does; two Space presses leave Count at 0) —
      standard button-activation convention, relevant to the accessibility story. R reset and Q quit work.

### three-ascii

- [x] **QA-024 (P1)** Esc does not exit although the header advertises "Esc / Ctrl+C to exit" (tested with the controls
      panel open and hidden; Ctrl+C works). Same class as QA-011.
- [x] **QA-025 (P2)** Preset value "OpenTUI Blocks" overflows the controls panel and eats its right border; shorter
      values ("Glyph Atlas") fit. Same class as QA-012.

### window-manager

Print-and-exit report, not interactive: transcript coherent (tiling, overlay z-order, modal hit-testing, outside-click
close, tree selection), exit 0. No findings.

### exomux

Not driven in the harness, deliberately: launching `./visualization exomux` connects to the user's persistent PTY state
— the restored layout included a live `tmux attach` client into the user's real tmux server, so any keystroke would land
in their live session and the extra 140×40 client constrains their session size. The QA client was killed without
sending keys; the user's client survived untouched. Exomux visual QA stays on the user's machine (see butterchurn/GPU
debugging notes).

## Sweep status

All targets covered: 9 report demos clean; print-demo transcripts coherent; interactive demos driven above. Recurring
themes across findings: Escape-deadness (QA-011/015/016/021/024), border/label overflow at narrow widths
(QA-004/005/012/014/017/025), stale indicators (QA-001/002/016/018). Fix phase next.

## Fix log

- Dedup: polygons and three-ascii are launcher aliases for the same demo (examples/three_ascii.ts), so QA-011≡QA-024 and
  QA-012≡QA-025.
- **Root cause of the whole Escape family** (QA-011/015/016-dismissal/021/024): the input reader held a lone ESC byte in
  its incomplete-sequence remainder forever — `nextInputBoundary` returns null for ESC-at-end and there was no timeout
  flush, so Escape either never arrived or fused with the NEXT key into a fake alt-chord (which also made the key after
  Escape appear dead). Fixed in `src/input_reader/mod.ts`: when the remainder is non-empty, the next read races a 40 ms
  flush window; on timeout the pending tail is decoded as-is (`decodeBuffer(…, flush)`), delivering a real `escape`
  keypress. Two regression tests added. Verified live in three-ascii (Esc exits, status 0), api-workbench (Esc closes
  dropdowns, exits F6 layout mode, cancels the THREE config dialog, dismisses the orphaned Panels dropdown after
  focus-steal), and neon-exodus (Esc returns from maximize).
- QA-013: the demo's key handler bailed on `shift` and compared lowercase only, so the advertised capital `M` (and any
  shifted letter) was dead; keys now normalize case and only bail on ctrl/meta. Esc/x route to destroy.
- QA-012/025: control-panel values now right-align inside the panel interior and clamp, so long values can no longer eat
  the frame border.
- QA-016 residue: the workbench menubar highlight was a fake focus indicator — `[File]` bracketed at launch, `[Panels]`
  lingering after dismissal. `renderHeader` now passes `menuActiveIndex: -1` unless the menu bar is focused or a
  dropdown is open.
- QA-017: `renderStatusBar` (both priorities) now ends truncated segments with an ellipsis instead of clipping mid-word;
  pinned expectations updated.
- QA-018 invalid: "rows 34/33" is changed-flush-rows vs rendered-three-rows — two different domains, and changed >
  rendered is an expected, tested state (see workbench_three_panel.test.ts "rows 54/17").
- QA-019 invalid: `q` opens the QUIT WORKBENCH? confirm modal and always did — the original repro pressed `q` while the
  stuck dropdown (the Escape bug) was swallowing keys, and the retest only checked pane death, not the modal.
  Narrow-width hint rows do advertise "Q quit"; the ≥132 hint row omits it (cosmetic).
- QA-020 invalid: `N` opens the panels dropdown from a clean state — the original press happened while the stuck
  dropdown was swallowing keys. `G` being gated to a focused Neon 3D window is by design (it configures that window).
- **Second core find — TextObject drops padding cells** (QA-001/002/003/006 all downstream): in `overwriteRectangle`
  mode, `rerender()` clamped painting to `valueChars.length` instead of the owned rectangle width, so queued cells in
  the padding zone were dropped — a shrinking value kept its old tail ("Widgetsw", "Runtimeme", log lines fusing into
  "sample 60synthetic metrics") and a moving text kept old cells ("PANELNEL"). Fixed in `src/canvas/text.ts`
  (ownedWidth + `?? " "`); minimal repros confirmed both primitives, and the live app-shell palette ghosts (QA-002)
  vanished with it.
- QA-001: demo bug on top — `app.routes.active()` peeks by design, so Computeds wrapping it never re-evaluated;
  app_shell now tracks `activeRouteId` via an `activeRoute` Computed.
- QA-003: demo layout off-by-one — the frame's outside-drawn right border sat exactly on `pane.second.column` where z2
  panels overdraw it; width `pane.width + 4` → `+ 3`. (The "staggered borders" chased mid-diagnosis were a
  byte-vs-column artifact of measuring UTF-8 capture output with `cut -c`/mawk — the border is one column.)
- QA-004: `renderContextMenuRows` now takes the menu width so separators span it (was `label.length + 2` → "──"), and
  app_shell wraps the context menu in a framed "Actions" Modal like the palette gets.
- QA-005 by design: the right-panel copy lives in a ScrollArea with `contentWidth 74` — a scrollable viewport clips at
  its edge; not a rendering defect.
- QA-006: same TextObject shrink-residue (log lines); no demo change needed, verified clean live.
- QA-007: `renderSparkline` now leaves the tail blank when the series is shorter than the width (was repeating the last
  value as a fake plateau). The blank rows below the widgets are the demo's fixed layout, not a bug.
- QA-008: demo bug — `WindowManagerController.layout()` peeks its own signals by design; the monitor's `workspaceLayout`
  Computed now tracks `windows`/`activeId`/`fullscreenId`, so Enter fullscreens immediately (verified live: single
  pane + tab strip).
- QA-009: menu width `+2` → `+4` (borders + padding cost 4; every line lost its last two chars, "ORDE"), and the menu
  title no longer pads to full header width (the padding blanked the top border between title and corner).
- QA-010: legend percents right-align to a fixed 5 columns so "9.9%"/"15.0%" cells stay one width.
- QA-014: PanelView reserves a 2-column gap before the alert badge and ellipsizes cropped titles ("WIREFRAME LATTICE C…
  NOISE WARN", verified live).
- QA-022: the launcher's three-ascii preview art now fits the ~40-column card so the art|caption columns stay aligned.
- QA-023: Button now activates on Space when focused (Return stays with keymaps to avoid double-fires); the active-state
  demotion makes every Space press fire (verified: 3 presses → Count 3).

All 25 findings closed: 21 fixed, 4 invalid/by-design (QA-005/018/019/020). Root + exomux suites green (3,364 + 434).
