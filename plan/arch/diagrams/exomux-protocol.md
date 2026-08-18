# exomux daemon protocol

Supports `../overview.md` — "the daemon outlives its clients". History:
`../../todo/done/041-multiclient-shared-state.md`.

Two clients on one daemon: what is negotiated, what is replayed, and what is relayed.

```mermaid
sequenceDiagram
  participant A as Client A
  participant D as Daemon (host.ts)
  participant P as PTY
  participant B as Client B

  Note over A,D: descriptor on disk carries url, token,<br/>and the capabilities this daemon advertises
  A->>D: auth(token)
  D-->>A: ready(hostId)
  D-->>A: workspace-state (every retained key)
  A->>D: attach(sessionId, afterSequence)
  D-->>A: attached(descriptor, replayFrom, latest, truncated)
  D-->>A: replay frames, then live output
  P-->>D: output
  D-->>A: output(sequence)

  Note over B,D: B attaches later and is caught up the same way
  B->>D: auth + attach
  D-->>B: ready, workspace-state, attached, replay

  A->>D: workspace(key, revision, payload)
  D-->>B: workspace-state(key, revision, payload)
  Note right of D: relayed to every OTHER client;<br/>stale revisions dropped

  A->>D: presence(...)
  D-->>A: error(unknown-message, requestId)
  Note right of D: an unknown type from an authenticated<br/>client fails that call, not the session
```

## What to notice

- **Capabilities are advertised in the descriptor, not assumed.** A client that predates a message never sends it, and a
  client that postdates the daemon checks first. Skipping this bricked reattachment once.
- **The error is correlated.** An uncorrelated error frame is terminal on the client, so refusing a call must carry the
  `requestId` of the call being refused.
- **Replay is bounded** by a per-session ring; a client that has fallen too far behind is told `truncated` rather than
  handed a partial screen it would render as garbage.
- **Geometry is deliberately absent** from the shared channel. A phone and a laptop share which windows exist, not where
  they are.
