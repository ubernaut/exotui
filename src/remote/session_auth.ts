// Copyright 2023 Im-Beast. MIT license.

// REM-002: authentication becomes a short-lived PRINCIPAL, not a carried
// credential. The host-supplied authenticator sees the credential exactly
// once at setup and exchanges it for a session principal — an opaque
// session id, explicit roles, and a caller-clock expiry — after which the
// protocol only ever carries the session id. Capability checks resolve
// through the CURRENT role set on every call, so a role change (or a
// revocation) takes effect immediately: there is no cached capability
// object that could outlive the grant.

/** Explicit session roles. */
export type SessionRole = "viewer" | "controller" | "moderator" | "admin";

/** Capabilities gated by role. */
export type SessionCapability =
  | "view-output"
  | "send-input"
  | "resize"
  | "transfer-control"
  | "invite"
  | "terminate-session";

const ROLE_CAPABILITIES: Readonly<Record<SessionRole, readonly SessionCapability[]>> = {
  viewer: ["view-output"],
  controller: ["view-output", "send-input", "resize"],
  moderator: ["view-output", "send-input", "resize", "transfer-control", "invite"],
  admin: ["view-output", "send-input", "resize", "transfer-control", "invite", "terminate-session"],
};

/** The short-lived principal the protocol carries AFTER setup. */
export interface SessionPrincipal {
  /** Opaque id — carries no credential material. */
  readonly sessionId: string;
  readonly subject: string;
  readonly expiresAtMs: number;
}

/** The host authenticator: sees the credential once, returns identity. */
export type Authenticator = (
  credential: string,
) =>
  | { subject: string; roles: readonly SessionRole[] }
  | undefined
  | Promise<
    { subject: string; roles: readonly SessionRole[] } | undefined
  >;

/** An authorization decision. */
export type AuthDecision =
  | { readonly allowed: true; readonly role: SessionRole }
  | { readonly allowed: false; readonly reason: string };

interface SessionState {
  subject: string;
  roles: Set<SessionRole>;
  expiresAtMs: number;
  revoked: boolean;
}

/** The session authority. */
export class RemoteSessionAuthority {
  readonly #authenticate: Authenticator;
  readonly #sessions = new Map<string, SessionState>();
  readonly #ttlMs: number;
  #counter = 0;

  constructor(options: { readonly authenticate: Authenticator; readonly sessionTtlMs?: number }) {
    this.#authenticate = options.authenticate;
    this.#ttlMs = options.sessionTtlMs ?? 15 * 60 * 1000;
  }

  /**
   * Exchanges a credential for a principal. The credential is consumed
   * here and never stored — only the derived session state remains.
   */
  async establish(credential: string, nowMs: number): Promise<SessionPrincipal | undefined> {
    const identity = await this.#authenticate(credential);
    if (!identity || identity.roles.length === 0) return undefined;
    const sessionId = `s${++this.#counter}-${nowMs.toString(36)}`;
    const expiresAtMs = nowMs + this.#ttlMs;
    this.#sessions.set(sessionId, {
      subject: identity.subject,
      roles: new Set(identity.roles),
      expiresAtMs,
      revoked: false,
    });
    return { sessionId, subject: identity.subject, expiresAtMs };
  }

  /** The CURRENT roles — live state, never a cached snapshot. */
  roles(sessionId: string, nowMs: number): readonly SessionRole[] {
    const session = this.#live(sessionId, nowMs);
    return session ? [...session.roles] : [];
  }

  /** Checks one capability against the session's current roles. */
  authorize(sessionId: string, capability: SessionCapability, nowMs: number): AuthDecision {
    const session = this.#live(sessionId, nowMs);
    if (!session) return { allowed: false, reason: "session is expired, revoked, or unknown" };
    for (const role of session.roles) {
      if (ROLE_CAPABILITIES[role].includes(capability)) return { allowed: true, role };
    }
    return { allowed: false, reason: `no role grants "${capability}"` };
  }

  /** Replaces a session's roles — takes effect on the next authorize call. */
  setRoles(sessionId: string, roles: readonly SessionRole[]): boolean {
    const session = this.#sessions.get(sessionId);
    if (!session) return false;
    session.roles = new Set(roles);
    return true;
  }

  /** Revokes one session immediately. */
  revoke(sessionId: string): boolean {
    const session = this.#sessions.get(sessionId);
    if (!session || session.revoked) return false;
    session.revoked = true;
    return true;
  }

  /** Drops expired/revoked sessions; returns how many were released. */
  sweep(nowMs: number): number {
    let released = 0;
    for (const [id, session] of [...this.#sessions]) {
      if (session.revoked || nowMs >= session.expiresAtMs) {
        this.#sessions.delete(id);
        released += 1;
      }
    }
    return released;
  }

  #live(sessionId: string, nowMs: number): SessionState | undefined {
    const session = this.#sessions.get(sessionId);
    if (!session || session.revoked || nowMs >= session.expiresAtMs) return undefined;
    return session;
  }
}

/** Creates a remote-session authority. */
export function createRemoteSessionAuthority(
  options: { readonly authenticate: Authenticator; readonly sessionTtlMs?: number },
): RemoteSessionAuthority {
  return new RemoteSessionAuthority(options);
}
