# Detailed development log: `bug/exomux-agy-compat`

- **Branch:** `bug/exomux-agy-compat`
- **Started:** 2026-11-21

## 2026-11-21 — agy inside exomux, compatibility shakedown (findings only)

### Prompt

"agy has some rendering issues and compatibility issues with exomux ... fire up agy in a new exomux session and run
several tests ... just list them all out for now and we'll decide what to fix next".

### Method (reusable)

- `exomux -n <name> --memory` starts a separate daemon with its own state directory, so driving it from the isolated
  `tmux -L exotui-qa` harness never touches the live `main` session. Kill the daemon by pid afterwards (SIGTERM did not
  stop it within 3 s; SIGKILL did) and remove `~/.local/state/deno-tui/exomux/sessions/<name>`.
- Run the child under `script -q -f log -c 'agy ...'` to record its exact output. Replay the bytes three ways: offline
  through `TerminalScreenController`, into a plain tmux pane (`stty -opost; cat`), and into a live exomux window. Bisect
  on escape-sequence boundaries to find the first byte where two of them disagree.
- A fresh offline `TerminalScreenController` can hide state-dependent bugs: the live window had a saved cursor, the
  fresh one did not.

### Findings

1. `CSI ? u` (kitty keyboard query) falls through to `case "u"` in `terminal_screen.ts` and runs `#restoreCursor()`. agy
   sends it at startup and on every Ctrl+L. With a saved cursor present (any earlier `ESC 7` or `?1049h`) the cursor
   jumps there, so the following `CSI J` erases from the wrong cell and the redraw lands offset. Minimal repro:
   `ESC[10;5H ESC7 ESC[H ESC[?u X` puts X at row 10. Same class, untested live: `CSI ? ... s` and `CSI ? ... r`.
2. Window-host Alt bindings (`workbench_window_host.ts` `handleKey`) take every Alt chord before the child: Alt+M
   minimizes, Alt+F maximizes, Alt+D toggles tiling, Alt+C closes and kills the terminal with no confirmation,
   Alt+arrows nudge the window, also Alt+R/P/Tab. Unbound Alt chords (Alt+B) pass through.
3. Wheel-scrolling back and then typing leaves the view scrolled; the prompt is off screen while keys still go in.
4. No reply to DA1, DA2, XTVERSION, DSR 5n, OSC 10/11, DECRQM, DECRQSS. CPR and `CSI 18 t` are answered.
5. Child requests for kitty keyboard flags and modifyOtherKeys are consumed and ignored, and exomux does not enable
   either on its own host terminal.
6. After a phone-size host resize and back, the window keeps the phone dimensions.
7. Not reproduced: lost or reordered keystrokes while agy streams (three rounds, 80 to 90 keys each, including backspace
   and cursor-left edits and four resizes). One command typed about four seconds after session start lost its text while
   its Enter arrived; not reproduced since.

## 2026-11-21 — The fixes

### Prompt

"fix 1 and move the exomux alt shortcuts to shift+alt+[key] also shift alt+[arrow keys] shuold tile the window north
south east or west. and when you do up and right at the same time it should tile to the top right corner etc. we should
also fix 3, 4, 5, and 6".

### Response and strategy

- **1, private CSI.** `#applyControl` returns before the command switch for any `?`-prefixed CSI except DECSED/DECSEL,
  and for any CSI with an intermediate except DECSCUSR. Verified live: Ctrl+L in agy with a saved cursor armed redraws
  cleanly.
- **Shortcuts.** `handleKey` needs `meta && shift` for every window chord except Tab. Shift+Alt+arrow snaps to the
  workspace edge; a second arrow on the other axis within 250 ms (`TILE_CHORD_MS`) snaps to the corner. A terminal
  reports held keys as separate presses, so "at the same time" can only be a time window. Ctrl+Shift+Alt+arrow nudges.
  Keyboard resize lost its chord: `KeyPressEvent` has three modifiers and all arrow slots under Shift+Alt are used.
- **The decoder had to change first.** `decodeKey` matched the xterm modifier parameter against exactly 2, 3 and 5, so
  `CSI 1;4A` decoded as a bare Up. The old Alt+Ctrl and Alt+Shift arrow chords can never have worked in a terminal. It
  is a bitmask now.
- **3, scroll.** Any key or paste that produces bytes for the active terminal leaves copy mode first.
- **4, queries.** New `onReply`, `queryColors` and `identity` options; exomux writes replies with `writeSession`, which
  already refuses during replay. OSC 11 reports the colour the window really paints unset cells with.
- **5, keyboard.** Three parts. The screen tracks the child's kitty flag stack (per screen) and modifyOtherKeys level.
  `encodeTerminalKeyPress` re-encodes from decoded fields when the child asked for an enhanced form, or when the host
  reported in one and the child did not ask. `Tui.enableEnhancedKeyboard` pushes kitty flag 1 after the alternate screen
  switch, because the stack is per screen, and pops it before leaving. modifyOtherKeys output is deliberately
  conservative: only chords legacy bytes cannot express.
- **6 was not the phone layout.** `EXOMUX_MOBILE_MIN_COLUMNS` is 50, so the 60-column test never entered it. The plain
  reflow pass rewrote the floating rect to fit and kept no record. It now keeps the pre-shrink rect per window and
  restores it when it fits again, unless the rect changed in between.
- **Lost first input, found on the way.** `probeHostTerminal` raced `stdin.read` against a timer. On a host that answers
  neither query the read stayed pending and took the user's first keystrokes. The probe now ends on a DA1 reply. A host
  that answers nothing at all would still orphan the read; none is known.

### Not verified

- Nothing was run on Ghostty. The enhanced-keyboard path was exercised by injecting `CSI 13;2u` and friends as host
  input through tmux, which ignores the kitty push itself. Whether Ghostty's reports match is for the maintainer.
- Two clients on one session each answer a query. Same as the existing cursor report.

## 2026-11-21 — "Not reattaching to my agy terminal", and typing still looks corrupted

### Prompt

"it's not reattaching to may active agy terminal", then "wait it fixed it", then later "the input is still getting
(visually) corrupted in agy when I type into the prompt area."

### Response and strategy

- **Reattach: found and fixed.** A read-only probe of the live daemon (list, attach, detach; no input, no resize)
  reproduced it: `attach` from sequence 0 on both agy terminals came back "Terminal data exceeds the protocol quota".
  `prependModePreamble` merges the sticky-mode preamble into the first retained frame and encodes it; when that frame is
  exactly `outputBytes` (any burst over 64 KiB is split into frames of exactly that size), the merge is over the limit,
  `encodeExomuxData` throws, and the attach is refused. It "fixed itself" when the ring rotated to a smaller first
  frame. Host: the preamble becomes its own frame at `first.sequence - 1`. Client: on `data-too-large`, list, attach
  from the newest sequence, treat as truncated. The client half exists because the daemon outlives it.
- **Typing corruption: not reproduced, cause unknown.** What was ruled out, all on the maintainer's real agy output
  pulled from the daemon's replay ring (94x22, tool activity, OSC 8 links):
  - Emulator model against tmux for the same bytes: identical at the end and at 32 sampled prefixes. One apparent
    difference was the comparison's own tab handling.
  - Live exomux rendering against the emulator model, stream paced per agy frame: identical at 8 points.
  - PTY width fights between the two attached clients: the retained stream shows one width change (70 to 94), not
    alternation.
  - Torn frames from PTY read splits: agy's hide/show-cursor brackets have a median of about 70 bytes; 7% exceed 1 KiB
    and under 1% exceed 4 KiB. Everything above compares text, in tmux. Not covered: cell attributes and colours, the
    cursor cell, and anything specific to Ghostty as the host. Needs a description of the symptom, and whether
    `Ctrl-N l` clears it.

## 2026-11-21 — The typing corruption: two clients, one PTY, two screen sizes

### Prompt

A screenshot: typed text "things seem to be st" on one row and "alling out on some presets" one row lower, on top of the
prompt's bottom rule, with the rule above the prompt missing.

### Response and strategy

- **Reading the screenshot.** The continuation starts in the column the first half ended in, so it is a pure one-row
  slip. Decoding agy's frames from the daemon's ring showed why a slip sticks: agy never addresses rows absolutely. A
  spinner tick is `CR, CSI 3A`, rewrite, `CR LF`, rewrite, `LF LF`, `CSI 19D`. One row of disagreement about the
  screen's height and every later frame lands a row off.
- **Not reproduced with one client**, with a tool-running agy at the same 94x22 while typing.
- **Reproduced at once with two.** A 56x23 client attached to the same session resized the PTY to 54x20; the first
  client kept a 94x22 screen model and drew 54x20 output into it. The maintainer runs exactly this: Ghostty at 191x49
  and an SSH client at 56x23. `bug--codex-resize-cursor-report.md` describes the same thing from the other side ("stale
  Codex content at two different wrapping widths").
- **Why it happened.** `syncTerminalGeometry` sized the screen model to the local window and resized the PTY on any
  local geometry change and on every attach; the only reconciliation was on focus change. With a shared workspace a
  layout change on one client changes the other's projected rects too, so the passive client stole the size whenever the
  active one rearranged windows.
- **What landed.** The screen model is resized only from the host's session summary. `requestedColumns/Rows` is what
  this window wants. A client sends a resize when the terminal is used on it (key, paste, focus), or its window changes
  while it holds the size (`sizeClaimed` and the PTY still at its last request). Attach resizes only the focused window;
  a truncated attach of any other wiggles around the PTY's current size. `answerWindowSizeQuery` reports the PTY's size.
- **Test fakes lied.** Neither fake client reported a resize back, which the daemon always does. Both now do.

### Known limits

- A passive window smaller than the PTY shows the top-left of the screen, so an inline prompt at the bottom is cut off
  until the terminal is used there. Bottom-anchoring was left out because selection and mouse mapping index rows from
  the top.
- A single client restarted at a different terminal size no longer resizes every terminal at once: the focused one
  resizes, the rest when focused or typed into. The client cannot tell that it is alone without a protocol addition.
- A client on the old build still resizes on any layout change. A new client next to it stays coherent and takes the
  size back on the next keystroke.

## 2026-11-23 — Remaining visual corruption during output, typing, scrolling, and `/btw`

### Prompt

User reported ongoing visual corruption of input and output when running `agy` CLI (`1.5.15`) inside `exomux`, most
frequently during streaming output, typing, scrolling, and viewing `/btw` threads, and asked to compare what `agy`
expects against what `exomux` gets wrong and repair `exomux`.

### Investigation & empirical captures

Captured real `agy 1.5.15` PTY byte streams (startup, streaming 40–50 numbered lines with markdown tables and emoji,
typing at right margin, `/help` alternate-screen modals, `/btw` inline threads and Tab-expanded `/btw` growth, and
widening/shrinking resizes) and ran differential replays against `tmux` plus a 41-case VT100/xterm differential audit.

`agy` uses Charmbracelet Ultraviolet / Bubble Tea v2 cellbuf diff rendering: inline main-screen redraws never use
absolute row positioning (`CSI r;c H`), relying instead on relative vertical/horizontal moves (`CUU`, `CUD`, `\n`, `\r`,
`HT`, `CBT`, `CHA`, `DECST8C`, `DECAWM` toggles) and optionally wrapping every frame in DEC synchronized output
(`CSI ? 2026 h ... CSI ? 2026 l`) when `DECRQM ?2026$p` reports support. Any 1-row or 1-column disagreement permanently
shifts subsequent frames.

### Root causes found and fixed

1. **Tab stops lost on widen + `DECST8C` (`CSI ? 5 W`) ignored (`src/runtime/terminal_screen.ts`).** `resizeTabStops()`
   only kept existing stops from before the resize instead of populating default 8-column stops for newly added columns
   (`column >= previousColumns`), and `CSI ? 5 W` was silently dropped. Any terminal widened past its initial or
   smallest width (including floating windows widened past 80/86 columns or reclaimed from a smaller second client) lost
   all tab stops past the old width, causing `HT`/`CBT` to jump to the right margin or column 0 and corrupt rows (e.g.,
   `"31. Di✓  renderer initialized"` and 10+ shifted rows with ghost rules).
2. **Main-screen height resize truncated bottom rows instead of using scrollback (`src/runtime/terminal_screen.ts`).**
   `resizeState()` kept rows `0..nextRows-1` and clamped `cursor.row`, truncating `agy`'s inline prompt and `/btw` box
   on shrink and failing to pull rows back out of `#scrollback` on grow (also hit by truncated-attach wiggle resizes).
   Added `#resizeMainState()` matching xterm/Ghostty/tmux: drop trailing blank rows below the cursor first, push excess
   top rows into `#scrollback`, pull rows back on grow, and shift saved cursors accordingly; alternate screen stays
   top-anchored without touching scrollback.
3. **Non-cursor-moving control sequences wrongly cleared `#pendingWrap` (`src/runtime/terminal_screen.ts`).**
   `#applyControl` cleared `#pendingWrap` on every non-SGR sequence (`?25l`/`?25h`, `?2026h`/`?2026l`, `?2027h`, `OSC 8`
   hyperlinks, `OSC 0/2/7`, `DECSCUSR`, `DECST8C`, `ESC 7`), causing right-margin writes to overwrite the last column
   instead of wrapping. Added `preservesPendingWrap()` and per-mode clearing in `#applyPrivateModes()`.
4. **Shared single `#savedCursor`, incomplete `DECSC` state, and missing `DECSTBM` clamping
   (`src/runtime/terminal_screen.ts`).** Separated `#savedCursor` into `{ main, alternate }`, guarded redundant
   `?1049h`/`?1049l`, saved/restored full `DECSC` state (style, origin mode, autowrap, pending wrap, charsets), clamped
   `CUU`/`CUD`/`CNL`/`CPL`/`VPR` to the active scroll region, and made `CSI r` respect `DECOM` when homing the cursor.
5. **No DEC synchronized output (`DECSET 2026`) support (`src/runtime/terminal_screen.ts`,
   `packages/exomux/controller.ts`, `packages/exomux/app.ts`).** Added `2026` to `REPORTED_PRIVATE_MODES` so
   `DECRQM ?2026$p` reports reset (`2`) / set (`1`), causing `agy` to wrap every redraw in `?2026h ... ?2026l`. In
   `ExomuxController` and `paintTerminal`, hold a frozen `syncSnapshot` (with a 150 ms safety timeout and clean teardown
   on resize/clear/detach/exit/dispose) while mode `2026` is open so 60 Hz repaints never draw half-erased or
   half-written frames.
6. **`AnsiCanvasSink` cursor desync when a dirty range starts on a wide-glyph follower (`src/canvas/sink.ts`).** In
   `compactAnsiCellRange`, an empty wide-glyph follower `""` did not set `isolateNext = true`, causing the following
   ASCII cell to overwrite the right half of the wide glyph and shift the row left by 1 column.
7. **ASCII-base multi-codepoint cluster width mismatch & continuation guard (`packages/exomux/app.ts`).**
   `exomuxGlyphColumns` returned `1` for any string starting with `< 0x80`, mismeasuring keycaps like `1️⃣`
   (`"1\ufe0f\u20e3"`, width 2 in `TerminalScreenController`). Fixed fast path to `glyph.length === 1` and guarded
   `cell.continuation` skipping in `paintTerminal` so stale backdrop cells cannot leak if a preceding cell did not paint
   a 2-column glyph.
8. **Replay mode tracker dropped keyboard protocol and mode `2027` (`packages/exomux/terminal_modes.ts`).** Tracked
   main/alternate kitty keyboard stacks, `modifyOtherKeys`, and mode `2027` in `ExomuxTerminalModeTracker` and emitted
   them idempotently (`CSI = flags;1 u`, `CSI > 4;level m`) in `preamble()`.
9. **Passive mismatched-geometry clients injected duplicate child query replies (`packages/exomux/controller.ts`).**
   Added `#shouldAnswerQueries()` so a passive viewer with `!sizeClaimed` and mismatched geometry stays silent on
   `CSI 6 n`, `CSI 18 t`, `DECRQM`, `OSC 11`, and kitty queries while the active owner answers once.

### Verification

- Differential replay of captured `agy` traces (`60x20 -> 100x30`, `80x24 -> 100x30 -> 120x35 -> 80x24 -> 100x30`,
  `160x40` Tab-expanded `/btw`, `100x30` `/help` + `/btw`) against `tmux`: all final frames and cursors match cleanly.
- Live isolated `exomux -n <qa> --memory` + real `agy --effort low` inside isolated `tmux` with dual clients (`192x48`
  desktop + `56x23` phone), maximize/reclaim resizes, 50-line streaming + 3-column emoji table, post-stream typing, and
  Tab-expanded `/btw`: zero visual corruption or border drift across all checkpoints.
- Added unit tests in `tests/terminal_screen.test.ts`, `tests/terminal_screen_queries.test.ts`,
  `tests/canvas_sink.test.ts`, `packages/exomux/tests/terminal_modes.test.ts`,
  `packages/exomux/tests/controller.test.ts`, and `packages/exomux/tests/app.test.ts`.
- Not verified live on Ghostty itself (verified via unit tests, offline differential replays, and isolated tmux-hosted
  live exomux). Maintainer needs `./install-exomux.sh` and client/daemon restart to pick up the new binary and host-side
  `terminal_modes.ts` changes.

## 2026-11-23 — Follow-up: host sync output, host mode 2027, daemon query arbitration, OSC 8 links

### Prompt

User approved tackling the four follow-up items identified during the audit: host-side `DECSET 2026` framing on
`AnsiCanvasSink`, host-side `DECSET 2027`, daemon-side single query responder, and `OSC 8` hyperlink passthrough.

### Changes landed

1. **Host-side `DECSET 2026` synchronized output framing (`src/utils/ansi_codes.ts`, `src/canvas/sink.ts`, `src/tui.ts`,
   `packages/exomux/main.ts`, `packages/exomux/app.ts`).** Added `BEGIN_SYNCHRONIZED_OUTPUT` /
   `END_SYNCHRONIZED_OUTPUT`, `AnsiCanvasSinkOptions.synchronizedOutput`, and `TuiOptions.enableSynchronizedOutput`.
   `AnsiCanvasSink.flush()` and `flushRanges()` now bracket multi-chunk host writes in `\x1b[?2026h ... \x1b[?2026l`,
   stop emitting spans if `#degraded` trips while still closing `?2026l`, and avoid emitting a redundant trailing
   `moveCursor` before chunk splits. `probeHostTerminal()` sends `DECRQM ?2026$p` in its existing single pre-launch
   round trip and enables synchronized output when the host reports support.
2. **Host-side `DECSET 2027` grapheme clustering (`src/utils/ansi_codes.ts`, `src/tui.ts`, `packages/exomux/main.ts`,
   `packages/exomux/app.ts`).** Added `ENABLE_GRAPHEME_CLUSTERING` / `DISABLE_GRAPHEME_CLUSTERING` and
   `TuiOptions.enableGraphemeClustering`. `probeHostTerminal()` queries `DECRQM ?2027$p`; `exomux` enables `?2027h` (and
   restores `?2027l` on exit) only when the host reports `"reset"` (`2`), so hosts like Ghostty that already default it
   on (`1`/`3`) never have it turned off on exit.
3. **Daemon-side single query responder (`packages/exomux/protocol.ts`, `packages/exomux/host.ts`,
   `packages/exomux/model.ts`, `packages/exomux/client.ts`, `packages/exomux/controller.ts`,
   `packages/exomux/main.ts`).** Added a dedicated `"reply"` protocol message (advertised via `queryArbitration: true`
   in `host.json`, with automatic fallback to the client-side `#shouldAnswerQueries()` heuristic against older daemons).
   `ExomuxHostController` tracks one `queryOwner` per session (assigned on spawn/first attach, transferred on user
   `input`/`resize`, promoted to another attached client on detach/disconnect) and forwards only the owner's `reply`
   bytes to the PTY while silently acknowledging duplicates from co-attached clients even at identical geometry.
4. **`OSC 8` hyperlink passthrough (`src/utils/ansi_text.ts`, `src/canvas/sink.ts`, `packages/exomux/app.ts`).**
   Extended `stripAnsi()` to strip OSC sequences and added `readOsc8SequenceAt()`. Taught `AnsiCanvasSink` to parse,
   coalesce across adjacent cells (including across wide-glyph `""` followers), and cleanly close `OSC 8` runs at range
   boundaries. `paintTerminal()` and `DesktopPainter.cell()` now forward sanitized `http:`/`https:`/`file:`/`mailto:`
   `OSC 8` links without polluting `paintStyleCache`.

### Verification

- Added tests in `tests/canvas_sink.test.ts`, `tests/tui_destroy_contract.test.ts`,
  `packages/exomux/tests/host_probe.test.ts`, `packages/exomux/tests/host.test.ts`, and
  `packages/exomux/tests/app.test.ts`.
- Regenerated `docs/api-stable-baseline.json`, `docs/api-reference.md`, `budgets/public_api.json`, and
  `budgets/entrypoints.json`, verified API/budget/core/web/exomux tests, and reinstalled `~/.local/bin/exomux`.
- Backfed shared primitives into core `exotui` and `exowebtui`: moved `sanitizeTerminalHyperlink` to
  `src/runtime/terminal_links.ts`, extracted `TerminalSynchronizedOutputController` into
  `src/runtime/terminal_screen.ts`, wired `OSC 8` hyperlink passthrough and orphaned-continuation safety into core's
  `TerminalScreen` component (`src/components/terminal_screen.ts`), fixed paired ST-terminated OSC stripping in
  `stripStyles()` (`src/utils/strings.ts`), and taught `BrowserCellCanvasSink` (`src/web/cell_canvas_sink.ts`) to scan
  and expose `OSC 8` hyperlinks without breaking SGR parsing on URLs containing `m`.
