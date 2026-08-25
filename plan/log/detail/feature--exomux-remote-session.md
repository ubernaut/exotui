# Detailed development log: `feature/exomux-remote-session`

- **Branch:** `feature/exomux-remote-session`
- **Started:** 2026-08-23

A chronological record of prompts, strategies, attempts, failures, and pivots for this branch. See
`plan/todo/046-exomux-remote-session.md` for the design under discussion.

## 2026-08-23 — Branch opened, design proposals written

### Prompt

Adopt the vibe-plan planning structure if it is not already adopted, then open a branch for connecting a local exomux to
a remote exomux session — full-screen, over SSH, reached from a dropdown beside the top-bar close button. Propose a few
UX flows rather than picking one. While connected, enable image copy/paste and drag-and-drop into remote `codex` and
`claude` so those applications actually accept the images.

### Response and strategy

**Planning structure.** Already vibe-plan-derived and locally adapted. The one convention missing was branch-scoped
detail logs; landed on `main` first (`f4ea9a28`, merged `ad2e8524`) so every branch cut afterwards inherits it. This
file is the first log written under the new convention.

**Research before proposing.** Read `protocol.ts`, `client.ts`, `model.ts`, `host.ts`, `desktop_layout.ts`, `app.ts`'s
menu and top-bar paths, `src/app/clipboard.ts`, `src/app/drag_drop.ts`, and the whole of `035-exomux-network-menu.md`.
Four findings changed the shape of the proposal and are worth not rediscovering:

- `035` already attaches to a remote exomux — TSM-012/013 probe remote `tmux` _and_ `exomux` sessions over one batched
  SSH and attach with `ssh -t <target> exomux -a <name>`. So the request is not "make remote attach possible", it is
  "make it a desktop rather than a window". That reframing is what made Console mode (Proposal A) a cheap first slice
  instead of a throwaway.
- `ExomuxClientPort` (`model.ts:129`) is a complete, small seam, and `041`'s `workspace` op already relays desktop state
  between clients of one daemon. A remote transport is a second implementation of that interface, and the remote window
  layout then arrives as data rather than as repainted cells. That is the whole argument for Proposal B over A.
- `host.ts:1332` throws on any non-loopback bind, and `client.ts:218` normalizes to loopback too. An `ssh -L` port
  forward would technically satisfy both while quietly opening a local socket that any local process could reach, with
  the daemon token as the only guard. Rejected in favour of a stdio relay, which opens no socket at all. Written up
  under "Why a relay and not a port forward" so the tempting shortcut is refused in advance.
- TSM-014's paste-to-scp modal (`controller.ts:363`, `2536`, `2689`) is exactly the consent shape the image feature
  needs, and `src/app/drag_drop.ts` (INP-008) already has the policy-gated, adapter-neutral drop contract. Neither
  should be rebuilt.

**The image half.** The mechanism is forced by how the target applications actually work: no terminal carries image
bytes on paste, and `codex`/`claude` either read the OS clipboard themselves or take a filesystem path. Running on the
remote, they miss on both counts. So: capture locally, transfer over the already-open connection, type the _remote_
path. That in turn is the strongest argument for Proposal B — a relay gives an authenticated framed channel to push
bytes through; a nested `ssh -t` gives nothing and would need a second connection bolted alongside.

**Slice 0 is deliberately a measurement, not a build.** The feature rests on an unverified claim about two third-party
applications: what they accept as a typed image reference, and whether local `Ctrl-V` already works today (it plausibly
does, since they can read the clipboard themselves — in which case the local half of the feature does not exist and
should be deleted rather than built). This repository has already paid for modelling before measuring once, with the
183-line terminal-padding coordinate space that measured to zero. Not again.

**Not decided, on purpose.** Six open decisions are recorded rather than resolved — which of A/B/C, the glyph, the
capture keybinding, multi-host client shape, the transfer op's form, and whether to offer remote installation. The
prompt asked for proposals; picking for the user would be answering a question that was not asked.

Nothing is implemented. Next step is D1.

## 2026-08-24 — Kitty Unicode placeholders corrupted the desktop; combining marks fixed

### Prompt

Screen corruption when codex opens a kitty-based split terminal containing a browser — probably not from this branch,
but fix it here. Follow-up: over a remote session the placeholder characters do not even show, it corrupts the entire
exomux display.

### Response and strategy

**Reproduced from the live system rather than from the description.** The process tree plus `tmux list-panes` gave the
chain: Ghostty → exomux client (pts/10) → exomux daemon PTY (pts/22) → `tmux a` → tmux session 0 → pane `0:0.1` running
terminal-browser's electron. `tmux capture-pane -p -e -t 0:0.1` — read-only, no attach, so the live session was never
disturbed — returned rows of `F4 8E BB AE` (`U+10EEEE`, kitty's Unicode placeholder) each followed by two combining
diacritics, the run prefixed with `ESC[38;2;28;239;13m`. That foreground is the image id: kitty encodes it in the cell
colour, high byte in an optional third diacritic. `allow-passthrough` was `on` per pane, so the data did reach exomux.

**Measured before changing anything.** A five-line probe against `UNICODE_CHAR_REGEXP` and `textWidth`:

```
base+2  split: ["<base>̅", "̍"]      3 placeholder cells -> 6 chars, want 3
```

The splitter pairs an **astral** base with at most one combining mark, so the second arrives as its own character, and
`terminalGraphicWidth` floors every glyph at one column. Each placeholder cell therefore took two columns. That is the
whole first symptom: an image twice as wide as its pane, wrapping and cascading.

The user's follow-up identified the second symptom and confirmed the mechanism: a cell holding a _bare_ combining mark
is painted into the host's output stream, where the host terminal combines it with whatever the compositor drew
immediately before it. The damage escapes the window and takes the desktop with it, which is why over a remote session
there are no placeholder glyphs to see — just corruption.

**Fixed** in `src/runtime/terminal_screen.ts`: a glyph measuring zero columns attaches to the glyph it modifies and
never gets a cell. Bounded at 16 code units so a mark flood cannot grow a row. Five tests; four fail without the change
(the fifth, a wide base with one mark, is a regression guard — the splitter already grouped that case, so it passed
either way, and it is worth saying so rather than counting it as evidence).

This is a general correctness fix, not a kitty one: any text with two or more combining marks was mislaid identically.

**Also fixed:** the "exomux cannot show them yet" warning fired on the first kitty APC regardless of whether a relay
existed. With passthrough on it is a lie the status line then keeps. Gated on `!runtime.graphics`.

**Not fixed, filed as `047`.** The image still will not appear. `KittyPassthroughRelay` remaps `i=` into a per-session
host-id block, but a virtual placement carries its id in the _cell foreground_ too, which the relay cannot reach — so
the host gets the image under one id and placeholder cells naming another. `U` is not even in the relay's
`placementKeys`, so `U=1` is rewritten into a real cursor-anchored placement. Three approaches written up; the
recommendation is to namespace by the id's high byte (the third diacritic) so the foreground never needs touching. After
this fix the failure mode is a clean grid of blank placeholders instead of a smeared desktop — better, still broken.

**Gates.** Root suite 3682 passed after regenerating `budgets/entrypoints.json` (the module-touching rule again:
`terminal_screen.ts` grew 2584 bytes, module count unchanged). exomux suite 546 passed.

The maintainer still needs to drive the real thing: `terminal-browser open --split right` inside `tmux a` inside exomux,
in Ghostty. Headless mounts cannot see any of it.
