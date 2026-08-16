// Copyright 2023 Im-Beast. MIT license.

// ASY-007: a priority queue that cannot starve. Every queued task's
// effective priority ages upward with virtual waiting time, so low-priority
// work is guaranteed to surface; and a task that BLOCKS a higher-priority
// dependant inherits that dependant's priority for exactly as long as the
// dependency exists — the boost disappears the moment the dependency
// settles. All ordering is deterministic: effective priority first, then
// enqueue order.

/** One queued task. */
export interface PrioritySchedulerTask {
  readonly id: string;
  /** Base priority; higher runs earlier. */
  readonly priority: number;
}

/** Options for the scheduler. */
export interface PrioritySchedulerOptions {
  /** Priority points gained per second of waiting (default 1). */
  readonly agingPerSecond?: number;
}

interface QueuedTask {
  readonly id: string;
  readonly priority: number;
  readonly enqueuedAt: number;
  readonly order: number;
}

/** The aging, inheritance-aware priority queue. */
export class PriorityScheduler {
  readonly #agingPerSecond: number;
  readonly #queue = new Map<string, QueuedTask>();
  /** blocker id → dependant ids waiting on it. */
  readonly #dependants = new Map<string, Set<string>>();
  #order = 0;

  constructor(options: PrioritySchedulerOptions = {}) {
    this.#agingPerSecond = Math.max(0, options.agingPerSecond ?? 1);
  }

  enqueue(task: PrioritySchedulerTask, nowMs: number): void {
    if (this.#queue.has(task.id)) return;
    this.#queue.set(task.id, { id: task.id, priority: task.priority, enqueuedAt: nowMs, order: ++this.#order });
  }

  /** Declares that `blockerId` blocks `dependantId`; inheritance begins. */
  addDependency(blockerId: string, dependantId: string): void {
    const dependants = this.#dependants.get(blockerId) ?? new Set<string>();
    dependants.add(dependantId);
    this.#dependants.set(blockerId, dependants);
  }

  /** The dependency settled; inheritance is removed immediately. */
  settleDependency(blockerId: string, dependantId: string): void {
    const dependants = this.#dependants.get(blockerId);
    dependants?.delete(dependantId);
    if (dependants && dependants.size === 0) this.#dependants.delete(blockerId);
  }

  /** A task's effective priority at `nowMs`: base + aging + inheritance. */
  effectivePriority(id: string, nowMs: number): number | undefined {
    const task = this.#queue.get(id);
    if (!task) return undefined;
    const aged = task.priority + ((nowMs - task.enqueuedAt) / 1000) * this.#agingPerSecond;
    let inherited = aged;
    for (const dependantId of this.#dependants.get(id) ?? []) {
      const dependant = this.effectivePriority(dependantId, nowMs);
      if (dependant !== undefined && dependant > inherited) inherited = dependant;
    }
    return inherited;
  }

  /** Dequeues the highest effective priority (ties: enqueue order). */
  next(nowMs: number): string | undefined {
    let best: QueuedTask | undefined;
    let bestPriority = -Infinity;
    for (const task of this.#queue.values()) {
      const priority = this.effectivePriority(task.id, nowMs)!;
      if (priority > bestPriority || (priority === bestPriority && best !== undefined && task.order < best.order)) {
        best = task;
        bestPriority = priority;
      }
    }
    if (!best) return undefined;
    this.#queue.delete(best.id);
    return best.id;
  }

  inspect(nowMs: number): ReadonlyArray<{ id: string; effective: number }> {
    return [...this.#queue.keys()]
      .map((id) => ({ id, effective: this.effectivePriority(id, nowMs)! }))
      .sort((left, right) => right.effective - left.effective);
  }
}

/** Creates a priority scheduler. */
export function createPriorityScheduler(options: PrioritySchedulerOptions = {}): PriorityScheduler {
  return new PriorityScheduler(options);
}
