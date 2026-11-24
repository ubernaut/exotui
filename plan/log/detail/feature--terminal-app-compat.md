# Detailed development log: `feature/terminal-app-compat`

- **Branch:** `feature/terminal-app-compat`
- **Started:** 2026-11-23

Branched from `bug/exomux-agy-compat` (`df6b49b0`) to deliver 8 high-value terminal application compatibility
improvements in 8 focused commits, keeping reusable primitives in core `exotui` (`src/`) and `exowebtui` (`src/web/`)
with `exomux` standing thinly on top:

1. Honor `DECCKM` (`CSI ? 1 h`) application cursor keys in keyboard input encoding.
2. Forward Focus Reporting (`DECSET 1004`: `CSI I` / `CSI O`) to child windows.
3. Forward child `OSC 52` clipboard writes safely (bounded, write-only).
4. Render child cursor shape (`DECSCUSR`: block / bar / underline + blinking).
5. Reflow soft-wrapped logical lines on main-screen width resize in `TerminalScreenController`.
6. Richer Kitty keyboard flags (`CSI > 5 u` / flag 4 alternate & shifted keys) & `OSC 4` ANSI palette queries/overrides.
7. Left/right scroll margins (`DECLRMM` `?69h` + `DECSLRM` `CSI l;r s`) in `TerminalScreenController`.
8. Daemon-side screen snapshot fallback for rotated replays via reusable core ANSI screen serialization.

## 2026-11-23 — Commit 1: DECCKM (`CSI ? 1 h`) application cursor keys

### Changes

- `src/runtime/terminal_screen.ts`: added `TerminalScreenController.applicationCursorKeys` (`DECCKM` / private mode 1).
- `src/app/terminal_input.ts`: added `applicationCursorKeys?: boolean` to `TerminalKeyEncodingOptions` (and forwarded
  keyboard encoding options through `routeTerminalKeyPress`). Unmodified `up`/`down`/`right`/`left`/`home`/`end` keys
  translate between CSI (`\x1b[A..F/H`) and SS3 (`\x1bOA..F/H`) when `applicationCursorKeys` is set, while modified
  cursor keys remain CSI even under `DECCKM`.
- `src/web/remote_terminal.ts`: added optional `RemoteTerminalInputEncodingOptions` to `encodeRemoteTerminalInput()` so
  `exowebtui` remote terminals can forward `DECCKM`, Kitty/modifyOtherKeys, and bracketed paste options.
- `packages/exomux/app.ts`: passed `applicationCursorKeys: runtime.screen.applicationCursorKeys` from
  `encodeKeyForActiveTerminal()`.

## 2026-11-23 — Commit 2: DECSET 1004 Focus Reporting (`CSI I` / `CSI O`)

### Changes

- `src/runtime/terminal_screen.ts`: added `TerminalScreenController.focusReporting` (DEC private mode 1004).
- `src/app/terminal_input.ts`: exported `encodeTerminalFocusEvent(focused)` (`\x1b[I` / `\x1b[O`) and added
  `focusReporting?: boolean` to `TerminalInputRoutingOptions`.
- `src/web/remote_terminal.ts`: extended `encodeRemoteTerminalInput()` to encode `terminalFocus` events when
  `focusReporting` is enabled (including browser focus/blur events with empty raw buffers) and suppress them when
  explicitly disabled.
- `packages/exomux/app.ts`: tracked effective focused terminal session across window switches and host terminal
  focus/blur, forwarding `\x1b[O` / `\x1b[I` only to attached running sessions with `focusReporting` enabled.

## 2026-11-23 — Commit 3: Safe, bounded, write-only child OSC 52 clipboard passthrough

### Changes

- `src/runtime/terminal_services.ts`: exported `TerminalClipboardWrite` and `parseTerminalClipboardWrite()` with strict
  base64/UTF-8 validation, byte limits (default 64 KiB), selection normalization (`clipboard`/`primary`/`secondary`),
  and unconditional rejection of OSC 52 read queries (`?`).
- `src/runtime/terminal_screen.ts`: raised pending control sequence buffer to 128 KiB so 64 KiB base64 OSC 52 writes
  survive chunk splits, added `onClipboardWrite` / `maxClipboardBytes` options, and dispatched OSC 52 writes safely.
- `src/runtime/terminal_shell.ts`: forwarded optional `onClipboardWrite` to `TerminalScreenController`.
- `packages/exomux/controller.ts` & `packages/exomux/app.ts`: wired live attached child OSC 52 writes into
  `clipboardCopy` (preserving selection target and suppressing historical replay writes on attach).

## 2026-11-23 — Commit 4: Child cursor shape rendering (`DECSCUSR`: block / bar / underline + blinking)

### Changes

- `src/runtime/terminal_palette.ts`: added `cursorShape` (`"block"` / `"underline"` / `"bar"`) and `cursorHidden` (for
  blink off-phase) to `TerminalCellStyleOptions` and implemented distinct rendering in `resolveTerminalCellStyle()`
  (inverted block, solid accent underline preserving text/ground, thin `▏` bar on empty cells or contrast-safe accent
  tint over text).
- `src/components/terminal_screen.ts`: wired `cursorShape: inspection.cursorStyle.shape` and optional `cursorBlinkOn`
  signal into core `TerminalScreen` (shared by `exotui` and `exowebtui`).
- `packages/exomux/app.ts`: passed `cursorShape: inspection.cursorStyle.shape` into `paintTerminal()`.
- `packages/exomux/terminal_modes.ts`: tracked `DECSCUSR` (`CSI n SP q`) in `ExomuxTerminalModeTracker` so rotated
  replays preserve child cursor shapes.

## 2026-11-23 — Commit 5: Main-screen text reflow on width resize

### Changes

- `src/runtime/terminal_screen.ts`: implemented main-screen logical-line reflow on column-width resize (default
  `reflowOnResize: true`, opt-out supported; alternate screens remain non-reflowing). Consecutive `softWrapped` rows
  across scrollback and live cells merge into logical lines (stripping `wrapPadding` and trailing default blanks while
  preserving cell styles, wide pairs, and hyperlinks), re-wrap to the new width, map live and saved cursor positions
  through logical offsets, and rebalance scrollback vs viewport rows cleanly.

## 2026-11-23 — Commit 6: Richer Kitty keyboard flags (`CSI > 5 u` / flag 4) & `OSC 4` ANSI palette queries/overrides

### Changes

- `src/utils/ansi_codes.ts`: upgraded `ENABLE_ENHANCED_KEYBOARD` from `\x1b[>1u` to `\x1b[>5u` (disambiguate + report
  alternate/shifted keys) so host terminals report shifted punctuation and base-layout codepoints.
- `src/app/terminal_input.ts`: preserved Kitty alternate-key fields (`codepoint:shifted:base`) and US-shifted
  punctuation chords, emitting `code:shifted[:base];mod u` for flag-4 children, clean legacy downgrade (`\x1b?`) for
  non-Kitty children, and accurate `modifyOtherKeys` level-2 shifted punctuation.
- `src/runtime/terminal_palette.ts`: exported `xtermPaletteRgb()` and added `paletteOverrides` support to
  `terminalPaletteRgb()`, `terminalReadableForegroundRgb()`, and `resolveTerminalCellStyle()`.
- `src/runtime/terminal_screen.ts`: implemented `OSC 4` indexed palette queries (`?`) and dynamic RGB overrides
  (`rgb:r/g/b`, `#rgb`/`#rrggbb`), `OSC 104` selective/full reset, `TerminalScreenController.paletteOverrides()`, and
  `DECRQSS m` active SGR reporting.
- `src/components/terminal_screen.ts` & `packages/exomux/app.ts`: wired `paletteOverrides` into cell rendering.

## 2026-11-23 — Commit 7: Left/Right scroll margins (`DECLRMM` `?69h` + `DECSLRM` `CSI l;r s`)

### Changes

- `src/runtime/terminal_screen.ts`: added mode `69` (`DECLRMM`) to `REPORTED_PRIVATE_MODES`, disambiguated `DECSLRM`
  (`CSI l;r s` when `?69h` active) from `SCOSC` (`CSI s` when `?69l` and parameterless), added `DECRQSS s` reporting,
  bounded glyph wrapping, CR/BS/NEL/CUF/CUB/CHA/CUP/CPR, `SU`/`SD`/`IND`/`RI`, `IL`/`DL`, `ICH`/`DCH`, and
  `DECIC`/`DECDC` (`CSI n ' }` / `CSI n ' ~`) strictly inside the active horizontal+vertical margin box without
  disturbing outside columns or corrupting wide pairs.

## 2026-11-23 — Commit 8: Daemon-side screen snapshot fallback for rotated replays

### Changes

- `src/runtime/terminal_screen.ts`: added `TerminalScreenSnapshotOptions`,
  `TerminalScreenController.serializeSnapshot()`, and exported `serializeTerminalScreenSnapshot()` to serialize any
  screen's visible grid, optional main-screen scrollback, SGR styles, OSC 8 hyperlinks, OSC 4 palette overrides, scroll
  regions (`DECSTBM`/`DECLRMM`/`DECSLRM`), private modes, keyboard protocol, and cursor state into a compact replayable
  ANSI stream.
- `packages/exomux/{protocol,model,client,main,host,controller}.ts`: maintained a bounded shadow
  `TerminalScreenController` (`scrollbackLimit: 200`) per `HostSession` in the daemon, advertised `screenSnapshot: true`
  in `host.json`, added optional `snapshotFallback` on `attach` and `snapshot` on `attached` (fully backwards- and
  forwards-compatible across daemon/client version skew), and skipped truncation warnings and resize-wiggle recovery
  when the daemon restores a rotated attach from a complete snapshot.

## 2026-11-23 — Commit 9: Core upstreaming pass (host terminal & runtime primitives)

### Changes

- `src/runtime/terminal_modes.ts`: promoted `TerminalModeTracker` and `TerminalModeInspection` into core runtime (and
  exposed on `mod.terminal.ts` and browser-safe `mod.web.ts`); `packages/exomux/terminal_modes.ts` is now a thin
  compatibility re-export.
- `src/runtime/terminal_env.ts`: promoted `HOST_TERMINAL_IDENTITY_ENV_VARS`, `TerminalChildEnvironmentOptions`, and
  `terminalChildEnvironment()` into core runtime; `packages/exomux/terminal_env.ts` delegates with `program: "exomux"`.
- `src/runtime/host_terminal_probe.ts`: promoted `HostTerminalProbe`, `HOST_TERMINAL_PROBE_IMAGE_ID`,
  `HOST_TERMINAL_PROBE_SEQUENCE`, `parseHostTerminalProbeReplies()`, `hostTerminalProbeComplete()`, and
  `probeHostTerminal()` into core runtime; `packages/exomux/main.ts` imports `probeHostTerminal` and re-exports the
  existing probe aliases.
- `src/runtime/host_desktop.ts`: promoted `ReadLocalHostClipboardOptions`, `readLocalHostClipboard()`,
  `sanitizeTerminalClipboardPaste()`, and `openLocalTerminalLink()` into core runtime; `packages/exomux/clipboard.ts`
  and `packages/exomux/open_link.ts` delegate thinly to core.
- `src/canvas/sink.ts`: promoted `formatAnsiFlushTelemetry()` alongside `AnsiFlushTelemetry`;
  `packages/exomux/debug_log.ts` re-exports it as `formatExomuxFlushTelemetry`.
- `mod.web.ts`: exported browser-safe `terminal_modes.ts` and `terminal_palette.ts` so `exowebtui` apps have parity with
  terminal color/cursor-shape rendering and replay mode tracking.
- `tests/terminal_host_primitives.test.ts`: added core unit tests covering all promoted primitives and `mod.web.ts`
  re-exports.

## 2026-11-23 — Full health gate stabilization

### Changes

- `packages/exomux/tests/app.test.ts`: sized `stack-under`'s opaque red fixture row to its 28-column client width so
  narrowing from 80 columns does not reflow a 60-cell styled line into 4-column tail rows.
- `scripts/e2e.ts` & `docs/assets/*`: rebuilt GitHub Pages web bundles and ratcheted `web-workbench-bundle` `maxBytes`
  from `600_000` to `615_000` (`586,664 -> 606,701` bytes from the new `TerminalScreenController` VT features).
- Bidirectional daemon/client version-skew verified live against `main` (`0a8121cd`) in isolated temp state dirs:
  - Old daemon (`0a8121cd`) + new client (`HEAD`): spawn, attach, detach, reattach, and kill succeed cleanly without
    sending `snapshotFallback`.
  - New daemon (`HEAD`, `screenSnapshot: true`) + old client (`0a8121cd`) on a >5 MiB rotated session: old client reads
    the new descriptor cleanly and attaches with `truncated: true` (no `snapshot` field), while a new client attaching
    to the same rotated session receives `truncated: true, snapshot: true` containing the live screen tail.
