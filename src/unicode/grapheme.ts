// Copyright 2023 Im-Beast. MIT license.

import {
  type UnicodeCodePointRange,
  type UnicodeDataPack,
  unicodeDataSha256,
  type UnicodeValuedRange,
  validateUnicodeDataPack,
} from "./data_pack.ts";
import { GENERATED_UNICODE_17_0_0_GRAPHEME_DATA } from "./generated/unicode_17_0_0_grapheme.ts";

/** Grapheme_Cluster_Break values used by Unicode 17.0.0 extended grapheme clusters. */
export type GraphemeBreakProperty =
  | "CR"
  | "Control"
  | "Extend"
  | "L"
  | "LF"
  | "LV"
  | "LVT"
  | "Other"
  | "Prepend"
  | "Regional_Indicator"
  | "SpacingMark"
  | "T"
  | "V"
  | "ZWJ";

/** Indic_Conjunct_Break values used by UAX #29 rule GB9c (listed as GB9.3 in the conformance data). */
export type IndicConjunctBreakProperty = "Consonant" | "Extend" | "Linker" | "None";

/** Direction used to resolve a UTF-16 offset that lies inside a grapheme. */
export type GraphemeBoundaryBias = "backward" | "forward" | "nearest";

/** One immutable extended grapheme cluster with UTF-16 offsets into the original string. */
export interface GraphemeCluster {
  readonly segment: string;
  readonly start: number;
  readonly end: number;
  readonly index: number;
}

/** An immutable UTF-16 range whose endpoints are extended-grapheme boundaries. */
export interface GraphemeBoundaryRange {
  readonly start: number;
  readonly end: number;
}

/** Version metadata for a Unicode grapheme segmenter. */
export interface UnicodeGraphemeSegmenterInspection {
  readonly unicodeVersion: string;
  readonly dataPackFingerprint: string;
  readonly indicConjunctBreakFingerprint: string;
  readonly indicConjunctBreakRanges: number;
}

/** Raised when a pack cannot provide the pinned data required by the grapheme algorithm. */
export class UnicodeGraphemeDataError extends TypeError {
  readonly code: "UNICODE_GRAPHEME_DATA_INVALID" = "UNICODE_GRAPHEME_DATA_INVALID";

  constructor(detail: string) {
    super(`Invalid Unicode grapheme data: ${detail}`);
    this.name = "UnicodeGraphemeDataError";
  }
}

interface IndicConjunctBreakRange extends UnicodeCodePointRange {
  readonly value: Exclude<IndicConjunctBreakProperty, "None">;
}

interface GraphemeBreakRange extends UnicodeCodePointRange {
  readonly value: GraphemeBreakProperty;
}

interface GraphemeAlgorithmData {
  readonly graphemeBreak: readonly GraphemeBreakRange[];
  readonly extendedPictographic: readonly UnicodeCodePointRange[];
}

interface BuiltinGraphemeData extends GraphemeAlgorithmData {
  readonly unicodeVersion: string;
  readonly dataPackFingerprint: string;
  readonly indicConjunctBreakFingerprint: string;
  readonly indicConjunctBreak: readonly IndicConjunctBreakRange[];
}

const SUPPORTED_GRAPHEME_BREAK_PROPERTIES: ReadonlySet<string> = new Set<GraphemeBreakProperty>([
  "CR",
  "Control",
  "Extend",
  "L",
  "LF",
  "LV",
  "LVT",
  "Other",
  "Prepend",
  "Regional_Indicator",
  "SpacingMark",
  "T",
  "V",
  "ZWJ",
]);
const CONTROL_PROPERTIES: ReadonlySet<GraphemeBreakProperty> = new Set(["Control", "CR", "LF"]);
const PINNED_UNICODE_VERSION = "17.0.0";
const PINNED_DATA_PACK_FINGERPRINT = "4c885bc9201552e99c0797a4b8ea72db55fc2c315af3347ad53a9743c65bbfc2";
const PINNED_INDIC_CONJUNCT_BREAK_FINGERPRINT = "bfa679b9dd050b8de3a16881433fc28d48ec81cb01d46dd44c1f5bc4888f49e3";
const PINNED_COMPACT_GRAPHEME_FINGERPRINT = "bc25cd592433e9c0ee1835efcdf7e8b5f9edb462bbb971ae07c20fb16e479dc6";
const GRAPHEME_BREAK_VALUES: readonly GraphemeBreakProperty[] = Object.freeze([
  "CR",
  "Control",
  "Extend",
  "L",
  "LF",
  "LV",
  "LVT",
  "Other",
  "Prepend",
  "Regional_Indicator",
  "SpacingMark",
  "T",
  "V",
  "ZWJ",
]);
const INDIC_CONJUNCT_BREAK_VALUES: readonly Exclude<IndicConjunctBreakProperty, "None">[] = Object.freeze([
  "Consonant",
  "Extend",
  "Linker",
]);

function invalidData(detail: string): never {
  throw new UnicodeGraphemeDataError(detail);
}

function snapshotRecord(value: unknown, path: string, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalidData(`${path} must be a plain object`);
  }
  let prototype: object | null;
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  } catch {
    return invalidData(`${path} could not be inspected safely`);
  }
  if (prototype !== Object.prototype && prototype !== null) invalidData(`${path} must be a plain object`);
  const expected = new Set(keys);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !expected.has(key)) invalidData(`${path} has an unknown property`);
    const descriptor = descriptors[key];
    if (
      descriptor === undefined || !("value" in descriptor) || descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      invalidData(`${path}.${key} must be a data property`);
    }
    result[key] = descriptor.value;
  }
  for (const key of keys) {
    if (!Object.hasOwn(result, key)) invalidData(`${path}.${key} is required`);
  }
  return result;
}

function snapshotArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) invalidData(`${path} must be an array`);
  let prototype: object | null;
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  } catch {
    return invalidData(`${path} could not be inspected safely`);
  }
  if (prototype !== Array.prototype && prototype !== null) invalidData(`${path} must be a plain array`);
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 1 || length > 100_000) {
    invalidData(`${path}.length is outside the supported range`);
  }
  const result = new Array<unknown>(length);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)) invalidData(`${path} has a custom property`);
    const index = Number(key);
    const descriptor = descriptors[key];
    if (
      !Number.isSafeInteger(index) || index < 0 || index >= length || descriptor === undefined ||
      !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined
    ) {
      invalidData(`${path}[${key}] must be a dense data property`);
    }
    result[index] = descriptor.value;
  }
  for (let index = 0; index < length; index++) {
    if (!Object.hasOwn(result, index)) invalidData(`${path} must not be sparse`);
  }
  return result;
}

function normalizeStringCodec<T extends string>(
  value: unknown,
  expected: readonly T[],
  path: string,
): readonly T[] {
  const entries = snapshotArray(value, path);
  if (entries.length !== expected.length) invalidData(`${path} does not match the pinned property codec`);
  for (let index = 0; index < entries.length; index++) {
    if (entries[index] !== expected[index]) invalidData(`${path} does not match the pinned property codec`);
  }
  return expected;
}

function normalizeEncodedNumbers(value: unknown, path: string, stride: number): readonly number[] {
  const entries = snapshotArray(value, path);
  if (entries.length % stride !== 0) invalidData(`${path} length must be divisible by ${stride}`);
  const numbers: number[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!Number.isSafeInteger(entry) || (entry as number) < 0) {
      invalidData(`${path}[${index}] must be a non-negative safe integer`);
    }
    numbers.push(entry as number);
  }
  return Object.freeze(numbers);
}

function decodeValuedRanges<T extends string>(
  encoded: readonly number[],
  values: readonly T[],
  path: string,
): readonly (UnicodeCodePointRange & { readonly value: T })[] {
  const ranges: (UnicodeCodePointRange & { readonly value: T })[] = [];
  let previousEnd = -1;
  for (let offset = 0; offset < encoded.length; offset += 3) {
    const start = previousEnd + 1 + encoded[offset];
    const end = start + encoded[offset + 1];
    const value = values[encoded[offset + 2]];
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end > 0x10ffff) {
      invalidData(`${path}[${offset / 3}] is outside the Unicode code-point range`);
    }
    if (value === undefined) invalidData(`${path}[${offset / 3}] has an unsupported property code`);
    ranges.push(Object.freeze({ start, end, value }));
    previousEnd = end;
  }
  return Object.freeze(ranges);
}

function decodeBinaryRanges(encoded: readonly number[], path: string): readonly UnicodeCodePointRange[] {
  const ranges: UnicodeCodePointRange[] = [];
  let previousEnd = -1;
  for (let offset = 0; offset < encoded.length; offset += 2) {
    const start = previousEnd + 1 + encoded[offset];
    const end = start + encoded[offset + 1];
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end > 0x10ffff) {
      invalidData(`${path}[${offset / 2}] is outside the Unicode code-point range`);
    }
    ranges.push(Object.freeze({ start, end }));
    previousEnd = end;
  }
  return Object.freeze(ranges);
}

function normalizeBuiltinGraphemeData(input: unknown): BuiltinGraphemeData {
  const keys = [
    "schema",
    "schemaVersion",
    "unicodeVersion",
    "dataPackFingerprint",
    "indicConjunctBreakFingerprint",
    "graphemeBreakValues",
    "indicConjunctBreakValues",
    "graphemeBreakRanges",
    "extendedPictographicRanges",
    "indicConjunctBreakRanges",
    "fingerprint",
  ] as const;
  const data = snapshotRecord(input, "$.graphemeData", keys);
  if (data.schema !== "deno-tui.unicode-grapheme-data" || data.schemaVersion !== 1) {
    invalidData("compact grapheme schema must be deno-tui.unicode-grapheme-data version 1");
  }
  if (data.unicodeVersion !== PINNED_UNICODE_VERSION) {
    invalidData(`compact grapheme Unicode version must be ${PINNED_UNICODE_VERSION}`);
  }
  if (data.dataPackFingerprint !== PINNED_DATA_PACK_FINGERPRINT) {
    invalidData("compact grapheme data-pack fingerprint is not pinned");
  }
  if (data.indicConjunctBreakFingerprint !== PINNED_INDIC_CONJUNCT_BREAK_FINGERPRINT) {
    invalidData("compact Indic_Conjunct_Break fingerprint is not pinned");
  }
  if (data.fingerprint !== PINNED_COMPACT_GRAPHEME_FINGERPRINT) {
    invalidData("compact grapheme content fingerprint is not pinned");
  }

  const graphemeBreakValues = normalizeStringCodec(
    data.graphemeBreakValues,
    GRAPHEME_BREAK_VALUES,
    "$.graphemeData.graphemeBreakValues",
  );
  const indicConjunctBreakValues = normalizeStringCodec(
    data.indicConjunctBreakValues,
    INDIC_CONJUNCT_BREAK_VALUES,
    "$.graphemeData.indicConjunctBreakValues",
  );
  const graphemeBreakRanges = normalizeEncodedNumbers(
    data.graphemeBreakRanges,
    "$.graphemeData.graphemeBreakRanges",
    3,
  );
  const extendedPictographicRanges = normalizeEncodedNumbers(
    data.extendedPictographicRanges,
    "$.graphemeData.extendedPictographicRanges",
    2,
  );
  const indicConjunctBreakRanges = normalizeEncodedNumbers(
    data.indicConjunctBreakRanges,
    "$.graphemeData.indicConjunctBreakRanges",
    3,
  );
  const content = {
    schema: data.schema,
    schemaVersion: data.schemaVersion,
    unicodeVersion: data.unicodeVersion,
    dataPackFingerprint: data.dataPackFingerprint,
    indicConjunctBreakFingerprint: data.indicConjunctBreakFingerprint,
    graphemeBreakValues,
    indicConjunctBreakValues,
    graphemeBreakRanges,
    extendedPictographicRanges,
    indicConjunctBreakRanges,
  };
  if (unicodeDataSha256(JSON.stringify(content)) !== data.fingerprint) {
    invalidData("compact grapheme fingerprint does not match its encoded content");
  }
  return Object.freeze({
    unicodeVersion: data.unicodeVersion,
    dataPackFingerprint: data.dataPackFingerprint,
    indicConjunctBreakFingerprint: data.indicConjunctBreakFingerprint,
    graphemeBreak: decodeValuedRanges(
      graphemeBreakRanges,
      graphemeBreakValues,
      "$.graphemeData.graphemeBreakRanges",
    ),
    extendedPictographic: decodeBinaryRanges(
      extendedPictographicRanges,
      "$.graphemeData.extendedPictographicRanges",
    ),
    indicConjunctBreak: decodeValuedRanges(
      indicConjunctBreakRanges,
      indicConjunctBreakValues,
      "$.graphemeData.indicConjunctBreakRanges",
    ),
  }) as BuiltinGraphemeData;
}

const BUILTIN_GRAPHEME_DATA = normalizeBuiltinGraphemeData(GENERATED_UNICODE_17_0_0_GRAPHEME_DATA);

function assertCodePoint(codePoint: number): void {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    throw new RangeError("Unicode code point must be an integer from 0 through 1114111.");
  }
}

function findRange<T extends UnicodeCodePointRange>(ranges: readonly T[], codePoint: number): T | undefined {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = low + ((high - low) >>> 1);
    const range = ranges[middle];
    if (codePoint < range.start) high = middle - 1;
    else if (codePoint > range.end) low = middle + 1;
    else return range;
  }
  return undefined;
}

/** Look up the pinned Unicode 17.0.0 Indic_Conjunct_Break value. */
export function lookupIndicConjunctBreakProperty(codePoint: number): IndicConjunctBreakProperty {
  assertCodePoint(codePoint);
  return findRange(BUILTIN_GRAPHEME_DATA.indicConjunctBreak, codePoint)?.value ?? "None";
}

/**
 * Boundaries for pure-ASCII text, which is nearly everything a terminal wraps.
 *
 * Every rule that joins two scalars into one cluster — Extend, ZWJ, SpacingMark,
 * Prepend, Hangul jamo, regional indicators, emoji sequences — needs a code
 * point at or above U+0080. The single exception inside ASCII is GB3, CR × LF.
 * So for ASCII the answer is "a boundary at every offset, except between a CR
 * and the LF that follows it", and that is exact rather than approximate.
 *
 * Worth the special case because the general path allocates a one-character
 * string per scalar through the string iterator and runs the rule state machine
 * for each: it was 77% of the cost of wrapping a screen of plain text.
 */
function asciiGraphemeBoundaries(text: string): readonly number[] | undefined {
  const length = text.length;
  for (let index = 0; index < length; index += 1) {
    if (text.charCodeAt(index) > 0x7f) return undefined;
  }
  const boundaries: number[] = [];
  for (let index = 0; index < length; index += 1) {
    // GB3: no boundary between a carriage return and its line feed.
    if (index > 0 && text.charCodeAt(index - 1) === 0x0d && text.charCodeAt(index) === 0x0a) continue;
    boundaries.push(index);
  }
  boundaries.push(length);
  return Object.freeze(boundaries);
}

function assertText(text: string): void {
  if (typeof text !== "string") throw new TypeError("Grapheme input must be a primitive string.");
}

function assertOffset(text: string, offset: number, name = "offset"): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) {
    throw new RangeError(`${name} must be an integer from 0 through the input's UTF-16 length (${text.length}).`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer.`);
}

function normalizeBias(bias: GraphemeBoundaryBias): GraphemeBoundaryBias {
  if (bias !== "backward" && bias !== "forward" && bias !== "nearest") {
    throw new TypeError('Grapheme boundary bias must be "backward", "forward", or "nearest".');
  }
  return bias;
}

function graphemeBreakProperty(data: GraphemeAlgorithmData, codePoint: number): GraphemeBreakProperty {
  return findRange(data.graphemeBreak, codePoint)?.value ?? "Other";
}

function isExtendedPictographic(data: GraphemeAlgorithmData, codePoint: number): boolean {
  return findRange(data.extendedPictographic, codePoint) !== undefined;
}

function shouldBreak(
  previous: GraphemeBreakProperty,
  current: GraphemeBreakProperty,
  currentIsExtendedPictographic: boolean,
  precedingRegionalIndicators: number,
  previousZwjFollowsExtendedPictographic: boolean,
  indicConsonantChain: boolean,
  indicLinkerSeen: boolean,
  currentIndic: IndicConjunctBreakProperty,
): boolean {
  // GB3
  if (previous === "CR" && current === "LF") return false;
  // GB4 and GB5 precede all joining rules.
  if (CONTROL_PROPERTIES.has(previous) || CONTROL_PROPERTIES.has(current)) return true;
  // GB6, GB7, and GB8.
  if (previous === "L" && (current === "L" || current === "V" || current === "LV" || current === "LVT")) {
    return false;
  }
  if ((previous === "LV" || previous === "V") && (current === "V" || current === "T")) return false;
  if ((previous === "LVT" || previous === "T") && current === "T") return false;
  // GB9, GB9a, and GB9b.
  if (current === "Extend" || current === "ZWJ" || current === "SpacingMark" || previous === "Prepend") {
    return false;
  }
  // GB9c / Unicode 17 conformance rule 9.3.
  if (currentIndic === "Consonant" && indicConsonantChain && indicLinkerSeen) return false;
  // GB11.
  if (currentIsExtendedPictographic && previousZwjFollowsExtendedPictographic) return false;
  // GB12 and GB13 pair consecutive regional indicators from the start of the run.
  if (previous === "Regional_Indicator" && current === "Regional_Indicator") {
    return precedingRegionalIndicators % 2 === 0;
  }
  return true;
}

class GraphemeRuleState {
  readonly #data: GraphemeAlgorithmData;
  #previous: GraphemeBreakProperty | undefined;
  #precedingRegionalIndicators = 0;
  #extendedPictographicExtendRun = false;
  #previousZwjFollowsExtendedPictographic = false;
  #indicConsonantChain = false;
  #indicLinkerSeen = false;

  constructor(data: GraphemeAlgorithmData) {
    this.#data = data;
  }

  consume(codePoint: number): boolean {
    const current = graphemeBreakProperty(this.#data, codePoint);
    const currentIndic = lookupIndicConjunctBreakProperty(codePoint);
    const currentIsExtendedPictographic = isExtendedPictographic(this.#data, codePoint);
    const boundary = this.#previous !== undefined &&
      shouldBreak(
        this.#previous,
        current,
        currentIsExtendedPictographic,
        this.#precedingRegionalIndicators,
        this.#previousZwjFollowsExtendedPictographic,
        this.#indicConsonantChain,
        this.#indicLinkerSeen,
        currentIndic,
      );

    const zwjFollowsExtendedPictographic = current === "ZWJ" && this.#extendedPictographicExtendRun;
    if (currentIsExtendedPictographic) this.#extendedPictographicExtendRun = true;
    else if (current !== "Extend") this.#extendedPictographicExtendRun = false;

    if (currentIndic === "Consonant") {
      this.#indicConsonantChain = true;
      this.#indicLinkerSeen = false;
    } else if (currentIndic === "Extend" || currentIndic === "Linker") {
      if (this.#indicConsonantChain && currentIndic === "Linker") this.#indicLinkerSeen = true;
    } else {
      this.#indicConsonantChain = false;
      this.#indicLinkerSeen = false;
    }

    this.#precedingRegionalIndicators = current === "Regional_Indicator" ? this.#precedingRegionalIndicators + 1 : 0;
    this.#previous = current;
    this.#previousZwjFollowsExtendedPictographic = zwjFollowsExtendedPictographic;
    return boundary;
  }
}

function sameCodePointRanges(
  actual: readonly UnicodeCodePointRange[],
  expected: readonly UnicodeCodePointRange[],
): boolean {
  if (actual.length !== expected.length) return false;
  for (let index = 0; index < actual.length; index++) {
    if (actual[index].start !== expected[index].start || actual[index].end !== expected[index].end) return false;
  }
  return true;
}

function sameValuedRanges(actual: readonly UnicodeValuedRange[], expected: readonly UnicodeValuedRange[]): boolean {
  if (actual.length !== expected.length) return false;
  for (let index = 0; index < actual.length; index++) {
    if (
      actual[index].start !== expected[index].start || actual[index].end !== expected[index].end ||
      actual[index].value !== expected[index].value
    ) {
      return false;
    }
  }
  return true;
}

function assertAlgorithmCriticalPackData(pack: UnicodeDataPack): void {
  if (!sameValuedRanges(pack.tables.graphemeBreak, BUILTIN_GRAPHEME_DATA.graphemeBreak)) {
    invalidData("pack Grapheme_Cluster_Break table does not match the pinned Unicode 17.0.0 algorithm data");
  }
  const actualExtendedPictographic = pack.tables.emoji.find((entry) => entry.property === "Extended_Pictographic");
  if (
    actualExtendedPictographic === undefined ||
    !sameCodePointRanges(actualExtendedPictographic.ranges, BUILTIN_GRAPHEME_DATA.extendedPictographic)
  ) {
    invalidData("pack Extended_Pictographic table does not match the pinned Unicode 17.0.0 algorithm data");
  }
}

const SEGMENTER_DATA = new WeakMap<object, GraphemeAlgorithmData>();

function boundarySearch(
  boundaries: readonly number[],
  offset: number,
): { readonly found: boolean; readonly index: number } {
  let low = 0;
  let high = boundaries.length;
  while (low < high) {
    const middle = low + ((high - low) >>> 1);
    if (boundaries[middle] < offset) low = middle + 1;
    else high = middle;
  }
  return { found: boundaries[low] === offset, index: low };
}

/**
 * Deterministic Unicode 17.0.0 UAX #29 extended-grapheme segmenter.
 *
 * Offsets are UTF-16 code-unit offsets, matching JavaScript string slicing and
 * DOM selection APIs. The constructor validates and clones its pack so caller
 * mutation, accessors, and proxies cannot alter later segmentation.
 */
export class UnicodeGraphemeSegmenter {
  readonly #data: GraphemeAlgorithmData;
  readonly #inspection: UnicodeGraphemeSegmenterInspection;

  constructor(packInput?: unknown) {
    let data: GraphemeAlgorithmData;
    let dataPackFingerprint: string;
    if (packInput === undefined) {
      data = BUILTIN_GRAPHEME_DATA;
      dataPackFingerprint = BUILTIN_GRAPHEME_DATA.dataPackFingerprint;
    } else {
      const pack = validateUnicodeDataPack(packInput);
      if (pack.unicodeVersion !== BUILTIN_GRAPHEME_DATA.unicodeVersion) {
        invalidData(
          `pack version ${pack.unicodeVersion} has no matching Indic_Conjunct_Break table; expected ${BUILTIN_GRAPHEME_DATA.unicodeVersion}`,
        );
      }
      for (let index = 0; index < pack.tables.graphemeBreak.length; index++) {
        const value = pack.tables.graphemeBreak[index].value;
        if (!SUPPORTED_GRAPHEME_BREAK_PROPERTIES.has(value)) {
          invalidData(`pack Grapheme_Cluster_Break range ${index} has unsupported value ${JSON.stringify(value)}`);
        }
      }
      assertAlgorithmCriticalPackData(pack);
      const extendedPictographic = pack.tables.emoji.find((entry) => entry.property === "Extended_Pictographic")!;
      data = Object.freeze({
        graphemeBreak: pack.tables.graphemeBreak as readonly GraphemeBreakRange[],
        extendedPictographic: extendedPictographic.ranges,
      });
      dataPackFingerprint = pack.fingerprint;
    }
    this.#data = data;
    this.#inspection = Object.freeze({
      unicodeVersion: BUILTIN_GRAPHEME_DATA.unicodeVersion,
      dataPackFingerprint,
      indicConjunctBreakFingerprint: BUILTIN_GRAPHEME_DATA.indicConjunctBreakFingerprint,
      indicConjunctBreakRanges: BUILTIN_GRAPHEME_DATA.indicConjunctBreak.length,
    });
    SEGMENTER_DATA.set(this, data);
    Object.freeze(this);
  }

  /** Return immutable, clone-safe version and fingerprint metadata. */
  inspect(): UnicodeGraphemeSegmenterInspection {
    return this.#inspection;
  }

  /** Return every extended-grapheme boundary as a UTF-16 offset, including 0 and string length. */
  boundaries(text: string): readonly number[] {
    assertText(text);
    const ascii = asciiGraphemeBoundaries(text);
    if (ascii) return ascii;
    const boundaries: number[] = [0];
    let offset = 0;
    const rules = new GraphemeRuleState(this.#data);

    for (const scalar of text) {
      const codePoint = scalar.codePointAt(0)!;
      const currentStart = offset;
      if (rules.consume(codePoint)) boundaries.push(currentStart);
      offset += scalar.length;
    }

    if (boundaries[boundaries.length - 1] !== text.length) boundaries.push(text.length);
    return Object.freeze(boundaries);
  }

  /** Iterate immutable clusters without exposing the mutable boundary work array. */
  *iterate(text: string): IterableIterator<GraphemeCluster> {
    const boundaries = this.boundaries(text);
    for (let index = 0; index + 1 < boundaries.length; index++) {
      const start = boundaries[index];
      const end = boundaries[index + 1];
      yield Object.freeze({ segment: text.slice(start, end), start, end, index });
    }
  }

  /** Materialize all immutable clusters in an immutable array. */
  segments(text: string): readonly GraphemeCluster[] {
    return Object.freeze(Array.from(this.iterate(text)));
  }

  /** Count extended grapheme clusters. */
  count(text: string): number {
    return this.boundaries(text).length - 1;
  }

  /** Test whether a UTF-16 offset is a canonical extended-grapheme boundary. */
  isBoundary(text: string, offset: number): boolean {
    assertText(text);
    assertOffset(text, offset);
    return boundarySearch(this.boundaries(text), offset).found;
  }

  /** Move to the preceding boundary; a boundary input moves one cluster unless already at zero. */
  previousBoundary(text: string, offset: number): number {
    assertText(text);
    assertOffset(text, offset);
    const boundaries = this.boundaries(text);
    const match = boundarySearch(boundaries, offset);
    const index = match.index - 1;
    return boundaries[Math.max(0, index)];
  }

  /** Move to the following boundary; a boundary input moves one cluster unless already at the end. */
  nextBoundary(text: string, offset: number): number {
    assertText(text);
    assertOffset(text, offset);
    const boundaries = this.boundaries(text);
    const match = boundarySearch(boundaries, offset);
    const index = match.found ? match.index + 1 : match.index;
    return boundaries[Math.min(boundaries.length - 1, index)];
  }

  /** Resolve an arbitrary valid UTF-16 offset to a boundary without splitting a surrogate pair or grapheme. */
  resolveBoundary(text: string, offset: number, bias: GraphemeBoundaryBias): number {
    assertText(text);
    assertOffset(text, offset);
    const normalizedBias = normalizeBias(bias);
    const boundaries = this.boundaries(text);
    const match = boundarySearch(boundaries, offset);
    if (match.found) return offset;
    const before = boundaries[match.index - 1];
    const after = boundaries[match.index];
    if (normalizedBias === "backward") return before;
    if (normalizedBias === "forward") return after;
    return offset - before <= after - offset ? before : after;
  }

  /** Expand a UTF-16 range outward so both endpoints are extended-grapheme boundaries. */
  coveringRange(text: string, start: number, end: number): GraphemeBoundaryRange {
    assertText(text);
    assertOffset(text, start, "start");
    assertOffset(text, end, "end");
    if (end < start) throw new RangeError("Grapheme range end must not precede start.");
    return Object.freeze({
      start: this.resolveBoundary(text, start, "backward"),
      end: this.resolveBoundary(text, end, "forward"),
    });
  }

  /** Truncate to at most a number of extended grapheme clusters. */
  truncateClusters(text: string, maximumClusters: number): string {
    assertText(text);
    assertNonNegativeInteger(maximumClusters, "maximumClusters");
    const boundaries = this.boundaries(text);
    if (maximumClusters >= boundaries.length - 1) return text;
    return text.slice(0, boundaries[maximumClusters]);
  }

  /** Truncate to a UTF-16 budget while always ending on an extended-grapheme boundary. */
  truncateUtf16(text: string, maximumCodeUnits: number): string {
    assertText(text);
    assertNonNegativeInteger(maximumCodeUnits, "maximumCodeUnits");
    if (maximumCodeUnits >= text.length) return text;
    return text.slice(0, this.resolveBoundary(text, maximumCodeUnits, "backward"));
  }
}

/** Shared immutable segmenter for the built-in Unicode 17.0.0 data pack. */
export const DEFAULT_UNICODE_GRAPHEME_SEGMENTER: UnicodeGraphemeSegmenter = new UnicodeGraphemeSegmenter();

/** Return canonical UTF-16 boundaries using the built-in pinned segmenter. */
export function graphemeBoundaries(text: string): readonly number[] {
  return DEFAULT_UNICODE_GRAPHEME_SEGMENTER.boundaries(text);
}

/** Iterate extended grapheme clusters using the built-in pinned segmenter. */
export function iterateGraphemes(text: string): IterableIterator<GraphemeCluster> {
  return DEFAULT_UNICODE_GRAPHEME_SEGMENTER.iterate(text);
}

/** Materialize immutable extended grapheme clusters using the built-in pinned segmenter. */
export function segmentGraphemes(text: string): readonly GraphemeCluster[] {
  return DEFAULT_UNICODE_GRAPHEME_SEGMENTER.segments(text);
}

/** Test a UTF-16 offset using the built-in pinned segmenter. */
export function isGraphemeBoundary(text: string, offset: number): boolean {
  return DEFAULT_UNICODE_GRAPHEME_SEGMENTER.isBoundary(text, offset);
}

/** Move to the preceding canonical cursor boundary. */
export function previousGraphemeBoundary(text: string, offset: number): number {
  return DEFAULT_UNICODE_GRAPHEME_SEGMENTER.previousBoundary(text, offset);
}

/** Move to the following canonical cursor boundary. */
export function nextGraphemeBoundary(text: string, offset: number): number {
  return DEFAULT_UNICODE_GRAPHEME_SEGMENTER.nextBoundary(text, offset);
}

/** Resolve an arbitrary valid UTF-16 offset to a canonical boundary. */
export function resolveGraphemeBoundary(text: string, offset: number, bias: GraphemeBoundaryBias): number {
  return DEFAULT_UNICODE_GRAPHEME_SEGMENTER.resolveBoundary(text, offset, bias);
}

/** Expand a selection range so neither endpoint splits a grapheme. */
export function coveringGraphemeRange(text: string, start: number, end: number): GraphemeBoundaryRange {
  return DEFAULT_UNICODE_GRAPHEME_SEGMENTER.coveringRange(text, start, end);
}

/** Truncate by cluster count without splitting an extended grapheme. */
export function truncateGraphemeClusters(text: string, maximumClusters: number): string {
  return DEFAULT_UNICODE_GRAPHEME_SEGMENTER.truncateClusters(text, maximumClusters);
}

/** Truncate by a UTF-16 budget without splitting a surrogate pair or extended grapheme. */
export function truncateGraphemeUtf16(text: string, maximumCodeUnits: number): string {
  return DEFAULT_UNICODE_GRAPHEME_SEGMENTER.truncateUtf16(text, maximumCodeUnits);
}

/**
 * Incremental chunk adapter that retains the final open cluster and any
 * dangling UTF-16 high surrogate.
 *
 * This makes every split point, including one between UTF-16 surrogate code
 * units, produce the same clusters as a contiguous string.
 */
export class UnicodeGraphemeChunkSegmenter {
  readonly #rules: GraphemeRuleState;
  #pendingParts: string[] = [];
  #pendingLength = 0;
  #pendingStart = 0;
  #danglingHighSurrogate = "";
  #danglingHighSurrogateStart = 0;
  #receivedCodeUnits = 0;
  #nextIndex = 0;
  #finished = false;

  constructor(segmenter: UnicodeGraphemeSegmenter = DEFAULT_UNICODE_GRAPHEME_SEGMENTER) {
    const data = typeof segmenter === "object" && segmenter !== null ? SEGMENTER_DATA.get(segmenter) : undefined;
    if (data === undefined || Object.getPrototypeOf(segmenter) !== UnicodeGraphemeSegmenter.prototype) {
      throw new TypeError("Chunk segmenter requires an exact, unproxied UnicodeGraphemeSegmenter instance.");
    }
    this.#rules = new GraphemeRuleState(data);
  }

  get finished(): boolean {
    return this.#finished;
  }

  /** Add a string chunk and emit every cluster that can no longer be extended by the next chunk. */
  push(chunk: string): readonly GraphemeCluster[] {
    assertText(chunk);
    if (this.#finished) throw new Error("Cannot push to a finished grapheme chunk segmenter.");
    const emitted: GraphemeCluster[] = [];
    const chunkStart = this.#receivedCodeUnits;
    let index = 0;

    if (this.#danglingHighSurrogate.length > 0 && chunk.length > 0) {
      const firstCodeUnit = chunk.charCodeAt(0);
      if (firstCodeUnit >= 0xdc00 && firstCodeUnit <= 0xdfff) {
        this.#consumeScalar(
          this.#danglingHighSurrogate + chunk[0],
          this.#danglingHighSurrogateStart,
          emitted,
        );
        index = 1;
      } else {
        this.#consumeScalar(this.#danglingHighSurrogate, this.#danglingHighSurrogateStart, emitted);
      }
      this.#danglingHighSurrogate = "";
    }

    while (index < chunk.length) {
      const firstCodeUnit = chunk.charCodeAt(index);
      if (firstCodeUnit >= 0xd800 && firstCodeUnit <= 0xdbff) {
        if (index + 1 >= chunk.length) {
          this.#danglingHighSurrogate = chunk[index];
          this.#danglingHighSurrogateStart = chunkStart + index;
          index += 1;
          continue;
        }
        const secondCodeUnit = chunk.charCodeAt(index + 1);
        if (secondCodeUnit >= 0xdc00 && secondCodeUnit <= 0xdfff) {
          this.#consumeScalar(chunk.slice(index, index + 2), chunkStart + index, emitted);
          index += 2;
          continue;
        }
      }
      this.#consumeScalar(chunk[index], chunkStart + index, emitted);
      index += 1;
    }
    this.#receivedCodeUnits += chunk.length;
    return Object.freeze(emitted);
  }

  /** Finish the stream and emit all retained text; subsequent calls are empty and idempotent. */
  finish(): readonly GraphemeCluster[] {
    if (this.#finished) return Object.freeze([]);
    const emitted: GraphemeCluster[] = [];
    if (this.#danglingHighSurrogate.length > 0) {
      this.#consumeScalar(this.#danglingHighSurrogate, this.#danglingHighSurrogateStart, emitted);
      this.#danglingHighSurrogate = "";
    }
    this.#emitPending(emitted);
    this.#finished = true;
    return Object.freeze(emitted);
  }

  #consumeScalar(scalar: string, start: number, emitted: GraphemeCluster[]): void {
    if (this.#rules.consume(scalar.codePointAt(0)!)) this.#emitPending(emitted);
    if (this.#pendingLength === 0) this.#pendingStart = start;
    this.#pendingParts.push(scalar);
    this.#pendingLength += scalar.length;
  }

  #emitPending(emitted: GraphemeCluster[]): void {
    if (this.#pendingLength === 0) return;
    const segment = this.#pendingParts.join("");
    emitted.push(Object.freeze({
      segment,
      start: this.#pendingStart,
      end: this.#pendingStart + this.#pendingLength,
      index: this.#nextIndex++,
    }));
    this.#pendingParts = [];
    this.#pendingLength = 0;
  }
}
