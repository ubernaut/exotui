import {
  assert,
  assertEquals,
  assertFalse,
  assertNotStrictEquals,
  assertStringIncludes,
  assertThrows,
} from "./deps.ts";
import {
  BUILTIN_UNICODE_DATA_PACK,
  BUILTIN_UNICODE_DATA_PACK_INSPECTION,
  DEFAULT_UNICODE_DATA_PACK_REGISTRY,
  fingerprintUnicodeDataPackContent,
  hasEmojiProperty,
  inspectUnicodeDataPack,
  lookupEastAsianWidthProperty,
  lookupEmojiProperties,
  lookupGraphemeBreakProperty,
  UNICODE_DATA_PACK_LIMITS,
  UNICODE_DATA_PACK_SCHEMA,
  UNICODE_DATA_PACK_SCHEMA_VERSION,
  UNICODE_DATA_VERSION,
  type UnicodeDataPackContent,
  UnicodeDataPackNotFoundError,
  UnicodeDataPackRegistry,
  UnicodeDataPackValidationError,
  unicodeDataSha256,
  validateUnicodeDataPack,
} from "../src/unicode/mod.ts";

function fixtureContent(version = "16.0.0"): UnicodeDataPackContent {
  return {
    schema: UNICODE_DATA_PACK_SCHEMA,
    schemaVersion: UNICODE_DATA_PACK_SCHEMA_VERSION,
    unicodeVersion: version,
    sources: [{
      name: "fixture",
      url: `https://example.test/unicode-${version}.txt`,
      sha256: "a".repeat(64),
    }],
    tables: {
      graphemeBreak: [
        { start: 10, end: 12, value: "Extend" },
        { start: 20, end: 20, value: "ZWJ" },
      ],
      eastAsianWidth: [{ start: 100, end: 102, value: "W" }],
      emoji: [{ property: "Emoji", ranges: [{ start: 200, end: 202 }] }],
    },
  };
}

function fixturePack(version = "16.0.0"): Record<string, unknown> {
  const content = fixtureContent(version);
  return {
    schema: content.schema,
    schemaVersion: content.schemaVersion,
    unicodeVersion: content.unicodeVersion,
    fingerprint: fingerprintUnicodeDataPackContent(content),
    sources: content.sources,
    tables: content.tables,
  };
}

Deno.test("built-in Unicode metadata pins complete official 17.0.0 sources", () => {
  assertEquals(UNICODE_DATA_VERSION, "17.0.0");
  assertEquals(BUILTIN_UNICODE_DATA_PACK.unicodeVersion, UNICODE_DATA_VERSION);
  assertEquals(
    BUILTIN_UNICODE_DATA_PACK.fingerprint,
    "4c885bc9201552e99c0797a4b8ea72db55fc2c315af3347ad53a9743c65bbfc2",
  );
  assertEquals(BUILTIN_UNICODE_DATA_PACK.sources, [
    {
      name: "east-asian-width",
      url: "https://www.unicode.org/Public/17.0.0/ucd/EastAsianWidth.txt",
      sha256: "ea7ce50f3444a050333448dffef1cadd9325af55cbb764b4a2280faf52170a33",
    },
    {
      name: "emoji-properties",
      url: "https://www.unicode.org/Public/17.0.0/ucd/emoji/emoji-data.txt",
      sha256: "2cb2bb9455cda83e8481541ecf5b6dfda66a3bb89efa3fa7c5297eccf607b72b",
    },
    {
      name: "grapheme-break",
      url: "https://www.unicode.org/Public/17.0.0/ucd/auxiliary/GraphemeBreakProperty.txt",
      sha256: "d6b51d1d2ae5c33b451b7ed994b48f1f4dc62b2272a5831e7fd418514a6bae89",
    },
  ]);
  assertEquals(BUILTIN_UNICODE_DATA_PACK_INSPECTION.graphemeBreakRanges, 1_386);
  assertEquals(BUILTIN_UNICODE_DATA_PACK_INSPECTION.eastAsianWidthRanges, 1_201);
  assertEquals(BUILTIN_UNICODE_DATA_PACK_INSPECTION.emojiRanges, 439);
  assertEquals(BUILTIN_UNICODE_DATA_PACK_INSPECTION.emojiProperties, [
    "Emoji",
    "Emoji_Component",
    "Emoji_Modifier",
    "Emoji_Modifier_Base",
    "Emoji_Presentation",
    "Extended_Pictographic",
  ]);
  assert(Object.isFrozen(BUILTIN_UNICODE_DATA_PACK));
  assert(Object.isFrozen(BUILTIN_UNICODE_DATA_PACK.tables.graphemeBreak));
  assert(Object.isFrozen(BUILTIN_UNICODE_DATA_PACK.sources[0]));
});

Deno.test("built-in range lookups provide UAX #29, UAX #11, and UTS #51 foundations", () => {
  assertEquals(lookupGraphemeBreakProperty(BUILTIN_UNICODE_DATA_PACK, 0x000d), "CR");
  assertEquals(lookupGraphemeBreakProperty(BUILTIN_UNICODE_DATA_PACK, 0x0301), "Extend");
  assertEquals(lookupGraphemeBreakProperty(BUILTIN_UNICODE_DATA_PACK, 0x200d), "ZWJ");
  assertEquals(lookupGraphemeBreakProperty(BUILTIN_UNICODE_DATA_PACK, 0x1f1e6), "Regional_Indicator");
  assertEquals(lookupGraphemeBreakProperty(BUILTIN_UNICODE_DATA_PACK, 0x0041), "Other");

  assertEquals(lookupEastAsianWidthProperty(BUILTIN_UNICODE_DATA_PACK, 0x0041), "Na");
  assertEquals(lookupEastAsianWidthProperty(BUILTIN_UNICODE_DATA_PACK, 0x3000), "F");
  assertEquals(lookupEastAsianWidthProperty(BUILTIN_UNICODE_DATA_PACK, 0x1f600), "W");
  assert(hasEmojiProperty(BUILTIN_UNICODE_DATA_PACK, "Emoji", 0x1f600));
  assert(hasEmojiProperty(BUILTIN_UNICODE_DATA_PACK, "Extended_Pictographic", 0x1f600));
  assert(hasEmojiProperty(BUILTIN_UNICODE_DATA_PACK, "Emoji_Modifier", 0x1f3fb));
  assertFalse(hasEmojiProperty(BUILTIN_UNICODE_DATA_PACK, "Emoji_Modifier", 0x1f600));
  assertFalse(hasEmojiProperty(BUILTIN_UNICODE_DATA_PACK, "Unknown", 0x1f600));
  const properties = lookupEmojiProperties(BUILTIN_UNICODE_DATA_PACK, 0x1f600);
  assertEquals(properties, ["Emoji", "Emoji_Presentation", "Extended_Pictographic"]);
  assert(Object.isFrozen(properties));
});

Deno.test("range lookup includes exact boundaries and rejects non-code-points", () => {
  const pack = validateUnicodeDataPack(fixturePack());
  assertEquals(lookupGraphemeBreakProperty(pack, 9), "Other");
  assertEquals(lookupGraphemeBreakProperty(pack, 10), "Extend");
  assertEquals(lookupGraphemeBreakProperty(pack, 12), "Extend");
  assertEquals(lookupGraphemeBreakProperty(pack, 13), "Other");
  assertEquals(lookupGraphemeBreakProperty(pack, 20), "ZWJ");
  assertEquals(lookupEastAsianWidthProperty(pack, 99), "N");
  assertEquals(lookupEastAsianWidthProperty(pack, 100), "W");
  assertEquals(lookupEastAsianWidthProperty(pack, 102), "W");
  assertEquals(lookupEastAsianWidthProperty(pack, 103), "N");
  assertFalse(hasEmojiProperty(pack, "Emoji", 199));
  assert(hasEmojiProperty(pack, "Emoji", 200));
  assert(hasEmojiProperty(pack, "Emoji", 202));
  assertFalse(hasEmojiProperty(pack, "Emoji", 203));
  for (const value of [-1, 0x110000, 1.5, Number.NaN]) {
    assertThrows(() => lookupGraphemeBreakProperty(pack, value), RangeError);
    assertThrows(() => lookupEastAsianWidthProperty(pack, value), RangeError);
    assertThrows(() => hasEmojiProperty(pack, "Emoji", value), RangeError);
  }
});

Deno.test("registries select fixture versions deterministically without global mutation", () => {
  const oldPack = fixturePack("15.1.0");
  const currentPack = fixturePack("16.0.0");
  const registry = new UnicodeDataPackRegistry([currentPack, oldPack]);
  assertEquals(registry.versions, ["15.1.0", "16.0.0"]);
  assertEquals(registry.defaultUnicodeVersion, "16.0.0");
  assertEquals(registry.select().unicodeVersion, "16.0.0");
  assertEquals(registry.select("15.1.0").unicodeVersion, "15.1.0");
  const oldFingerprint = registry.select("15.1.0").fingerprint;
  assertEquals(registry.select({ fingerprint: oldFingerprint }).unicodeVersion, "15.1.0");
  assertEquals(registry.select({ unicodeVersion: "15.1.0", fingerprint: oldFingerprint }).unicodeVersion, "15.1.0");
  assertThrows(() => registry.select("14.0.0"), UnicodeDataPackNotFoundError);
  assertThrows(
    () => registry.select({ unicodeVersion: "16.0.0", fingerprint: oldFingerprint }),
    UnicodeDataPackNotFoundError,
  );

  const extended = registry.withPack(fixturePack("17.0.0"));
  assertEquals(extended.versions, ["15.1.0", "16.0.0", "17.0.0"]);
  assertEquals(extended.defaultUnicodeVersion, "16.0.0");
  assertEquals(registry.versions, ["15.1.0", "16.0.0"]);
  assertEquals(DEFAULT_UNICODE_DATA_PACK_REGISTRY.versions, ["17.0.0"]);
  const newerDefault = registry.withPack(fixturePack("17.0.0"), { defaultUnicodeVersion: "17.0.0" });
  assertEquals(newerDefault.select().unicodeVersion, "17.0.0");
});

Deno.test("registries reject ambiguity, unbounded input, and hostile options", () => {
  assertThrows(
    () => new UnicodeDataPackRegistry([fixturePack(), fixturePack()]),
    UnicodeDataPackValidationError,
    "versions must be unique",
  );
  assertThrows(
    () => new UnicodeDataPackRegistry(new Array(UNICODE_DATA_PACK_LIMITS.maxPacks + 1)),
    UnicodeDataPackValidationError,
    "length",
  );
  assertThrows(
    () => new UnicodeDataPackRegistry([fixturePack()], { defaultUnicodeVersion: "14.0.0" }),
    UnicodeDataPackValidationError,
    "not registered",
  );
  let calls = 0;
  const options = Object.defineProperty({}, "defaultUnicodeVersion", {
    enumerable: true,
    get() {
      calls++;
      return "16.0.0";
    },
  });
  assertThrows(
    () => new UnicodeDataPackRegistry([fixturePack()], options),
    UnicodeDataPackValidationError,
    "accessors",
  );
  assertEquals(calls, 0);
});

Deno.test("validated packs and inspections are deeply immutable and clone-safe", () => {
  const raw = fixturePack() as {
    tables: { graphemeBreak: { start: number; end: number; value: string }[] };
  } & Record<string, unknown>;
  const pack = validateUnicodeDataPack(raw);
  raw.tables.graphemeBreak[0].value = "Control";
  assertEquals(lookupGraphemeBreakProperty(pack, 10), "Extend");
  assertNotStrictEquals(pack as unknown, raw as unknown);
  assertNotStrictEquals(pack.tables as unknown, raw.tables as unknown);
  assert(Object.isFrozen(pack));
  assert(Object.isFrozen(pack.tables));
  assert(Object.isFrozen(pack.tables.graphemeBreak[0]));
  assertThrows(() => (pack.tables.graphemeBreak[0] as { value: string }).value = "Control", TypeError);

  const first = inspectUnicodeDataPack(pack);
  const second = inspectUnicodeDataPack(pack);
  assertEquals(first, second);
  assertNotStrictEquals(first, second);
  assertNotStrictEquals(first.sources, second.sources);
  assert(Object.isFrozen(first));
  assert(Object.isFrozen(first.sources));
  assert(Object.isFrozen(first.sources[0]));

  const registry = new UnicodeDataPackRegistry([pack]);
  const inspectionA = registry.inspect();
  const inspectionB = registry.inspect();
  assertEquals(inspectionA, inspectionB);
  assertNotStrictEquals(inspectionA, inspectionB);
  assertNotStrictEquals(inspectionA.packs, inspectionB.packs);
  assert(Object.isFrozen(inspectionA.versions));
  assertNotStrictEquals(registry.versions, registry.versions);
});

Deno.test("pack validation rejects malformed identity, fields, and source metadata", () => {
  const badFingerprint = fixturePack();
  badFingerprint.fingerprint = "0".repeat(64);
  assertThrows(() => validateUnicodeDataPack(badFingerprint), UnicodeDataPackValidationError, "fingerprint");

  const unknown = fixturePack();
  unknown.extra = true;
  assertThrows(() => validateUnicodeDataPack(unknown), UnicodeDataPackValidationError, "unknown property");

  const missing = fixturePack();
  delete missing.schema;
  assertThrows(() => validateUnicodeDataPack(missing), UnicodeDataPackValidationError, "required property");

  const symbol = fixturePack();
  Object.defineProperty(symbol, Symbol("hidden"), { enumerable: true, value: true });
  assertThrows(() => validateUnicodeDataPack(symbol), UnicodeDataPackValidationError, "symbol keys");

  const nonEnumerable = fixturePack();
  Object.defineProperty(nonEnumerable, "schema", { enumerable: false, value: UNICODE_DATA_PACK_SCHEMA });
  assertThrows(() => validateUnicodeDataPack(nonEnumerable), UnicodeDataPackValidationError, "enumerable");

  const badVersion = fixturePack();
  badVersion.unicodeVersion = "017.0";
  assertThrows(() => validateUnicodeDataPack(badVersion), UnicodeDataPackValidationError, "major.minor.patch");

  const badSources = fixturePack() as { sources: Record<string, unknown>[] } & Record<string, unknown>;
  badSources.sources = [
    { name: "z-source", url: "https://example.test/z", sha256: "a".repeat(64) },
    { name: "a-source", url: "https://example.test/a", sha256: "b".repeat(64) },
  ];
  assertThrows(() => validateUnicodeDataPack(badSources), UnicodeDataPackValidationError, "sorted by name");

  const badUrl = fixturePack() as { sources: Record<string, unknown>[] } & Record<string, unknown>;
  badUrl.sources[0].url = "http://example.test/unicode.txt";
  assertThrows(() => validateUnicodeDataPack(badUrl), UnicodeDataPackValidationError, "HTTPS");

  const badDigest = fixturePack() as { sources: Record<string, unknown>[] } & Record<string, unknown>;
  badDigest.sources[0].sha256 = "A".repeat(64);
  assertThrows(() => validateUnicodeDataPack(badDigest), UnicodeDataPackValidationError, "lowercase SHA-256");
});

Deno.test("pack validation enforces range ordering, bounds, values, and collection limits", () => {
  const overlap = fixturePack() as { tables: Record<string, unknown> } & Record<string, unknown>;
  overlap.tables.graphemeBreak = [
    { start: 10, end: 20, value: "Extend" },
    { start: 20, end: 21, value: "ZWJ" },
  ];
  assertThrows(() => validateUnicodeDataPack(overlap), UnicodeDataPackValidationError, "non-overlapping");

  const reversed = fixturePack() as { tables: Record<string, unknown> } & Record<string, unknown>;
  reversed.tables.graphemeBreak = [{ start: 20, end: 10, value: "Extend" }];
  assertThrows(() => validateUnicodeDataPack(reversed), UnicodeDataPackValidationError, "precedes");

  const invalidPoint = fixturePack() as { tables: Record<string, unknown> } & Record<string, unknown>;
  invalidPoint.tables.graphemeBreak = [{ start: 0x110000, end: 0x110000, value: "Extend" }];
  assertThrows(() => validateUnicodeDataPack(invalidPoint), UnicodeDataPackValidationError, "1114111");

  const invalidWidth = fixturePack() as { tables: Record<string, unknown> } & Record<string, unknown>;
  invalidWidth.tables.eastAsianWidth = [{ start: 100, end: 102, value: "Wide" }];
  assertThrows(() => validateUnicodeDataPack(invalidWidth), UnicodeDataPackValidationError, "unsupported");

  const tooManySources = fixturePack() as Record<string, unknown>;
  tooManySources.sources = new Array(UNICODE_DATA_PACK_LIMITS.maxSources + 1);
  assertThrows(() => validateUnicodeDataPack(tooManySources), UnicodeDataPackValidationError, "length");

  const tooManyRanges = fixturePack() as { tables: Record<string, unknown> } & Record<string, unknown>;
  tooManyRanges.tables.graphemeBreak = new Array(UNICODE_DATA_PACK_LIMITS.maxRangesPerTable + 1);
  assertThrows(() => validateUnicodeDataPack(tooManyRanges), UnicodeDataPackValidationError, "length");

  const tooManyEmojiProperties = fixturePack() as { tables: Record<string, unknown> } & Record<string, unknown>;
  tooManyEmojiProperties.tables.emoji = new Array(UNICODE_DATA_PACK_LIMITS.maxEmojiProperties + 1);
  assertThrows(() => validateUnicodeDataPack(tooManyEmojiProperties), UnicodeDataPackValidationError, "length");

  const oversizedUrl = fixturePack() as { sources: Record<string, unknown>[] } & Record<string, unknown>;
  oversizedUrl.sources[0].url = `https://example.test/${"x".repeat(UNICODE_DATA_PACK_LIMITS.maxUrlLength)}`;
  assertThrows(() => validateUnicodeDataPack(oversizedUrl), UnicodeDataPackValidationError, "length");
});

Deno.test("validation rejects getters without invoking them", () => {
  const raw = fixturePack();
  const originalFingerprint = raw.fingerprint;
  let topLevelCalls = 0;
  Object.defineProperty(raw, "fingerprint", {
    enumerable: true,
    get() {
      topLevelCalls++;
      return originalFingerprint;
    },
  });
  assertThrows(() => validateUnicodeDataPack(raw), UnicodeDataPackValidationError, "accessors");
  assertEquals(topLevelCalls, 0);

  const nested = fixturePack() as { tables: { graphemeBreak: unknown[] } } & Record<string, unknown>;
  let nestedCalls = 0;
  nested.tables.graphemeBreak[0] = Object.defineProperty({ end: 12, value: "Extend" }, "start", {
    enumerable: true,
    get() {
      nestedCalls++;
      return 10;
    },
  });
  assertThrows(() => validateUnicodeDataPack(nested), UnicodeDataPackValidationError, "accessors");
  assertEquals(nestedCalls, 0);

  const selectorRegistry = new UnicodeDataPackRegistry([fixturePack()]);
  let selectorCalls = 0;
  const selector = Object.defineProperty({}, "unicodeVersion", {
    enumerable: true,
    get() {
      selectorCalls++;
      return "16.0.0";
    },
  });
  assertThrows(
    () => selectorRegistry.select(selector),
    UnicodeDataPackValidationError,
    "accessors",
  );
  assertEquals(selectorCalls, 0);
});

Deno.test("validation rejects sparse, extended, accessor-backed, and exotic arrays", () => {
  const sparse = fixturePack() as { tables: Record<string, unknown> } & Record<string, unknown>;
  sparse.tables.graphemeBreak = new Array(1);
  assertThrows(() => validateUnicodeDataPack(sparse), UnicodeDataPackValidationError, "sparse arrays");

  const extended = fixturePack() as { tables: { graphemeBreak: unknown[] } } & Record<string, unknown>;
  Object.defineProperty(extended.tables.graphemeBreak, "metadata", { enumerable: true, value: true });
  assertThrows(() => validateUnicodeDataPack(extended), UnicodeDataPackValidationError, "custom array properties");

  const accessor = fixturePack() as { tables: Record<string, unknown> } & Record<string, unknown>;
  let calls = 0;
  const items: unknown[] = [];
  Object.defineProperty(items, "0", {
    enumerable: true,
    get() {
      calls++;
      return { start: 10, end: 12, value: "Extend" };
    },
  });
  accessor.tables.graphemeBreak = items;
  assertThrows(() => validateUnicodeDataPack(accessor), UnicodeDataPackValidationError, "accessors");
  assertEquals(calls, 0);

  const exotic = fixturePack() as { tables: { graphemeBreak: unknown[] } } & Record<string, unknown>;
  Object.setPrototypeOf(exotic.tables.graphemeBreak, Object.create(null));
  assertThrows(() => validateUnicodeDataPack(exotic), UnicodeDataPackValidationError, "plain array");
});

Deno.test("validation fails closed on throwing, revoked, and malformed proxies", () => {
  const throwing = fixturePack() as { tables: Record<string, unknown> } & Record<string, unknown>;
  throwing.tables.graphemeBreak = new Proxy([], {
    ownKeys() {
      throw new Error("hostile");
    },
  });
  assertThrows(() => validateUnicodeDataPack(throwing), UnicodeDataPackValidationError, "safely");

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const revokedPack = fixturePack();
  revokedPack.tables = revoked.proxy;
  assertThrows(() => validateUnicodeDataPack(revokedPack), UnicodeDataPackValidationError, "safely");

  const malformed = fixturePack() as { tables: { graphemeBreak: unknown[] } } & Record<string, unknown>;
  malformed.tables.graphemeBreak[0] = new Proxy({ start: 10, end: 12, value: "Extend" }, {
    getOwnPropertyDescriptor(target, property) {
      if (property === "start") {
        return { configurable: true, enumerable: true, get: () => 10 };
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  assertThrows(() => validateUnicodeDataPack(malformed), UnicodeDataPackValidationError, "accessors");
});

Deno.test("descriptor snapshots prevent proxy time-of-check/time-of-use drift", () => {
  const raw = fixturePack() as { tables: { graphemeBreak: unknown[] } } & Record<string, unknown>;
  let startDescriptorReads = 0;
  raw.tables.graphemeBreak[0] = new Proxy({ start: 10, end: 12, value: "Extend" }, {
    getOwnPropertyDescriptor(target, property) {
      if (property === "start") startDescriptorReads++;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  const pack = validateUnicodeDataPack(raw);
  assertEquals(lookupGraphemeBreakProperty(pack, 10), "Extend");
  assertEquals(startDescriptorReads, 1);
});

Deno.test("fingerprints are canonical, content-sensitive, and use standard SHA-256", () => {
  assertEquals(unicodeDataSha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assertEquals(unicodeDataSha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const content = fixtureContent();
  const reordered = {
    tables: content.tables,
    sources: content.sources,
    unicodeVersion: content.unicodeVersion,
    schemaVersion: content.schemaVersion,
    schema: content.schema,
  };
  assertEquals(fingerprintUnicodeDataPackContent(content), fingerprintUnicodeDataPackContent(reordered));
  const changed = structuredClone(content) as
    & { tables: { graphemeBreak: { value: string }[] } }
    & UnicodeDataPackContent;
  changed.tables.graphemeBreak[0].value = "Control";
  assertFalse(fingerprintUnicodeDataPackContent(content) === fingerprintUnicodeDataPackContent(changed));
});

Deno.test("network-free check mode verifies deterministic output and rejects drift", async () => {
  const command = new Deno.Command(Deno.execPath(), {
    args: [...("Bun" in globalThis ? [] : ["run", "--allow-read"]), "scripts/update_unicode_data.ts", "--check"],
    cwd: Deno.cwd(),
  });
  const checked = await command.output();
  assertEquals(checked.code, 0, new TextDecoder().decode(checked.stderr));
  const stdout = new TextDecoder().decode(checked.stdout);
  assertStringIncludes(stdout, "Unicode data check passed: Unicode 17.0.0");
  assertStringIncludes(
    stdout,
    "compact 14223 bytes 460e0ba686e75a1037c3d322e7d10f9628673397d2a32d9e06c5d5154c2f9dc4",
  );

  const generatedPath = "src/unicode/generated/unicode_17_0_0.ts";
  const generated = await Deno.readTextFile(generatedPath);
  const temporary = await Deno.makeTempFile({ suffix: ".ts" });
  try {
    const drifted = structuredClone(BUILTIN_UNICODE_DATA_PACK) as {
      schema: typeof UNICODE_DATA_PACK_SCHEMA;
      schemaVersion: typeof UNICODE_DATA_PACK_SCHEMA_VERSION;
      unicodeVersion: string;
      fingerprint: string;
      sources: UnicodeDataPackContent["sources"];
      tables: {
        graphemeBreak: { start: number; end: number; value: string }[];
        eastAsianWidth: UnicodeDataPackContent["tables"]["eastAsianWidth"];
        emoji: UnicodeDataPackContent["tables"]["emoji"];
      };
    };
    drifted.tables.graphemeBreak[0].end = 8;
    drifted.fingerprint = fingerprintUnicodeDataPackContent({
      schema: drifted.schema,
      schemaVersion: drifted.schemaVersion,
      unicodeVersion: drifted.unicodeVersion,
      sources: drifted.sources,
      tables: drifted.tables,
    });
    const driftedModule = generated
      .replace(BUILTIN_UNICODE_DATA_PACK.fingerprint, drifted.fingerprint)
      .replace('"end": 9', '"end": 8');
    await Deno.writeTextFile(temporary, driftedModule);
    const driftCheck = await new Deno.Command(Deno.execPath(), {
      args: [
        ...("Bun" in globalThis ? [] : ["run", "--allow-read"]),
        "scripts/update_unicode_data.ts",
        "--check",
        temporary,
      ],
      cwd: Deno.cwd(),
    }).output();
    assertFalse(driftCheck.success);
    assertStringIncludes(new TextDecoder().decode(driftCheck.stderr), "unreviewed");
  } finally {
    await Deno.remove(temporary);
  }
});
