// Copyright 2023 Im-Beast. MIT license.

// Shared test fakes for the exomux suites. These live outside app.test.ts so
// suites that need a fake client do not re-instantiate (and re-run) the whole
// app test module under Deno's per-file test isolation.

import type {
  ExomuxAttachResult,
  ExomuxClientPort,
  ExomuxOutputFrame,
  ExomuxSessionSummary,
  ExomuxSpawnOptions,
} from "../model.ts";

export class FakeExomuxClient implements ExomuxClientPort {
  connected = true;
  delayInputAcks = false;
  rejectAttach = false;
  truncateNextAttach = false;
  rejectKill = false;
  shutdownCalls = 0;
  readonly inputs: Array<{ sessionId: string; data: string }> = [];
  readonly spawned: ExomuxSpawnOptions[] = [];
  readonly detached: string[] = [];
  readonly killed: string[] = [];
  readonly #sessions = new Map<string, ExomuxSessionSummary>();
  readonly #replay = new Map<string, ExomuxOutputFrame[]>();
  readonly #listeners = new Map<string, (frame: ExomuxOutputFrame) => void>();
  readonly #sessionListeners = new Map<string, (session: ExomuxSessionSummary) => void>();
  readonly #broadcastListeners = new Set<(session: ExomuxSessionSummary) => void>();
  readonly #workspace = new Map<string, { revision: number; payload: unknown }>();
  readonly #workspaceListeners = new Set<
    (state: { readonly key: string; readonly revision: number; readonly payload: unknown }) => void
  >();
  readonly #pendingInputAcks: Array<() => void> = [];
  #ordinal = 1;

  constructor(
    sessions: readonly ExomuxSessionSummary[],
    replay: Readonly<Record<string, readonly ExomuxOutputFrame[]>> = {},
  ) {
    for (const session of sessions) this.#sessions.set(session.id, session);
    for (const [sessionId, frames] of Object.entries(replay)) this.#replay.set(sessionId, [...frames]);
  }

  list(): Promise<readonly ExomuxSessionSummary[]> {
    return Promise.resolve(this.listSnapshot());
  }

  subscribeSessions(listener: (session: ExomuxSessionSummary) => void): () => void {
    this.#broadcastListeners.add(listener);
    return () => {
      this.#broadcastListeners.delete(listener);
    };
  }

  /** Simulates the host's all-clients session-state broadcast (UX-007). */
  broadcastSession(summary: ExomuxSessionSummary): void {
    this.#sessions.set(summary.id, summary);
    for (const listener of [...this.#broadcastListeners]) listener(summary);
  }

  /**
   * The final state of a session the host has dropped: listeners hear it, but
   * a later `list` no longer returns it — exactly what the real daemon does
   * when another client kills a terminal (broadcast, then delete).
   */
  /** In-memory shared-state channel mirroring the daemon's retain-and-relay. */
  publishWorkspace(key: string, revision: number, payload: unknown): Promise<boolean> {
    const current = this.#workspace.get(key);
    if (current && revision <= current.revision) return Promise.resolve(true);
    this.#workspace.set(key, { revision, payload });
    // The real host skips the publisher; this fake relays to everyone, which
    // is stricter — a controller that cannot tolerate its own echo fails here.
    for (const listener of [...this.#workspaceListeners]) listener({ key, revision, payload });
    return Promise.resolve(true);
  }

  subscribeWorkspace(
    listener: (state: { readonly key: string; readonly revision: number; readonly payload: unknown }) => void,
  ): () => void {
    this.#workspaceListeners.add(listener);
    for (const [key, record] of this.#workspace) {
      listener({ key, revision: record.revision, payload: record.payload });
    }
    return () => {
      this.#workspaceListeners.delete(listener);
    };
  }

  emitSessionRemoved(summary: ExomuxSessionSummary): void {
    this.#sessions.delete(summary.id);
    this.#listeners.delete(summary.id);
    for (const listener of [...this.#broadcastListeners]) listener(summary);
  }

  listSnapshot(): ExomuxSessionSummary[] {
    return [...this.#sessions.values()];
  }

  spawn(options: ExomuxSpawnOptions): Promise<ExomuxSessionSummary> {
    this.spawned.push(options);
    const id = `spawned-${this.#ordinal++}`;
    const summary = session(id, options.title ?? id, 0, options.command);
    this.#sessions.set(id, summary);
    return Promise.resolve(summary);
  }

  attach(
    sessionId: string,
    options: {
      readonly sinceSequence?: number;
      readonly onOutput: (frame: ExomuxOutputFrame) => void;
      readonly onSession?: (session: ExomuxSessionSummary) => void;
    },
  ): Promise<ExomuxAttachResult> {
    if (this.rejectAttach) return Promise.reject(new Error("fake attach rejected"));
    const current = this.#sessions.get(sessionId);
    if (!current) return Promise.reject(new Error("missing fake session"));
    this.#listeners.set(sessionId, options.onOutput);
    if (options.onSession) this.#sessionListeners.set(sessionId, options.onSession);
    return Promise.resolve({
      session: current,
      replay: (this.#replay.get(sessionId) ?? []).filter((frame) => frame.sequence > (options.sinceSequence ?? 0)),
      truncated: this.truncateNextAttach,
    });
  }

  detach(sessionId: string): Promise<boolean> {
    this.detached.push(sessionId);
    this.#listeners.delete(sessionId);
    return Promise.resolve(this.#sessions.has(sessionId));
  }

  input(sessionId: string, data: string | Uint8Array): Promise<boolean> {
    this.inputs.push({
      sessionId,
      data: typeof data === "string" ? data : new TextDecoder().decode(data),
    });
    const accepted = this.#sessions.has(sessionId);
    if (!this.delayInputAcks) return Promise.resolve(accepted);
    return new Promise((resolve) => this.#pendingInputAcks.push(() => resolve(accepted)));
  }

  get pendingInputAckCount(): number {
    return this.#pendingInputAcks.length;
  }

  resolveNextInputAck(): void {
    this.#pendingInputAcks.shift()?.();
  }

  async resolveAllInputAcks(): Promise<void> {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      for (const resolve of this.#pendingInputAcks.splice(0)) resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (this.#pendingInputAcks.length === 0) return;
    }
    throw new Error("fake input ACK queue did not drain");
  }

  emitOutput(frame: ExomuxOutputFrame): void {
    this.#listeners.get(frame.sessionId)?.(frame);
  }

  /** Marks one session's child process as exited and notifies its attachment. */
  markExited(sessionId: string, exitCode: number): void {
    const current = this.#sessions.get(sessionId);
    if (!current) return;
    const exited: ExomuxSessionSummary = {
      ...current,
      status: "exited",
      running: false,
      exitCode,
      updatedAt: current.updatedAt + 1,
    };
    this.#sessions.set(sessionId, exited);
    this.#sessionListeners.get(sessionId)?.(exited);
  }

  readonly resizes: Array<{ sessionId: string; columns: number; rows: number }> = [];

  resize(sessionId: string, columns: number, rows: number): Promise<boolean> {
    this.resizes.push({ sessionId, columns, rows });
    return Promise.resolve(true);
  }

  kill(sessionId: string): Promise<boolean> {
    this.killed.push(sessionId);
    if (this.rejectKill) return Promise.resolve(false);
    this.#listeners.delete(sessionId);
    return Promise.resolve(this.#sessions.delete(sessionId));
  }

  shutdownHost(): Promise<boolean> {
    this.shutdownCalls += 1;
    this.#sessions.clear();
    this.#listeners.clear();
    return Promise.resolve(true);
  }

  dispose(): Promise<void> {
    this.connected = false;
    this.#listeners.clear();
    return Promise.resolve();
  }
}

export function session(
  id: string,
  title: string,
  sequence: number,
  commandLine = "/bin/test-shell",
): ExomuxSessionSummary {
  return {
    id,
    title,
    commandLine,
    status: "running",
    running: true,
    columns: 80,
    rows: 24,
    sequence,
    createdAt: 1,
    updatedAt: 1,
  };
}
