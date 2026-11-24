# Detailed development log: `feature/low-bandwidth-mode`

- **Branch:** `feature/low-bandwidth-mode`
- **Started:** 2026-11-23

Implements a three-position `Low-bandwidth mode` (`Auto` / `On` / `Off`) core-first across `exotui` and `exomux`:

1. Core `AnsiCanvasSink` wire efficiency: cross-range SGR persistence, partial fg/bg delta emission,
   runtime-configurable xterm-256 color quantization (`colorDepth: "256"`), and ECMA-48 `REP` (`CSI n b`) run-length
   compression.
2. Core `HostTerminalProbe.rttMs`, `LowBandwidthController` (startup latency + remote-env + live `AnsiFlushTelemetry`
   backpressure state machine with hysteresis), `RenderLoop.requestSoon()`, `Tui.setRefreshRate()`, and degraded-flush
   congestion backoff.
3. Exomux `lowBandwidth: "auto" | "on" | "off"` global setting, non-destructive effective visual/input/transport profile
   (opaque windows, frozen flat background, no overgrowth/window transitions/block cursor, `1003 → 1002` mouse step-down
   unless active child wants `1003`, paused kitty graphics passthrough, ASCII borders, 12 FPS output cap with fast input
   wakeups, hidden-window render suppression, and `[LOW-BW]` top-bar badge).

## 2026-11-23 — Slice 1: Core `AnsiCanvasSink` wire compression & delta SGR

### Strategy

- Track active color-only SGR state (`fgParam`, `bgParam`) across row ranges within one `flushRanges()` frame so
  unchanged channels are not re-emitted and redundant per-range `\x1b[0m` resets are eliminated.
- Add runtime `AnsiCanvasSink.configure({ colorDepth, repeatCompression })` (plus `rgbToXterm256`) so low-bandwidth mode
  can flip 256-color quantization and `REP` run-length compression on/off dynamically without replacing the sink.

## 2026-11-23 — Slice 2 & 3: Core `LowBandwidthController` + Exomux 3-position `Low-bandwidth mode`

### Changes

- `src/runtime/host_terminal_probe.ts`: measured `rttMs` during the existing pre-launch DA1 probe batch (zero extra wire
  bytes).
- `src/perf/low_bandwidth.ts`: added pure `LowBandwidthController`, `detectRemoteTerminalEnvironment`, and
  `LOW_BANDWIDTH_MODES` (`auto` / `on` / `off`) with startup RTT thresholds, SSH/Mosh detection, live
  `AnsiFlushTelemetry` backpressure escalation, and hysteresis recovery; exported on `mod.ts`, `mod.terminal.ts`, and
  `mod.web.ts`.
- `src/runtime/render_loop.ts`, `src/canvas/canvas.ts`, `src/tui.ts`: added `RenderLoop.requestSoon()`,
  `RenderLoop.deferNext()`, `Canvas.lastFlushDegraded`, `Tui.setRefreshRate()`, and automatic congestion backoff after a
  degraded flush.
- `packages/exomux/{model,desktop_layout,main,app}.ts`: added global `lowBandwidth` setting (`Auto` / `On` / `Off`),
  non-destructive `exomuxEffectiveGlobalSettings` & `exomuxResolvedOpacity` overrides (opaque windows, ASCII borders,
  frozen flat background, no overgrowth/window transitions/block cursor), shared flush-telemetry sampler for both debug
  logging and auto backpressure, `1003 → 1002` mouse step-down unless focused child enables `1003`, paused Kitty
  graphics passthrough, 12 FPS output cadence with 20 ms input wakeups, hidden-window render suppression, and top-bar
  `[LOW-BW]` badge.
- `packages/exomux/tests/low_bandwidth.test.ts`: added mounted end-to-end tests proving real desktop wire-byte
  reduction, `auto` RTT/backpressure/recovery transitions, child `1003` passthrough, and minimized-window suppression.

## 2026-11-23 — Measured wire-bandwidth savings

Measured directly on rendered Exomux frames through `AnsiCanvasSink` (default `opacity: 0.85`, syntax-highlighted
terminal content):

- Idle `140×40` desktop (metaballs @ 8 FPS): `39.7 KB/s` → `0 B/s` (`100%` saved).
- Full repaint (`140×40`, metaballs): `30.3 KB` → `9.8 KB` (`67.7%` saved, `3.1×` smaller).
- Full repaint (`140×40`, matrix): `19.7 KB` → `9.7 KB` (`50.8%` saved, `2.0×` smaller).
- Full repaint (`80×24`, metaballs): `17.8 KB` → `7.0 KB` (`60.4%` saved, `2.5×` smaller).
- Scrolled code frame (`140×40` / `80×24`): `4.2 KB → 2.3 KB` (`45.5%`) / `2.4 KB → 1.1 KB` (`55.3%`).
- Sustained streaming (`140×40` / `80×24`, 60 → 12 FPS): `244 KB/s → 27 KB/s` (`89.1%`, `9.2×`) / `139 KB/s → 12 KB/s`
  (`91.1%`, `11.2×`).
