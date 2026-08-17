# Demo QA pass — drive and visually inspect every demo

Status: in progress, August 17 2026. User direction: "go through every single exotui demo and visually check it and
also drive it to search for issues. I think you'll find a lot."

Method: every interactive demo runs in an isolated tmux socket (`tmux -L exotui-qa`, 140×40), settled, captured,
driven with its own advertised keys, re-captured, and quit; report-style demos run to stdout with exit codes and
stderr checked. Frames are read, not just diffed. Findings land here with repro keys; fixes follow slice discipline.

## Targets

Interactive: api-workbench, monitor, neon-exodus, showcase, workspace-launcher, actions, app-shell, command-search,
dashboard, data-query, form, pipeline, polygons, resource, runtime-workloads, table-selection, terminal-command,
theme-bindings, theme-engine-commands, theme-engines, theme-pipeline, theme-resolver, theme-workspace,
window-manager, worker, terminal-app, demo, three-ascii, exomux.

Reports: adopter, batteries, capabilities, components, gallery, layout-recipe, plugins, theme-gallery,
theme-manifest, api-inventory, benchmark, health (separately — it is the long gate).

## Findings

### app-shell (`./visualization app-shell`, 140×40)

- [ ] **QA-001 (P1)** Route header is stale: pressing `2`/palette navigation changes the route (stepper, radio, and
      toasts all agree) but the title bar stays "Deno TUI app shell / Overview" and the summary line stays
      "Route: Overview". Repro: launch, press `2`.
- [ ] **QA-002 (P1)** Closing the command palette leaves ghost rows: after `p`, type `over`, Enter — palette region
      keeps "` > over`" / "` > Go to Overview`" fragments and the stepper renders "Runtimeme" (stale-width residue).
- [ ] **QA-003 (P2)** The main frame's right border only renders on ~4 of 30 rows; the rest are blank or overdrawn
      by the right-hand panels.
- [ ] **QA-004 (P2)** Context menu (`c`) opens flush against the right screen edge: no frame, items clipped by the
      edge, floating "──" separator.
- [ ] **QA-005 (P3)** Right-panel copy hard-clips mid-word with no ellipsis ("without co", "trap a", "can ren").

### dashboard

- [ ] **QA-006 (P2)** Bar-chart labels collide with the legend: rows render "sample 60synthetic metrics" — two
      strings jammed together with no separator.
- [ ] **QA-007 (P2)** The sparkline pads its right ~60% with a constant flat tail (uninitialized window fill) —
      persists across live updates; also ~24 blank rows below the two widgets.

### monitor

- [ ] **QA-008 (P1)** Enter on a focused pane sets the header to "LAYOUT SINGLE(MONITOR)" but the tiled grid stays
      fully visible — nothing maximizes.
- [ ] **QA-009 (P3)** Help modal's top border is unfilled between "╭─HELP" and "─╮" (gap instead of ─ fill); one
      item clips mid-word ("ORDE").
- [ ] **QA-010 (P3)** CPU legend columns go ragged when percentages vary in width (9.9% vs 15.0%).

### polygons

- [ ] **QA-011 (P1)** Esc does not exit although the header advertises "Esc / Ctrl+C to exit" (Ctrl+C works).
- [ ] **QA-012 (P2)** Long preset values overflow the controls panel and eat its right border ("OpenTUI Blocks");
      shorter values fit.
- [ ] **QA-013 (P3)** `M` (header: "M controls") does not hide the controls panel.

### showcase

- [ ] **QA-014 (P2)** Panel title collides with status badges when width is tight: the THREE section renders
      "WIREFRAME LATTICE CHA NOISE WARN" — title hard-clipped mid-word, jammed against the badges with no
      separator. The same title/badge pair fits fine at neon-exodus panel widths. Filter+maximize+quit all work.

### api-workbench

- [ ] **QA-015 (P1)** Escape is dead app-wide: it does not close menu dropdowns (File, Panels), does not exit F6
      layout mode (only F6 does), and does not cancel the THREE RENDERER CONFIG dialog (the activity log records
      no cancel on Esc; only `G` toggles it closed).
- [ ] **QA-016 (P1)** Toggling a panel from the Panels dropdown moves focus to the spawned panel and orphans the
      still-open dropdown: F10 and Escape no longer dismiss it; only an unrelated arrow-key interaction clears it.
      The menubar highlight (`[Panels]`) also stays bracketed after the dropdown is gone, and `[File]` renders
      bracketed at launch while focus is actually on the workspace.
- [ ] **QA-017 (P2)** The status bar's left segment hard-clips mid-word against the keymap hints ("diag 2 wa")
      when the focus label lengthens (e.g. the "LAYOUT · " prefix); no ellipsis, no reflow.
- [ ] **QA-018 (P3)** THREE panel stats row reports "rows 34/33" — the row counter exceeds its own capacity
      denominator (off-by-one or stale denominator after retile).
- [ ] **QA-019 (P2)** No keyboard quit: the status bar advertises no quit key and `q`/Ctrl+Q do nothing; only the
      mouse `[x]` or Ctrl+C exit.
- [ ] **QA-020 (P3)** Advertised hints are inert or context-dependent: `N` ("panels") produces no visible effect
      and logs nothing; `G` ("config") only works while a Neon 3D panel has focus but is advertised globally.

### neon-exodus

- [ ] **QA-021 (P2)** "ESC,T RETURN" is half-false in the maximized view: Esc does not return to the grid
      (T does). Everything else driven works: arrows, 1–5 filters, Enter/F maximize, B/G/M styles, O/W/E suites,
      Q exits 0.

### workspace-launcher

- [ ] **QA-022 (P3)** Preview-card caption wraps out of its column: the Three ASCII card renders the two-column
      art|caption row "…##== | glyph style:" and then "mixed-best" flush-left on the next row instead of aligned
      under the caption column. Everything else driven works: Enter open, F fullscreen, M hide, R restore,
      Esc cancels the quit modal, Q→Y exits 0.

### terminal-app (`deno task terminal-app`)

- [ ] **QA-023 (P3)** Space does not activate the focused button (Enter does; two Space presses leave Count at 0)
      — standard button-activation convention, relevant to the accessibility story. R reset and Q quit work.

### three-ascii

- [ ] **QA-024 (P1)** Esc does not exit although the header advertises "Esc / Ctrl+C to exit" (tested with the
      controls panel open and hidden; Ctrl+C works). Same class as QA-011.
- [ ] **QA-025 (P2)** Preset value "OpenTUI Blocks" overflows the controls panel and eats its right border;
      shorter values ("Glyph Atlas") fit. Same class as QA-012.

### window-manager

Print-and-exit report, not interactive: transcript coherent (tiling, overlay z-order, modal hit-testing,
outside-click close, tree selection), exit 0. No findings.

### exomux

Not driven in the harness, deliberately: launching `./visualization exomux` connects to the user's persistent PTY
state — the restored layout included a live `tmux attach` client into the user's real tmux server, so any
keystroke would land in their live session and the extra 140×40 client constrains their session size. The QA
client was killed without sending keys; the user's client survived untouched. Exomux visual QA stays on the
user's machine (see butterchurn/GPU debugging notes).

## Sweep status

All targets covered: 9 report demos clean; print-demo transcripts coherent; interactive demos driven above.
Recurring themes across findings: Escape-deadness (QA-011/015/016/021/024), border/label overflow at narrow
widths (QA-004/005/012/014/017/025), stale indicators (QA-001/002/016/018). Fix phase next.
