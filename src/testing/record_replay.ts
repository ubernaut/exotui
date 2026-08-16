// Copyright 2023 Im-Beast. MIT license.

// QAL-006: nondeterminism is a JOURNAL. In record mode the runtime pulls
// time, random values, input events, resource completions, and resizes
// from live sources and journals every value in order; in replay mode it
// serves the journal verbatim and REFUSES divergence — a request of the
// wrong kind, or past the journal's end, throws with the position named.
// State checkpoints hash their JSON serialization: record stores the
// hash, replay compares it, and a mismatch names the checkpoint — so a
// captured failing run reproduces byte-identical state checkpoints
// offline or fails loudly, never approximately.

/** Journal entry kinds. */
export type JournalKind = "time" | "random" | "input" | "resource" | "resize";

/** One journaled value. */
export interface JournalEntry {
  readonly kind: JournalKind;
  readonly value: unknown;
}

/** One checkpoint record. */
export interface CheckpointRecord {
  readonly label: string;
  readonly hash: number;
}

/** The serializable run journal. */
export interface RunJournal {
  readonly entries: readonly JournalEntry[];
  readonly checkpoints: readonly CheckpointRecord[];
}

/** Live sources used in record mode. */
export interface RuntimeSources {
  now(): number;
  random(): number;
  nextInput(): string | undefined;
  nextResource?(): unknown;
  nextResize?(): { columns: number; rows: number } | undefined;
}

/** Thrown when replay diverges from the journal. */
export class ReplayDivergenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayDivergenceError";
  }
}

function hashState(state: unknown): number {
  const text = JSON.stringify(state) ?? "undefined";
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The deterministic runtime. */
export class DeterministicRuntime {
  readonly #mode: "record" | "replay";
  readonly #sources?: RuntimeSources;
  readonly #entries: JournalEntry[];
  readonly #checkpoints: CheckpointRecord[];
  #cursor = 0;
  #checkpointCursor = 0;

  private constructor(
    mode: "record" | "replay",
    sources?: RuntimeSources,
    journal?: RunJournal,
  ) {
    this.#mode = mode;
    this.#sources = sources;
    this.#entries = journal ? [...journal.entries] : [];
    this.#checkpoints = journal ? [...journal.checkpoints] : [];
  }

  static record(sources: RuntimeSources): DeterministicRuntime {
    return new DeterministicRuntime("record", sources);
  }

  static replay(journal: RunJournal): DeterministicRuntime {
    return new DeterministicRuntime("replay", undefined, journal);
  }

  now(): number {
    return this.#pull("time", () => this.#sources!.now()) as number;
  }

  random(): number {
    return this.#pull("random", () => this.#sources!.random()) as number;
  }

  nextInput(): string | undefined {
    return this.#pull("input", () => this.#sources!.nextInput()) as string | undefined;
  }

  nextResource(): unknown {
    return this.#pull("resource", () => this.#sources?.nextResource?.());
  }

  nextResize(): { columns: number; rows: number } | undefined {
    return this.#pull("resize", () => this.#sources?.nextResize?.()) as
      | { columns: number; rows: number }
      | undefined;
  }

  /** Hashes state: record stores, replay compares byte-identically. */
  checkpoint(label: string, state: unknown): void {
    const hash = hashState(state);
    if (this.#mode === "record") {
      this.#checkpoints.push({ label, hash });
      return;
    }
    const expected = this.#checkpoints[this.#checkpointCursor];
    this.#checkpointCursor += 1;
    if (!expected) {
      throw new ReplayDivergenceError(`checkpoint "${label}" has no recorded counterpart`);
    }
    if (expected.label !== label) {
      throw new ReplayDivergenceError(`checkpoint "${label}" arrived where "${expected.label}" was recorded`);
    }
    if (expected.hash !== hash) {
      throw new ReplayDivergenceError(`checkpoint "${label}" state diverged from the recording`);
    }
  }

  /** The journal captured so far (record mode). */
  journal(): RunJournal {
    return { entries: [...this.#entries], checkpoints: [...this.#checkpoints] };
  }

  /** Replay must consume everything; leftovers mean the run diverged. */
  assertFullyReplayed(): void {
    if (this.#mode !== "replay") return;
    if (this.#cursor !== this.#entries.length) {
      throw new ReplayDivergenceError(
        `replay consumed ${this.#cursor} of ${this.#entries.length} journal entries`,
      );
    }
    if (this.#checkpointCursor !== this.#checkpoints.length) {
      throw new ReplayDivergenceError(
        `replay hit ${this.#checkpointCursor} of ${this.#checkpoints.length} checkpoints`,
      );
    }
  }

  #pull(kind: JournalKind, live: () => unknown): unknown {
    if (this.#mode === "record") {
      const value = live();
      this.#entries.push({ kind, value });
      return value;
    }
    const entry = this.#entries[this.#cursor];
    if (!entry) {
      throw new ReplayDivergenceError(`request #${this.#cursor + 1} (${kind}) runs past the journal`);
    }
    if (entry.kind !== kind) {
      throw new ReplayDivergenceError(
        `request #${this.#cursor + 1} asked for ${kind} but the journal holds ${entry.kind}`,
      );
    }
    this.#cursor += 1;
    return entry.value;
  }
}
