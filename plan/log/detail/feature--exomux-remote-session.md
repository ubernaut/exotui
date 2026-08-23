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
