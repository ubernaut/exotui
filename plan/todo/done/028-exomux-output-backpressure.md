# 028 · Exomux PTY output backpressure

**Done 2026-08-10.** Implemented as designed (onData deferral seam, saturated-client waits, unattached drain budget,
batch yields, termination-aware deferrals) and validated against the live game. Residual documented in the CHANGELOG:
the Sigma PTY FFI pump buffers internally, so an abandoned flood still grows daemon memory slowly.

## The reproduced failure

A user's terminal game (`sn8ks`, Rust + crossterm) crashed Exomux, and relaunching then failed with
`The recorded Exomux host still appears alive but did not respond`. Reproduced 2026-08-10 against the real detached
daemon by running the game inside Exomux and pressing Esc: the pause screen plays a full-screen TV-static effect, which
redraws essentially every cell every frame with truecolor SGR — sustained 2–4 MiB/s of PTY output at 60–90 chunks/s,
indefinitely, because a paused game is exactly what a user leaves unattended.

Measured consequences, in order:

1. The attached client is disconnected with close code `1013 "slow-client"` — the per-client outbound queue (2 MiB / 512
   messages) overflows, not because the loopback WebSocket is slow but because the daemon's event loop is saturated by
   ingestion, starving its own flush loop. In the real workbench this kills the UI session.
2. With **zero clients attached**, the daemon stays at 100%+ CPU and RSS climbs without bound (138 → 395 MiB in ~17 s,
   still rising when killed). The paused game keeps rendering static; the daemon keeps draining it flat out to feed a 2
   MiB replay ring.
3. A fresh connect then times out during auth (single 1.5 s budget reliably fails; a 6 s budget with retries sometimes
   squeaks through at ~4 s). Before the 2026-08-10 recovery work this produced the permanently stuck launch; with it,
   the descriptor is quarantined and a fresh host launches, but the wedged daemon still owns the PTYs and burns a core
   forever.

## Root cause

`pty_backend.ts` `#readChunks` drains the PTY every 8 ms with no flow control, however fast the child writes. Each chunk
then pays, in `host.ts` `#appendOutput` and the handle's own bookkeeping: mode-tracker parse, base64 encode, replay-ring
rotation, a second UTF-8 decode into the inspection line buffer, and per-client enqueue. Ingestion has strictly higher
priority than every consumer of its results, so a child that writes faster than the daemon can process starves delivery,
auth, and GC — while a real terminal would simply stop reading and let the kernel PTY buffer block the child's writes.

## Fix direction

Apply backpressure at the read loop instead of absorbing the flood:

- Extend the terminal backend seam so the `onData` consumer can defer the next read — e.g. allow
  `TerminalBackendSpawnOptions.onData` to return `void | Promise<void>` and make the PTY poll loop await it (additive,
  pre-1.0). The kernel PTY buffer then blocks the child once the daemon stops reading, exactly like a real terminal
  under a slow reader.
- In the Exomux host, return a deferral when ingestion outruns consumption:
  - **No clients attached:** throttle each session to a small drain budget (replay freshness only). A paused game's
    static then blocks in the child at trivial daemon cost; reads return to full speed on attach.
  - **Clients attached:** defer reads while _every_ attached client's outbound queue is near its cap, so a hostile
    output rate slows the child instead of executing the fastest client as a `slow-client`. A client that stays
    saturated while others drain still gets the existing `1013` protection.
- Keep the input path (`input`, `resize`, control barriers) unthrottled — prior latency work
  (`muxstone-input-latency-20260720`, `muxstone-compounding-input-backlog-20260720`) must not regress, and asciichurn's
  sustained-but-consumable throughput must still flow at full speed when clients keep up.
- Regressions to add: a deterministic flood-producer session asserting bounded daemon CPU/RSS and no `slow-client` close
  for a draining client; an unattached-flood test asserting the child blocks rather than the replay ring churning at
  full rate; an attach-after-flood test asserting resumed output and a correct mode preamble.

## Evidence

Probe harnesses from the 2026-08-10 session (scratchpad, reproducible from any checkout): an in-process host driving
`sn8ks` menu → game → Esc, and an out-of-process daemon probe sampling `/proc/<pid>` while pausing the game, abandoning
the client, and attempting reconnect.
