// Copyright 2023 Im-Beast. MIT license.
import type { InputEvent } from "./input_reader/types.ts";
import type { RemoteTerminalInputEvent } from "./web/remote_terminal.ts";

/** Current canonical input envelope schema version. */
export const INPUT_ENVELOPE_SCHEMA_VERSION = 1 as const;

/** Origin channel that produced an input event. */
export type InputSourceKind = "terminal" | "browser" | "remote" | "test";

/** Physical or logical device responsible for an input event. */
export type InputDeviceKind =
  | "keyboard"
  | "mouse"
  | "touch"
  | "pen"
  | "clipboard"
  | "window"
  | "unknown";

/** Caller-auditable trust assigned to an input event. */
export type InputTrustLevel = "trusted" | "untrusted" | "synthetic";

/** Stable semantic event categories supported by schema version 1. */
export type InputSemanticKind =
  | "key"
  | "text"
  | "pointer"
  | "scroll"
  | "paste"
  | "focus"
  | "resize"
  | "composition"
  | "drop";

/** Normalized modifier flags. Every flag is always present in an envelope. */
export interface InputModifierFlags {
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
}

/** JSON values accepted as semantic event data. */
export type InputEnvelopeJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly InputEnvelopeJsonValue[]
  | InputEnvelopeJsonObject;

/** Plain JSON object accepted as semantic event data. */
export interface InputEnvelopeJsonObject {
  readonly [key: string]: InputEnvelopeJsonValue;
}

/** Optional raw protocol bytes, kept separate from semantic event data. */
export interface InputEnvelopeRawPayload {
  readonly encoding: "base64";
  readonly data: string;
}

/** One immutable, clone-safe, versioned input event. */
export interface InputEnvelope {
  readonly schemaVersion: typeof INPUT_ENVELOPE_SCHEMA_VERSION;
  readonly sequence: number;
  readonly timestamp: number;
  readonly source: InputSourceKind;
  readonly device: InputDeviceKind;
  readonly trust: InputTrustLevel;
  readonly modifiers: InputModifierFlags;
  readonly kind: InputSemanticKind;
  readonly data?: InputEnvelopeJsonObject;
  readonly raw?: InputEnvelopeRawPayload;
}

/** Validation limits used by parsing, normalization, serialization, and factories. */
export interface InputEnvelopeLimits {
  /** Maximum UTF-8 bytes in one canonical serialized envelope. */
  maxBytes?: number;
  /** Maximum nesting below the semantic `data` object. */
  maxDepth?: number;
  /** Maximum primitive/container nodes below semantic `data`. */
  maxNodes?: number;
  /** Maximum decoded bytes in the optional raw payload. */
  maxRawBytes?: number;
}

/** Resolved immutable validation limits exposed by inspection. */
export interface ResolvedInputEnvelopeLimits {
  readonly maxBytes: number;
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxRawBytes: number;
}

/** Explicit sequence exhaustion behavior. Duplicates or unsafe integers are never emitted. */
export type InputSequenceOverflowPolicy = "throw";

/** Construction options for one independent input envelope sequence. */
export interface InputEnvelopeFactoryOptions {
  /** Required caller-owned clock. No global clock or timer is consulted. */
  now: () => number;
  /** First sequence emitted by this factory. Defaults to 1. */
  initialSequence?: number;
  /** Schema v1 exhausts by throwing before a duplicate can be emitted. */
  sequenceOverflowPolicy?: InputSequenceOverflowPolicy;
  limits?: InputEnvelopeLimits;
}

/** Optional source-adapter policy. Raw bytes are excluded unless explicitly requested. */
export interface InputEnvelopeAdapterOptions {
  trust?: InputTrustLevel;
  device?: InputDeviceKind;
  modifiers?: Partial<InputModifierFlags>;
  includeRaw?: boolean;
}

/** Pure semantic input accepted by InputEnvelopeFactory.create. */
export interface InputSemanticEventInput {
  kind: InputSemanticKind;
  device: InputDeviceKind;
  modifiers?: Partial<InputModifierFlags>;
  data?: InputEnvelopeJsonObject;
  /** Candidate protocol bytes; ignored unless `includeRaw` is true. */
  raw?: Uint8Array;
}

/** Options for the pure legacy-source adapter functions. */
export interface InputSourceAdapterOptions {
  includeRaw?: boolean;
}

/** Defensive snapshot of one factory's sequence and timestamp state. */
export interface InputEnvelopeFactoryInspection {
  readonly schemaVersion: typeof INPUT_ENVELOPE_SCHEMA_VERSION;
  readonly emitted: number;
  readonly exhausted: boolean;
  readonly nextSequence?: number;
  readonly lastSequence?: number;
  readonly lastTimestamp?: number;
  readonly sequenceOverflowPolicy: InputSequenceOverflowPolicy;
  readonly limits: ResolvedInputEnvelopeLimits;
}

/** Stable error codes for input envelope validation and allocation. */
export type InputEnvelopeErrorCode =
  | "invalid-shape"
  | "invalid-value"
  | "unknown-field"
  | "unsupported-version"
  | "limit-exceeded"
  | "clock-failed"
  | "sequence-overflow";

/** Typed failure raised by strict input envelope operations. */
export class InputEnvelopeError extends Error {
  constructor(
    readonly code: InputEnvelopeErrorCode,
    message: string,
    readonly path: string = "$",
    override readonly cause?: unknown,
  ) {
    super(`${message} at ${path}`, { cause });
    this.name = "InputEnvelopeError";
  }
}

const SOURCE_KINDS: readonly InputSourceKind[] = ["terminal", "browser", "remote", "test"];
const DEVICE_KINDS: readonly InputDeviceKind[] = [
  "keyboard",
  "mouse",
  "touch",
  "pen",
  "clipboard",
  "window",
  "unknown",
];
const TRUST_LEVELS: readonly InputTrustLevel[] = ["trusted", "untrusted", "synthetic"];
const SEMANTIC_KINDS: readonly InputSemanticKind[] = [
  "key",
  "text",
  "pointer",
  "scroll",
  "paste",
  "focus",
  "resize",
  "composition",
  "drop",
];
const MODIFIER_FIELDS = ["alt", "ctrl", "meta", "shift"] as const;
const TOP_LEVEL_REQUIRED_FIELDS = [
  "schemaVersion",
  "sequence",
  "timestamp",
  "source",
  "device",
  "trust",
  "modifiers",
  "kind",
] as const;
const TOP_LEVEL_OPTIONAL_FIELDS = ["data", "raw"] as const;
const RAW_REQUIRED_FIELDS = ["encoding", "data"] as const;
const RESERVED_OBJECT_KEYS = ["__proto__", "constructor", "prototype"] as const;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DEFAULT_LIMITS: ResolvedInputEnvelopeLimits = Object.freeze({
  maxBytes: 64 * 1024,
  maxDepth: 16,
  maxNodes: 4_096,
  maxRawBytes: 4 * 1024,
});

interface JsonNormalizationState {
  nodes: number;
  readonly ancestors: WeakSet<object>;
  readonly limits: ResolvedInputEnvelopeLimits;
}

/**
 * Owns a deterministic input sequence. Every source method adapts into the
 * exact same versioned envelope shape and mutates no input object.
 */
export class InputEnvelopeFactory {
  readonly #now: () => number;
  readonly #limits: ResolvedInputEnvelopeLimits;
  readonly #overflowPolicy: InputSequenceOverflowPolicy;
  #nextSequence?: number;
  #lastSequence?: number;
  #lastTimestamp?: number;
  #emitted = 0;

  constructor(options: InputEnvelopeFactoryOptions) {
    if (!options || typeof options.now !== "function") {
      throw new InputEnvelopeError("invalid-value", "factory now must be a function", "$.now");
    }
    const initialSequence = options.initialSequence ?? 1;
    assertSequence(initialSequence, "$.initialSequence");
    const policy = options.sequenceOverflowPolicy ?? "throw";
    if (policy !== "throw") {
      throw new InputEnvelopeError(
        "invalid-value",
        "sequenceOverflowPolicy must be throw",
        "$.sequenceOverflowPolicy",
      );
    }
    this.#now = options.now;
    this.#nextSequence = initialSequence;
    this.#overflowPolicy = policy;
    this.#limits = resolveLimits(options.limits);
  }

  /** Emits a semantic event for an explicitly selected source. */
  create(
    source: InputSourceKind,
    event: InputSemanticEventInput,
    options: InputEnvelopeAdapterOptions = {},
  ): InputEnvelope {
    assertEnum(source, SOURCE_KINDS, "source", "$.source");
    const trust = options.trust ?? defaultTrust(source);
    const device = options.device ?? event.device;
    const modifiers = mergeModifiers(event.modifiers, options.modifiers);
    const draft: Record<string, unknown> = {
      schemaVersion: INPUT_ENVELOPE_SCHEMA_VERSION,
      sequence: this.#candidateSequence(),
      timestamp: 0,
      source,
      device,
      trust,
      modifiers,
      kind: event.kind,
    };
    if (event.data !== undefined) draft.data = event.data;
    if (options.includeRaw === true && event.raw !== undefined) {
      draft.raw = rawPayloadFromBytes(event.raw, this.#limits.maxRawBytes);
    }

    const timestamp = this.#sampleTimestamp();
    draft.timestamp = timestamp;
    const envelope = normalizeInputEnvelopeInternal(draft, this.#limits);
    this.#commit(envelope.sequence, timestamp);
    return envelope;
  }

  /** Adapts one decoded terminal event. */
  terminal(event: InputEvent, options: InputEnvelopeAdapterOptions = {}): InputEnvelope {
    return this.create(
      "terminal",
      adaptTerminalInput(event, { includeRaw: options.includeRaw }),
      options,
    );
  }

  /** Adapts one browser-platform event after its existing TUI normalization. */
  browser(event: InputEvent, options: InputEnvelopeAdapterOptions = {}): InputEnvelope {
    return this.create(
      "browser",
      adaptBrowserInput(event, { includeRaw: options.includeRaw }),
      options,
    );
  }

  /** Adapts one remote-terminal wrapper. Remote events default to untrusted. */
  remote(event: RemoteTerminalInputEvent, options: InputEnvelopeAdapterOptions = {}): InputEnvelope {
    return this.create(
      "remote",
      adaptRemoteInput(event, { includeRaw: options.includeRaw }),
      options,
    );
  }

  /** Adapts one testing event. Test events default to synthetic trust. */
  test(event: InputEvent, options: InputEnvelopeAdapterOptions = {}): InputEnvelope {
    return this.create(
      "test",
      adaptTestInput(event, { includeRaw: options.includeRaw }),
      options,
    );
  }

  /** Returns a frozen snapshot that shares no mutable state with the factory. */
  inspect(): InputEnvelopeFactoryInspection {
    const limits = Object.freeze({ ...this.#limits });
    const inspection: InputEnvelopeFactoryInspection = {
      schemaVersion: INPUT_ENVELOPE_SCHEMA_VERSION,
      emitted: this.#emitted,
      exhausted: this.#nextSequence === undefined,
      nextSequence: this.#nextSequence,
      lastSequence: this.#lastSequence,
      lastTimestamp: this.#lastTimestamp,
      sequenceOverflowPolicy: this.#overflowPolicy,
      limits,
    };
    return Object.freeze(inspection);
  }

  #candidateSequence(): number {
    if (this.#nextSequence === undefined) {
      throw new InputEnvelopeError(
        "sequence-overflow",
        "input sequence exhausted at Number.MAX_SAFE_INTEGER",
        "$.sequence",
      );
    }
    return this.#nextSequence;
  }

  #sampleTimestamp(): number {
    let sampled: number;
    try {
      sampled = this.#now();
    } catch (cause) {
      throw new InputEnvelopeError("clock-failed", "input clock threw", "$.timestamp", cause);
    }
    if (!Number.isFinite(sampled)) {
      throw new InputEnvelopeError("clock-failed", "input clock must return a finite number", "$.timestamp");
    }
    if (Object.is(sampled, -0)) sampled = 0;
    return this.#lastTimestamp === undefined ? sampled : Math.max(this.#lastTimestamp, sampled);
  }

  #commit(sequence: number, timestamp: number): void {
    this.#lastSequence = sequence;
    this.#lastTimestamp = timestamp;
    this.#nextSequence = sequence === Number.MAX_SAFE_INTEGER ? undefined : sequence + 1;
    this.#emitted += 1;
  }
}

/** Pure adapter from the existing decoded terminal event union. */
export function adaptTerminalInput(
  event: InputEvent,
  options: InputSourceAdapterOptions = {},
): InputSemanticEventInput {
  return adaptInputEvent(event, options.includeRaw === true);
}

/** Pure adapter from the event union emitted by BrowserInputSource. */
export function adaptBrowserInput(
  event: InputEvent,
  options: InputSourceAdapterOptions = {},
): InputSemanticEventInput {
  return adaptInputEvent(event, options.includeRaw === true);
}

/** Pure adapter from the existing remote-terminal input wrapper. */
export function adaptRemoteInput(
  input: RemoteTerminalInputEvent,
  options: InputSourceAdapterOptions = {},
): InputSemanticEventInput {
  if (!input || typeof input !== "object") {
    throw new InputEnvelopeError("invalid-shape", "remote input must be an object", "$.input");
  }
  const adapted = adaptInputEvent(input.event, options.includeRaw === true);
  const valid = (input.kind === "keyPress" && adapted.kind === "key") ||
    (input.kind === "mousePress" && adapted.kind === "pointer") ||
    (input.kind === "mouseScroll" && adapted.kind === "scroll") ||
    (input.kind === "paste" && adapted.kind === "paste") ||
    (input.kind === "terminalFocus" && adapted.kind === "focus");
  if (!valid) {
    throw new InputEnvelopeError(
      "invalid-value",
      `remote kind ${String(input.kind)} does not match its event`,
      "$.input.kind",
    );
  }
  return adapted;
}

/** Pure adapter from the event union used by test pilots and test factories. */
export function adaptTestInput(
  event: InputEvent,
  options: InputSourceAdapterOptions = {},
): InputSemanticEventInput {
  return adaptInputEvent(event, options.includeRaw === true);
}

/** Strictly clones and freezes an unknown envelope value. */
export function normalizeInputEnvelope(
  value: unknown,
  limits?: InputEnvelopeLimits,
): InputEnvelope {
  return normalizeInputEnvelopeInternal(value, resolveLimits(limits));
}

/** Strictly parses, validates, clones, and freezes a serialized envelope. */
export function parseInputEnvelope(
  serialized: string,
  limits?: InputEnvelopeLimits,
): InputEnvelope {
  const resolved = resolveLimits(limits);
  if (typeof serialized !== "string") {
    throw new InputEnvelopeError("invalid-shape", "serialized envelope must be a string");
  }
  enforceByteLimit(serialized, resolved.maxBytes, "$", "serialized envelope");
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (cause) {
    throw new InputEnvelopeError("invalid-shape", "serialized envelope is not valid JSON", "$", cause);
  }
  return normalizeInputEnvelopeInternal(parsed, resolved);
}

/** Serializes an envelope with stable schema and lexicographically sorted data keys. */
export function serializeInputEnvelope(
  value: unknown,
  limits?: InputEnvelopeLimits,
): string {
  const resolved = resolveLimits(limits);
  const normalized = normalizeInputEnvelopeInternal(value, resolved);
  const serialized = JSON.stringify(normalized);
  enforceByteLimit(serialized, resolved.maxBytes, "$", "serialized envelope");
  return serialized;
}

function normalizeInputEnvelopeInternal(
  value: unknown,
  limits: ResolvedInputEnvelopeLimits,
): InputEnvelope {
  const record = plainRecord(value, "$", "input envelope");
  assertExactFields(record, TOP_LEVEL_REQUIRED_FIELDS, TOP_LEVEL_OPTIONAL_FIELDS, "$", "input envelope");
  if (record.schemaVersion !== INPUT_ENVELOPE_SCHEMA_VERSION) {
    throw new InputEnvelopeError(
      "unsupported-version",
      `unsupported input envelope schema version ${String(record.schemaVersion)}`,
      "$.schemaVersion",
    );
  }
  assertSequence(record.sequence, "$.sequence");
  if (typeof record.timestamp !== "number" || !Number.isFinite(record.timestamp)) {
    throw new InputEnvelopeError("invalid-value", "timestamp must be finite", "$.timestamp");
  }
  const timestamp = Object.is(record.timestamp, -0) ? 0 : record.timestamp;
  const source = assertEnum(record.source, SOURCE_KINDS, "source", "$.source");
  const device = assertEnum(record.device, DEVICE_KINDS, "device", "$.device");
  const trust = assertEnum(record.trust, TRUST_LEVELS, "trust", "$.trust");
  const kind = assertEnum(record.kind, SEMANTIC_KINDS, "kind", "$.kind");
  const modifiers = normalizeModifiers(record.modifiers, "$.modifiers", false);
  const state: JsonNormalizationState = { nodes: 0, ancestors: new WeakSet(), limits };
  const data = record.data === undefined ? undefined : normalizeJsonObject(record.data, "$.data", 0, state);
  const raw = record.raw === undefined ? undefined : normalizeRawPayload(record.raw, limits);

  const normalized: {
    schemaVersion: typeof INPUT_ENVELOPE_SCHEMA_VERSION;
    sequence: number;
    timestamp: number;
    source: InputSourceKind;
    device: InputDeviceKind;
    trust: InputTrustLevel;
    modifiers: InputModifierFlags;
    kind: InputSemanticKind;
    data?: InputEnvelopeJsonObject;
    raw?: InputEnvelopeRawPayload;
  } = {
    schemaVersion: INPUT_ENVELOPE_SCHEMA_VERSION,
    sequence: record.sequence,
    timestamp,
    source,
    device,
    trust,
    modifiers,
    kind,
  };
  if (data !== undefined) normalized.data = data;
  if (raw !== undefined) normalized.raw = raw;
  const envelope = Object.freeze(normalized);
  const serialized = JSON.stringify(envelope);
  enforceByteLimit(serialized, limits.maxBytes, "$", "canonical envelope");
  return envelope;
}

function adaptInputEvent(event: InputEvent, includeRaw: boolean): InputSemanticEventInput {
  if (!event || typeof event !== "object") {
    throw new InputEnvelopeError("invalid-shape", "input event must be an object", "$.event");
  }
  const raw = includeRaw ? cloneInputBuffer(event) : undefined;
  if (event.key === "paste") {
    return withRaw({
      kind: "paste",
      device: "clipboard",
      modifiers: emptyModifiers(),
      data: { text: event.text },
    }, raw);
  }
  if (event.key === "focus") {
    return withRaw({
      kind: "focus",
      device: "window",
      modifiers: emptyModifiers(),
      data: { focused: event.focused },
    }, raw);
  }
  if (event.key === "apc") {
    // A terminal-to-application APC (a kitty graphics reply) is not user
    // input, and schema v1 has no semantic kind for it on purpose: consumers
    // that route it — a multiplexer's graphics relay — subscribe to the
    // reader's `terminalApc` event directly. Enveloping one is a category
    // error, refused rather than shoehorned into a keystroke.
    throw new InputEnvelopeError(
      "invalid-shape",
      "terminal APC replies are not semantic input; subscribe to terminalApc instead",
      "$.event",
    );
  }
  if (event.key !== "mouse") {
    return withRaw({
      kind: "key",
      device: "keyboard",
      modifiers: legacyModifiers(event),
      data: { key: event.key },
    }, raw);
  }

  const common = {
    x: event.x,
    y: event.y,
    movementX: event.movementX,
    movementY: event.movementY,
  };
  if ("scroll" in event) {
    return withRaw({
      kind: "scroll",
      device: "mouse",
      modifiers: legacyModifiers(event),
      data: { ...common, direction: event.scroll, drag: event.drag },
    }, raw);
  }
  const hasPressShape = "release" in event;
  return withRaw({
    kind: "pointer",
    device: "mouse",
    modifiers: legacyModifiers(event),
    data: {
      ...common,
      phase: hasPressShape ? event.release ? "up" : event.drag ? "move" : "down" : "move",
      button: hasPressShape ? event.button ?? null : null,
      drag: hasPressShape ? event.drag : false,
    },
  }, raw);
}

function withRaw(event: InputSemanticEventInput, raw: Uint8Array | undefined): InputSemanticEventInput {
  return raw === undefined ? event : { ...event, raw };
}

function cloneInputBuffer(event: InputEvent): Uint8Array {
  if (!(event.buffer instanceof Uint8Array)) {
    throw new InputEnvelopeError("invalid-value", "input event buffer must be Uint8Array", "$.event.buffer");
  }
  return new Uint8Array(event.buffer);
}

function legacyModifiers(event: { ctrl: boolean; meta: boolean; shift: boolean }): InputModifierFlags {
  return {
    alt: false,
    ctrl: event.ctrl,
    meta: event.meta,
    shift: event.shift,
  };
}

function emptyModifiers(): InputModifierFlags {
  return { alt: false, ctrl: false, meta: false, shift: false };
}

function mergeModifiers(
  event: Partial<InputModifierFlags> | undefined,
  overrides: Partial<InputModifierFlags> | undefined,
): InputModifierFlags {
  const base = normalizeModifiers(event ?? {}, "$.event.modifiers", true);
  const next = normalizeModifiers(overrides ?? {}, "$.options.modifiers", true);
  return {
    alt: overrides?.alt === undefined ? base.alt : next.alt,
    ctrl: overrides?.ctrl === undefined ? base.ctrl : next.ctrl,
    meta: overrides?.meta === undefined ? base.meta : next.meta,
    shift: overrides?.shift === undefined ? base.shift : next.shift,
  };
}

function normalizeModifiers(
  value: unknown,
  path: string,
  partial: boolean,
): InputModifierFlags {
  const record = plainRecord(value, path, "modifiers");
  assertExactFields(record, partial ? [] : MODIFIER_FIELDS, partial ? MODIFIER_FIELDS : [], path, "modifiers");
  const normalized: { alt: boolean; ctrl: boolean; meta: boolean; shift: boolean } = {
    alt: false,
    ctrl: false,
    meta: false,
    shift: false,
  };
  for (const field of MODIFIER_FIELDS) {
    const candidate = record[field];
    if (candidate === undefined && partial) continue;
    if (typeof candidate !== "boolean") {
      throw new InputEnvelopeError("invalid-value", `${field} modifier must be boolean`, `${path}.${field}`);
    }
    normalized[field] = candidate;
  }
  return Object.freeze(normalized);
}

function normalizeRawPayload(
  value: unknown,
  limits: ResolvedInputEnvelopeLimits,
): InputEnvelopeRawPayload {
  const record = plainRecord(value, "$.raw", "raw payload");
  assertExactFields(record, RAW_REQUIRED_FIELDS, [], "$.raw", "raw payload");
  if (record.encoding !== "base64") {
    throw new InputEnvelopeError("invalid-value", "raw encoding must be base64", "$.raw.encoding");
  }
  if (typeof record.data !== "string") {
    throw new InputEnvelopeError("invalid-value", "raw data must be a string", "$.raw.data");
  }
  validateCanonicalBase64(record.data, limits.maxRawBytes, "$.raw.data");
  return Object.freeze({ encoding: "base64", data: record.data });
}

function rawPayloadFromBytes(bytes: Uint8Array, maxRawBytes: number): InputEnvelopeRawPayload {
  if (!(bytes instanceof Uint8Array)) {
    throw new InputEnvelopeError("invalid-value", "raw input must be Uint8Array", "$.event.raw");
  }
  if (bytes.byteLength > maxRawBytes) {
    throw new InputEnvelopeError(
      "limit-exceeded",
      `raw payload exceeds ${maxRawBytes} bytes`,
      "$.raw.data",
    );
  }
  return Object.freeze({ encoding: "base64", data: encodeBase64(bytes) });
}

function normalizeJsonObject(
  value: unknown,
  path: string,
  depth: number,
  state: JsonNormalizationState,
): InputEnvelopeJsonObject {
  const normalized = normalizeJsonValue(value, path, depth, state);
  if (normalized === null || Array.isArray(normalized) || typeof normalized !== "object") {
    throw new InputEnvelopeError("invalid-shape", "semantic data must be a plain JSON object", path);
  }
  return normalized as InputEnvelopeJsonObject;
}

function normalizeJsonValue(
  value: unknown,
  path: string,
  depth: number,
  state: JsonNormalizationState,
): InputEnvelopeJsonValue {
  if (depth > state.limits.maxDepth) {
    throw new InputEnvelopeError(
      "limit-exceeded",
      `semantic data exceeds depth ${state.limits.maxDepth}`,
      path,
    );
  }
  state.nodes += 1;
  if (state.nodes > state.limits.maxNodes) {
    throw new InputEnvelopeError(
      "limit-exceeded",
      `semantic data exceeds ${state.limits.maxNodes} nodes`,
      path,
    );
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new InputEnvelopeError("invalid-value", "JSON numbers must be finite", path);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") {
    throw new InputEnvelopeError("invalid-value", `unsupported JSON value ${typeof value}`, path);
  }
  if (state.ancestors.has(value)) {
    throw new InputEnvelopeError("invalid-value", "cyclic JSON value", path);
  }
  state.ancestors.add(value);
  try {
    if (Array.isArray(value)) return normalizeJsonArray(value, path, depth, state);
    const record = plainRecord(value, path, "JSON object");
    const normalized: Record<string, InputEnvelopeJsonValue> = {};
    for (const key of Object.keys(record).sort()) {
      if (isReservedObjectKey(key)) {
        throw new InputEnvelopeError("invalid-value", `reserved object key ${key}`, `${path}.${key}`);
      }
      normalized[key] = normalizeJsonValue(record[key], childPath(path, key), depth + 1, state);
    }
    return Object.freeze(normalized);
  } finally {
    state.ancestors.delete(value);
  }
}

function normalizeJsonArray(
  value: unknown[],
  path: string,
  depth: number,
  state: JsonNormalizationState,
): readonly InputEnvelopeJsonValue[] {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new InputEnvelopeError("invalid-shape", "JSON arrays must use Array.prototype", path);
  }
  if (value.length > state.limits.maxNodes) {
    throw new InputEnvelopeError(
      "limit-exceeded",
      `JSON array exceeds ${state.limits.maxNodes} entries`,
      path,
    );
  }
  const ownKeys = safeOwnKeys(value, path);
  for (const key of ownKeys) {
    if (typeof key !== "string") {
      throw new InputEnvelopeError("invalid-shape", "JSON arrays cannot contain symbol properties", path);
    }
    if (key !== "length" && !isCanonicalArrayIndex(key, value.length)) {
      throw new InputEnvelopeError("invalid-shape", `unexpected array property ${key}`, childPath(path, key));
    }
  }
  const normalized: InputEnvelopeJsonValue[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = safeDescriptor(value, String(index), `${path}[${index}]`);
    if (!descriptor) {
      throw new InputEnvelopeError("invalid-shape", "sparse JSON arrays are not allowed", `${path}[${index}]`);
    }
    assertDataDescriptor(descriptor, `${path}[${index}]`);
    normalized.push(normalizeJsonValue(descriptor.value, `${path}[${index}]`, depth + 1, state));
  }
  return Object.freeze(normalized);
}

function plainRecord(value: unknown, path: string, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InputEnvelopeError("invalid-shape", `${label} must be a plain object`, path);
  }
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch (cause) {
    throw new InputEnvelopeError("invalid-shape", `${label} prototype is not inspectable`, path, cause);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new InputEnvelopeError("invalid-shape", `${label} cannot be an exotic or class instance`, path);
  }
  for (const key of safeOwnKeys(value, path)) {
    if (typeof key !== "string") {
      throw new InputEnvelopeError("invalid-shape", `${label} cannot contain symbol properties`, path);
    }
    const descriptor = safeDescriptor(value, key, childPath(path, key));
    if (!descriptor) {
      throw new InputEnvelopeError("invalid-shape", `${label} property disappeared`, childPath(path, key));
    }
    assertDataDescriptor(descriptor, childPath(path, key));
  }
  return value as Record<string, unknown>;
}

function assertDataDescriptor(
  descriptor: PropertyDescriptor,
  path: string,
): asserts descriptor is PropertyDescriptor & {
  value: unknown;
} {
  if (!("value" in descriptor) || !descriptor.enumerable) {
    throw new InputEnvelopeError(
      "invalid-shape",
      "JSON properties must be enumerable data properties without accessors",
      path,
    );
  }
}

function safeOwnKeys(value: object, path: string): (string | symbol)[] {
  try {
    return Reflect.ownKeys(value);
  } catch (cause) {
    throw new InputEnvelopeError("invalid-shape", "object keys are not inspectable", path, cause);
  }
}

function safeDescriptor(value: object, key: string, path: string): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(value, key);
  } catch (cause) {
    throw new InputEnvelopeError("invalid-shape", "property descriptor is not inspectable", path, cause);
  }
}

function assertExactFields(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: string,
  label: string,
): void {
  const allowed = [...required, ...optional];
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new InputEnvelopeError("unknown-field", `${label} contains unknown field ${key}`, childPath(path, key));
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) {
      throw new InputEnvelopeError("invalid-shape", `${label} is missing ${key}`, childPath(path, key));
    }
  }
}

function assertSequence(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new InputEnvelopeError("invalid-value", "sequence must be a non-negative safe integer", path);
  }
}

function assertEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
  path: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new InputEnvelopeError("invalid-value", `${label} is not supported`, path);
  }
  return value as T;
}

function resolveLimits(limits: InputEnvelopeLimits | undefined): ResolvedInputEnvelopeLimits {
  const resolved = {
    maxBytes: limitValue(limits?.maxBytes, DEFAULT_LIMITS.maxBytes, "$.limits.maxBytes", 1),
    maxDepth: limitValue(limits?.maxDepth, DEFAULT_LIMITS.maxDepth, "$.limits.maxDepth", 0),
    maxNodes: limitValue(limits?.maxNodes, DEFAULT_LIMITS.maxNodes, "$.limits.maxNodes", 1),
    maxRawBytes: limitValue(limits?.maxRawBytes, DEFAULT_LIMITS.maxRawBytes, "$.limits.maxRawBytes", 0),
  };
  return Object.freeze(resolved);
}

function limitValue(value: number | undefined, fallback: number, path: string, minimum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new InputEnvelopeError("invalid-value", `limit must be a safe integer >= ${minimum}`, path);
  }
  return value;
}

function defaultTrust(source: InputSourceKind): InputTrustLevel {
  if (source === "remote") return "untrusted";
  if (source === "test") return "synthetic";
  return "trusted";
}

function enforceByteLimit(value: string, limit: number, path: string, label: string): void {
  const bytes = new TextEncoder().encode(value).byteLength;
  if (bytes > limit) {
    throw new InputEnvelopeError("limit-exceeded", `${label} exceeds ${limit} UTF-8 bytes`, path);
  }
}

function validateCanonicalBase64(value: string, maxBytes: number, path: string): void {
  if (
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new InputEnvelopeError("invalid-value", "raw data must be canonical base64", path);
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const decodedLength = value.length === 0 ? 0 : value.length / 4 * 3 - padding;
  if (decodedLength > maxBytes) {
    throw new InputEnvelopeError("limit-exceeded", `raw payload exceeds ${maxBytes} bytes`, path);
  }
  const decoded = decodeBase64(value, decodedLength);
  if (encodeBase64(decoded) !== value) {
    throw new InputEnvelopeError("invalid-value", "raw data must use canonical base64 padding bits", path);
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const bits = first << 16 | (second ?? 0) << 8 | (third ?? 0);
    output += BASE64_ALPHABET[(bits >>> 18) & 63];
    output += BASE64_ALPHABET[(bits >>> 12) & 63];
    output += second === undefined ? "=" : BASE64_ALPHABET[(bits >>> 6) & 63];
    output += third === undefined ? "=" : BASE64_ALPHABET[bits & 63];
  }
  return output;
}

function decodeBase64(value: string, decodedLength: number): Uint8Array {
  const output = new Uint8Array(decodedLength);
  let offset = 0;
  for (let index = 0; index < value.length; index += 4) {
    const a = BASE64_ALPHABET.indexOf(value[index]!);
    const b = BASE64_ALPHABET.indexOf(value[index + 1]!);
    const c = value[index + 2] === "=" ? 0 : BASE64_ALPHABET.indexOf(value[index + 2]!);
    const d = value[index + 3] === "=" ? 0 : BASE64_ALPHABET.indexOf(value[index + 3]!);
    const bits = a << 18 | b << 12 | c << 6 | d;
    if (offset < decodedLength) output[offset++] = (bits >>> 16) & 0xff;
    if (offset < decodedLength) output[offset++] = (bits >>> 8) & 0xff;
    if (offset < decodedLength) output[offset++] = bits & 0xff;
  }
  return output;
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  if (!/^(?:0|[1-9][0-9]*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

function isReservedObjectKey(key: string): boolean {
  return RESERVED_OBJECT_KEYS.includes(key as typeof RESERVED_OBJECT_KEYS[number]);
}

function childPath(parent: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}
