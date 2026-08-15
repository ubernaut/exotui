# Exomux Network Menu Program (formerly "Tailnet")

Status: MVP implementation in progress as of July 21, 2026. Fleshes out the original notes in
`plan/tailscale-integration.md`; this document is the authoritative plan and supersedes those notes.

## Direction updates (user, July 21 2026)

- **D3 resolved**: the menu-bar button is `[ Network ]`, not Tailnet/Tailscale.
- The panel's top level is split into two sections: **Hosts** (remembered SSH targets, including non-Tailscale-enabled
  machines) and **Tailscale** (live tailnet devices).
- Hosts the user connects to are **remembered** (persisted in workspace state) and can be **deleted** from the panel
  (Del key on a saved host row).
- Landed in the MVP: `[ Network ]` menu entry, left-docked floating panel window, Hosts/Tailscale sections, saved-host
  memory + delete, tailscale status via LocalAPI-with-CLI-fallback source, visibility-gated polling, SSH spawn through
  the existing daemon spawn request, keyboard/pointer/wheel navigation.
- The panel hierarchy is driven by the shared workbench `TreeController` (`src/components/tree.ts`) — real
  expandable/collapsible browsing (machines fold open to their actions), the same widget the workbench uses; the
  per-machine `Sessions` and further `Actions` children slot into this tree as they land.
- Spawned SSH/terminal windows now open centered (with a slight cascade) and focused above the panel; the network window
  stacks in the normal tier so new terminals always land on top of it.
- Landed July 21: paste-to-scp (TSM-014 core) — pasting one existing local file path onto a network-panel SSH shell
  opens a Send / Paste path / Cancel modal; Send runs argv-only `scp -q -- <file> <target>:` in the background with
  status-line progress, Paste path forwards the literal text, and every other paste flows through untouched. Destination
  is the remote home directory; OSC 7 remote-cwd tracking (D4) remains open.
- **TSM-010 landed Aug 15 2026:** every saved host and tailnet device grows an `Actions` subtree — System monitor
  (`ssh -t` with a remote `btop → htop → top` probe, one command string resolved by the remote shell), Ping (bounded
  argv-only local `ping -c 1 -W 3` through the injectable `TailnetCommandRunner`, result in the status line), and
  Copy IPv4 / Copy MagicDNS / Copy address (OSC 52 through the hosting terminal's stdout via the library's
  `terminalClipboardSequence`; a status-line confirmation names what was copied). The Details modal from the ledger
  row was deferred — it was not in the acceptance criteria.
- **TSM-012/013 landed Aug 15 2026:** every machine grows a lazily-probed `Sessions` node — expanding it runs one
  batched `ssh -o BatchMode=yes` command (tmux tab-separated rows, a `--exomux--` marker, then exomux's own session
  table) through the bounded injectable runner, cached per target with a 30s TTL and force-refreshed by `r`.
  Discovered rows render as `tmux: main (3) · attached` / `exomux: default (2)`; Enter attaches over
  `ssh -t <target> tmux attach -t <name>` (or `exomux -a <name>`) in a new window, re-activating focuses the window
  already attached to that machine+session, and Shift-Enter forces a second attachment. Hostile probe lines and
  non-conservative session names are dropped before argv.
- Still tracked below (unchanged): remaining OSC 7 cwd targeting for scp (a `pwd`-probe capture already landed),
  capability/provider manifest integration (TSM-011), fuzzy filter.

This roadmap adds first-class Tailscale awareness to the Exomux terminal-multiplexer showcase: a `[ Tailnet ]` menu-bar
entry beside `[ New ]` that opens a floating, TOC-style tree panel on the left edge of the desktop, from which tailnet
machines can be inspected, opened as SSH terminal sessions, monitored, and used as scp targets.

## Source requirements (from `plan/tailscale-integration.md`)

1. Tree view of the computers in the network, built on the existing deno_tui tree/file-explorer widget.
2. Open a remote shell on a machine via SSH, appearing as a new terminal window in this desktop.
3. Drag-and-drop/paste a local file onto a remote terminal → scp it directly into the folder currently active in that
   remote shell.
4. Under each machine, an actions submenu (launch shell, system monitor, …) and a sessions submenu listing tmux/exomux
   sessions on that machine; activating a session opens it in a new terminal or focuses the window if it is already
   open.

## Grounding in the current code

- Menu bar: Exomux renders a row-0 menu bar with `[ New ] [ Sessions ] [ Theme ] [ Help ]`
  (`examples/showcases/exomux/app.ts:122-125`, `app.ts:1561-1572`) driven by `ExomuxMenuId` (`app.ts:141`) and
  `registerMenuTarget` (`app.ts:1133-1138`). The new entry slots immediately to the right of `[ New ]`; the frozen
  column constants re-flow.
- Tree widget: `src/components/tree.ts` (with `file_explorer.ts` as the styling reference) provides expandable nodes,
  keyboard navigation, and selection — the panel composes it rather than inventing a list control.
- Session spawning: the wire protocol already supports arbitrary `command`, `args`, `cwd`, `env`, and `title` in
  `ExomuxSpawnRequest` (`examples/showcases/exomux/protocol.ts:59-68`), so SSH shells, remote monitors, and remote tmux
  attaches require **no protocol change** — they are all just spawn argv.
- Floating windows: automatic floating startup and the `WorkbenchWindowHostController` shelf/tier machinery already
  exist; the panel is one more floating window with a reserved window id (`model.ts` window-id helpers).
- Capability/provider seam: `ExomuxClientProvider` (`controller.ts:899`) and the shared showcase provider contract
  (`examples/showcases/shared/provider.ts`) define the degraded/unavailable reporting model.
- Paste plumbing: Exomux already has modal-safe paste handling and the canonical input envelope carries paste events —
  the scp-on-paste flow builds on that, not on new input machinery.
- Persistence: Showcase Session V2 (`examples/showcases/shared/session.ts`, `terminal_store.ts`) persists window
  geometry; panel visibility/geometry/expansion state ride the same store.

## Goals

- Discover tailnet devices with zero configuration when the `tailscale` CLI is present and logged in.
- One-gesture SSH: activate a device, get a new floating Exomux terminal attached to that machine.
- Per-machine tree: actions (shell, system monitor) and live remote tmux/exomux session lists, with
  focus-if-already-open semantics.
- File transfer: paste/drop a local file path onto a remote terminal and scp it into that shell's current directory,
  with explicit confirmation.
- Degrade gracefully (missing binary, logged out, daemon down, offline) without ever blocking the UI.
- Follow Exomux's existing security posture: strict input normalization, bounded parsing, no secrets in logs or
  persistence, explicit permission manifest entries, argv-only subprocess execution.

## Non-goals (tracked, not in scope)

- Tailnet administration (key rotation, ACL editing, device authorization/removal).
- Changing routing state (exit nodes, subnet routes) — read-only display at most.
- Browser-host support (Exomux is terminal-host only today, `model.ts:272`); revisit with SHOW-WIN browser work.
- Bundling or installing Tailscale itself; managing SSH credentials or keys.

## UX specification

### Menu entry

- New `ExomuxMenuId` value `"tailnet"`, rendered as `[ Tailnet ]` between `[ New ]` and `[ Sessions ]`.
- Activation (click, coarse tap, or keyboard) toggles the Tailnet panel. When the capability is unavailable the entry
  stays visible but muted and opens the panel in its diagnostic state (TSM-008) — discoverability over hiding.
- Prefix binding: recommend `Ctrl-B @` (open decision D2).

### Panel: floating tree TOC on the left

- Default placement: floating window docked to the left edge, below the menu bar, full desktop height minus menu and
  footer rows; default width 32 columns (min 24, max 44), user-resizable/movable like any floating window; geometry,
  visibility, and node-expansion state persist across sessions.
- Built on the existing tree widget. Node hierarchy:

  ```
  ▾ This device (workshop)          ← self node: tailnet name, version, backend state
  ▾ Online
    ▾ ● studio (linux)
        Open shell                  ← default action, also Enter on the machine row
      ▾ Actions
          System monitor            ← configurable argv, default htop/btop probe
          Ping
          Copy IPv4 / Copy MagicDNS
          Details…
      ▾ Sessions                    ← lazily fetched on expand
          tmux: main (3 windows)
          tmux: scratch
          exomux: default (2 terminals)
    ▸ ● renderbox (linux)
  ▸ Offline (3)                     ← collapsed by default, rows muted, last-seen shown
  ```

- Row anatomy: status glyph + short hostname + OS tag; a toggleable detail line shows tailnet IPv4 and a `relay` marker
  when traffic is DERP-relayed. Status glyphs pair shape with color for color-blind safety: `●` online, `○` offline, `◐`
  idle/relay-only.
- Interaction: `↑/↓`/`j/k` move, `←/→` collapse/expand, `Enter` activates (machine row → shell; session row →
  attach-or-focus; action row → run), `m`/right-click opens the same action set as a context menu, `/` fuzzy filter
  across machine and session names, `r` forces refresh, `Esc` closes the panel and returns focus to the previously
  focused window.
- Spawned windows: floating (matching current floating-spawn default), titled with the device short name (plus session
  name for attaches); the footer session row inherits the same title so panel, title bar, and footer agree.

### Remote sessions submenu

- Expanding a machine's `Sessions` node triggers a bounded remote query over SSH (batched into one command):
  `tmux list-sessions -F '#{session_name}\t#{session_windows}\t#{session_attached}'` plus a exomux host
  descriptor/session probe. Results are cached per machine with a short TTL and refreshed on expand or `r`.
- Activating a session row spawns `ssh -t <host> tmux attach -t <name>` (or `tmux new -A -s` per D5) — or the exomux
  attach equivalent — in a new floating window. If a window for that machine+session is already open, it is focused
  instead of duplicated (`Shift-Enter` forces a second attach).
- Machines that are offline, or where the probe finds no tmux/exomux, render an empty-state row ("no sessions") rather
  than an error.

### File transfer: paste/drop → scp

- When a local filesystem path is pasted (or OS-level dropped, which terminals deliver as a paste) onto a focused Exomux
  terminal window whose session was spawned as a Tailnet SSH shell, Exomux intercepts it **before** forwarding to the
  PTY and offers a modal: `scp /local/file → studio:~/current/dir ? [Send] [Paste path] [Cancel]`. "Paste path"
  preserves today's behavior exactly; plain text pastes are never intercepted.
- The remote destination is the shell's current working directory, tracked via OSC 7 (`file://host/path`) working
  directory reports parsed by the terminal screen's OSC handler. When the remote shell does not emit OSC 7, the transfer
  falls back to the remote home directory and says so in the modal (open decision D4 covers a shell-integration snippet
  to opt in).
- Transfer runs `scp` (argv-only) in a supervised background task with progress and completion/failure reported in the
  status line; multiple transfers queue per machine.

## Architecture

### Data source: client-side `tailscale` CLI (Phase 1)

- A new `TailscaleStatusSource` runs `tailscale status --json` (and `tailscale version`) via `Deno.Command` with argv
  arrays only — never a shell — under a caller-owned deadline and an output byte cap, mirroring the hostile-input stance
  of `protocol.ts` normalizers.
- Rationale for client-side: the Exomux host is loopback-only (`host.ts:979-981`), so client and daemon are the same
  machine; the client already holds subprocess capability (it launches the daemon, `client.ts:636`). Running status
  queries client-side avoids protocol changes. **Open decision D1** records the host-side alternative for a hypothetical
  remote-host future.
- Polling: refresh every 15s with ±20% jitter while the panel is visible; exponential backoff (max 2 min) on failure;
  zero polling while hidden. Manual `r` always allowed. All subprocess work runs in a supervised task group so disposal
  cancels cleanly. Remote session probes are on-demand (expand/refresh), never polled.
- Snapshot cache: last good parsed status (redacted, JSON-safe) is written through the showcase terminal store so a
  reopened panel paints instantly with a `stale — refreshing…` badge instead of a spinner.

### Normalization and model

- `TailnetDevice` type in `model.ts`: id (stable node key hash), shortName, dnsName, ipv4, ipv6, os, online, lastSeen,
  self, tags, relayed. `TailnetRemoteSession` type: machineId, kind (`tmux | exomux`), name, windows, attached. All
  fields pass bounded normalizers (length caps, charset checks); unknown/extra JSON and unparseable probe lines are
  dropped, never echoed.
- **Never store or log auth keys, node keys, or machine keys.** Key-material fields are stripped at parse time; any
  secret-shaped diagnostic value goes through the SEC-008 opaque secret wrapper.
- Controller additions: `tailnetDevices`, `tailnetSessions` (per-machine cache), `tailnetStatus`
  (`ready | stale | degraded | unavailable`), `tailnetPanelVisible`, `tailnetFilter`, and a machine+session → windowId
  map powering focus-if-open. The panel projection consumes them reactively like the session list.

### Capability integration

- `ExomuxClientProvider` gains optional capability `network.tailscale` reporting `available` (CLI present, logged in),
  `degraded` (daemon stopped / NeedsLogin), or `unavailable` (no binary).
- The runtime permission manifest gains explicit subprocess entries for `tailscale` (status/version/ping), `ssh`, and
  `scp`, with provenance, so activation reports stay honest (SEC-001).

### Spawn paths

- Shell: prefer `tailscale ssh <shortName>` when supported for the target, else `ssh <dnsName>`; `SSH as user…` prompts
  via the existing modal input and produces `user@host`.
- System monitor: `ssh -t <host> <monitor argv>`, where the monitor command is a configurable per-showcase setting
  defaulting to `htop` with a `btop`→`top` fallback probe.
- Session attach: `ssh -t <host> tmux attach -t <name>` / exomux attach equivalent.
- Hostnames, users, session names, and paths are validated against conservative charsets before entering argv
  (defense-in-depth even though argv arrays already prevent shell injection). The confirm path previews the exact argv
  in the status line; `Enter` on a row is the explicit user gesture.

## Feature ledger

| ID      | Feature                                                                                               | Acceptance                                                                                                                                                                                                                  | Label   |
| ------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| TSM-001 | `[ Tailnet ]` menu entry + `ExomuxMenuId`                                                             | Entry renders beside `[ New ]`, toggles panel, muted-but-present when unavailable; pointer + keyboard activation covered by pilot test                                                                                      | Compose |
| TSM-002 | `TailscaleStatusSource` (CLI exec, deadline, byte cap, strict parse, secret stripping)                | Fixture tests: valid status, oversized output, malformed JSON, missing binary, NeedsLogin; no key material survives parsing                                                                                                 | Host    |
| TSM-003 | `TailnetDevice`/`TailnetRemoteSession` model + controller signals + snapshot cache                    | Normalizers reject hostile fields; cache round-trips through terminal store; stale badge deterministic under fake clock                                                                                                     | Core    |
| TSM-004 | Floating tree panel window (left-docked default, persistent geometry/visibility/expansion)            | Opens at default rect on first run, restores persisted state on relaunch, resizes within min/max, closes with focus return                                                                                                  | Compose |
| TSM-005 | Tree composition on the existing tree widget: groups, machine rows, glyph+color status, detail toggle | Snapshot tests across at least two themes; color-blind-safe glyph/text pairing asserted; offline group collapsed by default                                                                                                 | Compose |
| TSM-006 | Keyboard nav + expand/collapse + fuzzy filter + manual refresh                                        | Pilot test drives `↑/↓ j/k ←/→ Tab / r Esc Enter` end-to-end with fixture data                                                                                                                                              | Compose |
| TSM-007 | SSH shell spawn (default + as-user) with argv validation and title propagation                        | Spawn request captured in host test carries expected argv/title; hostile hostname rejected before spawn                                                                                                                     | Host    |
| TSM-008 | Degraded/unavailable panel states with actionable hints (`install tailscale`, `tailscale up`)         | Each state renders its hint; no polling in `unavailable`; recovery to `ready` without restart                                                                                                                               | Core    |
| TSM-009 | Poll scheduler (jitter, backoff, visibility-gated, task-group supervised)                             | Fake-clock tests prove cadence, backoff ceiling, zero subprocess spawns while hidden, clean cancellation on dispose                                                                                                         | Core    |
| TSM-010 | Per-machine Actions nodes: system monitor, ping, copy IPv4/DNS (OSC 52), details modal                | Monitor spawns configured argv over `ssh -t`; ping result/timeout in status line; copy emits OSC 52 payload in pilot capture                                                                                                | Compose |
| TSM-011 | Permission manifest + provider capability reporting                                                   | Activation report lists tailscale/ssh/scp subprocess grants with provenance; capability transitions available→degraded→available under fixture control                                                                      | Host    |
| TSM-012 | Remote session discovery (tmux + exomux probe over SSH, TTL cache, lazy on expand)                    | Fixture-driven probe parser tests incl. hostile/truncated output; empty-state and offline rows render; no probe for collapsed nodes                                                                                         | Host    |
| TSM-013 | Session attach with focus-if-open                                                                     | Activating a listed session spawns attach argv; re-activating focuses the existing window; `Shift-Enter` forces a duplicate; map survives window close                                                                      | Compose |
| TSM-014 | Paste/drop → scp with OSC 7 cwd tracking and confirm modal                                            | Path paste on a tailnet SSH window offers Send/Paste path/Cancel; OSC 7 dir used when present, home fallback labeled; plain text never intercepted; transfer progress + failure surfaced; deterministic tests with fake scp | Host    |
| TSM-015 | Docs + showcase roadmap sync (this file, hiatus/025 ledger, api-reference if any public surface moves)       | `deno task exomux:check` and repo gates pass; hiatus/025 references the TSM block                                                                                                                                                  | Gap     |

### Phase 2 (after MVP verified)

- TSM-020 Taildrop send as an alternative transfer transport (`tailscale file cp`) where scp is unavailable.
- TSM-021 Sort modes (name/os/last-seen) and pinned favorites (persisted).
- TSM-022 Panel dock-right and shelf-minimize modes; remember last dock side.
- TSM-023 Multi-file and directory transfers (recursive scp) with a queue view.
- TSM-024 Exit-node and serve/funnel **read-only** indicators in Details.
- TSM-025 Configurable per-machine action list (user-defined argv entries) with strict validation.

### Phase 3 (explicitly gated)

- TSM-030 Host-side status source behind a protocol v2 `tailnet-status` request (only if remote hosts ever ship).
- TSM-031 Browser-host panel once Exomux gains a browser host (real drag-and-drop file transfer becomes possible there).
- TSM-032 Multi-tailnet/profile switching (`tailscale switch`) — needs an account-context UX design note first.

## Usability considerations

- **First paint is never blocked on the CLI.** Cached snapshot (or empty-state skeleton) renders immediately; live data
  replaces it. Subprocess failures surface in the status line, never as modals.
- **Lazy remote work.** Session probes run only on expand — collapsing a tailnet of 100 machines costs zero SSH
  connections. Probe results carry their age so a stale sessions list is visibly stale.
- **Narrow terminals:** below ~70 desktop columns the panel opens as a temporary always-on-top overlay that auto-closes
  on selection instead of tiling into scarce space.
- **Focus discipline:** opening the panel remembers the focused window; every close path (Esc, menu toggle, spawn,
  attach-focus) restores or intentionally moves focus. Spawning moves focus to the new terminal — the panel closes in
  overlay mode, stays open in docked mode.
- **Theme fidelity:** all panel colors resolve through the active Exomux theme (13 themes) — no hardcoded RGB; glyphs
  must remain legible in T2 Neural Steel and the darkest Workbench theme.
- **SSH prerequisites are the user's:** if `tailscale ssh` is unsupported and plain `ssh` fails (no key/agent), the
  terminal window shows ssh's own error — Exomux does not manage credentials; the Details modal shows which transport
  was chosen and why.
- **Transfer trust:** the scp modal always shows source path, destination machine, and destination directory; the "Paste
  path" escape hatch keeps the old behavior one keystroke away; nothing transfers without the modal.
- **No surprise processes:** polling only while visible; every subprocess class is listed in the permission manifest;
  argv is previewable. Uninstalling Tailscale flips the capability to `unavailable` on the next poll with a single
  status-line notice, no error spam.
- **Latency honesty:** rows carry a `relay` marker when traffic is DERP-relayed, setting expectations before a session
  opens.
- **Testing-first:** a `TailnetFixtureSource` (mirroring Inkstone's `fixture_provider.ts`) provides deterministic device
  sets — large tailnets (100+ nodes), all-offline, single-self — plus fake ssh/tmux/scp probe outputs, powering unit,
  pilot, and snapshot tests without a real tailnet. `deno task exomux:test` grows `exomux_tailnet.test.ts`.

## Open decisions

- **D1 — status source placement:** Phase 1 runs the CLI client-side (client and host share a machine today). Revisit
  host-side (TSM-030) only if remote hosts are scheduled.
- **D2 — prefix key:** recommend `Ctrl-B @` (mnemonic: network address); alternatives `T` (shift) or `g`. Decide before
  TSM-006 lands.
- **D3 — naming:** "Tailnet" (recommended: describes the network, avoids implying official affiliation with the
  Tailscale product in a showcase) vs "Tailscale". Affects menu label and docs only.
- **D4 — remote cwd opt-in:** ship a documented one-line shell-integration snippet (OSC 7 emitter) for remote machines,
  or rely on home-directory fallback silently. Recommendation: document the snippet in Details and the transfer modal's
  fallback notice.
- **D5 — attach semantics:** `tmux attach -t` (fail if absent) vs `tmux new -A -s` (create-or-attach). Recommendation:
  plain attach for listed sessions (they exist by definition); a separate "New tmux session…" action can use `new -A`
  later.

## Delivery order

TSM-002 → TSM-003 → TSM-009 (headless core with fixtures) → TSM-001/004/005/006 (tree UI) → TSM-007/008 → TSM-010/011 →
TSM-012/013 (remote sessions) → TSM-014 (scp) → TSM-015 closeout, then repository gates (`deno task exomux:check`,
`exomux:test`, full `deno test`) with fresh ICC evidence and a verified ICC attempt.
