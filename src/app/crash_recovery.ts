// Copyright 2023 Im-Beast. MIT license.

// HIS-010: crash recovery as a safe partial replay. The journal parses as
// JSONL with a torn final line detected and set aside (never "repaired" —
// replay reads, it does not write, so the saved journal cannot corrupt).
// Replay applies state transitions only: external effects are represented by
// their recorded state change and are never re-invoked, so a crash between
// effect and acknowledgement cannot duplicate the effect. Replay stops at
// the first invalid record or at a non-idempotent action whose effect was
// never acknowledged — everything before that point restores; the report
// says exactly where and why it stopped.

/** One journaled action record. */
export interface RecoveryRecord {
  readonly id: string;
  /** Pure state transition payload; interpretation is the applier's. */
  readonly patch: unknown;
  /** Safe to apply twice? */
  readonly idempotent?: boolean;
  /** The action drove an external effect. */
  readonly external?: boolean;
  /** The external effect was acknowledged complete before the crash. */
  readonly acknowledged?: boolean;
}

/** Where and why replay stopped early. */
export interface RecoveryStop {
  readonly index: number;
  readonly id?: string;
  readonly reason: "invalid" | "unacknowledged-effect" | "torn";
}

/** The replay report. */
export interface RecoveryReport<TState> {
  readonly state: TState;
  readonly applied: readonly string[];
  readonly stop?: RecoveryStop;
}

/** Parses a JSONL journal, setting a torn final line aside. */
export function parseRecoveryJournal(text: string): { records: unknown[]; torn: boolean } {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  const records: unknown[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    try {
      records.push(JSON.parse(lines[index]!));
    } catch {
      // Only a TORN final line is tolerable; garbage mid-file is invalid data
      // the replay itself will refuse at this position.
      if (index === lines.length - 1) return { records, torn: true };
      records.push({ __invalid: lines[index] });
    }
  }
  return { records, torn: false };
}

function isRecord(value: unknown): value is RecoveryRecord {
  return typeof value === "object" && value !== null && typeof (value as RecoveryRecord).id === "string" &&
    "patch" in (value as object);
}

/** Options for a replay. */
export interface RecoveryReplayOptions<TState> {
  readonly initial: TState;
  readonly records: readonly unknown[];
  /** True when the journal's final line was torn. */
  readonly torn?: boolean;
  /** Applies one record's patch to state; must not run external effects. */
  readonly apply: (state: TState, record: RecoveryRecord) => TState;
  /** Extra validity check beyond structural shape. */
  readonly validate?: (record: RecoveryRecord) => boolean;
}

/**
 * Replays the safe prefix. Stops at the first structurally invalid record,
 * at the first non-idempotent external action never acknowledged, or at the
 * torn tail — whichever comes first — and restores everything before it.
 */
export function replayRecoveryJournal<TState>(options: RecoveryReplayOptions<TState>): RecoveryReport<TState> {
  let state = options.initial;
  const applied: string[] = [];
  for (let index = 0; index < options.records.length; index += 1) {
    const candidate = options.records[index];
    if (!isRecord(candidate) || (options.validate && !options.validate(candidate))) {
      return { state, applied, stop: { index, reason: "invalid" } };
    }
    // A non-idempotent external action without an acknowledgement may or may
    // not have completed before the crash; re-applying could double it.
    if (candidate.external && !candidate.idempotent && !candidate.acknowledged) {
      return { state, applied, stop: { index, id: candidate.id, reason: "unacknowledged-effect" } };
    }
    state = options.apply(state, candidate);
    applied.push(candidate.id);
  }
  if (options.torn) {
    return { state, applied, stop: { index: options.records.length, reason: "torn" } };
  }
  return { state, applied };
}
