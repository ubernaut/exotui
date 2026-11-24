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
