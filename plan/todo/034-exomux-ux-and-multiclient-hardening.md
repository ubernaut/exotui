# Exomux UX + Multi-Client Hardening

Status: **UX-001 through UX-012 landed Aug 15 2026.** Still needs the user's live confirmation on the resize-ghost fix
(the corner drag recipe), the session switcher, and the Ghostty visual pass for the VHS shader and manager window — plus
a debug-log capture from a stuttering many-window run for UX-011's write-path evidence.

## UX-001 — Resize ghosting in the settings window (P0 bug) — **fixed Aug 15 2026**

> **Root cause found:** not a repaint gap — dropped terminal writes. A saturated pty accepts fewer bytes than
> `writeSync` offers, and raw-mode stdin shares the tty's non-blocking flag so writes can throw `WouldBlock`;
> `AnsiCanvasSink` ignored both, truncating the biggest frames (a resize storm) mid-escape — stale bars and shifted
> fragments on real terminals only, invisible to the in-memory harness. Every sink write now loops to completion with
> bounded stall retries, and a still-saturated terminal degrades the flush so the canvas forces a clean full repaint
> next render (self-healing). End-to-end regression: the interactive corner-drag recipe, with the emitted ANSI stream
> replayed through the terminal emulator and diffed against the frame buffer.

**Repro (user, Aug 15):** grab a corner of the settings window, resize it as small as it allows, release; grab again,
resize as large as it allows, release. Stale picker rows (selection bars at old positions, horizontally-shifted
fragments like `> fire *`) persist inside the window. Reproduced across two themes/terminals; matches the Aug 14 ghost
report (031 "Open bug" section) which had no repro then.

**What Aug 14's investigation established:** the canvas frame buffer stays correct in every headless reproduction
(racing clicks, mid-flight resizes), `Canvas.rerenderAll()` clears retained state, and `WidgetSurface.render()` now
converges on deferred draws — so the ghosts live between the canvas and the physical terminal (the stdout diff), or in
frames that were simply never painted. **User hypothesis, which fits both:** repaint is not triggered on every resize
tick — cells the shrinking window uncovers are never repainted beneath it, and the diff layer then believes they are
already correct forever after.

**Plan:** (a) reproduce headlessly with the exact recipe — corner-drag gestures via the window host's interaction path
(not `set-placement`, which the Aug 14 attempts used and which may skip the per-tick path the bug needs), read the frame
buffer after _each tick_; (b) make every resize/move interaction tick bump the desktop render revision (and, while a
geometry gesture is active, force the desktop draw object's full-paint path so uncovered cells repaint — the diff can't
be trusted across geometry churn); (c) confirm with the user whether `Ctrl-N l` (prefix-l full repaint) clears the
ghosts live — if yes, the diff-desync theory is confirmed and (b) is the right shape; if no, the canvas itself holds
them and the headless repro will show it.

## UX-002 — Responsive settings layout: stack the pickers when narrow (P1) — **done Aug 15 2026** (stacked below 52 columns, background-config button under the background list)

On narrow desktops (mobile) there is not enough horizontal room for the Theme and Background list boxes side by side.
Below a width threshold, `exomuxGlobalConfigLayout` should stack them **vertically** (Theme above Background), and the
**Background-config button moves to sit directly below the background listbox** (instead of the bottom row).
Hit-testing, wheel routing, and the composited-picker regions all read the same layout function, so this is one layout
change plus tests at narrow widths.

## UX-003 — Settings/Sessions/Network behave like regular windows (P1) — **done Aug 15 2026** (always-on-top pinning removed; raise on focus only)

The settings window forces itself on top; sessions and network have similar special-casing. All three should behave like
any other floating window: normal z-order (raise on focus only), no always-on-top pinning, normal stacking against
terminals. Audit `EXOMUX_SETTINGS/SESSIONS/NETWORK_WINDOW_ID` special cases in the window-host wiring (spawn/raise
paths) and remove the forced-top behavior.

## UX-004 — Titlebar text/control contrast (P1) — **done Aug 15 2026** (titles and all controls in the main theme foreground; supersedes WS-011 tone painting)

In some themes the titlebar button tones (restore/maximize from WS-011) and the title text read poorly against the
active accent bar (screenshots: pink bar, near-invisible `[v]`/`[M]`). **User direction: use the main theme foreground
colour for window titles** (e.g. black in the screenshots) rather than theme.background-on-accent. Apply the same rule
to the titlebar buttons: default them to the theme foreground, keeping only the close button's danger tone (and any tone
that passes a contrast check against the actual bar colour — the WCAG lift helper from `terminal_palette` is available
library-side).

## UX-005 — X button on an exited window performs kill (P1) — **done Aug 15 2026** (host only treats failed disposal as fatal while the process still runs; dead windows reap in one click)

Clicking the titlebar ✕ on a window whose process has exited does nothing. It should perform the kill action (remove the
dead session/window) instead of being unresponsive — dead windows must always be closable with one click, no
confirmation needed since there is no process to lose.

## UX-006 — Sessions window lists host exomux sessions (P2 feature) — **done Aug 15 2026** (HOST SESSIONS section with liveness/uptime/terminal counts; click-to-switch through the launcher's new client loop; keyboard switching deferred)

The sessions panel currently lists terminal windows in the current exomux session. The user wants it to list the
**exomux sessions running on the current host** (the tmux-like model: `--list-sessions` data — name, age, terminal
count, foreground commands) and allow switching between them from the panel. Design: two sections (this session's
terminals; other host sessions with an attach/switch action), or a top-level session switcher above the terminal list.
Switching means detach-current + attach-selected on the same client connection.

## UX-007 — Multi-client live window sync (P2 bug/feature) — **done Aug 15 2026** (host broadcasts session lifecycle to every authenticated client; controllers adopt unknown running sessions without stealing focus)

Two clients attached to the same exomux session do not see each other's window opens/closes in real time — a client only
picks up new windows on reconnect. The host must broadcast session-topology changes (window/session
opened/closed/renamed) to every attached client, and clients must reconcile their window set on that event rather than
only at attach. Check the host protocol for an existing session-update event (the taskbar's session summaries update —
the gap may be window-set reconciliation client-side).

## UX-008 — Global debug mode capturing warnings and errors (P0 tooling) — **done Aug 15 2026** (settings toggle; console + uncaught errors + unhandled rejections to logs/exomux-<time>.log, path in the status line)

The existing debug logging is butterchurn-only (`debug_log.ts`, opened by the butterchurn "Debug overlay" setting).
Promote it to a **global settings toggle**: when on, open one logger (`logs/exomux-<timestamp>.log` under the working
directory), tee the JS `console` methods, capture global `error`/`unhandledrejection` events, and route
`exomuxDebugLog(category, message)` callers there — so any warning or error anywhere in the desktop lands in the file
instead of vanishing (or corrupting the full-screen TUI). This is also the evidence channel for UX-001 on the user's
machine. Every filesystem touch stays guarded (missing `--allow-write` degrades to a no-op), and the status line should
say where the log went when the toggle turns on.

## UX-009 — Ghostty shader manager window (P2 feature, user, Aug 15) — **done Aug 15 2026** (own modal off a settings `[ s Shaders ]` button: builtin toggles + params, custom GLSL entries with enable/disable, Del remove, `[ ]` reorder, composited path input)

> **Landed:** the settings options pane carries global settings only again; a Ghostty-gated `[ s Shaders ]` button
> (bottom row, or next to Close when stacked) and the `s` key open a dedicated manager modal. It lists the builtin
> effect toggles and their param Cyclers (via `shaderManagerRows()`), then the custom `custom-shader` entries in chain
> order — Enter/←→ toggles or cycles, `a` opens a composited path Input (Enter adds enabled, Escape cancels), Del
> removes, `[`/`]` reorder with the selection following, and the heading row is skipped by navigation. All mutations
> flow through the same `#setShaderConfig` → `onShadersChanged` → `applyExomuxShaders` pipeline, so the GLSL files and
> `ghostty.conf` rewrite on every change. Non-Ghostty hides the button and inerts every entry point.

Break the Ghostty-specific shader settings out of the global settings window into **their own window, launched from a
button in settings** (the way "Background config" opens its own surface). The inline shader rows the settings options
pane carries today (CRT scanlines: depth/flicker/pulse; CRT pincushion: distortion — surfaced via
`controller.shaderOptionRows()`, Ghostty-only) move into it. The window must support:

- **Add or remove custom shaders** — Ghostty `custom-shader` config entries pointing at user GLSL files; order is
  preserved since Ghostty applies shaders in sequence.
- **Enable or disable existing shaders** individually without removing them.
- **Tweak settings for shaders that have hooks** — shaders registered with parameters (the `EXOMUX_SHADER_PARAMS`
  machinery in `packages/exomux/ghostty.ts`, e.g. pincushion `magnitude`) get value controls; hookless shaders get only
  the enable toggle.

Build on the proven composited-surface pattern (`ExomuxSettingsOptions`/`ExomuxSettingsWidgets`/list hosts, as the
background-config modal does), and route config changes through the existing Ghostty config rewriting in `ghostty.ts`.
Note the pincushion pointer-warp precedent (`exomuxPincushionSource`): any shader that displaces the display may need a
matching pointer-transform hook.

## UX-010 — VHS distortion shader with per-effect intensities (P2 feature, user, Aug 15) — **shipped Aug 15 2026** (all five effects registered through EXOMUX_SHADER_EFFECTS/PARAMS; realism follow-up tracked as UX-013)

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

## UX-011 — Terminal write-path telemetry in the debug log (P1 tooling, user, Aug 15) — **done Aug 15 2026**

The "many windows stutter but the CPU graph looks fine" report needs ground truth. The suspected limiter is the write
path between the canvas and the terminal (small kernel pty buffer + the terminal's parse/raster drain rate): since
UX-001 the sink loops writes to completion with bounded stalls, so saturation shows up as the single JS thread _waiting_
— dropped frames with an idle CPU — and past the 40ms budget as a degraded flush that forces a maximal full repaint next
frame. `AnsiCanvasSink` now counts, per window: frames flushed, bytes offered, `writeSync` calls, WouldBlock refusals,
short writes, total/max stall time, degraded flushes, and dropped bytes (`takeFlushTelemetry()` on the sink contract;
draining resets). While the global debug toggle (UX-008) is on, exomux drains the counters every 5s and logs one
fixed-format key=value line per active window under the `flush` category (plus a "since launch" baseline when the toggle
turns on) — greppable, plottable evidence of frames blocked on a saturated terminal.

## UX-012 — Resume leaves nested full-screen sessions blank until a manual resize (P1 bug, user, Aug 15) — **fixed Aug 15 2026**

**Report:** resuming a local session whose terminals run remote exomux instances (ssh → exomux on another host) shows
nothing usable until each remote window is manually resized; the user reads it as the desktop chrome not painting.
**Root cause:** the host retains a bounded raw-output ring per session (2MB / 2048 entries). A long-running full-screen
child paints diffs, so the ring's tail cannot reconstruct its screen; on reattach the `truncated` path clears the
client-side screen and replays fragments — a mostly blank window — and nothing asked the child to repaint. The manual
resize worked because it changed the pty size, and the SIGWINCH made the nested exomux repaint fully. **Fix:** a
truncated attach now schedules a repaint wiggle through the coalescing-safe resize drain — one genuinely different row
count, then the real geometry (an unchanged TIOCSWINSZ raises no SIGWINCH) — so full-screen children redraw themselves
immediately on resume; clean attaches send no wiggle. Applies to both the resume path and UX-007 adoption, which share
`#attachRuntime`. Headless repro confirmed the desktop chrome itself paints correctly with nested-exomux replays, so the
chrome half of the report needs the user's debug log (UX-011 flush lines plus any errors) from a live resume to rule out
a write-path component on the real terminal.

## UX-013 — VHS shader realism pass: tracking, static/snow, luma noise (P2, user, Aug 15) — **implemented Aug 16 2026, awaiting the user's visual verdict**

> **Landed:** tracking is now a thin sync-glitch band (1–4% of screen height) whose rows displace sharply in 2px
> scanline pairs, filled with horizontal 24px streak segments and a bright seam on its lower edge — all geometry in
> fixed pixel units so a resize changes nothing. Static/snow became discrete short-lived 2×2px flecks with density fixed
> per area; luma noise became 2×2px film grain cross-faded between two hash frames (shimmer, not strobe) with a
> quadratic dark-area falloff. Color bleeding and jitter/wavy lines are untouched per the user's verdict.

User verdict after the hash fix: **color bleeding and jitter/wavy lines look great**; the other three artifacts do not.
Tracking errors, static/snow, and luma noise either look unrealistic ("shitty") or break when the screen size changes.
Make a dedicated pass over those three effects in `generateExomuxShader`'s vhs branch:

- Tracking errors: the torn band should read as a horizontal sync glitch (displaced scanline band with hash fill and a
  bright seam), not a smooth smear; verify band position/height stay sane across resizes (iResolution-derived quantities
  must be resolution-independent).
- Static/snow: discrete short-lived flecks, not per-pixel confetti; density and fleck size must not change with window
  size (scale sampling by a fixed cell/angular size rather than raw fragCoord).
- Luma noise: film-like grain in dark areas — likely needs temporal smoothing (blend two hash frames) and a gentler
  response curve; confirm it does not shimmer or re-pattern on resize.
- Test on the user's machine across min→max resize; the Aug 15 screenshot (huge window, woven texture) is the regression
  reference.

## UX-014 — Settings listbox: stale duplicate selection bars (P1 bug, user, Aug 16) — **root cause found and fixed Aug 16 2026 (second pass), awaiting the user's confirmation**

> **Second pass (the real fix):** the user's follow-up screenshot — bars accumulating in _three different themes'_
> accent colors, worsening with every click — reproduced headlessly once theme clicks (which remount the composited
> pickers) interleaved with scrolls. Two compounding one-line library bugs: (1) `DrawObject.draw()` re-registered an
> already-registered object on every visibility recomputation, and `erase()` removes only one entry, so the twin kept
> painting its frozen frame forever; (2) `Component.destroy()` iterated `children` while each child spliced itself out
> of that array, so **every other child survived destroy** with live draw objects. Both fixed (idempotent registration;
> snapshot iteration), plus two hardening fixes surfaced en route: `Text.draw()` now calls `super.draw()` (its `#drawn`
> latch never set, inviting repeated draws), and the List's selection highlight destroys its predecessor instead of
> orphaning it. Regression guards: `tests/list_teardown.test.ts` (object counts pinned across scroll/destroy/remount)
> and exomux `tests/picker_churn.test.ts` (the click/scroll churn). The earlier settledness fix below remains correct
> but was not the cause. **Not** fixable by terminating the host — the client renders; reinstall picks the fix up.

**Report + screenshot:** after wheel-scrolling the theme/background pickers, the selection bar appears twice — the live
row plus a stale bar frozen at the old screen position (the screenshot shows "Unit-01 Signal" and "jungle *" each
rendered at two rows), stuck until the next interaction. **Root cause:** the composited `WidgetSurface.render()`
convergence loop has a pass cap; when deferred List redraws outlast it (slow machine, rapid scrolls), the loop used to
exit silently with a half-applied buffer, the host cleared its dirty flag, and nothing ever re-rendered — the mixed
frame (old window rows + new window rows) froze on screen. Headless repro converges (fast machine), matching the UX-001
pattern of environment-dependent timing. **Fix:** `render()` now reports settledness; every composited host (pickers,
options, widgets, input fields, session list, network tree, start menu, background list) stays dirty on an unsettled
render — or refuses to commit its snapshot signature — so another pass always replaces the mix. The pass cap also rose 6
→ 8.

## Verification

- UX-001: headless corner-drag repro test (frame-buffer scan per tick), plus the user's live confirm; the fix gets a
  regression test driving the actual interaction path.
- UX-002: layout tests at narrow widths (stacked rects, button placement), plus a composited-picker test at a narrow
  size.
- UX-003–005: app-level tests (z-order after focusing settings; titlebar foreground assertions per theme; click-✕ on an
  exited session removes it).
- UX-006/007: host protocol tests with two fake clients (session list contents; topology-change broadcast observed by
  the second client).
- UX-009: shader-window tests under a fake Ghostty environment — add/remove/enable round-trips the config file, param
  edits rewrite the shader values, non-Ghostty hides the launcher button.
- UX-010: the five intensity params register, persist, and rewrite the shader config; the GLSL compiles under Ghostty's
  shader contract (manual check on the user's machine for the visual pass).
- UX-011: sink tests count bytes/stalls/WouldBlocks under a throttled stdout and degraded flushes/dropped bytes under a
  saturated one, with drain-resets; the formatter's key=value line is pinned exactly. Live evidence comes from the
  user's laptop: debug toggle on, reproduce the stutter, read the `flush` lines.
