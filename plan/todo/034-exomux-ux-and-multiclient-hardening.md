# Exomux UX + Multi-Client Hardening

Status: specified Aug 15 2026 from user field reports (screenshots on file); **P0 — the next work block**, ahead of
035–037. Ten items, ordered by the user's pain: the resize ghosting first, then window-behavior and contrast fixes,
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

## UX-008 — Global debug mode capturing warnings and errors (P0 tooling, user, Aug 15)

The existing debug logging is butterchurn-only (`debug_log.ts`, opened by the butterchurn "Debug overlay" setting).
Promote it to a **global settings toggle**: when on, open one logger (`logs/exomux-<timestamp>.log` under the working
directory), tee the JS `console` methods, capture global `error`/`unhandledrejection` events, and route
`exomuxDebugLog(category, message)` callers there — so any warning or error anywhere in the desktop lands in the
file instead of vanishing (or corrupting the full-screen TUI). This is also the evidence channel for UX-001 on the
user's machine. Every filesystem touch stays guarded (missing `--allow-write` degrades to a no-op), and the status
line should say where the log went when the toggle turns on.

## UX-009 — Ghostty shader manager window (P2 feature, user, Aug 15)

Break the Ghostty-specific shader settings out of the global settings window into **their own window, launched from a
button in settings** (the way "Background config" opens its own surface). The inline shader rows the settings options
pane carries today (CRT scanlines: depth/flicker/pulse; CRT pincushion: distortion — surfaced via
`controller.shaderOptionRows()`, Ghostty-only) move into it. The window must support:

- **Add or remove custom shaders** — Ghostty `custom-shader` config entries pointing at user GLSL files; order is
  preserved since Ghostty applies shaders in sequence.
- **Enable or disable existing shaders** individually without removing them.
- **Tweak settings for shaders that have hooks** — shaders registered with parameters (the `EXOMUX_SHADER_PARAMS`
  machinery in `packages/exomux/ghostty.ts`, e.g. pincushion `magnitude`) get value controls; hookless shaders get
  only the enable toggle.

Build on the proven composited-surface pattern (`ExomuxSettingsOptions`/`ExomuxSettingsWidgets`/list hosts, as the
background-config modal does), and route config changes through the existing Ghostty config rewriting in
`ghostty.ts`. Note the pincushion pointer-warp precedent (`exomuxPincushionSource`): any shader that displaces the
display may need a matching pointer-transform hook.

## UX-010 — VHS distortion shader with per-effect intensities (P2 feature, user, Aug 15)

Ship a VHS distortion shader for Ghostty, registered through `EXOMUX_SHADER_EFFECTS`/`EXOMUX_SHADER_PARAMS` so the
shader manager (UX-009) and the param system pick it up automatically. **One intensity setting per effect**, mixable
independently:

1. **Tracking errors** — horizontal bands of noise, tearing, or jumping images (tape/video-head misalignment).
2. **Color bleeding (chroma shift)** — red/green/blue channels separating and bleeding past the edges of objects.
3. **Static and snow** — random white and black flecks or fuzz layered over the video signal.
4. **Jitter and wavy lines** — horizontal shifting or warping of the top and bottom of the frame.
5. **Luma noise** — grainy or sandy texture in the dark areas of the picture.

The shader ships as a GLSL file exomux writes and points Ghostty at, the same mechanism the CRT scanline/pincushion
shaders use; intensities flow through shader params into the Ghostty config. The jitter/wavy-line displacement is a
display distortion — evaluate whether it needs a pointer-transform hook like the pincushion's before enabling it by
default.

## Verification

- UX-001: headless corner-drag repro test (frame-buffer scan per tick), plus the user's live confirm; the fix gets a
  regression test driving the actual interaction path.
- UX-002: layout tests at narrow widths (stacked rects, button placement), plus a composited-picker test at a narrow
  size.
- UX-003–005: app-level tests (z-order after focusing settings; titlebar foreground assertions per theme; click-✕ on
  an exited session removes it).
- UX-006/007: host protocol tests with two fake clients (session list contents; topology-change broadcast observed
  by the second client).
- UX-009: shader-window tests under a fake Ghostty environment — add/remove/enable round-trips the config file,
  param edits rewrite the shader values, non-Ghostty hides the launcher button.
- UX-010: the five intensity params register, persist, and rewrite the shader config; the GLSL compiles under
  Ghostty's shader contract (manual check on the user's machine for the visual pass).
