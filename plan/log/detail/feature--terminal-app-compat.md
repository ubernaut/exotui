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
