// Copyright 2023 Im-Beast. MIT license.

// ASY-004: token-bucket and leaky-bucket rate limiters on virtual time.
// Every entry point takes the caller's clock — no hidden timers — so tests
// prove burst, refill, fairness, and cancellation deterministically. Queued
// acquisition is strictly FIFO: the head waiter blocks everyone behind it
// even when a later, smaller request could be satisfied first, which is the
// fairness contract; aborting a waiter rejects its promise and removes it
// without disturbing the order of the rest.

/** Options for a token bucket. */
export interface TokenBucketOptions {
  /** Maximum tokens the bucket holds (the burst size). */
  readonly capacity: number;
  /** Tokens restored per second. */
  readonly refillPerSecond: number;
}

/** Options for a leaky bucket. */
export interface LeakyBucketOptions {
  /** Maximum bucket level before acquisitions queue. */
  readonly capacity: number;
  /** Level drained per second. */
  readonly leakPerSecond: number;
}

interface Waiter {
  readonly tokens: number;
  readonly resolve: () => void;
  readonly reject: (reason: Error) => void;
  aborted: boolean;
}

class AbortedAcquisitionError extends Error {
  constructor() {
    super("rate-limited acquisition aborted");
    this.name = "AbortedAcquisitionError";
  }
}

/** Classic token bucket with fair queued acquisition. */
export class TokenBucketRateLimiter {
  readonly #capacity: number;
  readonly #refillPerSecond: number;
  #tokens: number;
  #updatedAt: number;
  #queue: Waiter[] = [];

  constructor(options: TokenBucketOptions) {
    this.#capacity = Math.max(1, options.capacity);
    this.#refillPerSecond = Math.max(0, options.refillPerSecond);
    this.#tokens = this.#capacity;
    this.#updatedAt = 0;
  }

  /** Immediate acquisition; false when tokens are short or waiters exist. */
  tryAcquire(tokens: number, nowMs: number): boolean {
    this.#refill(nowMs);
    if (this.#queue.length > 0 || tokens > this.#tokens) return false;
    this.#tokens -= tokens;
    return true;
  }

  /** FIFO queued acquisition; resolves during a later advance(). */
  acquire(tokens: number, nowMs: number, signal?: AbortSignal): Promise<void> {
    if (tokens > this.#capacity) {
      return Promise.reject(new RangeError(`cannot acquire ${tokens} tokens from a ${this.#capacity} bucket`));
    }
    if (this.tryAcquire(tokens, nowMs)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { tokens, resolve, reject, aborted: false };
      this.#queue.push(waiter);
      signal?.addEventListener("abort", () => {
        if (waiter.aborted) return;
        waiter.aborted = true;
        this.#queue = this.#queue.filter((entry) => entry !== waiter);
        reject(new AbortedAcquisitionError());
      }, { once: true });
    });
  }

  /** Refills to `nowMs` and grants queued waiters in order. */
  advance(nowMs: number): void {
    this.#refill(nowMs);
    while (this.#queue.length > 0 && this.#queue[0]!.tokens <= this.#tokens) {
      const waiter = this.#queue.shift()!;
      this.#tokens -= waiter.tokens;
      waiter.resolve();
    }
  }

  inspect(): { readonly tokens: number; readonly queued: number } {
    return { tokens: this.#tokens, queued: this.#queue.length };
  }

  #refill(nowMs: number): void {
    if (nowMs <= this.#updatedAt) return;
    const elapsed = (nowMs - this.#updatedAt) / 1000;
    this.#tokens = Math.min(this.#capacity, this.#tokens + elapsed * this.#refillPerSecond);
    this.#updatedAt = nowMs;
  }
}

/** Leaky bucket: admissions raise the level, time drains it. */
export class LeakyBucketRateLimiter {
  readonly #capacity: number;
  readonly #leakPerSecond: number;
  #level = 0;
  #updatedAt = 0;
  #queue: Waiter[] = [];

  constructor(options: LeakyBucketOptions) {
    this.#capacity = Math.max(1, options.capacity);
    this.#leakPerSecond = Math.max(0, options.leakPerSecond);
  }

  /** Immediate admission; false when the bucket is full or waiters exist. */
  tryAcquire(nowMs: number): boolean {
    this.#leak(nowMs);
    if (this.#queue.length > 0 || this.#level + 1 > this.#capacity) return false;
    this.#level += 1;
    return true;
  }

  /** FIFO queued admission; resolves during a later advance(). */
  acquire(nowMs: number, signal?: AbortSignal): Promise<void> {
    if (this.tryAcquire(nowMs)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { tokens: 1, resolve, reject, aborted: false };
      this.#queue.push(waiter);
      signal?.addEventListener("abort", () => {
        if (waiter.aborted) return;
        waiter.aborted = true;
        this.#queue = this.#queue.filter((entry) => entry !== waiter);
        reject(new AbortedAcquisitionError());
      }, { once: true });
    });
  }

  advance(nowMs: number): void {
    this.#leak(nowMs);
    while (this.#queue.length > 0 && this.#level + 1 <= this.#capacity) {
      const waiter = this.#queue.shift()!;
      this.#level += 1;
      waiter.resolve();
    }
  }

  inspect(): { readonly level: number; readonly queued: number } {
    return { level: this.#level, queued: this.#queue.length };
  }

  #leak(nowMs: number): void {
    if (nowMs <= this.#updatedAt) return;
    const elapsed = (nowMs - this.#updatedAt) / 1000;
    this.#level = Math.max(0, this.#level - elapsed * this.#leakPerSecond);
    this.#updatedAt = nowMs;
  }
}

/** Creates a token-bucket limiter. */
export function createTokenBucketRateLimiter(options: TokenBucketOptions): TokenBucketRateLimiter {
  return new TokenBucketRateLimiter(options);
}

/** Creates a leaky-bucket limiter. */
export function createLeakyBucketRateLimiter(options: LeakyBucketOptions): LeakyBucketRateLimiter {
  return new LeakyBucketRateLimiter(options);
}
