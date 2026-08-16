// Copyright 2023 Im-Beast. MIT license.

// REM-006: reconnecting is a TOKEN plus a CHECKPOINT, both bounded. A
// reconnect token is single-use with a caller-clock expiry — redeeming
// it a second time fails as replayed, redeeming late fails as expired,
// and both invalidate nothing else. Each session keeps exactly one
// checkpoint: the newest acknowledged frame (its full content and
// sequence) plus the input acknowledgement. A successful resume hands
// back that checkpoint — the client repaints from the acked frame, so no
// acknowledged output is lost, and it resumes SENDING input after the
// returned ack, so replayed inputs land at or below the sequencer's ack
// and become inert duplicates. Tokens here are opaque host-side ids;
// they ride the REM-003 secure transport, never a URL.

import type { CellFrame } from "./frame_codec.ts";

/** One session's resumable state. */
export interface SessionCheckpoint {
  /** The newest acknowledged frame, in full. */
  readonly frame: CellFrame;
  /** That frame's sequence number in the REM-005 flow. */
  readonly frameSequence: number;
  /** The REM-007 input acknowledgement at checkpoint time. */
  readonly inputAck: number;
}

/** A resume outcome. */
export type ResumeResult =
  | { readonly ok: true; readonly sessionId: string; readonly checkpoint: SessionCheckpoint }
  | { readonly ok: false; readonly reason: "expired" | "replayed" | "unknown-token" | "no-checkpoint" };

interface TokenState {
  readonly sessionId: string;
  readonly expiresAtMs: number;
  redeemed: boolean;
}

/** The resume manager. */
export class SessionResumeManager {
  readonly #tokens = new Map<string, TokenState>();
  readonly #checkpoints = new Map<string, SessionCheckpoint>();
  readonly #ttlMs: number;
  #counter = 0;

  constructor(options: { readonly tokenTtlMs?: number } = {}) {
    this.#ttlMs = options.tokenTtlMs ?? 60_000;
  }

  /** Records a session's newest checkpoint — exactly one is kept. */
  checkpoint(sessionId: string, state: SessionCheckpoint): void {
    this.#checkpoints.set(sessionId, state);
  }

  /** Issues one single-use reconnect token. */
  issueToken(sessionId: string, nowMs: number): string {
    const token = `rt${++this.#counter}-${nowMs.toString(36)}`;
    this.#tokens.set(token, { sessionId, expiresAtMs: nowMs + this.#ttlMs, redeemed: false });
    return token;
  }

  /** Redeems a token. Single use; expiry and replay fail closed. */
  resume(token: string, nowMs: number): ResumeResult {
    const state = this.#tokens.get(token);
    if (!state) return { ok: false, reason: "unknown-token" };
    if (state.redeemed) return { ok: false, reason: "replayed" };
    if (nowMs >= state.expiresAtMs) return { ok: false, reason: "expired" };
    state.redeemed = true;
    const checkpoint = this.#checkpoints.get(state.sessionId);
    if (!checkpoint) return { ok: false, reason: "no-checkpoint" };
    return { ok: true, sessionId: state.sessionId, checkpoint };
  }

  /** Drops expired and redeemed tokens; returns how many were released. */
  sweep(nowMs: number): number {
    let released = 0;
    for (const [token, state] of [...this.#tokens]) {
      if (state.redeemed || nowMs >= state.expiresAtMs) {
        this.#tokens.delete(token);
        released += 1;
      }
    }
    return released;
  }

  /** Ends a session: its checkpoint and outstanding tokens disappear. */
  end(sessionId: string): void {
    this.#checkpoints.delete(sessionId);
    for (const [token, state] of [...this.#tokens]) {
      if (state.sessionId === sessionId) this.#tokens.delete(token);
    }
  }

  inspect(): { tokens: number; checkpoints: number } {
    return { tokens: this.#tokens.size, checkpoints: this.#checkpoints.size };
  }
}

/** Creates a session resume manager. */
export function createSessionResumeManager(options: { readonly tokenTtlMs?: number } = {}): SessionResumeManager {
  return new SessionResumeManager(options);
}
