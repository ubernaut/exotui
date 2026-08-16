// Copyright 2023 Im-Beast. MIT license.

// REM-007: remote input is a numbered stream, and execution is gap-free
// by construction. Every input carries a client sequence number; the
// sequencer executes strictly in order, acknowledges the highest
// contiguous sequence, treats anything at or below the ack as a replay
// (acknowledged again, never executed twice), buffers a bounded window of
// out-of-order arrivals, and turns a missing number into an explicit gap
// state: later input waits in the buffer and NOTHING skips ahead until
// the gap either fills or the host applies a declared recovery (resync to
// a stated sequence, dropping the hole knowingly). Role checks run per
// input — a denied input advances the sequence (the stream stays live)
// but is recorded, not executed.

/** One submission's outcome. */
export type InputSubmissionOutcome =
  | "executed"
  | "duplicate"
  | "unauthorized"
  | "buffered"
  | "buffer-overflow";

/** The sequencer's report for one submission. */
export interface InputSubmissionReport {
  readonly outcome: InputSubmissionOutcome;
  /** Highest contiguous acknowledged sequence after this submission. */
  readonly ack: number;
  /** Set when a gap is currently blocking execution. */
  readonly missingSequence?: number;
}

/** Sequencer options. */
export interface InputSequencerOptions<TInput> {
  /** Executes one authorized, in-order input. */
  readonly execute: (input: TInput, sequence: number) => void;
  /** Per-input role check; default allows everything. */
  readonly authorize?: (input: TInput) => boolean;
  /** Max buffered out-of-order inputs before overflow (default 64). */
  readonly maxBuffered?: number;
}

/** The host-side input sequencer for one session. */
export class RemoteInputSequencer<TInput> {
  readonly #execute: (input: TInput, sequence: number) => void;
  readonly #authorize: (input: TInput) => boolean;
  readonly #maxBuffered: number;
  readonly #buffer = new Map<number, TInput>();
  #ack = 0;
  #denied = 0;

  constructor(options: InputSequencerOptions<TInput>) {
    this.#execute = options.execute;
    this.#authorize = options.authorize ?? (() => true);
    this.#maxBuffered = Math.max(1, options.maxBuffered ?? 64);
  }

  /** Submits one numbered input. */
  submit(sequence: number, input: TInput): InputSubmissionReport {
    if (!Number.isInteger(sequence) || sequence <= 0) {
      return this.#report("duplicate"); // malformed numbers are replay-inert
    }
    if (sequence <= this.#ack) {
      // Replay or duplicate: acknowledge again, never execute twice.
      return this.#report("duplicate");
    }
    if (sequence === this.#ack + 1) {
      const outcome = this.#deliver(sequence, input);
      this.#drain();
      return this.#report(outcome);
    }
    // Out of order: a gap exists. Buffer within the bound, never skip.
    if (this.#buffer.size >= this.#maxBuffered && !this.#buffer.has(sequence)) {
      return this.#report("buffer-overflow");
    }
    this.#buffer.set(sequence, input);
    return this.#report("buffered");
  }

  /** Highest contiguous acknowledged sequence. */
  ack(): number {
    return this.#ack;
  }

  /** The currently blocking gap, if any. */
  pendingGap(): { readonly missingSequence: number; readonly buffered: number } | undefined {
    if (this.#buffer.size === 0) return undefined;
    return { missingSequence: this.#ack + 1, buffered: this.#buffer.size };
  }

  /**
   * Explicit gap recovery: resynchronizes to a declared next sequence.
   * Buffered inputs BELOW it are dropped knowingly; those at or above it
   * drain in order. Returns how many buffered inputs were discarded.
   */
  recover(resyncTo: number): number {
    let dropped = 0;
    for (const sequence of [...this.#buffer.keys()]) {
      if (sequence < resyncTo) {
        this.#buffer.delete(sequence);
        dropped += 1;
      }
    }
    this.#ack = Math.max(this.#ack, resyncTo - 1);
    this.#drain();
    return dropped;
  }

  inspect(): { ack: number; buffered: number; denied: number } {
    return { ack: this.#ack, buffered: this.#buffer.size, denied: this.#denied };
  }

  #deliver(sequence: number, input: TInput): InputSubmissionOutcome {
    this.#ack = sequence;
    if (!this.#authorize(input)) {
      this.#denied += 1;
      return "unauthorized";
    }
    this.#execute(input, sequence);
    return "executed";
  }

  #drain(): void {
    while (this.#buffer.has(this.#ack + 1)) {
      const next = this.#ack + 1;
      const input = this.#buffer.get(next)!;
      this.#buffer.delete(next);
      this.#deliver(next, input);
    }
  }

  #report(outcome: InputSubmissionOutcome): InputSubmissionReport {
    const gap = this.pendingGap();
    return {
      outcome,
      ack: this.#ack,
      ...(gap ? { missingSequence: gap.missingSequence } : {}),
    };
  }
}

/** Creates a remote input sequencer. */
export function createRemoteInputSequencer<TInput>(
  options: InputSequencerOptions<TInput>,
): RemoteInputSequencer<TInput> {
  return new RemoteInputSequencer(options);
}
