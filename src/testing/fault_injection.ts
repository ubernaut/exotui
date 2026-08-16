// Copyright 2023 Im-Beast. MIT license.

// QAL-005: fault injection is a DETERMINISTIC SWEEP, not a dice roll. A
// probe run first counts every named fault site (allocation, storage,
// worker, transport, clock, permission, lifecycle hooks — any site the
// subject declares by calling `checkpoint`); the sweep then re-runs the
// subject once per (site, occurrence), throwing exactly there. After
// every injected failure the subject's cleanup predicate must hold and
// the subject must CLASSIFY the user-visible outcome — the report shows
// each injection with its outcome and cleanup verdict, so an unproven
// failure path is visible, never assumed.

/** The injector handed to the subject. */
export interface FaultInjector {
  /**
   * Declares one pass through a named fault site. Throws FaultInjected
   * when the sweep scheduled a fault at this site occurrence.
   */
  checkpoint(site: string): void;
}

/** The error the injector throws at a scheduled fault. */
export class FaultInjected extends Error {
  constructor(readonly site: string, readonly occurrence: number) {
    super(`injected fault at ${site}#${occurrence}`);
    this.name = "FaultInjected";
  }
}

/** One fault-injection subject. */
export interface FaultSubject<TOutcome extends string> {
  /** Runs the workload, calling injector.checkpoint at every fault site. */
  execute(injector: FaultInjector): void;
  /**
   * Classifies the user-visible outcome after a run — for faulted runs
   * this is what the USER would see (e.g. "aborted-clean", "degraded").
   */
  classifyOutcome(error: unknown): TOutcome;
  /** Returns true when all resources are released / state is consistent. */
  cleanupHolds(): boolean;
  /** Resets subject state between runs. */
  reset(): void;
}

/** One injection's report row. */
export interface InjectionReport<TOutcome extends string> {
  readonly site: string;
  readonly occurrence: number;
  readonly outcome: TOutcome;
  readonly cleanupHeld: boolean;
}

/** The sweep result. */
export interface FaultSweepReport<TOutcome extends string> {
  /** Sites discovered by the probe run, with occurrence counts. */
  readonly sites: Readonly<Record<string, number>>;
  readonly injections: readonly InjectionReport<TOutcome>[];
  /** true when every injection held cleanup. */
  readonly allCleanupHeld: boolean;
}

class SweepInjector implements FaultInjector {
  readonly counts = new Map<string, number>();
  constructor(
    private readonly target?: { site: string; occurrence: number },
  ) {}

  checkpoint(site: string): void {
    const occurrence = (this.counts.get(site) ?? 0) + 1;
    this.counts.set(site, occurrence);
    if (this.target && this.target.site === site && this.target.occurrence === occurrence) {
      throw new FaultInjected(site, occurrence);
    }
  }
}

/** Runs the deterministic sweep over every discovered fault site. */
export function sweepFaults<TOutcome extends string>(
  subject: FaultSubject<TOutcome>,
): FaultSweepReport<TOutcome> {
  // Probe run: discover sites and occurrence counts (must succeed).
  subject.reset();
  const probe = new SweepInjector();
  subject.execute(probe);
  if (!subject.cleanupHolds()) {
    throw new Error("the fault-free probe run already violates cleanup");
  }
  const sites = Object.fromEntries(probe.counts);

  const injections: InjectionReport<TOutcome>[] = [];
  for (const [site, total] of probe.counts) {
    for (let occurrence = 1; occurrence <= total; occurrence += 1) {
      subject.reset();
      let thrown: unknown;
      try {
        subject.execute(new SweepInjector({ site, occurrence }));
      } catch (error) {
        thrown = error;
      }
      injections.push({
        site,
        occurrence,
        outcome: subject.classifyOutcome(thrown),
        cleanupHeld: subject.cleanupHolds(),
      });
    }
  }
  return {
    sites,
    injections,
    allCleanupHeld: injections.every((injection) => injection.cleanupHeld),
  };
}
