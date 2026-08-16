// Copyright 2023 Im-Beast. MIT license.

// LOC-004: cached locale-aware formatters behind one disposable registry —
// cache keys include every semantic option and output matches the host Intl
// implementation directly.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { createLocaleFormatterRegistry, createUnicodeLocaleContext } from "../mod.ts";

const context = createUnicodeLocaleContext({
  requested: ["de-DE"],
  supported: ["de-DE", "en"],
  timeZone: "Europe/Berlin",
});

Deno.test("formatters match host Intl output and honor context defaults", () => {
  const registry = createLocaleFormatterRegistry(context);
  assertEquals(
    registry.number({ maximumFractionDigits: 2 }).format(1234.567),
    new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(1234.567),
  );
  const stamp = Date.UTC(2026, 7, 16, 12, 0, 0);
  assertEquals(
    registry.dateTime({ dateStyle: "medium", timeStyle: "short" }).format(stamp),
    new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Berlin",
      calendar: "gregory",
    }).format(stamp),
  );
  assertEquals(
    registry.relativeTime({ numeric: "auto" }).format(-1, "day"),
    new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" }).format(-1, "day"),
  );
  assertEquals(
    registry.list({ type: "conjunction" }).format(["a", "b", "c"]),
    new Intl.ListFormat("de-DE", { type: "conjunction" }).format(["a", "b", "c"]),
  );
  assertEquals(
    registry.displayNames({ type: "language" }).of("fr"),
    new Intl.DisplayNames(["de-DE"], { type: "language" }).of("fr"),
  );
  assertEquals(
    registry.unit("megabyte", { unitDisplay: "short" }).format(5),
    new Intl.NumberFormat("de-DE", { style: "unit", unit: "megabyte", unitDisplay: "short" }).format(5),
  );
});

Deno.test("cache keys include every option; equal requests share one instance", () => {
  const registry = createLocaleFormatterRegistry(context);
  const a = registry.number({ maximumFractionDigits: 2 });
  const b = registry.number({ maximumFractionDigits: 2 });
  const c = registry.number({ maximumFractionDigits: 3 });
  const d = registry.number();
  assert(a === b, "identical options must share one instance");
  assert(a !== c && a !== d && c !== d, "differing options must not collide");
  assertEquals(registry.inspect().hits, 1);
  assertEquals(registry.inspect().misses, 3);
});

Deno.test("duration composes unit and list formatters and the cache is bounded", () => {
  const registry = createLocaleFormatterRegistry(context, { maxCached: 2 });
  const text = registry.duration({ hours: 1, minutes: 5 });
  assert(text.includes("1") && text.includes("5"), `duration text: ${text}`);
  assertEquals(
    registry.duration({}),
    new Intl.NumberFormat("de-DE", { style: "unit", unit: "second", unitDisplay: "short" }).format(0),
  );
  assert(registry.inspect().evicted > 0, "a 2-entry cache must evict under duration's formatter set");
  assert(registry.inspect().cached <= 2);
  registry.dispose();
  assertThrows(() => registry.number());
});
