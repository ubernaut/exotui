// Copyright 2023 Im-Beast. MIT license.

// DAT-004: retry classification, deterministic backoff with jitter,
// retry-after, deadlines, and an observable per-origin circuit breaker.

import { assert, assertEquals } from "./deps.ts";
import { createCircuitBreakerRegistry, createRetryPolicy } from "../mod.ts";

Deno.test("permanent errors never retry; transients back off exponentially", () => {
  const policy = createRetryPolicy({ maxAttempts: 4, baseDelayMs: 100, jitter: 0 });
  assertEquals(policy.decide({ status: 404 }, 1, 0), { retry: false, delayMs: 0, reason: "permanent" });
  assertEquals(policy.decide(new Error("timeout"), 1, 0), { retry: true, delayMs: 100, reason: "backoff" });
  assertEquals(policy.decide(new Error("timeout"), 2, 0).delayMs, 200);
  assertEquals(policy.decide(new Error("timeout"), 3, 0).delayMs, 400);
  assertEquals(policy.decide(new Error("timeout"), 4, 0), { retry: false, delayMs: 0, reason: "attempts-exhausted" });
});

Deno.test("retry-after wins over backoff; deadlines stop retries; jitter is seeded", () => {
  const policy = createRetryPolicy({
    maxAttempts: 5,
    baseDelayMs: 100,
    deadlineMs: 1000,
    jitter: 0,
    classify: (error) => {
      const status = (error as { status?: number }).status;
      if (status === 429) return { kind: "rate-limited", retryAfterMs: 700 };
      return { kind: "transient" };
    },
  });
  assertEquals(policy.decide({ status: 429 }, 1, 0), { retry: true, delayMs: 700, reason: "retry-after" });
  // The same hint past the deadline refuses instead of scheduling beyond it.
  assertEquals(policy.decide({ status: 429 }, 1, 500), { retry: false, delayMs: 0, reason: "deadline" });

  const seeded = createRetryPolicy({ jitter: 0.5, seed: 42, baseDelayMs: 100 });
  const again = createRetryPolicy({ jitter: 0.5, seed: 42, baseDelayMs: 100 });
  const first = seeded.decide(new Error("x"), 1, 0);
  assertEquals(first, again.decide(new Error("x"), 1, 0)); // deterministic
  assert(first.delayMs >= 50 && first.delayMs <= 100);
});

Deno.test("the circuit opens on consecutive failures, half-opens once, and closes on success", () => {
  const circuits = createCircuitBreakerRegistry({ failureThreshold: 2, coolDownMs: 1000 });
  assert(circuits.allows("api.example", 0));
  circuits.reportFailure("api.example", 0);
  assertEquals(circuits.state("api.example"), "closed");
  circuits.reportFailure("api.example", 10);
  assertEquals(circuits.state("api.example"), "open");
  assertEquals(circuits.allows("api.example", 500), false); // cooling down

  assert(circuits.allows("api.example", 1200)); // the single half-open probe
  assertEquals(circuits.state("api.example"), "half-open");
  assertEquals(circuits.allows("api.example", 1300), false); // no second probe

  circuits.reportSuccess("api.example");
  assertEquals(circuits.state("api.example"), "closed");
  assert(circuits.allows("api.example", 1400));

  // A failed probe reopens; other origins are independent.
  circuits.reportFailure("api.example", 1500);
  circuits.reportFailure("api.example", 1500);
  assert(circuits.allows("api.example", 3000));
  circuits.reportFailure("api.example", 3000); // the probe fails
  assertEquals(circuits.state("api.example"), "open");
  assert(circuits.allows("other.example", 3000));
  assertEquals(circuits.inspect().length, 2);
});
