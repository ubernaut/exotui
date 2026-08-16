// Copyright 2023 Im-Beast. MIT license.

// INP-005: dead-key and compose-sequence processing ahead of command
// dispatch. A configurable table maps key-token sequences to composed text;
// the processor holds pending tokens while they prefix a sequence and
// resolves deterministically on match, invalid continuation, cancellation,
// or timeout — flushes always report both the literal text (via the
// configured literal forms) and the raw tokens for key-event replay, so no
// keystroke is ever silently lost.

/** One compose sequence: key tokens in order, and the composed text. */
export type ComposeSequence = readonly [readonly string[], string];

/** Options for the processor. */
export interface ComposeSequenceOptions {
  /** Pending tokens flush as a timeout after this idle time (default 1000). */
  readonly timeoutMs?: number;
  /** Literal text for a token when a flush re-emits it (e.g. dead-acute → "´"). */
  readonly literals?: Readonly<Record<string, string>>;
}

/** Result of feeding one key (or cancelling). */
export interface ComposeResult {
  readonly kind: "pending" | "composed" | "invalid" | "cancelled" | "timeout" | "passthrough";
  /** Text to insert (composed text, or the flushed literals). */
  readonly text: string;
  /** Raw tokens to replay as key events on a flush. */
  readonly replay: readonly string[];
}

/** Deterministic compose-sequence state machine. */
export class ComposeSequenceProcessor {
  readonly #sequences: readonly ComposeSequence[];
  readonly #literals: Readonly<Record<string, string>>;
  readonly #timeoutMs: number;
  #pending: string[] = [];
  #lastKeyAt = 0;

  constructor(sequences: readonly ComposeSequence[], options: ComposeSequenceOptions = {}) {
    this.#sequences = sequences;
    this.#literals = options.literals ?? {};
    this.#timeoutMs = Math.max(1, options.timeoutMs ?? 1000);
  }

  get pending(): readonly string[] {
    return [...this.#pending];
  }

  /** Feeds one key token under the caller's clock. */
  key(token: string, nowMs: number): ComposeResult {
    if (this.#pending.length > 0 && nowMs - this.#lastKeyAt > this.#timeoutMs) {
      const flush = this.#flush("timeout");
      const follow = this.key(token, nowMs);
      // The timeout flush and the fresh token resolve in one deterministic
      // result: flushed literals first, then whatever the token produced.
      return {
        kind: "timeout",
        text: flush.text + follow.text,
        replay: [...flush.replay, ...follow.replay],
      };
    }
    this.#lastKeyAt = nowMs;
    const candidate = [...this.#pending, token];
    if (this.#matches(candidate)) {
      this.#pending = [];
      return { kind: "composed", text: this.#matches(candidate)!, replay: [] };
    }
    if (this.#isPrefix(candidate)) {
      this.#pending = candidate;
      return { kind: "pending", text: "", replay: [] };
    }
    if (this.#pending.length > 0) {
      this.#pending = candidate;
      return this.#flush("invalid");
    }
    return { kind: "passthrough", text: this.#literal(token), replay: [token] };
  }

  /** Fires pending timeouts without a new key (for timer-driven hosts). */
  tick(nowMs: number): ComposeResult | undefined {
    if (this.#pending.length === 0 || nowMs - this.#lastKeyAt <= this.#timeoutMs) return undefined;
    return this.#flush("timeout");
  }

  /** Cancels the pending sequence (e.g. focus loss), flushing its literals. */
  cancel(): ComposeResult | undefined {
    if (this.#pending.length === 0) return undefined;
    return this.#flush("cancelled");
  }

  #matches(tokens: readonly string[]): string | undefined {
    for (const [sequence, text] of this.#sequences) {
      if (sequence.length === tokens.length && sequence.every((entry, index) => entry === tokens[index])) return text;
    }
    return undefined;
  }

  #isPrefix(tokens: readonly string[]): boolean {
    return this.#sequences.some(([sequence]) =>
      sequence.length > tokens.length && tokens.every((entry, index) => entry === sequence[index])
    );
  }

  #literal(token: string): string {
    return this.#literals[token] ?? (token.length === 1 ? token : "");
  }

  #flush(kind: "invalid" | "cancelled" | "timeout"): ComposeResult {
    const replay = this.#pending;
    this.#pending = [];
    return { kind, text: replay.map((token) => this.#literal(token)).join(""), replay };
  }
}

/** Creates a compose-sequence processor. */
export function createComposeSequenceProcessor(
  sequences: readonly ComposeSequence[],
  options: ComposeSequenceOptions = {},
): ComposeSequenceProcessor {
  return new ComposeSequenceProcessor(sequences, options);
}
