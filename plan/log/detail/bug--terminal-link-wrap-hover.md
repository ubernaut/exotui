# Detailed development log: `bug/terminal-link-wrap-hover`

- **Branch:** `bug/terminal-link-wrap-hover`
- **Started:** 2026-09-24

A chronological record of prompts, strategies, attempts, failures, and pivots for this branch. Preserve enough detail
that the same ground is not retrodden; link to task files, commits, or test output rather than duplicating them.

## 2026-09-24 — Multi-row links and a hand pointer over links

### Prompt

The maintainer reported that Ctrl-click on links from 0.4.0 fails for long links that span several rows, and asked for
the pointer to change to an arrow or finger over a link.

### Response and strategy

Measured before building. `codex` 0.156.1 and `claude` 2.1.281 were run in an isolated tmux server (`-L exolinks`) at
60x40 with `pipe-pane` recording raw output, each echoing a 119-character URL through its local `!` shell mode. Codex
was run from the trusted exotui checkout with `--sandbox read-only --ask-for-approval never`, because trusting a scratch
folder would have written to the maintainer's Codex config; no Codex model request was made (the weekly limit was under
25%). Claude Code's `!` mode still triggered one short model reply; the second run was interrupted with Escape before a
reply.

- **Codex does not break URLs.** It writes the whole line into its inline history region and lets the terminal soft-wrap
  it; `capture-pane -J` joins the rows. Replaying its bytes into `TerminalScreenController` at the same size found the
  whole URL from every row, so 0.4.0 already handled this at a fixed size.
- **Claude Code hard-wraps.** Its fullscreen renderer draws each row with cursor addressing. The prompt echo breaks one
  column short of the edge and pads that column with a styled space; tool output breaks at the edge and indents the
  continuation 5 columns under the URL. Assistant prose also ends one column short. No soft-wrap marks exist, so 0.4.0
  opened a truncated URL from the first row and nothing from the rest.
- **Claude Code links URLs only on an allowlist.** The binary's check is `TERM_PROGRAM` in
  `ghostty|Hyper|kitty|alacritty|iTerm.app|iTerm2`, the same list for `LC_TERMINAL`, `TERM` containing kitty, or
  `FORCE_HYPERLINK`. In Ghostty it therefore sends OSC 8, which is why links there work; exomux sets
  `TERM_PROGRAM=exomux`. With `FORCE_HYPERLINK=1` a second run emitted `ESC ]8;id=…;<url>` around every piece of the
  tool-output URL, and the screen kept the target on all three rows. The prompt echo stays plain text.
- **Resize discarded every soft-wrap mark.** `resize()` deleted `softWrapped`/`wrapPadding` because it does not reflow,
  so any window re-layout — opening a tiled window, or reattaching at another size — broke the joins Codex output relies
  on.

Changes:

1. `terminalLinkAt` joins a hard break when the URL-character run ends within one column of the right edge, the next row
   starts, after indentation no deeper than where that run began, with URL characters, and its first word neither starts
   a URL (which would glue prose onto the scheme and defeat `\b`) nor is a lone symbol or number marker. Indentation,
   edge padding and trailing words map to no link. The inherent false positive — a URL ending at the edge by coincidence
   above a prose line — is the same trade kitty makes; it needs the URL to end in the last two columns.
2. `resizeState` keeps soft wraps: widening fills the gap with `wrapPadding` cells and moves `softWrapped` to the new
   edge; narrowing keeps the join only when it drops nothing but padding. The first resize test exposed a new failure
   mode: narrowing cuts every long row at the new edge, and the hard-wrap rule then glued the cut pieces into
   `https://examcom/long/patyes`. A narrowing that cuts text now marks the new last cell `clipped`; a clipped row never
   joins, and a URL through a clipped cell never opens (it stays unopenable after widening until the row is rewritten).
3. `exomuxChildEnvironment` sets `FORCE_HYPERLINK=1` unless inherited or requested. SSH does not forward it, so remote
   Claude still relies on change 1.
4. Hover: exomux keeps mode 1003 on permanently (previously only with the block cursor) and writes OSC 22 `pointer` over
   a link and `text` off it. Ghostty's source (`Surface.zig`, `terminal/mouse.zig`) confirms it honours OSC 22 with CSS
   names while mouse reporting is on, starts at `text`, and ignores unknown names — so an empty reset would leave the
   hand stuck, and push/pop (`>`/`<`, kitty) is not understood. With the block cursor off, a hover event only updates
   the pointer and returns, so backgrounds, the drawn cursor, redraws and child mouse routing see exactly what they saw
   before. SGR hover decodes as `drag` with button 3, which `MousePressEvent`'s type does not admit. The any-motion and
   OSC 52 writes now share `writeHostTerminal` on the app's stdout, so tests capture them instead of the developer's
   terminal. The block cursor shows `☝` (one column in exotui's width tables). Teardown restores `text`.

Row cloning for the hover lookup costs 0.35 ms at 240x70; the painter already clones per frame, so no cache.

Validation: 8 link tests and 89 screen/selection/link tests; the new mounted test (Ctrl-click on the last hard-wrapped
row, real SGR hover bytes, dedup, modal, block cursor, teardown restore); 558 exomux tests. Entry-point budgets were
regenerated. Replays of the recorded Claude bytes resolve the full URL on all six rows of both layouts and nothing on
prose. `env -u NO_COLOR deno task health` exited zero on the final tree: 140 gates, 3,698 core tests (41 steps), 558
exomux, 62 web and 54 worker tests. (A first health run was discarded because a `git stash` round trip to compare lint
baselines touched the tree mid-run.) `FORCE_HYPERLINK` is applied by the daemon at spawn, so it reaches only terminals a
restarted daemon creates; link joining and the pointer are client-side. Real Ghostty acceptance of the hand pointer is
the maintainer's to run. Pushed for laptop testing at the maintainer's request; not merged or released.

## 2026-09-24 — Release acceptance

The maintainer tested the pushed branch (`f85fcb5a`) on their laptop, reported "it works!", and asked for a release.
Cutting exotui 0.8.1 and exomux 0.4.1 as patch releases, following 0.7.2's precedent for small additions: the library
change is a detection fix plus one optional cell field, and exomux's range moves to `^0.8.1` so registry consumers get
the fixed detection. Tag `v0.8.1` drives the binaries, GitHub release and npm publish; the merge to `main` drives both
JSR publishes. npm launcher tests and full health are rerun on the release tree before merging.
