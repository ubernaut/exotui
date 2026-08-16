// Copyright 2023 Im-Beast. MIT license.

// DAT-004: retry as declared policy. Errors classify as permanent (never
// retried), transient (retried with exponential backoff and deterministic
// seeded jitter), or rate-limited (honoring a retry-after hint); a deadline
// caps the whole attempt sequence, and a per-origin circuit breaker opens
// after consecutive failures, half-opens after its cool-down, and closes on
// a probe success — every state observable. Virtual time throughout: the
// planner computes delays, the caller sleeps.

/** How one failure should be treated. */
export type RetryClassification = "permanent" | "transient" | "rate-limited";

/** Classifies an error; `retryAfterMs` applies to rate-limited results. */
export type RetryClassifier = (error: unknown) => {
  readonly kind: RetryClassification;
  readonly retryAfterMs?: number;
};

/** Options for a retry plan. */
export interface RetryPolicyOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  /** Full-jitter fraction 0..1 (0 disables); deterministic via `seed`. */
  readonly jitter?: number;
  readonly seed?: number;
  /** Absolute deadline (virtual clock); retries never schedule past it. */
  readonly deadlineMs?: number;
  readonly classify?: RetryClassifier;
}

/** The planner's verdict after one failure. */
export interface RetryDecision {
  readonly retry: boolean;
  readonly delayMs: number;
  readonly reason: "permanent" | "attempts-exhausted" | "deadline" | "backoff" | "retry-after";
}

const DEFAULT_CLASSIFIER: RetryClassifier = (error) => {
  const status = (error as { status?: number })?.status;
  if (status === 429) return { kind: "rate-limited", retryAfterMs: undefined };
  if (status !== undefined && status >= 400 && status < 500) return { kind: "permanent" };
  return { kind: "transient" };
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic retry planner. */
export class RetryPolicy {
  readonly #options: Required<Pick<RetryPolicyOptions, "maxAttempts" | "baseDelayMs" | "maxDelayMs" | "jitter">>;
  readonly #deadlineMs: number | undefined;
  readonly #classify: RetryClassifier;
  readonly #random: () => number;

  constructor(options: RetryPolicyOptions = {}) {
    this.#options = {
      maxAttempts: Math.max(1, options.maxAttempts ?? 4),
      baseDelayMs: Math.max(1, options.baseDelayMs ?? 100),
      maxDelayMs: Math.max(1, options.maxDelayMs ?? 30_000),
      jitter: Math.min(1, Math.max(0, options.jitter ?? 0)),
    };
    this.#deadlineMs = options.deadlineMs;
    this.#classify = options.classify ?? DEFAULT_CLASSIFIER;
    this.#random = mulberry32(options.seed ?? 1);
  }

  /** Decides after a failure of `attempt` (1-based) at `nowMs`. */
  decide(error: unknown, attempt: number, nowMs: number): RetryDecision {
    const classified = this.#classify(error);
    if (classified.kind === "permanent") return { retry: false, delayMs: 0, reason: "permanent" };
    if (attempt >= this.#options.maxAttempts) return { retry: false, delayMs: 0, reason: "attempts-exhausted" };

    let delayMs: number;
    let reason: RetryDecision["reason"];
    if (classified.kind === "rate-limited" && classified.retryAfterMs !== undefined) {
      delayMs = Math.max(0, classified.retryAfterMs);
      reason = "retry-after";
    } else {
      const exponential = Math.min(this.#options.maxDelayMs, this.#options.baseDelayMs * 2 ** (attempt - 1));
      const jittered = this.#options.jitter > 0
        ? exponential * (1 - this.#options.jitter) + exponential * this.#options.jitter * this.#random()
        : exponential;
      delayMs = Math.round(jittered);
      reason = "backoff";
    }
    if (this.#deadlineMs !== undefined && nowMs + delayMs > this.#deadlineMs) {
      return { retry: false, delayMs: 0, reason: "deadline" };
    }
    return { retry: true, delayMs, reason };
  }
}

/** Circuit breaker states. */
export type CircuitState = "closed" | "open" | "half-open";

/** Options for a circuit breaker. */
export interface CircuitBreakerOptions {
  /** Consecutive failures that open the circuit (default 5). */
  readonly failureThreshold?: number;
  /** Cool-down before a half-open probe is allowed (default 30s). */
  readonly coolDownMs?: number;
}

/** Per-origin circuit breakers with observable state. */
export class CircuitBreakerRegistry {
  readonly #failureThreshold: number;
  readonly #coolDownMs: number;
  readonly #circuits = new Map<string, { state: CircuitState; failures: number; openedAt: number }>();

  constructor(options: CircuitBreakerOptions = {}) {
    this.#failureThreshold = Math.max(1, options.failureThreshold ?? 5);
    this.#coolDownMs = Math.max(0, options.coolDownMs ?? 30_000);
  }

  /** May a request to this origin proceed at `nowMs`? */
  allows(origin: string, nowMs: number): boolean {
    const circuit = this.#circuit(origin);
    if (circuit.state === "closed") return true;
    if (circuit.state === "open" && nowMs - circuit.openedAt >= this.#coolDownMs) {
      circuit.state = "half-open";
      return true; // exactly one probe rides the half-open state
    }
    return false; // open inside cool-down, or a probe already in flight
  }

  reportSuccess(origin: string): void {
    const circuit = this.#circuit(origin);
    circuit.state = "closed";
    circuit.failures = 0;
  }

  reportFailure(origin: string, nowMs: number): void {
    const circuit = this.#circuit(origin);
    if (circuit.state === "half-open") {
      circuit.state = "open";
      circuit.openedAt = nowMs;
      return;
    }
    circuit.failures += 1;
    if (circuit.failures >= this.#failureThreshold) {
      circuit.state = "open";
      circuit.openedAt = nowMs;
    }
  }

  state(origin: string): CircuitState {
    return this.#circuit(origin).state;
  }

  inspect(): ReadonlyArray<{ origin: string; state: CircuitState; failures: number }> {
    return [...this.#circuits.entries()].map(([origin, circuit]) => ({
      origin,
      state: circuit.state,
      failures: circuit.failures,
    }));
  }

  #circuit(origin: string): { state: CircuitState; failures: number; openedAt: number } {
    const existing = this.#circuits.get(origin);
    if (existing) return existing;
    const created = { state: "closed" as CircuitState, failures: 0, openedAt: 0 };
    this.#circuits.set(origin, created);
    return created;
  }
}

/** Creates a retry planner. */
export function createRetryPolicy(options: RetryPolicyOptions = {}): RetryPolicy {
  return new RetryPolicy(options);
}

/** Creates a per-origin circuit-breaker registry. */
export function createCircuitBreakerRegistry(options: CircuitBreakerOptions = {}): CircuitBreakerRegistry {
  return new CircuitBreakerRegistry(options);
}
