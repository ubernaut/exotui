// Copyright 2023 Im-Beast. MIT license.

// LOC-001: deterministic locale resolution for malformed, partial, and
// region-specific tags, inspectable without UI code.

import { assert, assertEquals } from "./deps.ts";
import { createUnicodeLocaleContext, unicodeLocaleFallbackChain } from "../mod.ts";

Deno.test("LOC-001 fallback chains truncate extensions then subtags", () => {
  assertEquals(unicodeLocaleFallbackChain("de-CH-u-ca-buddhist"), ["de-CH", "de"]);
  assertEquals(unicodeLocaleFallbackChain("zh-Hant-TW"), ["zh-Hant-TW", "zh-Hant", "zh"]);
  assertEquals(unicodeLocaleFallbackChain("en"), ["en"]);
});

Deno.test("LOC-001 negotiation prefers request order, then chain depth", () => {
  const context = createUnicodeLocaleContext({
    requested: ["de-CH", "fr-FR"],
    supported: ["fr-FR", "de", "en"],
  });
  // de-CH's chain reaches "de" before the second request is considered.
  assertEquals(context.resolve().resolved, "de");
  assertEquals(context.resolve().fallbackChain, ["de", "en"]);
  assert(context.matches("de"));
  assert(!context.matches("fr-FR"));

  const exact = createUnicodeLocaleContext({ requested: ["pt-BR"], supported: ["pt-BR", "pt"] });
  assertEquals(exact.resolve().resolved, "pt-BR");

  const missed = createUnicodeLocaleContext({ requested: ["ja"], supported: ["en", "de"], defaultLocale: "en" });
  assertEquals(missed.resolve().resolved, "en");
});

Deno.test("LOC-001 malformed and partial tags resolve deterministically", () => {
  const context = createUnicodeLocaleContext({
    requested: ["not a tag!", "", 42 as unknown as string, "EN-us", "de"],
    supported: ["en-US"],
  });
  const resolution = context.resolve();
  // Canonicalization normalizes case; invalid entries are recorded, not thrown.
  assertEquals(resolution.resolved, "en-US");
  assertEquals(resolution.requested, ["en-US", "de"]);
  assertEquals(resolution.invalidTags.map((entry) => entry.reason), ["malformed", "empty", "not-a-string"]);
  // The same options resolve identically every time.
  assertEquals(
    createUnicodeLocaleContext({ requested: ["not a tag!", "EN-us"], supported: ["en-US"] }).resolve().resolved,
    "en-US",
  );
});

Deno.test("LOC-001 time zone, numbering system, and calendar validate with fallbacks", () => {
  const context = createUnicodeLocaleContext({
    timeZone: "Not/AZone",
    numberingSystem: "bogus!!",
    calendar: "gregory",
  });
  const resolution = context.resolve();
  assertEquals(resolution.timeZone, "UTC");
  assertEquals(resolution.numberingSystem, "latn");
  assertEquals(resolution.calendar, "gregory");
  assertEquals(resolution.replacedOptions.length, 2);

  const good = createUnicodeLocaleContext({ timeZone: "Europe/Zurich", calendar: "buddhist" }).resolve();
  assertEquals(good.timeZone, "Europe/Zurich");
  assertEquals(good.calendar, "buddhist");
  assertEquals(good.replacedOptions, []);
});

Deno.test("LOC-001 resolutions are frozen and stable", () => {
  const context = createUnicodeLocaleContext({ requested: ["en-GB"], supported: ["en-GB"] });
  const resolution = context.resolve();
  assert(Object.isFrozen(resolution));
  assert(Object.isFrozen(resolution.fallbackChain));
  assert(Object.isFrozen(context));
  assertEquals(context.resolve(), resolution);
});
