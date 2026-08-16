// Copyright 2023 Im-Beast. MIT license.

// 036 R1: renderer idle/live-request accounting, frame statistics,
// scheduler diagnostics, and the reusable debug/console overlay — one
// module, no demo-local instrumentation. The accounting answers the
// question a renderer owner actually asks: WHY did each frame render?
// A live request names its reason and stays pending until a painted
// frame consumes it; an idle wake that painted nothing is a skipped
// frame the stats call out. Scheduler diagnostics are pull-based
// providers so any queue (async scheduler, priority scheduler, job
// manager) can report depth without coupling. The overlay renders it
// all — plus a console tail — into plain text rows any host paints.

import type { DiagnosticsSnapshot } from "../tooling/diagnostics_hub.ts";
import type { ConsoleEntry } from "../tooling/devtools.ts";

/** Renderer accounting statistics. */
export interface RenderAccountingStats {
  readonly liveRequests: number;
  readonly pendingLiveRequests: number;
  readonly framesPainted: number;
  readonly framesSkipped: number;
  readonly idleFrames: number;
  readonly lastFrameMs: number;
  readonly averageFrameMs: number;
  readonly worstFrameMs: number;
  /** The most recent live-request reasons, newest last. */
  readonly recentReasons: readonly string[];
}

/** The renderer idle/live accounting. */
export class RenderAccounting {
  readonly #maxReasons: number;
  #liveRequests = 0;
  #pending = 0;
  #painted = 0;
  #skipped = 0;
  #idle = 0;
  #frameStartMs?: number;
  #frameKind: "live" | "idle" = "idle";
  #lastMs = 0;
  #totalMs = 0;
  #timedFrames = 0;
  #worstMs = 0;
  #reasons: string[] = [];

  constructor(options: { readonly maxReasons?: number } = {}) {
    this.#maxReasons = Math.max(1, options.maxReasons ?? 16);
  }

  /** Something asked for a frame, and says why. */
  requestLive(reason: string): void {
    this.#liveRequests += 1;
    this.#pending += 1;
    this.#reasons.push(reason);
    if (this.#reasons.length > this.#maxReasons) {
      this.#reasons.splice(0, this.#reasons.length - this.#maxReasons);
    }
  }

  beginFrame(nowMs: number): void {
    this.#frameStartMs = nowMs;
    this.#frameKind = this.#pending > 0 ? "live" : "idle";
  }

  /** Ends the frame; painted live frames consume the pending requests. */
  endFrame(nowMs: number, painted: boolean): void {
    if (this.#frameStartMs !== undefined) {
      const duration = Math.max(0, nowMs - this.#frameStartMs);
      this.#lastMs = duration;
      this.#totalMs += duration;
      this.#timedFrames += 1;
      this.#worstMs = Math.max(this.#worstMs, duration);
      this.#frameStartMs = undefined;
    }
    if (this.#frameKind === "idle") this.#idle += 1;
    if (painted) {
      this.#painted += 1;
      this.#pending = 0;
    } else {
      this.#skipped += 1;
    }
  }

  stats(): RenderAccountingStats {
    return {
      liveRequests: this.#liveRequests,
      pendingLiveRequests: this.#pending,
      framesPainted: this.#painted,
      framesSkipped: this.#skipped,
      idleFrames: this.#idle,
      lastFrameMs: this.#lastMs,
      averageFrameMs: this.#timedFrames === 0 ? 0 : this.#totalMs / this.#timedFrames,
      worstFrameMs: this.#worstMs,
      recentReasons: [...this.#reasons],
    };
  }
}

/** One scheduler queue's diagnostic row. */
export interface SchedulerQueueDiagnostic {
  readonly name: string;
  readonly depth: number;
  readonly running: number;
}

/** Pull-based scheduler diagnostics. */
export class SchedulerDiagnostics {
  readonly #providers = new Map<string, () => { readonly depth: number; readonly running: number }>();

  registerQueue(name: string, provider: () => { readonly depth: number; readonly running: number }): () => void {
    this.#providers.set(name, provider);
    return () => this.#providers.delete(name);
  }

  snapshot(): readonly SchedulerQueueDiagnostic[] {
    return [...this.#providers.entries()].map(([name, provider]) => ({ name, ...provider() }));
  }
}

/** Options for the reusable debug overlay. */
export interface DebugOverlayOptions {
  readonly accounting?: RenderAccounting;
  readonly scheduler?: SchedulerDiagnostics;
  readonly diagnostics?: () => DiagnosticsSnapshot;
  readonly consoleTail?: () => readonly ConsoleEntry[];
  readonly consoleLines?: number;
}

/** Renders the debug/console overlay as plain rows any host paints. */
export function renderDebugOverlay(options: DebugOverlayOptions, width = 60): readonly string[] {
  const clip = (line: string): string => line.length > width ? line.slice(0, Math.max(1, width - 1)) + "…" : line;
  const rows: string[] = [];
  if (options.accounting) {
    const stats = options.accounting.stats();
    rows.push(clip(
      `frames: ${stats.framesPainted} painted, ${stats.framesSkipped} skipped, ${stats.idleFrames} idle`,
    ));
    rows.push(clip(
      `timing: last ${stats.lastFrameMs.toFixed(1)}ms avg ${stats.averageFrameMs.toFixed(1)}ms worst ${
        stats.worstFrameMs.toFixed(1)
      }ms`,
    ));
    rows.push(clip(`live: ${stats.liveRequests} requests, ${stats.pendingLiveRequests} pending`));
    if (stats.recentReasons.length > 0) {
      rows.push(clip(`why: ${stats.recentReasons.slice(-3).join(", ")}`));
    }
  }
  if (options.scheduler) {
    for (const queue of options.scheduler.snapshot()) {
      rows.push(clip(`queue ${queue.name}: ${queue.depth} waiting, ${queue.running} running`));
    }
  }
  if (options.diagnostics) {
    const snapshot = options.diagnostics();
    rows.push(clip(`cell diff: last ${snapshot.cellDiff.lastCells}, worst ${snapshot.cellDiff.worstCells}`));
    for (const [name, stats] of Object.entries(snapshot.caches)) {
      const parts = Object.entries(stats).map(([key, value]) => `${key} ${value}`).join(", ");
      rows.push(clip(`cache ${name}: ${parts}`));
    }
    for (const leak of snapshot.leakWarnings) {
      rows.push(clip(`LEAK ${leak.id} (${leak.owner}) alive ${Math.round(leak.aliveMs)}ms`));
    }
  }
  if (options.consoleTail) {
    const tail = options.consoleTail().slice(-(options.consoleLines ?? 5));
    for (const entry of tail) {
      rows.push(clip(`[${entry.level}] ${entry.source}: ${entry.text}`));
    }
  }
  return rows;
}
