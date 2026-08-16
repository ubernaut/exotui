// Copyright 2023 Im-Beast. MIT license.

// OBS-009: the health snapshot that always succeeds. Subsystems register
// bounded probes for lifecycle, backlogs, saturation, storage, and
// capabilities; snapshot() runs every probe defensively — a throwing or
// degraded probe contributes a "degraded" entry with its error instead of
// failing the snapshot — collects the recent classified-failure ring, and
// caps every list, so creation is bounded no matter how sick the process
// is.

/** One subsystem's reported health. */
export interface SubsystemHealth {
  readonly name: string;
  readonly status: "ok" | "degraded" | "unavailable";
  readonly detail?: string;
  /** Bounded numeric indicators (backlog depth, saturation percent, …). */
  readonly indicators?: Readonly<Record<string, number>>;
}

/** One classified recent failure. */
export interface ClassifiedFailure {
  readonly area: string;
  readonly classification: "transient" | "permanent" | "unknown";
  readonly at: number;
  readonly detail: string;
}

/** The full snapshot. */
export interface HealthSnapshot {
  readonly at: number;
  readonly lifecycle: "starting" | "running" | "suspending" | "stopping";
  readonly subsystems: readonly SubsystemHealth[];
  readonly recentFailures: readonly ClassifiedFailure[];
  readonly capabilities: Readonly<Record<string, boolean>>;
}

const MAX_SUBSYSTEMS = 32;
const MAX_FAILURES = 16;
const MAX_INDICATORS = 16;

/** The registry probes report into. */
export class HealthMonitor {
  #lifecycle: HealthSnapshot["lifecycle"] = "starting";
  readonly #probes = new Map<string, () => Omit<SubsystemHealth, "name">>();
  readonly #capabilities = new Map<string, boolean>();
  #failures: ClassifiedFailure[] = [];

  setLifecycle(state: HealthSnapshot["lifecycle"]): void {
    this.#lifecycle = state;
  }

  /** Registers a subsystem probe; returns its disposer. */
  probe(name: string, probe: () => Omit<SubsystemHealth, "name">): () => void {
    if (this.#probes.size < MAX_SUBSYSTEMS) this.#probes.set(name, probe);
    return () => {
      this.#probes.delete(name);
    };
  }

  declareCapability(name: string, available: boolean): void {
    this.#capabilities.set(name, available);
  }

  /** Records a classified failure into the bounded ring. */
  reportFailure(failure: ClassifiedFailure): void {
    this.#failures.push(failure);
    while (this.#failures.length > MAX_FAILURES) this.#failures.shift();
  }

  /** Builds the snapshot; degraded probes degrade, they never fail it. */
  snapshot(nowMs: number): HealthSnapshot {
    const subsystems: SubsystemHealth[] = [];
    for (const [name, probe] of this.#probes) {
      try {
        const report = probe();
        const indicators = report.indicators
          ? Object.fromEntries(Object.entries(report.indicators).slice(0, MAX_INDICATORS))
          : undefined;
        subsystems.push({ name, ...report, indicators });
      } catch (error) {
        subsystems.push({
          name,
          status: "degraded",
          detail: `probe failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    return {
      at: nowMs,
      lifecycle: this.#lifecycle,
      subsystems,
      recentFailures: [...this.#failures],
      capabilities: Object.fromEntries(this.#capabilities),
    };
  }
}

/** Creates a health monitor. */
export function createHealthMonitor(): HealthMonitor {
  return new HealthMonitor();
}
