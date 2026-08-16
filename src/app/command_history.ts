// Copyright 2023 Im-Beast. MIT license.

// AUT-009: invocation history that cannot leak. Every record carries the
// command id, outcome status, virtual-clock duration, and arguments passed
// through the author's classification: fields declared safe persist,
// fields declared sensitive persist as "[redacted]", and everything the
// author did NOT classify defaults to omitted when it is complex —
// primitives are summarized by type only, so an unclassified secret can
// never ride along by accident. The history is bounded oldest-first.

/** The author's argument classification for one command. */
export interface CommandArgumentClassification {
  /** Field names safe to persist verbatim. */
  readonly safe?: readonly string[];
  /** Field names persisted as "[redacted]" markers. */
  readonly sensitive?: readonly string[];
}

/** One history record. */
export interface CommandHistoryRecord {
  readonly id: string;
  readonly status: string;
  readonly durationMs: number;
  readonly at: number;
  /** The redacted argument projection. */
  readonly args: Readonly<Record<string, unknown>>;
}

/** The bounded, redacting history. */
export class CommandInvocationHistory {
  readonly #maxRecords: number;
  readonly #classifications = new Map<string, CommandArgumentClassification>();
  #records: CommandHistoryRecord[] = [];

  constructor(options: { readonly maxRecords?: number } = {}) {
    this.#maxRecords = Math.max(1, options.maxRecords ?? 128);
  }

  /** Declares a command's argument classification. */
  classify(id: string, classification: CommandArgumentClassification): void {
    this.#classifications.set(id, classification);
  }

  /** Records one settled invocation. */
  record(entry: {
    readonly id: string;
    readonly status: string;
    readonly input: unknown;
    readonly startedAt: number;
    readonly settledAt: number;
  }): CommandHistoryRecord {
    const record: CommandHistoryRecord = {
      id: entry.id,
      status: entry.status,
      durationMs: Math.max(0, entry.settledAt - entry.startedAt),
      at: entry.startedAt,
      args: this.#project(entry.id, entry.input),
    };
    this.#records.push(record);
    while (this.#records.length > this.#maxRecords) this.#records.shift();
    return record;
  }

  /** The history, oldest first. */
  records(): readonly CommandHistoryRecord[] {
    return [...this.#records];
  }

  /** Serializes exactly the projected records — nothing unredacted exists. */
  serialize(): string {
    return JSON.stringify({ version: 1, records: this.#records });
  }

  #project(id: string, input: unknown): Readonly<Record<string, unknown>> {
    if (input === null || input === undefined) return {};
    if (typeof input !== "object") {
      // A bare primitive input is summarized by type only.
      return { input: `[${typeof input}]` };
    }
    const classification = this.#classifications.get(id);
    const projected: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(input as Record<string, unknown>)) {
      if (classification?.sensitive?.includes(field)) {
        projected[field] = "[redacted]";
      } else if (classification?.safe?.includes(field)) {
        projected[field] = value;
      } else if (value !== null && typeof value === "object") {
        // Unclassified complex values are omitted entirely — the default
        // posture is that they might hold anything.
        continue;
      } else {
        projected[field] = `[${value === null ? "null" : typeof value}]`;
      }
    }
    return projected;
  }
}

/** Creates a redacting invocation history. */
export function createCommandInvocationHistory(
  options: { readonly maxRecords?: number } = {},
): CommandInvocationHistory {
  return new CommandInvocationHistory(options);
}
