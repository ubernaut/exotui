// Copyright 2023 Im-Beast. MIT license.

// AUT-003: structured command progress. A progress scope reports phases,
// determinate completion (monotonic per phase — a lower fraction than
// already reported is clamped, never regresses), indeterminate spinners,
// messages, and nested child operations whose fractions roll up weighted
// into the parent. Settling the scope freezes it: late events after
// settlement are ignored entirely.

/** One progress event, as observers receive it. */
export interface CommandProgressEvent {
  /** Path of operation labels, root first. */
  readonly path: readonly string[];
  readonly kind: "phase" | "fraction" | "indeterminate" | "message";
  readonly phase?: string;
  /** Rolled-up fraction 0..1 at the ROOT after this event. */
  readonly fraction?: number;
  readonly message?: string;
}

/** A progress scope (root or nested child). */
export class CommandProgressScope {
  readonly #label: string;
  readonly #parent: CommandProgressScope | undefined;
  readonly #listeners: Array<(event: CommandProgressEvent) => void>;
  readonly #children: Array<{ scope: CommandProgressScope; weight: number }> = [];
  #ownFraction = 0;
  #ownWeight = 1;
  #phase: string | undefined;
  #indeterminate = false;
  #settled = false;

  constructor(
    label: string,
    parent?: CommandProgressScope,
    listeners?: Array<(event: CommandProgressEvent) => void>,
  ) {
    this.#label = label;
    this.#parent = parent;
    this.#listeners = listeners ?? (parent ? parent.#listeners : []);
  }

  onProgress(listener: (event: CommandProgressEvent) => void): () => void {
    this.#listeners.push(listener);
    return () => {
      const index = this.#listeners.indexOf(listener);
      if (index >= 0) this.#listeners.splice(index, 1);
    };
  }

  /** Enters a named phase. */
  phase(name: string): void {
    if (this.#settled) return;
    this.#phase = name;
    this.#ownFraction = 0; // a new phase starts its own monotonic ramp
    this.#emit({ kind: "phase", phase: name });
  }

  /** Reports determinate completion; monotonic within the current phase. */
  report(fraction: number): void {
    if (this.#settled) return;
    this.#indeterminate = false;
    // Monotonic: regressions clamp to the highest fraction already reported.
    this.#ownFraction = Math.min(1, Math.max(this.#ownFraction, fraction));
    this.#emit({ kind: "fraction" });
  }

  /** Marks indeterminate work (spinner). */
  indeterminate(): void {
    if (this.#settled) return;
    this.#indeterminate = true;
    this.#emit({ kind: "indeterminate" });
  }

  message(text: string): void {
    if (this.#settled) return;
    this.#emit({ kind: "message", message: text });
  }

  /** Opens a nested child operation contributing `weight` to this scope. */
  child(label: string, weight = 1): CommandProgressScope {
    const child = new CommandProgressScope(label, this);
    if (!this.#settled) this.#children.push({ scope: child, weight });
    return child;
  }

  /** The rolled-up fraction: own work plus weighted children. */
  fraction(): number {
    const weights = this.#ownWeight + this.#children.reduce((sum, child) => sum + child.weight, 0);
    const total = this.#ownFraction * this.#ownWeight +
      this.#children.reduce((sum, child) => sum + child.scope.fraction() * child.weight, 0);
    return weights === 0 ? 0 : total / weights;
  }

  get settled(): boolean {
    return this.#settled;
  }

  get currentPhase(): string | undefined {
    return this.#phase;
  }

  get isIndeterminate(): boolean {
    return this.#indeterminate && !this.#settled;
  }

  /** Settles the scope (and every child): late events are ignored. */
  settle(): void {
    if (this.#settled) return;
    this.#ownFraction = 1;
    this.#settled = true;
    for (const child of this.#children) child.scope.settle();
  }

  #path(): string[] {
    const path = this.#parent ? this.#parent.#path() : [];
    path.push(this.#label);
    return path;
  }

  #root(): CommandProgressScope {
    return this.#parent ? this.#parent.#root() : this;
  }

  #emit(event: Omit<CommandProgressEvent, "path" | "fraction">): void {
    const full: CommandProgressEvent = {
      ...event,
      path: this.#path(),
      fraction: this.#root().fraction(),
    };
    for (const listener of [...this.#listeners]) listener(full);
  }
}

/** Creates a root progress scope. */
export function createCommandProgress(label: string): CommandProgressScope {
  return new CommandProgressScope(label);
}
