// Copyright 2023 Im-Beast. MIT license.

// REM-010: session endings are DETERMINISTIC and disposal is exactly
// once. The lifecycle policy declares idle expiry, absolute lifetime,
// per-tenant quotas, detach behavior, and drain grace; tick() evaluates
// on the caller's clock in a fixed order (lifetime before idle, drain
// before both once draining), so the same state always terminates for
// the same reason. Every termination — policy-driven, detach-driven,
// drain, or explicit — runs the terminal backend's dispose() exactly
// once behind a guard, and lands in a bounded termination journal with
// its reason.

/** Why a session ended. */
export type TerminationReason =
  | "idle-expired"
  | "lifetime-expired"
  | "detached"
  | "drained"
  | "explicit"
  | "quota-rejected";

/** Lifecycle policy. */
export interface SessionLifecyclePolicy {
  readonly idleMs?: number;
  readonly lifetimeMs?: number;
  readonly maxSessionsPerTenant?: number;
  /** What happens when the last client detaches (default "keep"). */
  readonly detachBehavior?: "keep" | "terminate";
  /** Grace period once draining begins (default 0: immediate). */
  readonly drainGraceMs?: number;
}

/** The terminal backend a session owns. */
export interface SessionBackend {
  dispose(): void;
}

/** One journal entry. */
export interface TerminationRecord {
  readonly sessionId: string;
  readonly reason: TerminationReason;
  readonly atMs: number;
}

interface SessionState {
  readonly tenant: string;
  readonly backend: SessionBackend;
  readonly openedAtMs: number;
  lastActivityMs: number;
  attached: number;
  disposed: boolean;
}

/** The lifecycle manager. */
export class SessionLifecycleManager {
  readonly #policy: SessionLifecyclePolicy;
  readonly #sessions = new Map<string, SessionState>();
  readonly #journal: TerminationRecord[] = [];
  #drainingSinceMs?: number;

  constructor(policy: SessionLifecyclePolicy = {}) {
    this.#policy = policy;
  }

  /** Opens a session under tenant quota; refusal is journaled. */
  open(sessionId: string, tenant: string, backend: SessionBackend, nowMs: number): boolean {
    if (this.#drainingSinceMs !== undefined) {
      this.#record(sessionId, "drained", nowMs);
      return false;
    }
    const quota = this.#policy.maxSessionsPerTenant;
    if (quota !== undefined) {
      const held = [...this.#sessions.values()].filter((session) => session.tenant === tenant).length;
      if (held >= quota) {
        this.#record(sessionId, "quota-rejected", nowMs);
        return false;
      }
    }
    this.#sessions.set(sessionId, {
      tenant,
      backend,
      openedAtMs: nowMs,
      lastActivityMs: nowMs,
      attached: 1,
      disposed: false,
    });
    return true;
  }

  /** Marks activity. */
  touch(sessionId: string, nowMs: number): void {
    const session = this.#sessions.get(sessionId);
    if (session) session.lastActivityMs = nowMs;
  }

  /** A client attached. */
  attach(sessionId: string, nowMs: number): void {
    const session = this.#sessions.get(sessionId);
    if (!session) return;
    session.attached += 1;
    session.lastActivityMs = nowMs;
  }

  /** A client detached; behavior follows the declared policy. */
  detach(sessionId: string, nowMs: number): void {
    const session = this.#sessions.get(sessionId);
    if (!session) return;
    session.attached = Math.max(0, session.attached - 1);
    if (session.attached === 0 && (this.#policy.detachBehavior ?? "keep") === "terminate") {
      this.#terminate(sessionId, "detached", nowMs);
    }
  }

  /** Begins graceful drain: no new sessions; existing get the grace. */
  drain(nowMs: number): void {
    this.#drainingSinceMs ??= nowMs;
  }

  /**
   * Evaluates policy on the caller's clock. Deterministic order per
   * session: drain (after grace) > lifetime > idle.
   */
  tick(nowMs: number): readonly TerminationRecord[] {
    const ended: TerminationRecord[] = [];
    for (const [sessionId, session] of [...this.#sessions]) {
      let reason: TerminationReason | undefined;
      if (
        this.#drainingSinceMs !== undefined &&
        nowMs - this.#drainingSinceMs >= (this.#policy.drainGraceMs ?? 0)
      ) {
        reason = "drained";
      } else if (this.#policy.lifetimeMs !== undefined && nowMs - session.openedAtMs >= this.#policy.lifetimeMs) {
        reason = "lifetime-expired";
      } else if (this.#policy.idleMs !== undefined && nowMs - session.lastActivityMs >= this.#policy.idleMs) {
        reason = "idle-expired";
      }
      if (reason) ended.push(this.#terminate(sessionId, reason, nowMs)!);
    }
    return ended;
  }

  /** Explicit termination. */
  terminate(sessionId: string, nowMs: number): boolean {
    return this.#terminate(sessionId, "explicit", nowMs) !== undefined;
  }

  journal(): readonly TerminationRecord[] {
    return [...this.#journal];
  }

  inspect(): { sessions: number; draining: boolean } {
    return { sessions: this.#sessions.size, draining: this.#drainingSinceMs !== undefined };
  }

  #terminate(sessionId: string, reason: TerminationReason, atMs: number): TerminationRecord | undefined {
    const session = this.#sessions.get(sessionId);
    if (!session) return undefined;
    this.#sessions.delete(sessionId);
    if (!session.disposed) {
      // The exactly-once guard: disposal cannot run twice for a session.
      session.disposed = true;
      session.backend.dispose();
    }
    return this.#record(sessionId, reason, atMs);
  }

  #record(sessionId: string, reason: TerminationReason, atMs: number): TerminationRecord {
    const record: TerminationRecord = { sessionId, reason, atMs };
    if (this.#journal.length >= 256) this.#journal.shift();
    this.#journal.push(record);
    return record;
  }
}

/** Creates a session lifecycle manager. */
export function createSessionLifecycleManager(policy: SessionLifecyclePolicy = {}): SessionLifecycleManager {
  return new SessionLifecycleManager(policy);
}
