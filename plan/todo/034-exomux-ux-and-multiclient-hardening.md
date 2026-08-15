# Exomux UX + Multi-Client Hardening

Status: specified Aug 15 2026 from user field reports (screenshots on file); **P0 — the next work block**, ahead of
035–037. Seven items, ordered by the user's pain: the resize ghosting first, then window-behavior and contrast fixes,
then the two session-model features.

## UX-001 — Resize ghosting in the settings window (P0 bug, repro in hand)

**Repro (user, Aug 15):** grab a corner of the settings window, resize it as small as it allows, release; grab again,
resize as large as it allows, release. Stale picker rows (selection bars at old positions, horizontally-shifted
fragments like `> fire *`) persist inside the window. Reproduced across two themes/terminals; matches the Aug 14
ghost report (031 "Open bug" section) which had no repro then.

**What Aug 14's investigation established:** the canvas frame buffer stays correct in every headless reproduction
(racing clicks, mid-flight resizes), `Canvas.rerenderAll()` clears retained state, and `WidgetSurface.render()` now
converges on deferred draws — so the ghosts live between the canvas and the physical terminal (the stdout diff), or
in frames that were simply never painted. **User hypothesis, which fits both:** repaint is not triggered on every
resize tick — cells the shrinking window uncovers are never repainted beneath it, and the diff layer then believes
they are already correct forever after.

**Plan:** (a) reproduce headlessly with the exact recipe — corner-drag gestures via the window host's interaction
path (not `set-placement`, which the Aug 14 attempts used and which may skip the per-tick path the bug needs), read
the frame buffer after *each tick*; (b) make every resize/move interaction tick bump the desktop render revision
(and, while a geometry gesture is active, force the desktop draw object's full-paint path so uncovered cells repaint
— the diff can't be trusted across geometry churn); (c) confirm with the user whether `Ctrl-N l` (prefix-l full
repaint) clears the ghosts live — if yes, the diff-desync theory is confirmed and (b) is the right shape; if no, the
canvas itself holds them and the headless repro will show it.

## UX-002 — Responsive settings layout: stack the pickers when narrow (P1)

On narrow desktops (mobile) there is not enough horizontal room for the Theme and Background list boxes side by
side. Below a width threshold, `exomuxGlobalConfigLayout` should stack them **vertically** (Theme above Background),
and the **Background-config button moves to sit directly below the background listbox** (instead of the bottom row).
Hit-testing, wheel routing, and the composited-picker regions all read the same layout function, so this is one
layout change plus tests at narrow widths.

## UX-003 — Settings/Sessions/Network behave like regular windows (P1)

The settings window forces itself on top; sessions and network have similar special-casing. All three should behave
like any other floating window: normal z-order (raise on focus only), no always-on-top pinning, normal stacking
against terminals. Audit `EXOMUX_SETTINGS/SESSIONS/NETWORK_WINDOW_ID` special cases in the window-host wiring
(spawn/raise paths) and remove the forced-top behavior.

## UX-004 — Titlebar text/control contrast (P1)

In some themes the titlebar button tones (restore/maximize from WS-011) and the title text read poorly against the
active accent bar (screenshots: pink bar, near-invisible `[v]`/`[M]`). **User direction: use the main theme
foreground colour for window titles** (e.g. black in the screenshots) rather than theme.background-on-accent.
Apply the same rule to the titlebar buttons: default them to the theme foreground, keeping only the close button's
danger tone (and any tone that passes a contrast check against the actual bar colour — the WCAG lift helper from
`terminal_palette` is available library-side).

## UX-005 — X button on an exited window performs kill (P1)

Clicking the titlebar ✕ on a window whose process has exited does nothing. It should perform the kill action
(remove the dead session/window) instead of being unresponsive — dead windows must always be closable with one
click, no confirmation needed since there is no process to lose.

## UX-006 — Sessions window lists host exomux sessions (P2 feature)

The sessions panel currently lists terminal windows in the current exomux session. The user wants it to list the
**exomux sessions running on the current host** (the tmux-like model: `--list-sessions` data — name, age, terminal
count, foreground commands) and allow switching between them from the panel. Design: two sections (this session's
terminals; other host sessions with an attach/switch action), or a top-level session switcher above the terminal
list. Switching means detach-current + attach-selected on the same client connection.

## UX-007 — Multi-client live window sync (P2 bug/feature)

Two clients attached to the same exomux session do not see each other's window opens/closes in real time — a client
only picks up new windows on reconnect. The host must broadcast session-topology changes (window/session
opened/closed/renamed) to every attached client, and clients must reconcile their window set on that event rather
than only at attach. Check the host protocol for an existing session-update event (the taskbar's session summaries
update — the gap may be window-set reconciliation client-side).

## Verification

- UX-001: headless corner-drag repro test (frame-buffer scan per tick), plus the user's live confirm; the fix gets a
  regression test driving the actual interaction path.
- UX-002: layout tests at narrow widths (stacked rects, button placement), plus a composited-picker test at a narrow
  size.
- UX-003–005: app-level tests (z-order after focusing settings; titlebar foreground assertions per theme; click-✕ on
  an exited session removes it).
- UX-006/007: host protocol tests with two fake clients (session list contents; topology-change broadcast observed
  by the second client).
