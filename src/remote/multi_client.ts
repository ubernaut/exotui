// Copyright 2023 Im-Beast. MIT license.

// REM-009: shared sessions are CONSENTED and VISIBLE. Every join goes
// through the host policy; every participant appears in the roster every
// other participant can read — the participant record has no hidden
// flag, so a hidden spectator is structurally impossible. Joins, leaves,
// role changes, control transfers, and revocations are ANNOUNCED to all
// participants through one bounded event journal plus live listeners.
// Control transfer requires host policy and is revocable at any moment:
// revocation demotes to viewer and is announced like everything else.

import type { SessionRole } from "./session_auth.ts";

/** One visible participant. Every field is roster-public. */
export interface Participant {
  readonly id: string;
  readonly subject: string;
  readonly role: SessionRole;
  readonly joinedAtMs: number;
}

/** One announced session event. */
export interface SessionAnnouncement {
  readonly kind: "joined" | "left" | "role-changed" | "control-transferred" | "control-revoked";
  readonly participantId: string;
  readonly detail: string;
  readonly atMs: number;
}

/** The host policy consulted for joins and control transfers. */
export interface MultiClientPolicy {
  approveJoin(subject: string, requestedRole: SessionRole): boolean;
  approveControlTransfer(fromId: string, toId: string): boolean;
}

/** A shared session with visible participants. */
export class MultiClientSession {
  readonly #policy: MultiClientPolicy;
  readonly #participants = new Map<string, Participant>();
  readonly #announcements: SessionAnnouncement[] = [];
  readonly #listeners = new Set<(announcement: SessionAnnouncement) => void>();
  #counter = 0;

  constructor(policy: MultiClientPolicy) {
    this.#policy = policy;
  }

  /** Requests to join. Host policy decides; approval is announced. */
  join(subject: string, requestedRole: SessionRole, nowMs: number): Participant | undefined {
    if (!this.#policy.approveJoin(subject, requestedRole)) return undefined;
    const participant: Participant = {
      id: `p${++this.#counter}`,
      subject,
      role: requestedRole,
      joinedAtMs: nowMs,
    };
    this.#participants.set(participant.id, participant);
    this.#announce({
      kind: "joined",
      participantId: participant.id,
      detail: `${subject} joined as ${requestedRole}`,
      atMs: nowMs,
    });
    return participant;
  }

  /** Leaves (or is removed); announced to everyone. */
  leave(participantId: string, nowMs: number): boolean {
    const participant = this.#participants.get(participantId);
    if (!participant) return false;
    this.#participants.delete(participantId);
    this.#announce({
      kind: "left",
      participantId,
      detail: `${participant.subject} left`,
      atMs: nowMs,
    });
    return true;
  }

  /**
   * Transfers control: the source loses controller, the target gains it.
   * Host policy must approve; the transfer is announced and revocable.
   */
  transferControl(fromId: string, toId: string, nowMs: number): boolean {
    const from = this.#participants.get(fromId);
    const to = this.#participants.get(toId);
    if (!from || !to || from.role !== "controller" && from.role !== "moderator") return false;
    if (!this.#policy.approveControlTransfer(fromId, toId)) return false;
    if (from.role === "controller") this.#setRole(from, "viewer", nowMs, false);
    this.#setRole(to, "controller", nowMs, false);
    this.#announce({
      kind: "control-transferred",
      participantId: toId,
      detail: `${from.subject} -> ${to.subject}`,
      atMs: nowMs,
    });
    return true;
  }

  /** Revokes control at any moment; the demotion is announced. */
  revokeControl(participantId: string, nowMs: number): boolean {
    const participant = this.#participants.get(participantId);
    if (!participant || participant.role !== "controller") return false;
    this.#setRole(participant, "viewer", nowMs, false);
    this.#announce({
      kind: "control-revoked",
      participantId,
      detail: `${participant.subject} lost control`,
      atMs: nowMs,
    });
    return true;
  }

  /**
   * The roster EVERY participant can read — all participants, all roles.
   * There is no hidden variant of this list.
   */
  roster(): readonly Participant[] {
    return [...this.#participants.values()];
  }

  /** The bounded announcement journal, oldest first. */
  announcements(): readonly SessionAnnouncement[] {
    return [...this.#announcements];
  }

  /** Live announcement delivery to a participant's client. */
  onAnnouncement(listener: (announcement: SessionAnnouncement) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #setRole(participant: Participant, role: SessionRole, nowMs: number, announce: boolean): void {
    const updated: Participant = { ...participant, role };
    this.#participants.set(participant.id, updated);
    if (announce) {
      this.#announce({
        kind: "role-changed",
        participantId: participant.id,
        detail: `${participant.subject} is now ${role}`,
        atMs: nowMs,
      });
    }
  }

  #announce(announcement: SessionAnnouncement): void {
    if (this.#announcements.length >= 256) this.#announcements.shift();
    this.#announcements.push(announcement);
    for (const listener of [...this.#listeners]) listener(announcement);
  }
}

/** Creates a consented multi-client session. */
export function createMultiClientSession(policy: MultiClientPolicy): MultiClientSession {
  return new MultiClientSession(policy);
}
