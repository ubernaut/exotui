// Copyright 2023 Im-Beast. MIT license.

// 036 R1: the stream-ownership audit, recorded as CHECKED DATA. For
// each transport the contract names who creates the byte stream, who
// may read and write, who is allowed to close it, and the teardown
// order — audited against the real modules: ProcessSessionController
// owns its PTY end to end (kill/dispose close the pair and resolve
// `closed`); an SSH session's stream belongs to the ssh client on the
// far side, the app only ever borrows a TTY it must not close; the
// remote server owns per-client WebSocket framing but the CREATING
// host closes the socket on a lifecycle verdict; an embedding page
// owns its xterm.js instance and the adapter only borrows onData/
// write; a browser-remote client owns its own socket and surface.
// isStreamActionAllowed is deny-by-default: an actor/action pair not
// named in the contract is refused, which is what makes the audit
// enforceable instead of prose.

/** The audited transports. */
export type StreamTransport = "pty" | "ssh" | "websocket" | "xterm.js" | "browser-remote";

/** The actors a contract can name. */
export type StreamActor =
  | "app"
  | "session-controller"
  | "remote-server"
  | "creating-host"
  | "embedding-page"
  | "browser-client"
  | "external";

/** One transport's ownership contract. */
export interface StreamOwnershipContract {
  readonly creates: StreamActor;
  readonly reads: readonly StreamActor[];
  readonly writes: readonly StreamActor[];
  /** ONLY these actors may close; everyone else is refused. */
  readonly closes: readonly StreamActor[];
  readonly teardownOrder: readonly string[];
  readonly borrowed: boolean;
  readonly notes: string;
}

/** The audited contract for all five transports. */
const CONTRACT = {
  pty: {
    creates: "session-controller",
    reads: ["session-controller"],
    writes: ["app"],
    closes: ["session-controller"],
    teardownOrder: ["kill child", "close pty pair", "resolve closed promise"],
    borrowed: false,
    notes: "ProcessSessionController owns the pair end to end; hosts never touch the raw fd.",
  },
  ssh: {
    creates: "external",
    reads: ["app"],
    writes: ["app"],
    closes: ["external"],
    teardownOrder: ["app restores terminal modes", "ssh client closes the channel"],
    borrowed: true,
    notes: "The stream belongs to the ssh client on the far side; the app sees a plain TTY " +
      "with the remote environment flag set and must never close it.",
  },
  websocket: {
    creates: "creating-host",
    reads: ["remote-server"],
    writes: ["remote-server"],
    closes: ["creating-host"],
    teardownOrder: ["lifecycle verdict", "flush frame flow", "creating host closes socket"],
    borrowed: false,
    notes: "The remote server owns framing (codec/flow/resume); the host that opened the " +
      "socket closes it when the session lifecycle rules a termination.",
  },
  "xterm.js": {
    creates: "embedding-page",
    reads: ["app"],
    writes: ["app"],
    closes: ["embedding-page"],
    teardownOrder: ["adapter unsubscribes onData", "page disposes the terminal"],
    borrowed: true,
    notes: "The adapter borrows onData/write callbacks; disposing the xterm.js instance is " +
      "the embedding page's job alone.",
  },
  "browser-remote": {
    creates: "browser-client",
    reads: ["browser-client", "remote-server"],
    writes: ["browser-client", "remote-server"],
    closes: ["browser-client", "remote-server"],
    teardownOrder: [
      "client detaches surface",
      "either side closes on lifecycle verdict",
      "server retires per-client state",
    ],
    borrowed: false,
    notes: "The client owns its socket and rendering surface; the server owns per-client " +
      "session state and may also close on a lifecycle verdict.",
  },
} as const satisfies Record<StreamTransport, StreamOwnershipContract>;

for (const contract of Object.values(CONTRACT)) Object.freeze(contract);

/** The frozen per-transport ownership contract `isStreamActionAllowed` enforces. */
export const STREAM_OWNERSHIP_CONTRACT: Readonly<Record<StreamTransport, StreamOwnershipContract>> = Object.freeze(
  CONTRACT,
);

/** Deny-by-default: only actors the contract names may act. */
export function isStreamActionAllowed(
  transport: StreamTransport,
  actor: StreamActor,
  action: "read" | "write" | "close",
): boolean {
  const contract = STREAM_OWNERSHIP_CONTRACT[transport];
  if (!contract) return false;
  const allowed = action === "read" ? contract.reads : action === "write" ? contract.writes : contract.closes;
  return allowed.includes(actor);
}
