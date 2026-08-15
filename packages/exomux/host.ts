// Copyright 2023 Im-Beast. MIT license.

import type { ProcessSessionInspection } from "@ubernaut/deno-tui/terminal";
import { ExomuxTerminalModeTracker } from "./terminal_modes.ts";
import {
  createProcessTerminalBackend,
  type TerminalBackend,
  type TerminalSessionHandle,
} from "@ubernaut/deno-tui/terminal";
import { createSigmaPtyTerminalBackend } from "@ubernaut/deno-tui/terminal";
import {
  decodeExomuxClientMessage,
  decodeExomuxData,
  encodeExomuxData,
  encodeExomuxMessage,
  EXOMUX_PROTOCOL_LIMITS,
  EXOMUX_PROTOCOL_VERSION,
  EXOMUX_WEBSOCKET_PATH,
  type ExomuxAcknowledgedMessage,
  type ExomuxClientRequest,
  type ExomuxErrorMessage,
  type ExomuxOutputMessage,
  ExomuxProtocolError,
  type ExomuxServerMessage,
  type ExomuxSessionDescriptor,
  type ExomuxSessionStatus,
  type ExomuxSpawnRequest,
} from "./protocol.ts";

const OUTPUT_ENCODER = new TextEncoder();
const WEBSOCKET_BACKPRESSURE_POLL_MS = 4;
const WEBSOCKET_BACKPRESSURE_TIMEOUT_MS = 5_000;
const SESSION_TITLE_REFRESH_MS = 100;
/** Matches the responsive Workbench PTY cadence instead of Sigma PTY's 100 ms default. */
export const EXOMUX_PTY_POLLING_INTERVAL_MS = 8;
/** How long a saturated session's ingestion waits between drain re-checks. */
const INGEST_DEFER_MS = 12;
/** Saturated waits give up after this long so a fully stalled client set falls
 * back to the slow-client quota instead of wedging ingestion forever. */
const INGEST_SATURATED_LIMIT_MS = WEBSOCKET_BACKPRESSURE_TIMEOUT_MS;
/** A large PTY batch yields to the event loop this often, so a flood can never
 * starve delivery, handshakes, or timers into a mute daemon. */
const INGEST_YIELD_BYTES = 256 * 1024;
/** Window for the unattached-session drain budget. */
const UNATTACHED_DRAIN_WINDOW_MS = 1_000;
const DEFAULT_HOST_LIMITS: Readonly<ExomuxHostLimits> = Object.freeze({
  clients: 32,
  sessions: 32,
  pendingInboundMessages: 64,
  inboundBytes: 2 * 1024 * 1024,
  outboundMessages: 512,
  outboundBytes: 2 * 1024 * 1024,
  replayEntries: 2048,
  replayBytes: 2 * 1024 * 1024,
  unattachedBytesPerSecond: 256 * 1024,
});

/** Bounded daemon-owned resource limits. */
export interface ExomuxHostLimits {
  clients: number;
  sessions: number;
  pendingInboundMessages: number;
  inboundBytes: number;
  outboundMessages: number;
  outboundBytes: number;
  replayEntries: number;
  replayBytes: number;
  /**
   * Per-session PTY drain budget while no client is attached. A session nobody
   * watches only feeds the replay ring, so reading it flat out buys nothing: a
   * paused game spewing full-screen effects at 2-4 MiB/s used to keep the
   * daemon at 100% CPU indefinitely. Past the budget the read loop defers and
   * the child blocks on the kernel PTY buffer; attaching restores full speed.
   */
  unattachedBytesPerSecond: number;
}

/** Transport-independent peer used by ExomuxHostController. */
export interface ExomuxHostPeer {
  /** Return false for sustained backpressure; abort cancels only this pending delivery. */
  send(message: string, signal: AbortSignal): boolean | void | Promise<boolean | void>;
  close(code: number, reason: string): void;
}

export interface ExomuxHostConnectionInspection {
  id: string;
  authenticated: boolean;
  closed: boolean;
  attachments: readonly string[];
  pendingInboundMessages: number;
  pendingInboundBytes: number;
  queuedOutboundMessages: number;
  queuedOutboundBytes: number;
}

/** A single client connection. Closing it only detaches views; it never owns or kills PTYs. */
export interface ExomuxHostConnection {
  readonly id: string;
  receive(message: string): Promise<void>;
  disconnect(): void;
  inspect(): ExomuxHostConnectionInspection;
}

export interface ExomuxHostInspection {
  id: string;
  running: boolean;
  clients: number;
  authenticatedClients: number;
  sessions: readonly ExomuxSessionDescriptor[];
  /** Undefined until the backend has been resolved; see `warmBackend`. */
  backend?: ExomuxHostBackendInspection;
}

export interface ExomuxHostControllerOptions {
  authToken: string;
  backend?: TerminalBackend;
  backendFactory?: () => TerminalBackend | Promise<TerminalBackend>;
  hostId?: string;
  idFactory?: () => string;
  now?: () => number;
  limits?: Partial<ExomuxHostLimits>;
  /**
   * Relocates the daemon's private descriptor to a new path when a session is
   * renamed. Returns true on success. Absent when the host was not launched by
   * a descriptor-owning daemon (tests, in-process hosts), where rename is a
   * no-op the client handles entirely on its side.
   */
  relocateDescriptor?: (descriptorPath: string) => boolean | Promise<boolean>;
}

export interface ServeExomuxHostOptions extends ExomuxHostControllerOptions {
  controller?: ExomuxHostController;
  hostname?: string;
  port?: number;
  path?: string;
  signal?: AbortSignal;
  websocketBufferedBytes?: number;
}

export interface ExomuxHostAddress {
  hostname: string;
  port: number;
  path: string;
  url: string;
}

export interface ExomuxHostServer {
  controller: ExomuxHostController;
  address: Promise<ExomuxHostAddress>;
  finished: Promise<void>;
  shutdown(): Promise<void>;
}

interface ReplayEntry {
  sequence: number;
  data: string;
  bytes: number;
}

/**
 * Puts the sticky-mode preamble in front of retained output without disturbing
 * sequence numbering: it rides on the first surviving frame, or becomes a frame
 * of its own at the session's current sequence when nothing survived.
 */
function prependModePreamble(
  retained: readonly ReplayEntry[],
  preamble: string,
  latestSequence: number,
): ReplayEntry[] {
  if (preamble === "") return [...retained];
  const bytes = new TextEncoder().encode(preamble);
  const first = retained[0];
  if (!first) {
    return [{ sequence: latestSequence, data: encodeExomuxData(bytes), bytes: bytes.byteLength }];
  }
  // Replay payloads are base64, so the preamble is merged before encoding
  // rather than concatenated after it.
  const head = decodeExomuxData(first.data);
  const merged = new Uint8Array(bytes.byteLength + head.byteLength);
  merged.set(bytes, 0);
  merged.set(head, bytes.byteLength);
  return [
    { sequence: first.sequence, data: encodeExomuxData(merged), bytes: merged.byteLength },
    ...retained.slice(1),
  ];
}

interface HostSession {
  id: string;
  handle: TerminalSessionHandle;
  title: string;
  titleCheckedAt: number;
  columns: number;
  rows: number;
  createdAt: number;
  updatedAt: number;
  sequence: number;
  replay: ReplayEntry[];
  replayBytes: number;
  /** Sticky DEC private modes, so a rotated replay cannot lose them. */
  modes: ExomuxTerminalModeTracker;
  clients: Set<HostConnection>;
  /** Unattached drain budget accounting; see ExomuxHostLimits.unattachedBytesPerSecond. */
  drainWindowStart: number;
  drainWindowBytes: number;
  ready: boolean;
  terminating: boolean;
  terminated: boolean;
  termination?: Promise<void>;
}

interface EncodedOutboundWork {
  kind: "message";
  encoded: string;
  bytes: number;
  settle?: (delivered: boolean) => void;
}

interface ReplayOutboundWork {
  kind: "replay";
  sessionId: string;
  attached?: EncodedOutboundWork;
  entries: readonly ReplayEntry[];
  nextEntry: number;
  deferred: EncodedOutboundWork[];
  currentBytes: number;
  committed: boolean;
  cancelled: boolean;
}

type OutboundWork = EncodedOutboundWork | ReplayOutboundWork;

interface ActiveOutboundSend {
  work: OutboundWork;
  abort: AbortController;
}

/**
 * Daemon-side session owner. The controller is independent of WebSockets so
 * lifecycle, replay, and hostile-input behavior can be tested deterministically.
 */
export class ExomuxHostController {
  readonly id: string;
  readonly #authToken: string;
  readonly #backendSelector: () => Promise<ExomuxTerminalBackendSelection>;
  readonly #idFactory: () => string;
  readonly #now: () => number;
  readonly #limits: Readonly<ExomuxHostLimits>;
  readonly #relocateDescriptor?: (descriptorPath: string) => boolean | Promise<boolean>;
  readonly #connections = new Map<string, HostConnection>();
  readonly #sessions = new Map<string, HostSession>();
  readonly #shutdownListeners = new Set<() => void>();
  #backendPromise?: Promise<ExomuxTerminalBackendSelection>;
  #selection?: ExomuxTerminalBackendSelection;
  #pendingSpawns = 0;
  #running = true;
  #shutdownPromise?: Promise<void>;

  constructor(options: ExomuxHostControllerOptions) {
    if (!/^[0-9a-f]{64}$/.test(options.authToken)) {
      throw new ExomuxProtocolError("invalid-auth", "Host auth token must encode exactly 32 random bytes.");
    }
    this.#authToken = options.authToken;
    this.#idFactory = options.idFactory ?? (() => crypto.randomUUID());
    this.id = normalizeGeneratedId(options.hostId ?? this.#idFactory(), "host");
    this.#now = options.now ?? (() => Date.now());
    this.#limits = normalizeHostLimits(options.limits);
    this.#relocateDescriptor = options.relocateDescriptor;
    // An injected backend or factory is taken at its word — only the default
    // path can report a PTY rejection, because only it attempts the load.
    const backend = options.backend;
    const factory = options.backendFactory;
    if (backend) {
      this.#backendSelector = () => Promise.resolve(Object.freeze({ backend, pty: backend.pty }));
    } else if (factory) {
      this.#backendSelector = async () => {
        const resolved = await factory();
        return Object.freeze({ backend: resolved, pty: resolved.pty });
      };
    } else {
      this.#backendSelector = () => selectExomuxTerminalBackend();
    }
  }

  /**
   * Resolves the backend up front so a degraded host is observable before the
   * first terminal is spawned rather than after. Safe to call repeatedly.
   */
  async warmBackend(): Promise<ExomuxTerminalBackendSelection> {
    return await this.#select();
  }

  connect(peer: ExomuxHostPeer): ExomuxHostConnection {
    const connection = new HostConnection(this, peer, this.#nextId("client"), this.#limits);
    if (!this.#running) {
      connection.close(1012, "host-stopped");
      return connection;
    }
    if (this.#connections.size >= this.#limits.clients) {
      connection.close(1013, "client-quota");
      return connection;
    }
    this.#connections.set(connection.id, connection);
    return connection;
  }

  inspect(): ExomuxHostInspection {
    let authenticatedClients = 0;
    for (const connection of this.#connections.values()) {
      if (connection.authenticated) authenticatedClients += 1;
    }
    return Object.freeze({
      id: this.id,
      running: this.#running,
      clients: this.#connections.size,
      authenticatedClients,
      sessions: Object.freeze(this.#sessionDescriptors()),
      ...(this.#selection
        ? {
          backend: Object.freeze({
            id: this.#selection.backend.id,
            label: this.#selection.backend.label,
            pty: this.#selection.pty,
            ...(this.#selection.degradedReason ? { degradedReason: this.#selection.degradedReason } : {}),
          }),
        }
        : {}),
    });
  }

  onShutdown(listener: () => void): () => void {
    this.#shutdownListeners.add(listener);
    return () => this.#shutdownListeners.delete(listener);
  }

  /** Explicit host shutdown is one of only two paths that kills and disposes PTYs. */
  shutdown(): Promise<void> {
    return this.#beginShutdown();
  }

  #beginShutdown(beforeClose?: () => void | Promise<void>): Promise<void> {
    if (this.#shutdownPromise) return this.#shutdownPromise;
    const operation = this.#performShutdown(beforeClose);
    this.#shutdownPromise = operation;
    void operation.catch(() => {
      if (this.#shutdownPromise === operation) this.#shutdownPromise = undefined;
    });
    return operation;
  }

  async handleMessage(connection: HostConnection, encoded: string): Promise<void> {
    if (!this.#running || connection.closed) return;
    let message;
    try {
      message = decodeExomuxClientMessage(encoded);
    } catch (error) {
      const protocol = protocolError(error);
      connection.enqueue(errorMessage(protocol.code, protocol.message));
      connection.close(1002, "protocol-error");
      return;
    }

    if (!connection.firstMessageReceived) {
      connection.firstMessageReceived = true;
      if (message.type !== "auth") {
        connection.enqueue(errorMessage("auth-required", "Authentication must be the first message."));
        connection.close(1008, "auth-required");
        return;
      }
      if (!constantTimeTokenEqual(message.token, this.#authToken)) {
        connection.close(1008, "auth-rejected");
        return;
      }
      connection.authenticated = true;
      connection.enqueue({ version: EXOMUX_PROTOCOL_VERSION, type: "ready", hostId: this.id });
      return;
    }

    if (!connection.authenticated || message.type === "auth") {
      connection.close(1008, "auth-order");
      return;
    }
    if (message.requestId <= connection.lastRequestId) {
      connection.enqueue(errorMessage("request-order", "Request ids must increase monotonically.", message.requestId));
      return;
    }
    connection.lastRequestId = message.requestId;

    try {
      await this.#dispatch(connection, message);
    } catch (error) {
      const protocol = protocolError(error);
      connection.enqueue(errorMessage(protocol.code, protocol.message, message.requestId));
    }
  }

  disconnect(connection: HostConnection): void {
    if (this.#connections.get(connection.id) !== connection) return;
    this.#connections.delete(connection.id);
    for (const sessionId of connection.attachments) {
      this.#sessions.get(sessionId)?.clients.delete(connection);
    }
    connection.attachments.clear();
  }

  async #dispatch(connection: HostConnection, request: ExomuxClientRequest): Promise<void> {
    switch (request.type) {
      case "list":
        connection.enqueue({
          version: EXOMUX_PROTOCOL_VERSION,
          type: "sessions",
          requestId: request.requestId,
          sessions: this.#sessionDescriptors(),
        });
        return;
      case "spawn":
        await this.#spawn(connection, request);
        return;
      case "attach":
        this.#attach(connection, request.requestId, request.sessionId, request.afterSequence ?? 0);
        return;
      case "detach": {
        const session = this.#requireSession(request.sessionId);
        session.clients.delete(connection);
        connection.attachments.delete(session.id);
        connection.cancelReplay(session.id);
        connection.enqueue(ack(request.requestId, "detach", session.id));
        return;
      }
      case "input": {
        const session = this.#requireSession(request.sessionId);
        requireAttachment(connection, session);
        if (!session.handle.inspect().running) {
          throw hostError("session-not-running", "Terminal session is not running.");
        }
        const accepted = await session.handle.write(decodeExomuxData(request.data));
        if (!accepted) throw hostError("input-rejected", "Terminal backend rejected input.");
        session.updatedAt = this.#now();
        connection.enqueue(ack(request.requestId, "input", session.id));
        setTimeout(() => {
          if (this.#sessions.get(session.id) !== session || session.terminated) return;
          if (this.#refreshSessionTitle(session, true)) this.#broadcastState(session);
        }, SESSION_TITLE_REFRESH_MS);
        return;
      }
      case "resize": {
        const session = this.#requireSession(request.sessionId);
        requireAttachment(connection, session);
        const accepted = await session.handle.resize(request.columns, request.rows);
        if (!accepted && session.handle.inspect().resizeSupported) {
          throw hostError("resize-rejected", "Terminal backend rejected resize.");
        }
        session.columns = request.columns;
        session.rows = request.rows;
        session.updatedAt = this.#now();
        connection.enqueue(ack(request.requestId, "resize", session.id));
        this.#broadcastState(session);
        return;
      }
      case "kill": {
        const session = this.#requireSession(request.sessionId);
        await this.#terminate(session);
        connection.enqueue(ack(request.requestId, "kill", request.sessionId));
        return;
      }
      case "ping":
        connection.enqueue({
          version: EXOMUX_PROTOCOL_VERSION,
          type: "pong",
          requestId: request.requestId,
          timestamp: this.#now(),
        });
        return;
      case "shutdown":
        await this.#beginShutdown(async () => {
          await connection.deliver(ack(request.requestId, "shutdown"));
        });
        return;
      case "rename": {
        // Relocating the descriptor is a daemon-owned filesystem move; an
        // in-process host without a relocator (tests) acknowledges as a no-op,
        // since the client handles the rest of the rename on its side.
        if (this.#relocateDescriptor) {
          const relocated = await this.#relocateDescriptor(request.descriptorPath);
          if (!relocated) throw hostError("rename-failed", "Host could not relocate its descriptor.");
        }
        connection.enqueue(ack(request.requestId, "rename"));
        return;
      }
    }
  }

  async #spawn(connection: HostConnection, request: ExomuxSpawnRequest): Promise<void> {
    if (!this.#running) throw hostError("host-stopped", "Exomux host is stopping.");
    if (this.#sessions.size + this.#pendingSpawns >= this.#limits.sessions) {
      throw hostError("session-quota", "Terminal session quota reached.");
    }
    this.#pendingSpawns += 1;
    try {
      const backend = (await this.#select()).backend;
      if (!this.#running) throw hostError("host-stopped", "Exomux host is stopping.");
      const id = this.#nextId("session");
      const createdAt = this.#now();
      const sessionRef: { current?: HostSession } = {};
      const pendingOutput: Uint8Array[] = [];
      let handle: TerminalSessionHandle;
      try {
        handle = backend.spawn({
          command: request.command,
          ...(request.args ? { args: [...request.args] } : {}),
          ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
          ...(request.env ? { env: { ...request.env } } : {}),
          columns: request.columns ?? 80,
          rows: request.rows ?? 24,
          onData: (data) => {
            const chunks = splitTerminalData(data);
            const session = sessionRef.current;
            if (!session?.ready) {
              pendingOutput.push(...chunks);
              return;
            }
            // Returning a promise defers the backend's next read: flow control
            // toward the source instead of unbounded ingestion.
            if (chunks.length === 1) {
              this.#appendOutput(session, chunks[0]!);
              return this.#ingestionDeferral(session);
            }
            return this.#ingestChunkedBatch(session, chunks);
          },
        });
      } catch {
        throw hostError("spawn-failed", "Terminal backend could not create the session.");
      }

      const inspection = safeHandleInspection(handle);
      const fallbackTitle = normalizeApplicationTitle(request.title) ?? applicationCommandName(request.command);
      const session: HostSession = {
        id,
        handle,
        title: normalizeApplicationTitle(inspection.title) ?? fallbackTitle,
        titleCheckedAt: createdAt,
        columns: request.columns ?? inspection.columns ?? 80,
        rows: request.rows ?? inspection.rows ?? 24,
        createdAt,
        updatedAt: createdAt,
        sequence: 0,
        replay: [],
        replayBytes: 0,
        modes: new ExomuxTerminalModeTracker(),
        clients: new Set([connection]),
        drainWindowStart: createdAt,
        drainWindowBytes: 0,
        ready: false,
        terminating: false,
        terminated: false,
      };
      sessionRef.current = session;
      this.#sessions.set(id, session);
      connection.attachments.add(id);
      connection.enqueue({
        version: EXOMUX_PROTOCOL_VERSION,
        type: "spawned",
        requestId: request.requestId,
        session: this.#descriptor(session),
      });
      session.ready = true;
      // Tell every other client about the new terminal immediately.
      this.#broadcastState(session);
      for (const chunk of pendingOutput.splice(0)) this.#appendOutput(session, chunk);
      void handle.closed.then((inspection) => this.#observeClosed(session, inspection)).catch(() => {
        this.#observeClosed(session, undefined);
      });
    } finally {
      this.#pendingSpawns -= 1;
    }
  }

  #attach(connection: HostConnection, requestId: number, sessionId: string, afterSequence: number): void {
    const session = this.#requireSession(sessionId);
    if (afterSequence > session.sequence) {
      throw hostError("invalid-sequence", "Requested output sequence is ahead of the session.");
    }
    const earliest = session.replay[0]?.sequence ?? session.sequence + 1;
    const truncated = afterSequence < earliest - 1;
    const latestSequence = session.sequence;
    // Snapshot references, not payloads: live ring rotation must not move the
    // attach barrier while this connection lazily produces its replay.
    const retained = session.replay.filter((entry) =>
      entry.sequence > afterSequence && entry.sequence <= latestSequence
    );
    // The raw ring rotates, so the bytes that switched on mouse reporting,
    // bracketed paste or the alternate screen are long gone on a busy session.
    // Re-assert the modes the child currently holds ahead of whatever survived;
    // the replay that follows ends in the same state, so this is idempotent.
    const replay = prependModePreamble(retained, session.modes.preamble(), latestSequence);
    const replayFromSequence = replay[0]?.sequence ?? latestSequence + 1;
    if (!connection.beginReplay(session.id)) {
      if (!connection.closed) throw hostError("attach-in-progress", "Session attachment is already replaying.");
      return;
    }
    session.clients.add(connection);
    connection.attachments.add(session.id);
    // A watcher arrived: leave the unattached drain budget behind immediately.
    session.drainWindowStart = this.#now();
    session.drainWindowBytes = 0;
    connection.commitReplay(
      {
        version: EXOMUX_PROTOCOL_VERSION,
        type: "attached",
        requestId,
        session: this.#descriptor(session),
        replayFromSequence,
        latestSequence,
        truncated,
      },
      replay,
    );
  }

  /**
   * A backend read can deliver far more than one protocol frame at once — an
   * internally buffered PTY hands back everything a flooding child produced
   * while the previous batch was processed. Ingest such batches incrementally:
   * wait out client saturation between chunks so the outbound queue stays
   * bounded, and yield to the event loop periodically so delivery, handshakes,
   * and timers keep running however large the batch is.
   */
  async #ingestChunkedBatch(session: HostSession, chunks: readonly Uint8Array[]): Promise<void> {
    let sinceYield = 0;
    for (const chunk of chunks) {
      // Termination must never wait behind a deferring backlog: the backend's
      // dispose awaits this pump, so bail as soon as a kill begins.
      if (session.terminated || session.terminating) return;
      this.#appendOutput(session, chunk);
      sinceYield += chunk.byteLength;
      const deferral = this.#ingestionDeferral(session);
      if (deferral) {
        await deferral;
        sinceYield = 0;
      } else if (sinceYield >= INGEST_YIELD_BYTES) {
        await delayMs(0);
        sinceYield = 0;
      }
    }
  }

  /**
   * Decides whether the session's PTY reads must pause. Unattached sessions
   * only feed the replay ring, so they are held to a small drain budget; a
   * session whose every live client sits above the outbound high-water mark
   * waits until one of them drains — the source slows down instead of the
   * fastest client being executed as `slow-client`. A client that stays
   * saturated while another drains still meets the existing 1013 protection,
   * and a fully stalled client set stops gating ingestion after a bounded wait
   * so the same quota can judge it.
   */
  #ingestionDeferral(session: HostSession): Promise<void> | undefined {
    if (session.terminated || session.terminating) return undefined;
    if (this.#countAttached(session) === 0) {
      const now = this.#now();
      if (now - session.drainWindowStart >= UNATTACHED_DRAIN_WINDOW_MS) {
        session.drainWindowStart = now;
        session.drainWindowBytes = 0;
      }
      if (session.drainWindowBytes <= this.#limits.unattachedBytesPerSecond) return undefined;
      const resumeIn = session.drainWindowStart + UNATTACHED_DRAIN_WINDOW_MS - now;
      return this.#deferUnlessTerminating(session, Math.max(1, resumeIn));
    }
    if (this.#anyClientDraining(session)) return undefined;
    return this.#awaitClientDrain(session);
  }

  /** Sleeps in short slices so a kill never waits out a long budget deferral. */
  async #deferUnlessTerminating(session: HostSession, totalMs: number): Promise<void> {
    for (let waited = 0; waited < totalMs; waited += INGEST_DEFER_MS) {
      if (session.terminated || session.terminating) return;
      await delayMs(Math.min(INGEST_DEFER_MS, totalMs - waited));
    }
  }

  #countAttached(session: HostSession): number {
    let attached = 0;
    for (const client of session.clients) if (!client.closed) attached += 1;
    return attached;
  }

  #anyClientDraining(session: HostSession): boolean {
    const highWater = Math.max(1, Math.floor(this.#limits.outboundBytes / 2));
    for (const client of session.clients) {
      if (!client.closed && client.queuedOutboundBytes < highWater) return true;
    }
    return false;
  }

  async #awaitClientDrain(session: HostSession): Promise<void> {
    const attempts = Math.max(1, Math.ceil(INGEST_SATURATED_LIMIT_MS / INGEST_DEFER_MS));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (session.terminated || session.terminating || this.#countAttached(session) === 0) return;
      if (this.#anyClientDraining(session)) return;
      await delayMs(INGEST_DEFER_MS);
    }
  }

  #appendOutput(session: HostSession, chunk: Uint8Array): void {
    if (session.terminated || chunk.byteLength === 0) return;
    session.drainWindowBytes += chunk.byteLength;
    session.modes.write(chunk);
    const entry: ReplayEntry = {
      sequence: ++session.sequence,
      data: encodeExomuxData(chunk),
      bytes: chunk.byteLength,
    };
    const updatedAt = this.#now();
    session.updatedAt = updatedAt;
    session.replay.push(entry);
    session.replayBytes += entry.bytes;
    while (
      session.replay.length > this.#limits.replayEntries ||
      session.replayBytes > this.#limits.replayBytes
    ) {
      const evicted = session.replay.shift();
      if (!evicted) break;
      session.replayBytes -= evicted.bytes;
    }
    const message = outputMessage(session.id, entry);
    for (const client of session.clients) client.enqueue(message);
    if (updatedAt - session.titleCheckedAt >= SESSION_TITLE_REFRESH_MS) {
      if (this.#refreshSessionTitle(session, true)) this.#broadcastState(session);
    }
  }

  #observeClosed(session: HostSession, _inspection: ProcessSessionInspection | undefined): void {
    if (this.#sessions.get(session.id) !== session || session.terminated) return;
    session.updatedAt = this.#now();
    this.#broadcastState(session);
  }

  #broadcastState(session: HostSession): void {
    const message: ExomuxServerMessage = {
      version: EXOMUX_PROTOCOL_VERSION,
      type: "session-state",
      session: this.#descriptor(session),
    };
    // Every authenticated client hears terminal lifecycle, not only the ones
    // attached to this terminal: a second client of the same exomux session
    // must see windows the first opens or closes without reconnecting
    // (UX-007). Attach-scoped delivery starved exactly that.
    for (const client of this.#connections.values()) {
      if (client.authenticated) client.enqueue(message);
    }
  }

  async #terminate(session: HostSession): Promise<void> {
    if (session.terminated) return;
    if (session.termination) return await session.termination;
    const operation = this.#performTermination(session);
    session.termination = operation;
    return await operation;
  }

  async #performTermination(session: HostSession): Promise<void> {
    session.terminating = true;
    let disposalFailed = false;
    try {
      await session.handle.kill("SIGTERM").catch(() => false);
      try {
        await session.handle.dispose();
      } catch {
        disposalFailed = true;
      }
      // Disposal failing is only fatal while the process is actually still
      // running. An exited session's handle is often already closed — its
      // dispose() throwing must not make the dead window unkillable (UX-005).
      if (safeHandleInspection(session.handle).running) {
        session.updatedAt = this.#now();
        throw hostError("termination-failed", "Terminal backend could not confirm session termination.");
      }
      if (disposalFailed) session.updatedAt = this.#now();
    } catch (error) {
      session.terminating = false;
      this.#broadcastState(session);
      throw error;
    }
    session.terminated = true;
    session.terminating = false;
    // A final not-running state reaches every client before the session is
    // dropped, so other attached desktops see the terminal exit instead of
    // keeping a silently frozen window.
    this.#broadcastState(session);
    this.#sessions.delete(session.id);
    for (const client of session.clients) {
      client.cancelReplay(session.id);
      client.attachments.delete(session.id);
    }
    session.clients.clear();
    session.replay.length = 0;
    session.replayBytes = 0;
  }

  async #performShutdown(beforeClose?: () => void | Promise<void>): Promise<void> {
    if (!this.#running) return;
    this.#running = false;
    const sessions = [...this.#sessions.values()];
    const terminations = await Promise.allSettled(sessions.map((session) => this.#terminate(session)));
    if (terminations.some((result) => result.status === "rejected")) {
      this.#running = true;
      throw hostError("shutdown-failed", "One or more terminal sessions could not stop.");
    }
    await beforeClose?.();
    for (const connection of [...this.#connections.values()]) connection.close(1001, "host-shutdown");
    this.#connections.clear();
    for (const listener of [...this.#shutdownListeners]) {
      try {
        listener();
      } catch {
        // Shutdown remains best-effort across listener failures.
      }
    }
    this.#shutdownListeners.clear();
  }

  #requireSession(id: string): HostSession {
    const session = this.#sessions.get(id);
    if (!session || session.terminated) throw hostError("session-not-found", "Terminal session does not exist.");
    return session;
  }

  #descriptor(session: HostSession): ExomuxSessionDescriptor {
    const inspection = safeHandleInspection(session.handle);
    this.#adoptSessionTitle(session, inspection.title);
    const status = normalizeStatus(inspection.status);
    return Object.freeze({
      id: session.id,
      backendId: boundedText(inspection.backendId || session.handle.backendId, 128),
      title: session.title,
      commandLine: boundedText(
        inspection.commandLine || session.handle.command.command,
        EXOMUX_PROTOCOL_LIMITS.argumentsBytes,
      ),
      status,
      running: Boolean(inspection.running) && !session.terminating && !session.terminated,
      columns: session.columns,
      rows: session.rows,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      latestSequence: session.sequence,
      attachedClients: session.clients.size,
    });
  }

  #sessionDescriptors(): ExomuxSessionDescriptor[] {
    return [...this.#sessions.values()]
      .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
      .map((session) => this.#descriptor(session));
  }

  #refreshSessionTitle(session: HostSession, force = false): boolean {
    const now = this.#now();
    if (!force && now - session.titleCheckedAt < SESSION_TITLE_REFRESH_MS) return false;
    session.titleCheckedAt = now;
    return this.#adoptSessionTitle(session, safeHandleInspection(session.handle).title, now);
  }

  #adoptSessionTitle(session: HostSession, value: string | undefined, updatedAt?: number): boolean {
    const title = normalizeApplicationTitle(value);
    if (!title || title === session.title) return false;
    session.title = title;
    session.updatedAt = Math.max(session.updatedAt, updatedAt ?? this.#now());
    return true;
  }

  #select(): Promise<ExomuxTerminalBackendSelection> {
    return this.#backendPromise ??= this.#backendSelector().then((selection) => {
      this.#selection = selection;
      return selection;
    });
  }

  #nextId(kind: string): string {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const value = normalizeGeneratedId(this.#idFactory(), kind);
      if (!this.#connections.has(value) && !this.#sessions.has(value) && value !== this.id) return value;
    }
    throw hostError("id-collision", "Host could not allocate a unique identifier.");
  }
}

class HostConnection implements ExomuxHostConnection {
  readonly attachments = new Set<string>();
  readonly #host: ExomuxHostController;
  readonly #peer: ExomuxHostPeer;
  readonly #limits: Readonly<ExomuxHostLimits>;
  readonly #outbound: OutboundWork[] = [];
  readonly #replays = new Map<string, ReplayOutboundWork>();
  readonly #deliveryWaiters = new Set<(delivered: boolean) => void>();
  #activeSend?: ActiveOutboundSend;
  #outboundMessages = 0;
  #outboundBytes = 0;
  #sending = false;
  /** Internal queue depth read by the controller's ingestion flow control. */
  get queuedOutboundBytes(): number {
    return this.#outboundBytes;
  }
  #pendingInbound = 0;
  #pendingInboundBytes = 0;
  #inboundTail: Promise<void> = Promise.resolve();
  authenticated = false;
  firstMessageReceived = false;
  lastRequestId = 0;
  closed = false;

  constructor(
    host: ExomuxHostController,
    peer: ExomuxHostPeer,
    readonly id: string,
    limits: Readonly<ExomuxHostLimits>,
  ) {
    this.#host = host;
    this.#peer = peer;
    this.#limits = limits;
  }

  receive(message: string): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (typeof message !== "string" || message.length > EXOMUX_PROTOCOL_LIMITS.messageBytes) {
      this.close(1009, "message-too-large");
      return Promise.resolve();
    }
    const messageBytes = OUTPUT_ENCODER.encode(message).byteLength;
    if (
      messageBytes > EXOMUX_PROTOCOL_LIMITS.messageBytes ||
      this.#pendingInboundBytes + messageBytes > this.#limits.inboundBytes
    ) {
      this.close(1009, "inbound-bytes");
      return Promise.resolve();
    }
    this.#pendingInbound += 1;
    if (this.#pendingInbound > this.#limits.pendingInboundMessages) {
      this.close(1013, "inbound-quota");
      this.#pendingInbound -= 1;
      return Promise.resolve();
    }
    this.#pendingInboundBytes += messageBytes;
    const operation = this.#inboundTail.then(() => this.#host.handleMessage(this, message));
    this.#inboundTail = operation.catch(() => undefined).finally(() => {
      this.#pendingInbound -= 1;
      this.#pendingInboundBytes -= messageBytes;
    });
    return operation;
  }

  enqueue(message: ExomuxServerMessage): void {
    if (this.closed) return;
    const work = this.#encode(message);
    if (!work || !this.#reserve(1, work.bytes)) return;
    const replay = this.#replays.get(outboundSessionId(message) ?? "");
    if (replay) replay.deferred.push(work);
    else this.#outbound.push(work);
    if (!this.#sending) void this.#flush();
  }

  /** Enqueues control traffic and resolves only after the peer accepted it. */
  deliver(message: ExomuxServerMessage): Promise<boolean> {
    if (this.closed) return Promise.resolve(false);
    const work = this.#encode(message);
    if (!work || !this.#reserve(1, work.bytes)) return Promise.resolve(false);
    const delivered = new Promise<boolean>((resolve) => {
      const settle = (accepted: boolean) => {
        if (!this.#deliveryWaiters.delete(settle)) return;
        resolve(accepted);
      };
      work.settle = settle;
      this.#deliveryWaiters.add(settle);
    });
    this.#outbound.push(work);
    if (!this.#sending) void this.#flush();
    return delivered;
  }

  /**
   * Reserves one bounded producer lane before the session starts forwarding live
   * output. Retained replay entries remain owned by the session and are encoded
   * one at a time instead of being duplicated into the transport queue.
   */
  beginReplay(sessionId: string): boolean {
    if (this.closed || this.#replays.has(sessionId) || !this.#reserve(1, 0)) return false;
    this.#replays.set(sessionId, {
      kind: "replay",
      sessionId,
      entries: [],
      nextEntry: 0,
      deferred: [],
      currentBytes: 0,
      committed: false,
      cancelled: false,
    });
    return true;
  }

  /** Starts a reserved lane. Each flush turn emits one frame for fair multi-session replay. */
  commitReplay(
    attached: ExomuxServerMessage,
    entries: readonly ReplayEntry[],
  ): void {
    if (this.closed) return;
    const sessionId = outboundSessionId(attached);
    const replay = sessionId ? this.#replays.get(sessionId) : undefined;
    if (!replay || replay.committed) {
      this.close(1011, "replay-state");
      return;
    }
    const encoded = this.#encode(attached);
    if (!encoded || !this.#reserve(0, encoded.bytes)) return;
    replay.attached = encoded;
    replay.entries = entries;
    replay.currentBytes = encoded.bytes;
    replay.committed = true;
    this.#outbound.push(replay);
    if (!this.#sending) void this.#flush();
  }

  /** Cancels queued replay before detach/kill acknowledgement can be emitted. */
  cancelReplay(sessionId: string): void {
    const replay = this.#replays.get(sessionId);
    if (!replay) return;
    this.#replays.delete(sessionId);
    replay.cancelled = true;
    const queued = this.#outbound.indexOf(replay);
    if (queued >= 0) this.#outbound.splice(queued, 1);
    this.#outboundMessages -= 1 + replay.deferred.length;
    this.#outboundBytes -= replay.currentBytes;
    for (const message of replay.deferred) this.#outboundBytes -= message.bytes;
    if (this.#activeSend?.work === replay) this.#activeSend.abort.abort("replay-cancelled");
    replay.attached = undefined;
    replay.currentBytes = 0;
    replay.deferred.length = 0;
  }

  disconnect(): void {
    if (this.closed) return;
    this.closed = true;
    this.#activeSend?.abort.abort("connection-disconnected");
    this.#activeSend = undefined;
    this.#settleDeliveries(false);
    this.#outbound.length = 0;
    this.#replays.clear();
    this.#outboundMessages = 0;
    this.#outboundBytes = 0;
    this.#host.disconnect(this);
  }

  close(code: number, reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.#activeSend?.abort.abort("connection-closed");
    this.#activeSend = undefined;
    this.#settleDeliveries(false);
    this.#outbound.length = 0;
    this.#replays.clear();
    this.#outboundMessages = 0;
    this.#outboundBytes = 0;
    this.#host.disconnect(this);
    try {
      this.#peer.close(code, boundedText(reason, 120));
    } catch {
      // A transport close failure cannot retain host resources.
    }
  }

  inspect(): ExomuxHostConnectionInspection {
    return Object.freeze({
      id: this.id,
      authenticated: this.authenticated,
      closed: this.closed,
      attachments: Object.freeze([...this.attachments].sort()),
      pendingInboundMessages: this.#pendingInbound,
      pendingInboundBytes: this.#pendingInboundBytes,
      queuedOutboundMessages: this.#outboundMessages,
      queuedOutboundBytes: this.#outboundBytes,
    });
  }

  #encode(message: ExomuxServerMessage): EncodedOutboundWork | undefined {
    try {
      const encoded = encodeExomuxMessage(message);
      return { kind: "message", encoded, bytes: OUTPUT_ENCODER.encode(encoded).byteLength };
    } catch {
      this.close(1011, "encode-failed");
      return undefined;
    }
  }

  #reserve(messages: number, bytes: number): boolean {
    if (
      this.#outboundMessages + messages > this.#limits.outboundMessages ||
      this.#outboundBytes + bytes > this.#limits.outboundBytes
    ) {
      this.close(1013, "slow-client");
      return false;
    }
    this.#outboundMessages += messages;
    this.#outboundBytes += bytes;
    return true;
  }

  #completeReplay(replay: ReplayOutboundWork): void {
    if (this.#replays.get(replay.sessionId) === replay) this.#replays.delete(replay.sessionId);
    this.#outboundMessages -= 1;
    replay.entries = [];
    replay.nextEntry = 0;
    replay.deferred.length = 0;
  }

  #settleDeliveries(delivered: boolean): void {
    for (const settle of [...this.#deliveryWaiters]) settle(delivered);
  }

  async #flush(): Promise<void> {
    if (this.#sending || this.closed) return;
    this.#sending = true;
    try {
      while (!this.closed) {
        const work = this.#outbound.shift();
        if (!work) break;
        let next: EncodedOutboundWork | undefined;
        let replayEntry = false;
        let deferredEntry = false;
        if (work.kind === "message") {
          next = work;
        } else if (work.attached) {
          next = work.attached;
        } else if (work.nextEntry < work.entries.length) {
          next = this.#encode(outputMessage(work.sessionId, work.entries[work.nextEntry]!));
          if (!next || !this.#reserve(0, next.bytes)) return;
          work.currentBytes = next.bytes;
          replayEntry = true;
        } else if (work.deferred.length > 0) {
          next = work.deferred[0];
          deferredEntry = true;
        } else {
          this.#completeReplay(work);
          continue;
        }
        let accepted: boolean | void;
        const abort = new AbortController();
        this.#activeSend = { work, abort };
        try {
          const interrupted = abortSignal(abort.signal);
          const delivery = await Promise.race([
            Promise.resolve(this.#peer.send(next.encoded, abort.signal)).then((value) => ({
              aborted: false as const,
              value,
            })),
            interrupted,
          ]);
          if (delivery.aborted) {
            if (this.closed) return;
            if (work.kind === "replay" && work.cancelled) continue;
            this.close(1011, "transport-cancelled");
            return;
          }
          accepted = delivery.value;
        } catch {
          if (work.kind === "replay" && work.cancelled) continue;
          if (this.closed) return;
          this.close(1011, "transport-failed");
          return;
        } finally {
          if (this.#activeSend?.abort === abort) this.#activeSend = undefined;
        }
        if (accepted === false) {
          if (work.kind === "replay" && work.cancelled) continue;
          this.close(1013, "slow-client");
          return;
        }
        if (this.closed) return;
        if (work.kind === "replay" && work.cancelled) continue;
        this.#outboundBytes -= next.bytes;
        if (work.kind === "message") {
          this.#outboundMessages -= 1;
          work.settle?.(true);
          continue;
        }
        work.currentBytes = 0;
        if (replayEntry) work.nextEntry += 1;
        else if (deferredEntry) {
          work.deferred.shift();
          this.#outboundMessages -= 1;
        } else work.attached = undefined;
        if (!work.attached && work.nextEntry >= work.entries.length && work.deferred.length === 0) {
          this.#completeReplay(work);
        } else this.#outbound.push(work);
      }
    } finally {
      this.#sending = false;
      if (!this.closed && this.#outbound.length > 0) void this.#flush();
    }
  }
}

/**
 * Which backend the host settled on, and why it settled there.
 *
 * The PTY adapter is optional: it loads a native library over the network on
 * first use, so it can fail for reasons that have nothing to do with this
 * codebase — no `--allow-ffi`, an offline or proxied machine, an unsupported
 * platform. Falling back to pipes keeps the host usable, but a pipe is not a
 * terminal: no job control, no `TIOCGWINSZ`, and line-discipline differences
 * that programs like tmux notice. Recording the reason means a degraded host is
 * something you can observe rather than something you have to infer.
 */
export interface ExomuxTerminalBackendSelection {
  readonly backend: TerminalBackend;
  readonly pty: boolean;
  /** Why the PTY adapter was rejected; absent when the PTY loaded. */
  readonly degradedReason?: string;
}

/** Reported on the host inspection so a degraded backend is externally visible. */
export interface ExomuxHostBackendInspection {
  readonly id: string;
  readonly label: string;
  readonly pty: boolean;
  readonly degradedReason?: string;
}

/** Picks the PTY backend when it loads and records the failure when it does not. */
export async function selectExomuxTerminalBackend(
  createPtyBackend: (
    options: { readonly pollingIntervalMs: number },
  ) => Promise<TerminalBackend> = createSigmaPtyTerminalBackend,
): Promise<ExomuxTerminalBackendSelection> {
  try {
    const backend = await createPtyBackend({ pollingIntervalMs: EXOMUX_PTY_POLLING_INTERVAL_MS });
    return Object.freeze({ backend, pty: backend.pty });
  } catch (error) {
    return Object.freeze({
      backend: createProcessTerminalBackend(),
      pty: false,
      degradedReason: describeBackendFailure(error),
    });
  }
}

/** Optional PTY-first backend used by the runnable host; tests may inject its loader seam. */
export async function createDefaultExomuxTerminalBackend(
  createPtyBackend: (
    options: { readonly pollingIntervalMs: number },
  ) => Promise<TerminalBackend> = createSigmaPtyTerminalBackend,
): Promise<TerminalBackend> {
  return (await selectExomuxTerminalBackend(createPtyBackend)).backend;
}

/** Keeps the reason short and free of stack traces; it is surfaced verbatim. */
function describeBackendFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const collapsed = message.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "PTY backend unavailable.";
  return collapsed.length > 200 ? `${collapsed.slice(0, 199)}…` : collapsed;
}

/** Starts a loopback-only WebSocket host. Session ownership remains in the returned controller. */
export function serveExomuxHost(options: ServeExomuxHostOptions): ExomuxHostServer {
  const hostname = options.hostname ?? "127.0.0.1";
  if (hostname !== "127.0.0.1" && hostname !== "::1") {
    throw new ExomuxProtocolError("non-loopback-host", "Exomux only listens on an explicit loopback address.");
  }
  const port = normalizePort(options.port ?? 0);
  const path = normalizeWebSocketPath(options.path ?? EXOMUX_WEBSOCKET_PATH);
  const websocketBufferedBytes = normalizePositiveLimit(
    options.websocketBufferedBytes,
    DEFAULT_HOST_LIMITS.outboundBytes,
    64 * 1024 * 1024,
    "websocketBufferedBytes",
  );
  const controller = options.controller ?? new ExomuxHostController(options);
  if (options.signal?.aborted) throw new DOMException("Exomux host start was aborted.", "AbortError");
  const abort = new AbortController();
  const externalAbort = () => {
    abort.abort(options.signal?.reason);
    void controller.shutdown();
  };
  options.signal?.addEventListener("abort", externalAbort, { once: true });
  const removeShutdown = controller.onShutdown(() => abort.abort());
  let resolveAddress!: (address: ExomuxHostAddress) => void;
  let rejectAddress!: (error: unknown) => void;
  const address = new Promise<ExomuxHostAddress>((resolve, reject) => {
    resolveAddress = resolve;
    rejectAddress = reject;
  });

  let server: Deno.HttpServer<Deno.NetAddr>;
  try {
    server = Deno.serve(
      {
        hostname,
        port,
        signal: abort.signal,
        onListen(local) {
          const urlHost = local.hostname.includes(":") ? `[${local.hostname}]` : local.hostname;
          resolveAddress({
            hostname: local.hostname,
            port: local.port,
            path,
            url: `ws://${urlHost}:${local.port}${path}`,
          });
        },
        onError() {
          return new Response("Exomux host error", {
            status: 500,
            headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
          });
        },
      },
      (request) => {
        const url = new URL(request.url);
        if (url.pathname !== path) return new Response("Not found", { status: 404 });
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
          return new Response("WebSocket upgrade required", {
            status: 426,
            headers: { "cache-control": "no-store", upgrade: "websocket" },
          });
        }
        const { socket, response } = Deno.upgradeWebSocket(request);
        const connection = controller.connect({
          async send(message, signal) {
            const messageBytes = OUTPUT_ENCODER.encode(message).byteLength;
            if (!await waitForWebSocketCapacity(socket, messageBytes, websocketBufferedBytes, signal)) return false;
            if (signal.aborted) return false;
            socket.send(message);
          },
          close(code, reason) {
            if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) return;
            socket.close(code, reason);
          },
        });
        socket.addEventListener("message", (event) => {
          if (typeof event.data !== "string") {
            connection.disconnect();
            try {
              socket.close(1003, "text-json-required");
            } catch {
              // Socket may already be closing.
            }
            return;
          }
          void connection.receive(event.data);
        });
        socket.addEventListener("close", () => connection.disconnect());
        socket.addEventListener("error", () => connection.disconnect());
        return response;
      },
    );
  } catch (error) {
    removeShutdown();
    options.signal?.removeEventListener("abort", externalAbort);
    rejectAddress(error);
    throw error;
  }

  const finished = server.finished.finally(() => {
    removeShutdown();
    options.signal?.removeEventListener("abort", externalAbort);
  });
  void finished.catch(rejectAddress);
  // Resolve the backend without blocking readiness: the PTY adapter may fetch a
  // native library on first use, and making the listener wait on that would let
  // a slow or offline network stall startup past the client's connect deadline.
  // Warming it concurrently means `inspect().backend` is populated early
  // instead of only after the first spawn.
  void controller.warmBackend().catch(() => {
    // selectExomuxTerminalBackend never rejects; a throwing injected factory
    // surfaces on the spawn that needs it.
  });
  return {
    controller,
    address,
    finished,
    async shutdown() {
      await controller.shutdown();
      abort.abort();
      await finished;
    },
  };
}

function ack(
  requestId: number,
  operation: ExomuxAcknowledgedMessage["operation"],
  sessionId?: string,
): ExomuxAcknowledgedMessage {
  return {
    version: EXOMUX_PROTOCOL_VERSION,
    type: "ack",
    requestId,
    operation,
    ...(sessionId ? { sessionId } : {}),
  };
}

function errorMessage(code: string, message: string, requestId?: number): ExomuxErrorMessage {
  return {
    version: EXOMUX_PROTOCOL_VERSION,
    type: "error",
    ...(requestId !== undefined ? { requestId } : {}),
    code: boundedText(code, 64),
    message: boundedText(message, EXOMUX_PROTOCOL_LIMITS.errorBytes),
  };
}

function outputMessage(sessionId: string, entry: ReplayEntry): ExomuxOutputMessage {
  return {
    version: EXOMUX_PROTOCOL_VERSION,
    type: "output",
    sessionId,
    sequence: entry.sequence,
    data: entry.data,
  };
}

function outboundSessionId(message: ExomuxServerMessage): string | undefined {
  switch (message.type) {
    case "attached":
    case "session-state":
      return message.session.id;
    case "output":
      return message.sessionId;
    default:
      return undefined;
  }
}

function abortSignal(signal: AbortSignal): Promise<{ aborted: true }> {
  if (signal.aborted) return Promise.resolve({ aborted: true });
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve({ aborted: true }), { once: true });
  });
}

async function waitForWebSocketCapacity(
  socket: WebSocket,
  messageBytes: number,
  maximumBufferedBytes: number,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted || messageBytes > maximumBufferedBytes) return false;
  const deadline = Date.now() + WEBSOCKET_BACKPRESSURE_TIMEOUT_MS;
  while (
    socket.readyState === WebSocket.OPEN &&
    socket.bufferedAmount + messageBytes > maximumBufferedBytes
  ) {
    if (signal.aborted || Date.now() >= deadline) return false;
    if (!await delayUnlessAborted(WEBSOCKET_BACKPRESSURE_POLL_MS, signal)) return false;
  }
  return !signal.aborted && socket.readyState === WebSocket.OPEN;
}

function delayMs(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function delayUnlessAborted(milliseconds: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function requireAttachment(connection: HostConnection, session: HostSession): void {
  if (!session.clients.has(connection) || !connection.attachments.has(session.id)) {
    throw hostError("not-attached", "Client must attach before controlling a terminal session.");
  }
}

function splitTerminalData(data: string | Uint8Array): Uint8Array[] {
  const bytes = typeof data === "string" ? OUTPUT_ENCODER.encode(data) : new Uint8Array(data);
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += EXOMUX_PROTOCOL_LIMITS.outputBytes) {
    chunks.push(bytes.slice(offset, offset + EXOMUX_PROTOCOL_LIMITS.outputBytes));
  }
  return chunks;
}

function safeHandleInspection(handle: TerminalSessionHandle): ReturnType<TerminalSessionHandle["inspect"]> {
  try {
    return handle.inspect();
  } catch {
    return {
      id: handle.id,
      backendId: handle.backendId,
      commandLine: handle.command.command,
      status: "failed",
      running: false,
      columns: 80,
      rows: 24,
      resizeSupported: false,
    };
  }
}

function normalizeStatus(value: unknown): ExomuxSessionStatus {
  return value === "idle" || value === "running" || value === "exited" || value === "failed" || value === "cancelled"
    ? value
    : "failed";
}

function normalizeHostLimits(options: Partial<ExomuxHostLimits> | undefined): Readonly<ExomuxHostLimits> {
  return Object.freeze({
    clients: normalizePositiveLimit(options?.clients, DEFAULT_HOST_LIMITS.clients, 256, "clients"),
    sessions: normalizePositiveLimit(
      options?.sessions,
      DEFAULT_HOST_LIMITS.sessions,
      EXOMUX_PROTOCOL_LIMITS.sessions,
      "sessions",
    ),
    pendingInboundMessages: normalizePositiveLimit(
      options?.pendingInboundMessages,
      DEFAULT_HOST_LIMITS.pendingInboundMessages,
      4096,
      "pendingInboundMessages",
    ),
    inboundBytes: normalizePositiveLimit(
      options?.inboundBytes,
      DEFAULT_HOST_LIMITS.inboundBytes,
      64 * 1024 * 1024,
      "inboundBytes",
    ),
    outboundMessages: normalizePositiveLimit(
      options?.outboundMessages,
      DEFAULT_HOST_LIMITS.outboundMessages,
      16_384,
      "outboundMessages",
    ),
    outboundBytes: normalizePositiveLimit(
      options?.outboundBytes,
      DEFAULT_HOST_LIMITS.outboundBytes,
      64 * 1024 * 1024,
      "outboundBytes",
    ),
    replayEntries: normalizePositiveLimit(
      options?.replayEntries,
      DEFAULT_HOST_LIMITS.replayEntries,
      65_536,
      "replayEntries",
    ),
    replayBytes: normalizePositiveLimit(
      options?.replayBytes,
      DEFAULT_HOST_LIMITS.replayBytes,
      64 * 1024 * 1024,
      "replayBytes",
    ),
    unattachedBytesPerSecond: normalizePositiveLimit(
      options?.unattachedBytesPerSecond,
      DEFAULT_HOST_LIMITS.unattachedBytesPerSecond,
      64 * 1024 * 1024,
      "unattachedBytesPerSecond",
    ),
  });
}

function normalizePositiveLimit(value: number | undefined, fallback: number, maximum: number, name: string): number {
  const normalized = value ?? fallback;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
    throw new ExomuxProtocolError("invalid-limit", `${name} is outside the supported range.`);
  }
  return normalized;
}

function normalizePort(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 65_535) {
    throw new ExomuxProtocolError("invalid-port", "Exomux port must be between 0 and 65535.");
  }
  return value;
}

function normalizeWebSocketPath(value: string): string {
  if (typeof value !== "string" || !/^\/[A-Za-z0-9/_-]{1,127}$/.test(value) || value.includes("//")) {
    throw new ExomuxProtocolError("invalid-path", "Exomux WebSocket path is invalid.");
  }
  return value;
}

function normalizeGeneratedId(value: string, kind: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new ExomuxProtocolError("invalid-id", `Generated ${kind} id is invalid.`);
  }
  return value;
}

function constantTimeTokenEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function boundedText(value: string, maxBytes: number): string {
  if (OUTPUT_ENCODER.encode(value).byteLength <= maxBytes) return value;
  let end = Math.min(value.length, maxBytes);
  while (end > 0 && OUTPUT_ENCODER.encode(value.slice(0, end)).byteLength > maxBytes) end -= 1;
  return value.slice(0, end);
}

function applicationCommandName(command: string): string {
  const normalized = normalizeApplicationTitle(command);
  return normalized ?? "terminal";
}

function normalizeApplicationTitle(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  let result = "";
  let pendingSpace = false;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || /\s/u.test(char)) {
      pendingSpace = result.length > 0;
      continue;
    }
    if (pendingSpace) result += " ";
    pendingSpace = false;
    result += char;
  }
  result = result.trim();
  if (!result) return undefined;
  if (!result.includes(" ")) result = result.split(/[\\/]/).at(-1) ?? result;
  return boundedText(result, EXOMUX_PROTOCOL_LIMITS.titleBytes) || undefined;
}

function protocolError(error: unknown): ExomuxProtocolError {
  return error instanceof ExomuxProtocolError
    ? error
    : new ExomuxProtocolError("host-failed", "Exomux host operation failed.");
}

function hostError(code: string, message: string): ExomuxProtocolError {
  return new ExomuxProtocolError(code, message);
}
