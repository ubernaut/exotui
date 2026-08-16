// Copyright 2023 Im-Beast. MIT license.

// QAL-007: surviving mutations are reported by owning feature ID and
// never auto-waived.

import { assert, assertEquals } from "./deps.ts";
import { formatMutationSurvivors, runMutationCampaign } from "../mod.testing.ts";

// The subject: a mutable policy object mutants can patch in place.
function makeSubject(): {
  clamp: (value: number, low: number, high: number) => number;
  allow: (role: string) => boolean;
} {
  return {
    clamp: (value, low, high) => Math.max(low, Math.min(high, value)),
    allow: (role) => role === "admin",
  };
}

function mutantsFor(subject: ReturnType<typeof makeSubject>) {
  return [
    {
      featureId: "SEC-999-policy",
      mutants: [
        {
          name: "invert-allow",
          apply() {
            const original = subject.allow;
            subject.allow = (role) => role !== "admin";
            return () => void (subject.allow = original);
          },
        },
      ],
    },
    {
      featureId: "TXT-999-clamp",
      mutants: [
        {
          name: "drop-upper-bound",
          apply() {
            const original = subject.clamp;
            subject.clamp = (value, low) => Math.max(low, value);
            return () => void (subject.clamp = original);
          },
        },
        {
          name: "off-by-one-low",
          apply() {
            const original = subject.clamp;
            subject.clamp = (value, low, high) => Math.max(low + 1, Math.min(high, value));
            return () => void (subject.clamp = original);
          },
        },
      ],
    },
  ];
}

Deno.test("a strong suite kills every mutant and the campaign is clean", () => {
  const subject = makeSubject();
  const report = runMutationCampaign(mutantsFor(subject), () =>
    subject.clamp(5, 0, 10) === 5 &&
    subject.clamp(15, 0, 10) === 10 && // catches drop-upper-bound
    subject.clamp(0, 0, 10) === 0 && // catches off-by-one-low
    subject.allow("admin") && !subject.allow("guest")); // catches invert-allow
  assert(report.clean);
  assertEquals(report.killed, 3);
  assertEquals(report.survived, 0);
  assertEquals(formatMutationSurvivors(report), "All mutants killed.");
});

Deno.test("survivors report by owning feature ID with no waiver anywhere", () => {
  const subject = makeSubject();
  // A weak suite that never exercises the upper bound.
  const report = runMutationCampaign(mutantsFor(subject), () =>
    subject.clamp(5, 0, 10) === 5 &&
    subject.clamp(0, 0, 10) === 0 &&
    subject.allow("admin") && !subject.allow("guest"));
  assert(!report.clean);
  assertEquals(report.survivorsByFeature, { "TXT-999-clamp": ["drop-upper-bound"] });
  assert(formatMutationSurvivors(report).includes("TXT-999-clamp: drop-upper-bound"));
  // The API is structurally waiver-free: neither options nor report
  // carry any waive/exclude/allowlist field.
  assertEquals(Object.keys(report).sort(), ["clean", "killed", "outcomes", "survived", "survivorsByFeature"]);
  assertEquals(runMutationCampaign.length, 2); // (mutantSets, suite) — nothing else
});

Deno.test("mutants restore after each run and a broken base suite voids kills", () => {
  const subject = makeSubject();
  runMutationCampaign(mutantsFor(subject), () => false);
  // Every mutation was restored even though the suite always "failed".
  assertEquals(subject.clamp(15, 0, 10), 10);
  assert(subject.allow("admin"));

  const voided = runMutationCampaign(mutantsFor(subject), () => false);
  assert(!voided.clean);
  assert(voided.outcomes.every((outcome) => outcome.status === "suite-error"));
});
