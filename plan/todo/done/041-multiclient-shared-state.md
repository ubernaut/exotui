# Multi-client shared state

Status: complete August 18 2026.

User report (Aug 18 2026): attaching two clients to the same exomux session shows very little shared state. Changing the
theme on one does not change the other; closing a window on one leaves it on the other, dead or labelled "[EXITED]".
Direction: fix all of it.

## Audit findings

The daemon shares exactly ONE thing: PTY session descriptors. Everything else that looks shared is two files on disk,
read once at process start.

- `#broadcastState` (host.ts:738-753) correctly fans `session-state` to every authenticated connection. The CLIENT
  throws it away: `#acceptBroadcastSession` (controller.ts:2550-2570) is adopt-only — it returns early for an existing
  runtime, returns at :2563 when `!summary.running`, and only creates windows for running-and-unknown sessions. There is
  no removal branch. `#runtimes.delete` appears exactly once in the whole controller (controller.ts:2645), inside
  `#killSessionOnce`, which only the INITIATING client runs.
- Result: the observer keeps an inert window (writeSession short-circuits on `!running`, controller.ts:2711) whose title
  carries no status (controller.ts:3086) while the Sessions row reads "[EXITED]" (app.ts:502). Only the manual
  prefix-`r` `refreshSessions` prunes; it has one non-test caller (controller.ts:1694).
- `detach` produces no broadcast at all (host.ts:422-428), so "close this window but keep the shell" cannot propagate.
- A naturally exited session is never removed from the daemon map (host.ts:735), so a NEWLY attached client materialises
  windows for already-dead sessions.
- Preferences (theme, background, globalSettings, backgroundSettings) never leave the process: the flow ends at a
  debounced `schedule()` in main.ts:610. The protocol has no preference message. Worse, at launch the config file
  overrides the layout snapshot (controller.ts:2832-2841) and each writer merges into a snapshot seeded at its own load
  time (main.ts:570), so the second client clobbers the first's theme on disk.
- Window layout persists to a shared per-session `layout.json` under the same key for both clients, but it is read
  exactly once at kernel construction (kernel.ts:216-218). Last writer wins; neither is notified.
- Precedent worth noting: `watchExomuxShaderConfig` (config.ts:171-215) already does live cross-process adoption, but
  delivers only `config.shaders`.

## Design

The daemon is the natural home for shared state: it already outlives every client and is the thing they have in common.
Rather than widen the config file watcher (same-machine only, last-write-wins, racy), add ONE generic shared-state
channel to the protocol and carry every shared payload on it.

- Host holds one opaque record per key with a monotonic revision, relays updates to every OTHER authenticated client,
  and hands the current record to a client when it authenticates. The host never interprets the payload.
- Clients publish on change and adopt on receipt. Last writer wins by revision, which is what a desktop wants for
  preferences; conflicting concurrent edits are not a real workflow here.
- Geometry is deliberately NOT shared. Two clients routinely have different terminal sizes (a phone and a desktop), and
  sharing absolute rectangles between them is wrong. What is shared is window LIFECYCLE and ordering, which is size
  independent: which windows exist, which are minimized/closed/maximized, focus order.

## Phases

- [x] **A — session removal.** Teach `#acceptBroadcastSession` to reconcile removals: a session that stops running, or
      that the daemon has dropped, removes its runtime and its window on every client, not just the initiator. Broadcast
      detach from the host so closing a window propagates. Prune already-dead sessions on attach.
- [x] **B — shared-state channel.** `workspace` client->host message and `workspace-state` host->client event, with host
      retention and relay-to-others; delivered on auth. Protocol normalizers, host state, client API, tests.
- [x] **C — preferences over the channel.** theme, background, globalSettings, backgroundSettings publish and adopt
      live. The config file stays the durable per-machine default. One correction to the design as written: the config
      file and the layout snapshot are startup DEFAULTS, not overrides. A client that joins a desktop which is already
      up adopts what is on screen, so `#initialize` skips the appearance assignment once `#adoptSharedPreferences` has
      run — otherwise the host's replay lands first and initialization immediately clobbers it.
- [x] **D — window lifecycle over the channel.** Closed and minimized are shared; geometry stays local, with the
      existing reflow keeping each client's windows on its own screen.

      Maximize and focus order are NOT shared, against the original bullet. Both are viewport-derived here: under the
      mobile layout `presentWindow` maximizes its target and puts everything else away, so sharing either would let a
      phone impose its one-window navigation on a desktop. For the same reason a mobile client publishes
      `minimized: null` — "no opinion" — and ignores an adopted minimized set, while still publishing and adopting
      closes, which are deliberate on any screen size.
