// Copyright 2023 Im-Beast. MIT license.

// 036 T2: the five devtools as host-neutral controllers, not demo
// widgets. The layout inspector is id-keyed and LIVE — re-ingesting a
// new solve keeps the selection when its id survives; the console is a
// bounded journal with level and substring filters; the worker/
// resource view renders straight off a DiagnosticsHub snapshot; the
// key diagnostic tool pairs every raw input sequence with what it
// decoded to (the "why didn't my key work" instrument); and the
// hot-reload error surface holds the latest failure until a successful
// reload clears it, so errors survive repaints instead of flashing by.

import type { ComputedLayoutBox } from "../layout/solver.ts";
import type { DiagnosticsSnapshot } from "./diagnostics_hub.ts";

/** One inspected node's report. */
export interface LayoutInspection {
  readonly id: string;
  readonly tag: string;
  readonly rect: ComputedLayoutBox["rect"];
  readonly contentRect: ComputedLayoutBox["contentRect"];
  readonly padding: ComputedLayoutBox["padding"];
  readonly margin: ComputedLayoutBox["margin"];
  readonly border: ComputedLayoutBox["border"];
  readonly overflow: { readonly x: string; readonly y: string };
  readonly childIds: readonly string[];
  readonly path: readonly string[];
}

/** The live layout/style inspector. */
export class LayoutInspectorController {
  #byId = new Map<string, ComputedLayoutBox>();
  #parents = new Map<string, string>();
  #selectedId?: string;

  /** Ingests a solve; selection survives when its id still exists. */
  ingest(root: ComputedLayoutBox): void {
    this.#byId = new Map();
    this.#parents = new Map();
    const walk = (box: ComputedLayoutBox, parentId?: string): void => {
      this.#byId.set(box.id, box);
      if (parentId !== undefined) this.#parents.set(box.id, parentId);
      for (const child of box.children) walk(child, box.id);
    };
    walk(root);
    if (this.#selectedId !== undefined && !this.#byId.has(this.#selectedId)) {
      this.#selectedId = undefined;
    }
  }

  select(id: string): boolean {
    if (!this.#byId.has(id)) return false;
    this.#selectedId = id;
    return true;
  }

  /** The node whose rect contains the cell, deepest first. */
  selectAt(column: number, row: number): string | undefined {
    let best: ComputedLayoutBox | undefined;
    let bestDepth = -1;
    for (const box of this.#byId.values()) {
      const inside = column >= box.rect.column && column < box.rect.column + box.rect.width &&
        row >= box.rect.row && row < box.rect.row + box.rect.height;
      if (!inside) continue;
      const depth = this.#pathOf(box.id).length;
      if (depth > bestDepth) {
        best = box;
        bestDepth = depth;
      }
    }
    if (!best) return undefined;
    this.#selectedId = best.id;
    return best.id;
  }

  inspect(): LayoutInspection | undefined {
    const box = this.#selectedId !== undefined ? this.#byId.get(this.#selectedId) : undefined;
    if (!box) return undefined;
    return {
      id: box.id,
      tag: box.tag,
      rect: box.rect,
      contentRect: box.contentRect,
      padding: box.padding,
      margin: box.margin,
      border: box.border,
      overflow: { x: box.overflowX, y: box.overflowY },
      childIds: box.children.map((child) => child.id),
      path: this.#pathOf(box.id),
    };
  }

  #pathOf(id: string): string[] {
    const path = [id];
    let current = id;
    while (this.#parents.has(current)) {
      current = this.#parents.get(current)!;
      path.unshift(current);
    }
    return path;
  }
}

/** One console entry. */
export interface ConsoleEntry {
  readonly atMs: number;
  readonly level: "debug" | "info" | "warn" | "error";
  readonly source: string;
  readonly text: string;
}

const LEVEL_RANK: Readonly<Record<ConsoleEntry["level"], number>> = { debug: 0, info: 1, warn: 2, error: 3 };

/** The filtered console. */
export class FilteredConsoleController {
  readonly #max: number;
  #entries: ConsoleEntry[] = [];
  #minLevel: ConsoleEntry["level"] = "debug";
  #query = "";

  constructor(options: { readonly maxEntries?: number } = {}) {
    this.#max = Math.max(1, options.maxEntries ?? 500);
  }

  append(entry: ConsoleEntry): void {
    this.#entries.push(entry);
    if (this.#entries.length > this.#max) this.#entries.splice(0, this.#entries.length - this.#max);
  }

  setFilter(options: { readonly minLevel?: ConsoleEntry["level"]; readonly query?: string }): void {
    if (options.minLevel !== undefined) this.#minLevel = options.minLevel;
    if (options.query !== undefined) this.#query = options.query;
  }

  visible(): readonly ConsoleEntry[] {
    return this.#entries.filter((entry) =>
      LEVEL_RANK[entry.level] >= LEVEL_RANK[this.#minLevel] &&
      (this.#query === "" || entry.text.includes(this.#query) || entry.source.includes(this.#query))
    );
  }
}

/** One worker/resource view row. */
export interface WorkerResourceRow {
  readonly kind: "task" | "resource-leak";
  readonly id: string;
  readonly owner: string;
  readonly detail: string;
}

/** Renders worker/task/resource rows off a diagnostics snapshot. */
export function workerResourceRows(snapshot: DiagnosticsSnapshot): readonly WorkerResourceRow[] {
  return [
    ...snapshot.tasks.map((task) => ({
      kind: "task" as const,
      id: task.id,
      owner: task.owner,
      detail: task.state,
    })),
    ...snapshot.leakWarnings.map((leak) => ({
      kind: "resource-leak" as const,
      id: leak.id,
      owner: leak.owner,
      detail: `alive ${Math.round(leak.aliveMs)}ms — check disposal`,
    })),
  ];
}

/** One key diagnostic pair: raw bytes and what they decoded to. */
export interface KeyDiagnosticRecord {
  readonly atMs: number;
  readonly raw: string;
  readonly decoded: string;
  readonly handled: boolean;
}

/** The key diagnostic tool. */
export class KeyDiagnosticsController {
  readonly #max: number;
  #records: KeyDiagnosticRecord[] = [];

  constructor(options: { readonly maxRecords?: number } = {}) {
    this.#max = Math.max(1, options.maxRecords ?? 64);
  }

  record(entry: KeyDiagnosticRecord): void {
    this.#records.push(entry);
    if (this.#records.length > this.#max) this.#records.splice(0, this.#records.length - this.#max);
  }

  latest(count = 10): readonly KeyDiagnosticRecord[] {
    return this.#records.slice(-Math.max(1, count));
  }

  /** Sequences that decoded but nothing handled — the usual culprits. */
  unhandled(): readonly KeyDiagnosticRecord[] {
    return this.#records.filter((record) => !record.handled);
  }
}

/** The hot-reload error surface. */
export class HotReloadErrorSurface {
  #current?: { readonly atMs: number; readonly file: string; readonly message: string; readonly stack?: string };

  /** A failed reload records; the error HOLDS until a success clears. */
  reportFailure(
    error: { readonly atMs: number; readonly file: string; readonly message: string; readonly stack?: string },
  ): void {
    this.#current = error;
  }

  reportSuccess(): void {
    this.#current = undefined;
  }

  current():
    | { readonly atMs: number; readonly file: string; readonly message: string; readonly stack?: string }
    | undefined {
    return this.#current;
  }

  /** Render lines for any host surface. */
  lines(width = 80): readonly string[] {
    if (!this.#current) return [];
    const out = [`reload failed: ${this.#current.file}`, this.#current.message];
    for (const line of (this.#current.stack ?? "").split("\n").slice(0, 6)) {
      if (line.trim() !== "") out.push(line.trim());
    }
    return out.map((line) => line.length > width ? line.slice(0, Math.max(1, width - 1)) + "…" : line);
  }
}
