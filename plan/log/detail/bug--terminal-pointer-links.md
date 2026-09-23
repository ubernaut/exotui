# Detailed development log: `bug/terminal-pointer-links`

- **Started:** 2026-09-23
- **Goal:** Fix terminal selection and scrolling in Codex/Claude, and open terminal links on the local computer.

The user runs exomux locally in Ghostty and uses SSH inside an exomux terminal to run Codex remotely. Scrolling works in
a raw terminal and tmux. The previous selection implementation, `4b736f01`, remained on
`feature/terminal-mouse-selection`; main and npm 0.3.1 did not contain it. Incorporated its changes into this branch.

Reproduced the history loss with a six-row screen and a top-anchored scrolling region leaving a fixed bottom prompt. The
exotui regression test failed with empty history. The same LF-driven sequence in an isolated tmux server retained `one`
and `two` in history. Codex's inline history insertion uses this region pattern; see
https://github.com/openai/codex/blob/main/codex-rs/tui/src/insert_history.rs and upstream issue
https://github.com/openai/codex/issues/27644. Changed the reusable terminal model to retain main-screen rows leaving the
top of the screen even when the region ends above the physical bottom. Interior and alternate-screen scrolls remain
excluded from history.

Added cell soft-wrap annotations so selection and URL detection can join real soft wraps while preserving explicit line
breaks and wide-glyph padding. Reusable link detection belongs to exotui. Exomux owns Ctrl-click activation and the
local OS launcher; URLs printed by SSH children open on the exomux client's computer. The launcher passes one validated
HTTP(S)/mailto URL as an argument, never through the child PTY or a command shell.

Alt-drag forces local selection when a child owns mouse reporting, avoiding Ghostty's interception of Shift-drag.
Existing Shift-drag support remains available when the host forwards it. Normal child mouse/wheel routing remains
covered by the mounted integration suite. Tests use fake clients, private temporary state, and an isolated tmux socket;
no live daemon or session was changed.

Focused validation passed: 81 terminal screen/selection tests, five link tests, and 103 mounted exomux/local-opener
tests. The regression failed before the history fix. Formatting passed, ICC guard-diff passed, and a compiled candidate
at `/tmp/exomux-pointer-links/exomux` passed its help smoke check. The full `env -u NO_COLOR deno task health` run is in
progress; its result will be recorded after completion. `NO_COLOR` must be unset for the existing color tests.

The maintainer requested this branch be pushed for testing from their laptop. Real Ghostty acceptance of scrolling,
selection/copy, and local link opening remains pending. Do not merge or publish until that check and full health pass.
From a checkout of this branch, run `deno task --cwd packages/exomux start`. npm 0.3.1 still contains the previous code.
