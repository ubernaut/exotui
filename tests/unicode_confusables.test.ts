// Copyright 2023 Im-Beast. MIT license.

// SEC-007: skeletons, restriction levels, and registry warnings — collisions
// are diagnosed without banning ordinary multilingual text.

import { assert, assertEquals } from "./deps.ts";
import { confusableSkeleton, createIdentifierSecurityGuard, restrictionLevel } from "../mod.ts";

Deno.test("skeletons unify lookalikes and restriction levels classify mixing", () => {
  assertEquals(confusableSkeleton("pаypal"), "paypal"); // Cyrillic а folds
  assertEquals(confusableSkeleton("ΡayΡal"), "PayPal"); // Greek Rho folds
  assertEquals(confusableSkeleton("plain"), "plain");

  assertEquals(restrictionLevel("hello"), "single-script");
  assertEquals(restrictionLevel("привет"), "single-script"); // pure Cyrillic is fine
  assertEquals(restrictionLevel("hello世界"), "highly-restrictive"); // Latin+CJK
  assertEquals(restrictionLevel("pаypal"), "unrestricted"); // Latin+Cyrillic lookalike
});

Deno.test("registries diagnose collisions without banning multilingual names", () => {
  const guard = createIdentifierSecurityGuard();
  assertEquals(guard.check("paypal.open"), []);
  // The confusable twin collides with the registered original.
  const collision = guard.check("pаypal.open");
  assertEquals(collision.length, 2); // collision + risky mix
  assertEquals(collision[0]!.kind, "skeleton-collision");
  assertEquals(collision[0]!.collidesWith, "paypal.open");

  // Ordinary multilingual identifiers in ONE consistent script pass freely.
  assertEquals(guard.check("файл.открыть"), []);
  assertEquals(guard.check("ファイル.開く"), []);
  // Re-checking the same identifier is not a collision with itself.
  assertEquals(guard.check("paypal.open"), []);
  assertEquals(guard.inspect().registered, 3);
});
