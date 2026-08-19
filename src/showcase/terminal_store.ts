// Copyright 2023 Im-Beast. MIT license.

import { type AsyncStore, MemoryStore } from "../runtime/storage.ts";
import type { DiagnosticsCollector } from "../runtime/diagnostics.ts";
import {
  createRuntimePermissionManifest,
  type RuntimePermissionManifest,
  type RuntimePermissionRequirement,
} from "../permissions.ts";

/** Stable adapter id used by terminal showcase persistence permission reports. */
export const SHOWCASE_TERMINAL_STORE_ADAPTER_ID = "showcase.terminal-json-store" as const;

/** Default upper bound applied before parsing or retaining terminal store JSON. */
export const SHOWCASE_TERMINAL_STORE_MAX_BYTES = 8_000_000;

/** Permission states understood by the injected terminal host boundary. */
export type ShowcaseTerminalPermissionState = "granted" | "denied" | "prompt";

/** One exact host permission query. No query grants or requests authority. */
export interface ShowcaseTerminalPermissionQuery {
  readonly name: "read" | "write";
  readonly path: string;
}

/** Injectable permission-query boundary used by deterministic tests and Deno hosts. */
export interface ShowcaseTerminalPermissionGateway {
  query(query: ShowcaseTerminalPermissionQuery): Promise<ShowcaseTerminalPermissionState>;
}

/**
 * Injectable, same-directory file boundary. `writeTextFile` must close the
 * written file before resolving; the default Deno adapter exclusively creates
 * and syncs the temporary file so a raced pathname is rejected.
 */
export interface ShowcaseTerminalFileAdapter {
  /** Creates this exact directory and any missing ancestors. */
  createDirectory?(path: string): Promise<void>;
  readTextFile(path: string, maxBytes: number): Promise<string>;
  writeTextFile(path: string, data: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  remove(path: string): Promise<void>;
  isNotFound(error: unknown): boolean;
}

/** Content-free mode exposed to status bars and tests. */
export type ShowcaseTerminalStoreMode =
  | "memory-disabled"
  | "memory-permission-fallback"
  | "memory-unavailable-fallback"
  | "durable";

/** Path- and content-free terminal persistence inspection. */
export interface ShowcaseTerminalStoreInspection {
  readonly mode: ShowcaseTerminalStoreMode;
  readonly durable: boolean;
  readonly explicitlyEnabled: boolean;
  readonly requiredPermissionCount: number;
  readonly ungrantedPermissionCount: number;
  readonly reads: number;
  readonly writes: number;
  readonly recoveries: number;
  readonly rejectedFiles: number;
}

/** Store selection returned to a terminal showcase composition root. */
export interface ShowcaseTerminalStoreSelection<T = unknown> {
  readonly store: AsyncStore<T>;
  readonly permissionManifest: RuntimePermissionManifest;
  inspect(): ShowcaseTerminalStoreInspection;
}

/** Options for explicitly selecting durable terminal showcase persistence. */
export interface CreateShowcaseTerminalStoreOptions {
  readonly enabled?: boolean;
  readonly path?: string;
  readonly diagnostics?: DiagnosticsCollector;
  readonly permissions?: ShowcaseTerminalPermissionGateway;
  readonly files?: ShowcaseTerminalFileAdapter;
  readonly maxBytes?: number;
}

/** Options for directly constructing the serialized durable adapter. */
export interface ShowcaseTerminalJsonStoreOptions {
  readonly path: string;
  readonly files: ShowcaseTerminalFileAdapter;
  readonly diagnostics?: DiagnosticsCollector;
  readonly maxBytes?: number;
}

interface StorePaths {
  readonly directory: string;
  readonly primary: string;
  readonly temporary: string;
  readonly backup: string;
}

interface MutableStoreCounters {
  reads: number;
  writes: number;
  recoveries: number;
  rejectedFiles: number;
}

type JsonPrimitive = null | boolean | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = Record<string, JsonValue>;

type FileCandidate =
  | Readonly<{ status: "valid"; value: JsonRecord }>
  | Readonly<{ status: "missing" | "invalid" | "unavailable" }>;

/** Content-safe terminal-store failure. Paths, values, and host errors are omitted. */
export class ShowcaseTerminalStoreError extends Error {
  constructor(readonly code: "invalid-input" | "read-failed" | "write-failed") {
    super(`Showcase terminal store ${code}.`);
    this.name = "ShowcaseTerminalStoreError";
  }
}

/**
 * Builds an immutable permission declaration for only the exact parent and
 * three files touched by the primary/temp/backup protocol.
 */
export function createShowcaseTerminalStorePermissionManifest(path: string): RuntimePermissionManifest {
  const paths = resolveStorePaths(path);
  const required: RuntimePermissionRequirement[] = [];
  for (const target of [paths.primary, paths.temporary, paths.backup]) {
    required.push({ kind: "read", operation: "content", target });
  }
  required.push(
    { kind: "write", operation: "create", target: paths.directory },
    { kind: "write", operation: "create", target: paths.temporary },
    { kind: "write", operation: "modify", target: paths.temporary },
    { kind: "write", operation: "remove", target: paths.primary },
    { kind: "write", operation: "remove", target: paths.temporary },
    { kind: "write", operation: "remove", target: paths.backup },
    { kind: "write", operation: "rename", target: paths.primary },
    { kind: "write", operation: "rename", target: paths.temporary },
    { kind: "write", operation: "rename", target: paths.backup },
  );
  return createRuntimePermissionManifest({ adapterId: SHOWCASE_TERMINAL_STORE_ADAPTER_ID, required });
}

/**
 * Crash-recoverable plain-object JSON store using serialized writes and a
 * same-directory primary/temp/backup replacement protocol. It does not claim
 * power-loss atomicity on hosts that cannot fsync directory entries.
 */
export class ShowcaseTerminalJsonStore<T = unknown> implements AsyncStore<T> {
  readonly #paths: StorePaths;
  readonly #files: ShowcaseTerminalFileAdapter;
  readonly #diagnostics?: DiagnosticsCollector;
  readonly #maxBytes: number;
  readonly #counters: MutableStoreCounters = { reads: 0, writes: 0, recoveries: 0, rejectedFiles: 0 };
  #tail: Promise<void> = Promise.resolve();

  constructor(options: ShowcaseTerminalJsonStoreOptions) {
    this.#paths = resolveStorePaths(options.path);
    this.#files = options.files;
    this.#diagnostics = options.diagnostics;
    this.#maxBytes = normalizeMaxBytes(options.maxBytes);
  }

  get(key: string): Promise<T | undefined> {
    return this.#serialized(async () => {
      const record = await this.#readRecord();
      const value = record[normalizeStoreKey(key)];
      return value === undefined ? undefined : normalizeJsonValue(value, "$value") as T;
    });
  }

  set(key: string, value: T): Promise<void> {
    return this.#serialized(async () => {
      const record = await this.#readRecord();
      record[normalizeStoreKey(key)] = normalizeJsonValue(value, "$value");
      await this.#commit(record);
    });
  }

  delete(key: string): Promise<void> {
    return this.#serialized(async () => {
      const record = await this.#readRecord();
      const normalizedKey = normalizeStoreKey(key);
      if (!Object.hasOwn(record, normalizedKey)) return;
      delete record[normalizedKey];
      await this.#commit(record);
    });
  }

  /** Returns a detached path- and content-free operational snapshot. */
  inspect(): ShowcaseTerminalStoreInspection {
    return freezeInspection({
      mode: "durable",
      durable: true,
      explicitlyEnabled: true,
      requiredPermissionCount: terminalPermissionQueries(this.#paths).length,
      ungrantedPermissionCount: 0,
      ...this.#counters,
    });
  }

  #serialized<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    const result = this.#tail.then(operation, operation);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async #readRecord(): Promise<JsonRecord> {
    const primary = await this.#readCandidate(this.#paths.primary, "primary");
    if (primary.status === "valid") return primary.value;

    const backup = await this.#readCandidate(this.#paths.backup, "backup");
    if (backup.status === "valid") {
      this.#counters.recoveries += 1;
      this.#report("terminal-store-backup-recovered", "warning", "A backup terminal session was recovered.");
      return backup.value;
    }
    if (primary.status === "unavailable" || backup.status === "unavailable") {
      throw new ShowcaseTerminalStoreError("read-failed");
    }
    return Object.create(null) as JsonRecord;
  }

  async #readCandidate(path: string, role: "primary" | "backup"): Promise<FileCandidate> {
    this.#counters.reads += 1;
    let text: string;
    try {
      text = await this.#files.readTextFile(path, this.#maxBytes);
    } catch (error) {
      if (this.#files.isNotFound(error)) return Object.freeze({ status: "missing" });
      this.#report(
        `terminal-store-${role}-read-failed`,
        "warning",
        `The ${role} terminal session could not be read.`,
      );
      return Object.freeze({ status: "unavailable" });
    }
    try {
      if (encodedBytes(text) > this.#maxBytes) throw new ShowcaseTerminalStoreError("invalid-input");
      const parsed: unknown = JSON.parse(text);
      return Object.freeze({ status: "valid", value: normalizeJsonRecord(parsed) });
    } catch {
      this.#counters.rejectedFiles += 1;
      this.#report(
        `terminal-store-${role}-rejected`,
        "warning",
        `The ${role} terminal session was rejected.`,
      );
      return Object.freeze({ status: "invalid" });
    }
  }

  async #commit(record: JsonRecord): Promise<void> {
    const normalized = normalizeJsonRecord(record);
    const text = `${JSON.stringify(normalized, null, 2)}\n`;
    if (encodedBytes(text) > this.#maxBytes) throw new ShowcaseTerminalStoreError("invalid-input");

    await this.#cleanupTemporary();
    try {
      await this.#files.writeTextFile(this.#paths.temporary, text);
      const primary = await this.#readCandidate(this.#paths.primary, "primary");
      if (primary.status === "unavailable") throw new ShowcaseTerminalStoreError("write-failed");
      if (primary.status === "valid") {
        // Keep the valid primary authoritative until the old backup no longer
        // occupies the rotation destination. This supports rename adapters
        // that reject an existing destination.
        await this.#removeForReplacement(this.#paths.backup, "backup");
        await this.#files.rename(this.#paths.primary, this.#paths.backup);
      } else if (primary.status === "invalid") {
        // A corrupt primary is never rotated over a recoverable backup. Remove
        // it only after the replacement is fully written and synced.
        await this.#removeForReplacement(this.#paths.primary, "primary");
      }
      await this.#files.rename(this.#paths.temporary, this.#paths.primary);
      this.#counters.writes += 1;
    } catch {
      await this.#cleanupTemporary();
      this.#report("terminal-store-write-failed", "warning", "The terminal session could not be persisted.");
      throw new ShowcaseTerminalStoreError("write-failed");
    }
  }

  async #cleanupTemporary(): Promise<void> {
    try {
      await this.#files.remove(this.#paths.temporary);
    } catch (error) {
      if (!this.#files.isNotFound(error)) {
        this.#report("terminal-store-temp-cleanup-failed", "info", "Temporary terminal state cleanup failed.");
      }
    }
  }

  async #removeForReplacement(path: string, role: "primary" | "backup"): Promise<void> {
    try {
      await this.#files.remove(path);
    } catch (error) {
      if (this.#files.isNotFound(error)) return;
      this.#report(
        `terminal-store-${role}-remove-failed`,
        "warning",
        `The ${role} terminal state could not be replaced.`,
      );
      throw new ShowcaseTerminalStoreError("write-failed");
    }
  }

  #report(code: string, severity: "info" | "warning", message: string): void {
    this.#diagnostics?.report({ source: "showcase-terminal-store", code, severity, message });
  }
}

/**
 * Selects durable storage only after explicit opt-in and successful exact-path
 * permission queries. Every other path returns a fresh deterministic MemoryStore.
 */
export async function createShowcaseTerminalStore<T = unknown>(
  options: CreateShowcaseTerminalStoreOptions = {},
): Promise<ShowcaseTerminalStoreSelection<T>> {
  const explicitlyEnabled = options.enabled === true;
  let paths: StorePaths | undefined;
  let permissionManifest = emptyPermissionManifest();
  try {
    if (options.path !== undefined) {
      paths = resolveStorePaths(options.path);
      permissionManifest = createShowcaseTerminalStorePermissionManifest(options.path);
    }
  } catch {
    // Invalid paths are treated as unavailable optional persistence below.
  }

  if (!explicitlyEnabled) {
    reportSelection(
      options.diagnostics,
      "terminal-store-disabled",
      "info",
      "Terminal session persistence is disabled.",
    );
    return memorySelection("memory-disabled", false, permissionManifest, 0, 0);
  }
  if (!paths) {
    reportSelection(
      options.diagnostics,
      "terminal-store-unavailable",
      "warning",
      "Terminal session persistence is unavailable; using memory.",
    );
    return memorySelection("memory-unavailable-fallback", true, permissionManifest, 0, 0);
  }

  const permissions = options.permissions ?? resolveDenoPermissionGateway();
  if (!permissions) {
    reportSelection(
      options.diagnostics,
      "terminal-store-permissions-unavailable",
      "warning",
      "Terminal session permissions are unavailable; using memory.",
    );
    return memorySelection(
      "memory-unavailable-fallback",
      true,
      permissionManifest,
      terminalPermissionQueries(paths).length,
      terminalPermissionQueries(paths).length,
    );
  }

  const queries = terminalPermissionQueries(paths);
  let ungranted = 0;
  try {
    for (const query of queries) {
      if (await permissions.query(query) !== "granted") ungranted += 1;
    }
  } catch {
    ungranted = queries.length;
  }
  if (ungranted > 0) {
    reportSelection(
      options.diagnostics,
      "terminal-store-permission-fallback",
      "warning",
      "Terminal session permissions were not granted; using memory.",
    );
    return memorySelection("memory-permission-fallback", true, permissionManifest, queries.length, ungranted);
  }

  const files = options.files ?? resolveDenoFileAdapter();
  if (!files?.createDirectory) {
    reportSelection(
      options.diagnostics,
      "terminal-store-files-unavailable",
      "warning",
      "Terminal file services are unavailable; using memory.",
    );
    return memorySelection("memory-unavailable-fallback", true, permissionManifest, queries.length, 0);
  }
  try {
    await files.createDirectory(paths.directory);
  } catch {
    reportSelection(
      options.diagnostics,
      "terminal-store-directory-unavailable",
      "warning",
      "The terminal session directory is unavailable; using memory.",
    );
    return memorySelection("memory-unavailable-fallback", true, permissionManifest, queries.length, 0);
  }
  const store = new ShowcaseTerminalJsonStore<T>({
    path: paths.primary,
    files,
    diagnostics: options.diagnostics,
    maxBytes: options.maxBytes,
  });
  return Object.freeze({ store, permissionManifest, inspect: () => store.inspect() });
}

function memorySelection<T>(
  mode: Exclude<ShowcaseTerminalStoreMode, "durable">,
  explicitlyEnabled: boolean,
  permissionManifest: RuntimePermissionManifest,
  requiredPermissionCount: number,
  ungrantedPermissionCount: number,
): ShowcaseTerminalStoreSelection<T> {
  const store = new MemoryStore<T>();
  const inspection = freezeInspection({
    mode,
    durable: false,
    explicitlyEnabled,
    requiredPermissionCount,
    ungrantedPermissionCount,
    reads: 0,
    writes: 0,
    recoveries: 0,
    rejectedFiles: 0,
  });
  return Object.freeze({ store, permissionManifest, inspect: () => inspection });
}

function emptyPermissionManifest(): RuntimePermissionManifest {
  return createRuntimePermissionManifest({ adapterId: SHOWCASE_TERMINAL_STORE_ADAPTER_ID });
}

function resolveStorePaths(path: string): StorePaths {
  if (
    typeof path !== "string" || path.length === 0 || path.length > 4_000 || path.includes("\0") ||
    path.trim() !== path || path.endsWith("/") || path.endsWith("\\")
  ) {
    throw new ShowcaseTerminalStoreError("invalid-input");
  }
  return Object.freeze({
    directory: parentDirectory(path),
    primary: path,
    temporary: `${path}.tmp`,
    backup: `${path}.bak`,
  });
}

function terminalPermissionQueries(paths: StorePaths): readonly ShowcaseTerminalPermissionQuery[] {
  const output: ShowcaseTerminalPermissionQuery[] = [];
  // Deno grants filesystem operations at read/write path granularity. One
  // exact write query per file covers its declared create/modify/remove/rename
  // operations without broadening authority or issuing duplicate prompts.
  for (const path of [paths.primary, paths.temporary, paths.backup]) {
    output.push(Object.freeze({ name: "read", path }), Object.freeze({ name: "write", path }));
  }
  output.push(Object.freeze({ name: "write", path: paths.directory }));
  return Object.freeze(output);
}

function parentDirectory(path: string): string {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (separator < 0) return ".";
  if (separator === 0) return path.slice(0, 1);
  if (separator === 2 && /^[A-Za-z]:[\\/]/.test(path)) return path.slice(0, 3);
  return path.slice(0, separator);
}

function normalizeMaxBytes(value: number | undefined): number {
  const resolved = value ?? SHOWCASE_TERMINAL_STORE_MAX_BYTES;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 64_000_000) {
    throw new ShowcaseTerminalStoreError("invalid-input");
  }
  return resolved;
}

function normalizeStoreKey(key: string): string {
  if (
    typeof key !== "string" || key.length === 0 || key.length > 512 || key === "__proto__" || key === "prototype" ||
    key === "constructor"
  ) {
    throw new ShowcaseTerminalStoreError("invalid-input");
  }
  return key;
}

function normalizeJsonRecord(value: unknown): JsonRecord {
  const normalized = normalizeJsonValue(value, "$", { nodes: 0 }, 0);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    throw new ShowcaseTerminalStoreError("invalid-input");
  }
  return normalized as JsonRecord;
}

function normalizeJsonValue(
  value: unknown,
  path: string,
  budget: { nodes: number } = { nodes: 0 },
  depth = 0,
): JsonValue {
  budget.nodes += 1;
  if (budget.nodes > 100_000 || depth > 64) throw new ShowcaseTerminalStoreError("invalid-input");
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ShowcaseTerminalStoreError("invalid-input");
    return value;
  }
  if (!value || typeof value !== "object") throw new ShowcaseTerminalStoreError("invalid-input");

  if (Array.isArray(value)) {
    if (
      value.length > 100_000 || Object.getOwnPropertySymbols(value).length > 0 ||
      Object.getOwnPropertyNames(value).length !== value.length + 1
    ) {
      throw new ShowcaseTerminalStoreError("invalid-input");
    }
    const output: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) throw new ShowcaseTerminalStoreError("invalid-input");
      output.push(normalizeJsonValue(descriptor.value, `${path}[${index}]`, budget, depth + 1));
    }
    return output;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null || Object.getOwnPropertySymbols(value).length > 0) {
    throw new ShowcaseTerminalStoreError("invalid-input");
  }
  const output: JsonRecord = Object.create(null) as JsonRecord;
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      throw new ShowcaseTerminalStoreError("invalid-input");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new ShowcaseTerminalStoreError("invalid-input");
    output[key] = normalizeJsonValue(descriptor.value, `${path}.${key}`, budget, depth + 1);
  }
  return output;
}

function freezeInspection(value: ShowcaseTerminalStoreInspection): ShowcaseTerminalStoreInspection {
  return Object.freeze({ ...value });
}

function reportSelection(
  diagnostics: DiagnosticsCollector | undefined,
  code: string,
  severity: "info" | "warning",
  message: string,
): void {
  diagnostics?.report({ source: "showcase-terminal-store", code, severity, message });
}

function encodedBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function resolveDenoPermissionGateway(): ShowcaseTerminalPermissionGateway | undefined {
  const deno = (globalThis as typeof globalThis & { Deno?: typeof Deno }).Deno;
  if (!deno?.permissions?.query) return undefined;
  return {
    async query(query) {
      const status = await deno.permissions.query({ name: query.name, path: query.path });
      return status.state;
    },
  };
}

function resolveDenoFileAdapter(): ShowcaseTerminalFileAdapter | undefined {
  const deno = (globalThis as typeof globalThis & { Deno?: typeof Deno }).Deno;
  if (!deno?.mkdir || !deno.open || !deno.rename || !deno.remove) return undefined;
  return {
    createDirectory: (path) => deno.mkdir(path, { recursive: true }),
    readTextFile: (path, maxBytes) => readDenoTextFile(deno, path, maxBytes),
    writeTextFile: (path, data) => writeDenoTextFile(deno, path, data),
    rename: (oldPath, newPath) => deno.rename(oldPath, newPath),
    remove: (path) => deno.remove(path),
    isNotFound: (error) => error instanceof deno.errors.NotFound,
  };
}

async function readDenoTextFile(deno: typeof Deno, path: string, maxBytes: number): Promise<string> {
  const file = await deno.open(path, { read: true });
  try {
    const output = new Uint8Array(maxBytes + 1);
    let offset = 0;
    while (offset < output.length) {
      const read = await file.read(output.subarray(offset));
      if (read === null) break;
      offset += read;
    }
    if (offset > maxBytes) throw new ShowcaseTerminalStoreError("invalid-input");
    return new TextDecoder("utf-8", { fatal: true }).decode(output.subarray(0, offset));
  } finally {
    file.close();
  }
}

async function writeDenoTextFile(deno: typeof Deno, path: string, data: string): Promise<void> {
  const bytes = new TextEncoder().encode(data);
  const file = await deno.open(path, { write: true, createNew: true, mode: 0o600 });
  try {
    let offset = 0;
    while (offset < bytes.length) offset += await file.write(bytes.subarray(offset));
    await file.sync();
  } finally {
    file.close();
  }
}
