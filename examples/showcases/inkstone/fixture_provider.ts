// Copyright 2023 Im-Beast. MIT license.

import {
  INKSTONE_VAULT_SCHEMA_VERSION,
  type InkstoneNote,
  type InkstoneNoteFixture,
  type InkstoneNoteId,
  type InkstoneNoteSummary,
  type InkstoneNoteWrite,
  type InkstoneSavedNoteOverride,
  InkstoneVaultConflictError,
  InkstoneVaultError,
  type InkstoneVaultOperationOptions,
  type InkstoneVaultProvider,
  type InkstoneVaultProviderInspection,
  type InkstoneVaultSnapshot,
} from "./model.ts";
import type { ShowcaseProvider } from "../../../src/showcase/mod.ts";

const MAX_NOTE_ID_LENGTH = 128;
const MAX_NOTE_PATH_LENGTH = 1_024;
const MAX_NOTE_SOURCE_LENGTH = 1_000_000;
const NOTE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

interface MutableFixtureNote {
  id: InkstoneNoteId;
  path: string;
  source: string;
  revision: number;
  updatedAt: number;
  seedSource: string;
  seedRevision: number;
  seedUpdatedAt: number;
}

/** Construction options for a deterministic fixture vault. */
export interface InMemoryInkstoneVaultProviderOptions {
  readonly now?: () => number;
  readonly snapshot?: InkstoneVaultSnapshot;
}

/**
 * Defensive fixture-only note provider with optimistic writes.
 *
 * It deliberately has no filesystem, watcher, Git, or synchronization behavior.
 */
export class InMemoryInkstoneVaultProvider implements InkstoneVaultProvider, ShowcaseProvider {
  readonly id = "inkstone-fixture-vault";
  readonly label = "Inkstone fixture vault";
  readonly capabilities = Object.freeze([
    Object.freeze({ id: "vault.list", status: "available" as const }),
    Object.freeze({ id: "vault.read", status: "available" as const }),
    Object.freeze({ id: "vault.write", status: "available" as const }),
    Object.freeze({ id: "vault.optimistic-conflict", status: "available" as const }),
    Object.freeze({ id: "vault.snapshot", status: "available" as const }),
  ]);
  readonly #notes = new Map<InkstoneNoteId, MutableFixtureNote>();
  readonly #now: () => number;
  #disposed = false;
  #reads = 0;
  #writes = 0;
  #conflicts = 0;

  constructor(
    fixtures: readonly InkstoneNoteFixture[],
    options: InMemoryInkstoneVaultProviderOptions = {},
  ) {
    if (!Array.isArray(fixtures) || fixtures.length === 0) {
      throw new InkstoneVaultError("invalid-note", "Fixture vault requires at least one note.");
    }
    this.#now = options.now ?? Date.now;

    const paths = new Set<string>();
    for (let index = 0; index < fixtures.length; index += 1) {
      const fixture = normalizeFixture(fixtures[index], index);
      if (this.#notes.has(fixture.id)) {
        throw new InkstoneVaultError("invalid-note", `Duplicate fixture note id: ${fixture.id}.`);
      }
      const pathKey = fixture.path.toLocaleLowerCase("en-US");
      if (paths.has(pathKey)) {
        throw new InkstoneVaultError("invalid-note", `Duplicate fixture note path: ${fixture.path}.`);
      }
      paths.add(pathKey);
      this.#notes.set(fixture.id, fixture);
    }
    if (options.snapshot) this.restore(options.snapshot);
  }

  async activate(
    context: Parameters<ShowcaseProvider["activate"]>[0],
  ): Promise<Readonly<{ status: "ready" }>> {
    this.#assertActive();
    assertNotAborted(context.signal);
    await asyncCheckpoint(context.signal);
    this.#assertActive();
    return Object.freeze({ status: "ready" });
  }

  async list(options: InkstoneVaultOperationOptions = {}): Promise<readonly InkstoneNoteSummary[]> {
    this.#assertActive();
    assertNotAborted(options.signal);
    await asyncCheckpoint(options.signal);
    this.#assertActive();
    const rows = [...this.#notes.values()].sort(compareNotes).map(noteSummary);
    return Object.freeze(rows);
  }

  async read(
    noteId: InkstoneNoteId,
    options: InkstoneVaultOperationOptions = {},
  ): Promise<InkstoneNote> {
    this.#assertActive();
    const id = normalizeNoteId(noteId, "noteId");
    assertNotAborted(options.signal);
    await asyncCheckpoint(options.signal);
    this.#assertActive();
    const note = this.#notes.get(id);
    if (!note) throw new InkstoneVaultError("not-found", `Unknown fixture note: ${id}.`);
    this.#reads += 1;
    return cloneNote(note);
  }

  async write(
    input: InkstoneNoteWrite,
    options: InkstoneVaultOperationOptions = {},
  ): Promise<InkstoneNote> {
    this.#assertActive();
    if (!input || typeof input !== "object") {
      throw new InkstoneVaultError("invalid-note", "A fixture write must be an object.");
    }
    const noteId = normalizeNoteId(input.noteId, "note.noteId");
    const source = normalizeSource(input.source, "note.source");
    const expectedRevision = normalizeRevision(input.expectedRevision, "note.expectedRevision");
    assertNotAborted(options.signal);
    await asyncCheckpoint(options.signal);
    this.#assertActive();

    const note = this.#notes.get(noteId);
    if (!note) throw new InkstoneVaultError("not-found", `Unknown fixture note: ${noteId}.`);
    if (note.revision !== expectedRevision) {
      this.#conflicts += 1;
      throw new InkstoneVaultConflictError(noteId, expectedRevision, note.revision);
    }
    if (note.revision >= Number.MAX_SAFE_INTEGER) {
      throw new InkstoneVaultError("invalid-note", `Note ${noteId} exhausted its revision range.`);
    }

    note.source = source;
    note.revision += 1;
    note.updatedAt = Math.max(note.updatedAt + 1, safeNow(this.#now));
    this.#writes += 1;
    return cloneNote(note);
  }

  snapshot(): InkstoneVaultSnapshot {
    this.#assertActive();
    const overrides: InkstoneSavedNoteOverride[] = [];
    for (const note of [...this.#notes.values()].sort(compareNotes)) {
      if (!isOverride(note)) continue;
      overrides.push(Object.freeze({
        noteId: note.id,
        source: note.source,
        revision: note.revision,
        updatedAt: note.updatedAt,
      }));
    }
    return Object.freeze({
      schemaVersion: INKSTONE_VAULT_SCHEMA_VERSION,
      overrides: Object.freeze(overrides),
    });
  }

  restore(snapshot: InkstoneVaultSnapshot): void {
    this.#assertActive();
    const overrides = normalizeSnapshot(snapshot, this.#notes);

    // Validation is complete before any retained note is changed.
    for (const note of this.#notes.values()) {
      note.source = note.seedSource;
      note.revision = note.seedRevision;
      note.updatedAt = note.seedUpdatedAt;
    }
    for (const override of overrides) {
      const note = this.#notes.get(override.noteId)!;
      note.source = override.source;
      note.revision = override.revision;
      note.updatedAt = override.updatedAt;
    }
  }

  inspect(): InkstoneVaultProviderInspection {
    return Object.freeze({
      provider: "fixture-memory",
      disposed: this.#disposed,
      noteCount: this.#notes.size,
      overrideCount: this.#disposed ? 0 : [...this.#notes.values()].filter(isOverride).length,
      reads: this.#reads,
      writes: this.#writes,
      conflicts: this.#conflicts,
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#notes.clear();
  }

  #assertActive(): void {
    if (this.#disposed) throw new InkstoneVaultError("disposed", "Fixture vault is disposed.");
  }
}

function normalizeFixture(fixture: InkstoneNoteFixture | undefined, index: number): MutableFixtureNote {
  if (!fixture || typeof fixture !== "object") {
    throw new InkstoneVaultError("invalid-note", `Fixture ${index} must be an object.`);
  }
  const id = normalizeNoteId(fixture.id, `fixtures[${index}].id`);
  const path = normalizePath(fixture.path, `fixtures[${index}].path`);
  const source = normalizeSource(fixture.source, `fixtures[${index}].source`);
  const revision = normalizeRevision(fixture.revision ?? 1, `fixtures[${index}].revision`);
  const updatedAt = normalizeTime(fixture.updatedAt ?? index, `fixtures[${index}].updatedAt`);
  return {
    id,
    path,
    source,
    revision,
    updatedAt,
    seedSource: source,
    seedRevision: revision,
    seedUpdatedAt: updatedAt,
  };
}

function normalizeSnapshot(
  snapshot: InkstoneVaultSnapshot,
  notes: ReadonlyMap<InkstoneNoteId, MutableFixtureNote>,
): InkstoneSavedNoteOverride[] {
  if (!snapshot || typeof snapshot !== "object" || snapshot.schemaVersion !== INKSTONE_VAULT_SCHEMA_VERSION) {
    throw new InkstoneVaultError("invalid-snapshot", "Unsupported fixture-vault snapshot schema.");
  }
  if (!Array.isArray(snapshot.overrides) || snapshot.overrides.length > notes.size) {
    throw new InkstoneVaultError("invalid-snapshot", "Fixture-vault overrides are invalid or exceed note count.");
  }
  const seen = new Set<string>();
  const output: InkstoneSavedNoteOverride[] = [];
  for (let index = 0; index < snapshot.overrides.length; index += 1) {
    const input = snapshot.overrides[index];
    if (!input || typeof input !== "object") {
      throw new InkstoneVaultError("invalid-snapshot", `Vault override ${index} must be an object.`);
    }
    const noteId = normalizeNoteId(input.noteId, `snapshot.overrides[${index}].noteId`);
    const seed = notes.get(noteId);
    if (!seed) throw new InkstoneVaultError("invalid-snapshot", `Vault override references unknown note ${noteId}.`);
    if (seen.has(noteId)) throw new InkstoneVaultError("invalid-snapshot", `Duplicate vault override ${noteId}.`);
    seen.add(noteId);
    const source = normalizeSource(input.source, `snapshot.overrides[${index}].source`);
    const revision = normalizeRevision(input.revision, `snapshot.overrides[${index}].revision`);
    const updatedAt = normalizeTime(input.updatedAt, `snapshot.overrides[${index}].updatedAt`);
    if (revision < seed.seedRevision) {
      throw new InkstoneVaultError("invalid-snapshot", `Vault override ${noteId} predates its fixture revision.`);
    }
    output.push(Object.freeze({ noteId, source, revision, updatedAt }));
  }
  return output.sort((left, right) => compareText(left.noteId, right.noteId));
}

function noteSummary(note: MutableFixtureNote): InkstoneNoteSummary {
  return Object.freeze({
    id: note.id,
    path: note.path,
    revision: note.revision,
    updatedAt: note.updatedAt,
  });
}

function cloneNote(note: MutableFixtureNote): InkstoneNote {
  return Object.freeze({ ...noteSummary(note), source: note.source });
}

function isOverride(note: MutableFixtureNote): boolean {
  return note.source !== note.seedSource || note.revision !== note.seedRevision ||
    note.updatedAt !== note.seedUpdatedAt;
}

function normalizeNoteId(value: unknown, path: string): InkstoneNoteId {
  if (
    typeof value !== "string" || value.length === 0 || value.length > MAX_NOTE_ID_LENGTH ||
    !NOTE_ID_PATTERN.test(value)
  ) {
    throw new InkstoneVaultError("invalid-note", `${path} is not a bounded stable note id.`);
  }
  return value;
}

function normalizePath(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_NOTE_PATH_LENGTH) {
    throw new InkstoneVaultError("invalid-note", `${path} is not a bounded note path.`);
  }
  if (
    value.startsWith("/") || value.endsWith("/") || value.includes("\\") || value.includes("//") ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new InkstoneVaultError("invalid-note", `${path} must be a normalized relative path.`);
  }
  return value;
}

function normalizeSource(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length > MAX_NOTE_SOURCE_LENGTH) {
    throw new InkstoneVaultError("invalid-note", `${path} exceeds the fixture source limit.`);
  }
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function normalizeRevision(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new InkstoneVaultError("invalid-note", `${path} must be a positive safe integer.`);
  }
  return value as number;
}

function normalizeTime(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new InkstoneVaultError("invalid-note", `${path} must be a non-negative finite timestamp.`);
  }
  return Math.floor(value);
}

function safeNow(now: () => number): number {
  try {
    const value = now();
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function compareNotes(left: MutableFixtureNote, right: MutableFixtureNote): number {
  return compareText(left.path, right.path) || compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason ?? new DOMException("Operation aborted.", "AbortError");
}

async function asyncCheckpoint(signal: AbortSignal | undefined): Promise<void> {
  await Promise.resolve();
  assertNotAborted(signal);
}
