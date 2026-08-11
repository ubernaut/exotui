// Copyright 2023 Im-Beast. MIT license.

/** Wire protocol version understood by the Exomux demo host. */
export const EXOMUX_PROTOCOL_VERSION = 1 as const;

/** WebSocket sub-path used by the local Exomux host. */
export const EXOMUX_WEBSOCKET_PATH = "/exomux/v1";

/** Hard protocol quotas. Values are deliberately small enough for a local demo daemon. */
export const EXOMUX_PROTOCOL_LIMITS = Object.freeze(
  {
    messageBytes: 128 * 1024,
    commandBytes: 1024,
    argumentCount: 128,
    argumentBytes: 4096,
    argumentsBytes: 64 * 1024,
    cwdBytes: 4096,
    environmentEntries: 128,
    environmentBytes: 64 * 1024,
    titleBytes: 256,
    inputBytes: 64 * 1024,
    outputBytes: 64 * 1024,
    sessionIdBytes: 128,
    errorBytes: 512,
    sessions: 64,
    columns: 512,
    rows: 256,
    cells: 65_536,
  } as const,
);

export type ExomuxSessionStatus = "idle" | "running" | "exited" | "failed" | "cancelled";
export type ExomuxRequestOperation =
  | "list"
  | "spawn"
  | "attach"
  | "detach"
  | "input"
  | "resize"
  | "kill"
  | "ping"
  | "shutdown"
  | "rename";

export interface ExomuxAuthRequest {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "auth";
  /** Lower-case hexadecimal representation of 32 cryptographically random bytes. */
  token: string;
}

export interface ExomuxListRequest {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "list";
  requestId: number;
}

export interface ExomuxSpawnRequest {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "spawn";
  requestId: number;
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  columns?: number;
  rows?: number;
  title?: string;
}

export interface ExomuxAttachRequest {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "attach";
  requestId: number;
  sessionId: string;
  /** Last output sequence durably observed by the client. Zero requests all retained output. */
  afterSequence?: number;
}

export interface ExomuxSessionRequest {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "detach" | "kill";
  requestId: number;
  sessionId: string;
}

export interface ExomuxInputRequest {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "input";
  requestId: number;
  sessionId: string;
  /** Canonical base64 bytes, preserving terminal control sequences exactly. */
  data: string;
}

export interface ExomuxResizeRequest {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "resize";
  requestId: number;
  sessionId: string;
  columns: number;
  rows: number;
}

export interface ExomuxPingRequest {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "ping";
  requestId: number;
}

export interface ExomuxShutdownRequest {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "shutdown";
  requestId: number;
}

/** Relocates the daemon's private descriptor file so a renamed session is discoverable. */
export interface ExomuxRenameRequest {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "rename";
  requestId: number;
  /** Absolute path the daemon should rewrite its host descriptor to. */
  descriptorPath: string;
}

export type ExomuxClientRequest =
  | ExomuxListRequest
  | ExomuxSpawnRequest
  | ExomuxAttachRequest
  | ExomuxSessionRequest
  | ExomuxInputRequest
  | ExomuxResizeRequest
  | ExomuxPingRequest
  | ExomuxShutdownRequest
  | ExomuxRenameRequest;

export type ExomuxClientMessage = ExomuxAuthRequest | ExomuxClientRequest;

export interface ExomuxSessionDescriptor {
  id: string;
  backendId: string;
  title: string;
  commandLine: string;
  status: ExomuxSessionStatus;
  running: boolean;
  columns: number;
  rows: number;
  createdAt: number;
  updatedAt: number;
  latestSequence: number;
  attachedClients: number;
}

export interface ExomuxReadyMessage {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "ready";
  hostId: string;
}

export interface ExomuxSessionsMessage {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "sessions";
  requestId: number;
  sessions: readonly ExomuxSessionDescriptor[];
}

export interface ExomuxSpawnedMessage {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "spawned";
  requestId: number;
  session: ExomuxSessionDescriptor;
}

export interface ExomuxAttachedMessage {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "attached";
  requestId: number;
  session: ExomuxSessionDescriptor;
  replayFromSequence: number;
  latestSequence: number;
  /** True when requested output predates the bounded replay ring. */
  truncated: boolean;
}

export interface ExomuxAcknowledgedMessage {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "ack";
  requestId: number;
  operation: "detach" | "input" | "resize" | "kill" | "shutdown" | "rename";
  sessionId?: string;
}

export interface ExomuxPongMessage {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "pong";
  requestId: number;
  timestamp: number;
}

export interface ExomuxOutputMessage {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "output";
  sessionId: string;
  sequence: number;
  data: string;
}

export interface ExomuxSessionStateMessage {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "session-state";
  session: ExomuxSessionDescriptor;
}

export interface ExomuxErrorMessage {
  version: typeof EXOMUX_PROTOCOL_VERSION;
  type: "error";
  requestId?: number;
  code: string;
  message: string;
}

export type ExomuxServerMessage =
  | ExomuxReadyMessage
  | ExomuxSessionsMessage
  | ExomuxSpawnedMessage
  | ExomuxAttachedMessage
  | ExomuxAcknowledgedMessage
  | ExomuxPongMessage
  | ExomuxOutputMessage
  | ExomuxSessionStateMessage
  | ExomuxErrorMessage;

export class ExomuxProtocolError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ExomuxProtocolError";
  }
}

const ENCODER = new TextEncoder();
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const STATUSES = new Set<ExomuxSessionStatus>(["idle", "running", "exited", "failed", "cancelled"]);
const ACK_OPERATIONS = new Set<ExomuxAcknowledgedMessage["operation"]>([
  "detach",
  "input",
  "resize",
  "kill",
  "shutdown",
  "rename",
]);

/** Generates a token with 256 bits of entropy. The returned string is 64 lower-case hexadecimal characters. */
export function createExomuxAuthToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let token = "";
  for (const byte of bytes) token += byte.toString(16).padStart(2, "0");
  return token;
}

export function isExomuxAuthToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** Encodes terminal bytes for the JSON protocol without interpreting them as text. */
export function encodeExomuxData(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? ENCODER.encode(data) : data;
  if (bytes.byteLength > EXOMUX_PROTOCOL_LIMITS.outputBytes) {
    throw new ExomuxProtocolError("data-too-large", "Terminal data exceeds the protocol quota.");
  }
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/** Decodes canonical base64 terminal data and enforces the supplied decoded-byte quota. */
export function decodeExomuxData(
  data: string,
  maxBytes = EXOMUX_PROTOCOL_LIMITS.inputBytes,
): Uint8Array {
  if (typeof data !== "string" || data.length > Math.ceil(maxBytes / 3) * 4 || !BASE64_PATTERN.test(data)) {
    throw new ExomuxProtocolError("invalid-data", "Terminal data must be bounded canonical base64.");
  }
  let binary: string;
  try {
    binary = atob(data);
  } catch {
    throw new ExomuxProtocolError("invalid-data", "Terminal data must be bounded canonical base64.");
  }
  if (binary.length > maxBytes || btoa(binary) !== data) {
    throw new ExomuxProtocolError("invalid-data", "Terminal data must be bounded canonical base64.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Parses and strictly normalizes a client protocol message. */
export function decodeExomuxClientMessage(message: string): ExomuxClientMessage {
  const parsed = parseBoundedMessage(message);
  return normalizeExomuxClientMessage(parsed);
}

/** Parses and strictly normalizes a server protocol message. */
export function decodeExomuxServerMessage(message: string): ExomuxServerMessage {
  const parsed = parseBoundedMessage(message);
  return normalizeExomuxServerMessage(parsed);
}

export function encodeExomuxMessage(message: ExomuxClientMessage | ExomuxServerMessage): string {
  const encoded = JSON.stringify(message);
  if (byteLength(encoded) > EXOMUX_PROTOCOL_LIMITS.messageBytes) {
    throw new ExomuxProtocolError("message-too-large", "Exomux message exceeds the protocol quota.");
  }
  return encoded;
}

export function normalizeExomuxClientMessage(value: unknown): ExomuxClientMessage {
  const root = record(value, ["version", "type"], [
    "token",
    "requestId",
    "command",
    "args",
    "cwd",
    "env",
    "columns",
    "rows",
    "title",
    "sessionId",
    "afterSequence",
    "data",
    "descriptorPath",
  ]);
  protocolVersion(root.version);
  const type = stringValue(root.type, "type", 16);
  switch (type) {
    case "auth": {
      exact(root, ["version", "type", "token"]);
      const token = stringValue(root.token, "token", 64);
      if (!isExomuxAuthToken(token)) fail("invalid-auth", "Auth token must encode exactly 32 random bytes.");
      return { version: 1, type, token };
    }
    case "list":
    case "ping":
    case "shutdown": {
      exact(root, ["version", "type", "requestId"]);
      return { version: 1, type, requestId: requestId(root.requestId) };
    }
    case "spawn": {
      exact(root, ["version", "type", "requestId", "command"], [
        "args",
        "cwd",
        "env",
        "columns",
        "rows",
        "title",
      ]);
      const command = stringValue(root.command, "command", EXOMUX_PROTOCOL_LIMITS.commandBytes, false);
      if (command.includes("\0")) fail("invalid-command", "Command contains a forbidden NUL byte.");
      const args = root.args === undefined ? undefined : stringArray(root.args);
      const cwd = root.cwd === undefined
        ? undefined
        : stringValue(root.cwd, "cwd", EXOMUX_PROTOCOL_LIMITS.cwdBytes, false);
      if (cwd?.includes("\0")) fail("invalid-cwd", "Working directory contains a forbidden NUL byte.");
      const env = root.env === undefined ? undefined : environment(root.env);
      const columns = root.columns === undefined ? undefined : positiveInteger(root.columns, "columns");
      const rows = root.rows === undefined ? undefined : positiveInteger(root.rows, "rows");
      dimensions(columns ?? 80, rows ?? 24);
      const title = root.title === undefined
        ? undefined
        : stringValue(root.title, "title", EXOMUX_PROTOCOL_LIMITS.titleBytes, false);
      return {
        version: 1,
        type,
        requestId: requestId(root.requestId),
        command,
        ...(args ? { args } : {}),
        ...(cwd !== undefined ? { cwd } : {}),
        ...(env ? { env } : {}),
        ...(columns !== undefined ? { columns } : {}),
        ...(rows !== undefined ? { rows } : {}),
        ...(title !== undefined ? { title } : {}),
      };
    }
    case "attach": {
      exact(root, ["version", "type", "requestId", "sessionId"], ["afterSequence"]);
      const afterSequence = root.afterSequence === undefined
        ? undefined
        : nonNegativeInteger(root.afterSequence, "afterSequence");
      return {
        version: 1,
        type,
        requestId: requestId(root.requestId),
        sessionId: sessionId(root.sessionId),
        ...(afterSequence !== undefined ? { afterSequence } : {}),
      };
    }
    case "detach":
    case "kill": {
      exact(root, ["version", "type", "requestId", "sessionId"]);
      return {
        version: 1,
        type,
        requestId: requestId(root.requestId),
        sessionId: sessionId(root.sessionId),
      };
    }
    case "input": {
      exact(root, ["version", "type", "requestId", "sessionId", "data"]);
      const data = stringValue(root.data, "data", Math.ceil(EXOMUX_PROTOCOL_LIMITS.inputBytes / 3) * 4);
      decodeExomuxData(data);
      return {
        version: 1,
        type,
        requestId: requestId(root.requestId),
        sessionId: sessionId(root.sessionId),
        data,
      };
    }
    case "resize": {
      exact(root, ["version", "type", "requestId", "sessionId", "columns", "rows"]);
      const columns = positiveInteger(root.columns, "columns");
      const rows = positiveInteger(root.rows, "rows");
      dimensions(columns, rows);
      return {
        version: 1,
        type,
        requestId: requestId(root.requestId),
        sessionId: sessionId(root.sessionId),
        columns,
        rows,
      };
    }
    case "rename": {
      exact(root, ["version", "type", "requestId", "descriptorPath"]);
      const descriptorPath = stringValue(root.descriptorPath, "descriptorPath", EXOMUX_PROTOCOL_LIMITS.cwdBytes, false);
      if (descriptorPath.includes("\0")) {
        fail("invalid-descriptor-path", "Descriptor path contains a forbidden NUL byte.");
      }
      return { version: 1, type, requestId: requestId(root.requestId), descriptorPath };
    }
    default:
      fail("unknown-message", "Unknown Exomux client message type.");
  }
}

export function normalizeExomuxServerMessage(value: unknown): ExomuxServerMessage {
  const root = record(value, ["version", "type"], [
    "hostId",
    "requestId",
    "sessions",
    "session",
    "replayFromSequence",
    "latestSequence",
    "truncated",
    "operation",
    "sessionId",
    "timestamp",
    "sequence",
    "data",
    "code",
    "message",
  ]);
  protocolVersion(root.version);
  const type = stringValue(root.type, "type", 32);
  switch (type) {
    case "ready":
      exact(root, ["version", "type", "hostId"]);
      return { version: 1, type, hostId: sessionId(root.hostId) };
    case "sessions": {
      exact(root, ["version", "type", "requestId", "sessions"]);
      if (!Array.isArray(root.sessions) || root.sessions.length > EXOMUX_PROTOCOL_LIMITS.sessions) {
        fail("invalid-sessions", "Session list exceeds the protocol quota.");
      }
      return {
        version: 1,
        type,
        requestId: requestId(root.requestId),
        sessions: root.sessions.map(sessionDescriptor),
      };
    }
    case "spawned":
      exact(root, ["version", "type", "requestId", "session"]);
      return {
        version: 1,
        type,
        requestId: requestId(root.requestId),
        session: sessionDescriptor(root.session),
      };
    case "attached":
      exact(root, [
        "version",
        "type",
        "requestId",
        "session",
        "replayFromSequence",
        "latestSequence",
        "truncated",
      ]);
      return {
        version: 1,
        type,
        requestId: requestId(root.requestId),
        session: sessionDescriptor(root.session),
        replayFromSequence: nonNegativeInteger(root.replayFromSequence, "replayFromSequence"),
        latestSequence: nonNegativeInteger(root.latestSequence, "latestSequence"),
        truncated: booleanValue(root.truncated, "truncated"),
      };
    case "ack": {
      exact(root, ["version", "type", "requestId", "operation"], ["sessionId"]);
      const operation = stringValue(root.operation, "operation", 16) as ExomuxAcknowledgedMessage["operation"];
      if (!ACK_OPERATIONS.has(operation)) fail("invalid-operation", "Unknown acknowledged operation.");
      const id = root.sessionId === undefined ? undefined : sessionId(root.sessionId);
      return {
        version: 1,
        type,
        requestId: requestId(root.requestId),
        operation,
        ...(id !== undefined ? { sessionId: id } : {}),
      };
    }
    case "pong":
      exact(root, ["version", "type", "requestId", "timestamp"]);
      return {
        version: 1,
        type,
        requestId: requestId(root.requestId),
        timestamp: nonNegativeFinite(root.timestamp, "timestamp"),
      };
    case "output": {
      exact(root, ["version", "type", "sessionId", "sequence", "data"]);
      const data = stringValue(root.data, "data", Math.ceil(EXOMUX_PROTOCOL_LIMITS.outputBytes / 3) * 4);
      decodeExomuxData(data, EXOMUX_PROTOCOL_LIMITS.outputBytes);
      return {
        version: 1,
        type,
        sessionId: sessionId(root.sessionId),
        sequence: positiveInteger(root.sequence, "sequence"),
        data,
      };
    }
    case "session-state":
      exact(root, ["version", "type", "session"]);
      return { version: 1, type, session: sessionDescriptor(root.session) };
    case "error": {
      exact(root, ["version", "type", "code", "message"], ["requestId"]);
      const id = root.requestId === undefined ? undefined : requestId(root.requestId);
      return {
        version: 1,
        type,
        ...(id !== undefined ? { requestId: id } : {}),
        code: stringValue(root.code, "code", 64, false),
        message: stringValue(root.message, "message", EXOMUX_PROTOCOL_LIMITS.errorBytes, false),
      };
    }
    default:
      fail("unknown-message", "Unknown Exomux server message type.");
  }
}

export function sessionDescriptor(value: unknown): ExomuxSessionDescriptor {
  const item = record(value, [
    "id",
    "backendId",
    "title",
    "commandLine",
    "status",
    "running",
    "columns",
    "rows",
    "createdAt",
    "updatedAt",
    "latestSequence",
    "attachedClients",
  ]);
  const status = stringValue(item.status, "status", 16) as ExomuxSessionStatus;
  if (!STATUSES.has(status)) fail("invalid-status", "Unknown session status.");
  const columns = positiveInteger(item.columns, "columns");
  const rows = positiveInteger(item.rows, "rows");
  dimensions(columns, rows);
  return {
    id: sessionId(item.id),
    backendId: stringValue(item.backendId, "backendId", 128, false),
    title: stringValue(item.title, "title", EXOMUX_PROTOCOL_LIMITS.titleBytes),
    commandLine: stringValue(item.commandLine, "commandLine", EXOMUX_PROTOCOL_LIMITS.argumentsBytes),
    status,
    running: booleanValue(item.running, "running"),
    columns,
    rows,
    createdAt: nonNegativeFinite(item.createdAt, "createdAt"),
    updatedAt: nonNegativeFinite(item.updatedAt, "updatedAt"),
    latestSequence: nonNegativeInteger(item.latestSequence, "latestSequence"),
    attachedClients: nonNegativeInteger(item.attachedClients, "attachedClients"),
  };
}

function parseBoundedMessage(message: string): unknown {
  if (typeof message !== "string" || message.length > EXOMUX_PROTOCOL_LIMITS.messageBytes) {
    fail("message-too-large", "Exomux messages must be bounded JSON text.");
  }
  if (byteLength(message) > EXOMUX_PROTOCOL_LIMITS.messageBytes) {
    fail("message-too-large", "Exomux messages must be bounded JSON text.");
  }
  try {
    return JSON.parse(message);
  } catch {
    fail("invalid-json", "Exomux message is not valid JSON.");
  }
}

type SafeRecord = Record<string, unknown>;

function record(value: unknown, required: readonly string[], optional: readonly string[] = []): SafeRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid-object", "Expected a plain object.");
  }
  let prototype: object | null;
  let descriptors: Record<string, PropertyDescriptor>;
  let symbols: symbol[];
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    fail("invalid-object", "Expected an inspectable plain object.");
  }
  if ((prototype !== Object.prototype && prototype !== null) || symbols.length !== 0) {
    fail("invalid-object", "Expected a plain string-keyed object.");
  }
  const allowed = new Set([...required, ...optional]);
  const result: SafeRecord = Object.create(null);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!allowed.has(key) || key === "__proto__" || key === "prototype" || key === "constructor") {
      fail("unexpected-field", "Exomux message contains an unexpected field.");
    }
    if (!("value" in descriptor) || !descriptor.enumerable) {
      fail("invalid-field", "Exomux fields must be enumerable values.");
    }
    result[key] = descriptor.value;
  }
  for (const key of required) {
    if (!Object.hasOwn(result, key)) fail("missing-field", "Exomux message is missing a required field.");
  }
  return result;
}

function exact(value: SafeRecord, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("unexpected-field", "Exomux message contains an unexpected field.");
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail("missing-field", "Exomux message is missing a required field.");
  }
}

function protocolVersion(value: unknown): asserts value is typeof EXOMUX_PROTOCOL_VERSION {
  if (value !== EXOMUX_PROTOCOL_VERSION) fail("unsupported-version", "Unsupported Exomux protocol version.");
}

function requestId(value: unknown): number {
  const result = positiveInteger(value, "requestId");
  if (!Number.isSafeInteger(result)) fail("invalid-request-id", "Request id must be a positive safe integer.");
  return result;
}

function sessionId(value: unknown): string {
  const result = stringValue(value, "sessionId", EXOMUX_PROTOCOL_LIMITS.sessionIdBytes, false);
  if (!SESSION_ID_PATTERN.test(result)) fail("invalid-session-id", "Session id contains unsupported characters.");
  return result;
}

function dimensions(columns: number, rows: number): void {
  if (
    columns > EXOMUX_PROTOCOL_LIMITS.columns || rows > EXOMUX_PROTOCOL_LIMITS.rows ||
    columns * rows > EXOMUX_PROTOCOL_LIMITS.cells
  ) {
    fail("invalid-dimensions", "Terminal dimensions exceed the protocol quota.");
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > EXOMUX_PROTOCOL_LIMITS.argumentCount) {
    fail("invalid-args", "Command arguments exceed the protocol quota.");
  }
  const result: string[] = [];
  let total = 0;
  for (const item of value) {
    const argument = stringValue(item, "argument", EXOMUX_PROTOCOL_LIMITS.argumentBytes);
    if (argument.includes("\0")) fail("invalid-args", "Command argument contains a forbidden NUL byte.");
    total += byteLength(argument);
    if (total > EXOMUX_PROTOCOL_LIMITS.argumentsBytes) fail("invalid-args", "Command arguments exceed the quota.");
    result.push(argument);
  }
  return result;
}

function environment(value: unknown): Record<string, string> {
  if (!isRecordCandidate(value)) fail("invalid-env", "Environment must be a plain object.");
  let keys: string[];
  try {
    keys = Object.keys(value);
  } catch {
    fail("invalid-env", "Environment must be an inspectable plain object.");
  }
  const source = record(value, [], keys);
  const entries = Object.entries(source);
  if (entries.length > EXOMUX_PROTOCOL_LIMITS.environmentEntries) {
    fail("invalid-env", "Environment entries exceed the protocol quota.");
  }
  const result: Record<string, string> = {};
  let total = 0;
  for (const [key, raw] of entries) {
    if (!key || key.includes("=") || key.includes("\0")) fail("invalid-env", "Environment key is invalid.");
    const item = stringValue(raw, "environment value", EXOMUX_PROTOCOL_LIMITS.environmentBytes);
    if (item.includes("\0")) fail("invalid-env", "Environment value contains a forbidden NUL byte.");
    total += byteLength(key) + byteLength(item);
    if (total > EXOMUX_PROTOCOL_LIMITS.environmentBytes) fail("invalid-env", "Environment exceeds the quota.");
    result[key] = item;
  }
  return result;
}

function isRecordCandidate(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, name: string, maxBytes: number, allowEmpty = true): string {
  if (
    typeof value !== "string" || (!allowEmpty && value.length === 0) || value.length > maxBytes ||
    byteLength(value) > maxBytes
  ) {
    fail("invalid-string", `${name} must be a bounded string.`);
  }
  return value;
}

function booleanValue(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") fail("invalid-boolean", `${name} must be boolean.`);
  return value;
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    fail("invalid-integer", `${name} must be a positive safe integer.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail("invalid-integer", `${name} must be a non-negative safe integer.`);
  }
  return value;
}

function nonNegativeFinite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("invalid-number", `${name} must be a non-negative finite number.`);
  }
  return value;
}

function byteLength(value: string): number {
  return ENCODER.encode(value).byteLength;
}

function fail(code: string, message: string): never {
  throw new ExomuxProtocolError(code, message);
}
