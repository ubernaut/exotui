// Copyright 2023 Im-Beast. MIT license.

// QAL-007: mutation testing that cannot be waved away. A mutant set
// belongs to one OWNING FEATURE ID and packages behavior mutations —
// each `apply()` patches the subject (a swapped comparator, an
// off-by-one bound, an inverted policy) and returns the restore. The
// campaign applies every mutant in isolation, runs the suite, and marks
// it killed (suite failed — good) or survived (suite passed — the suite
// has a hole). Survivors are reported grouped by owning feature ID, the
// campaign is clean only when zero survive, and there is deliberately NO
// waiver parameter anywhere in the API — a surviving mutant stays red
// until a test kills it.

/** One behavior mutant. */
export interface Mutant {
  readonly name: string;
  /** Applies the mutation; returns the exact restore. */
  apply(): () => void;
}

/** One feature's mutants. */
export interface MutantSet {
  readonly featureId: string;
  readonly mutants: readonly Mutant[];
}

/** One mutant's outcome. */
export interface MutantOutcome {
  readonly featureId: string;
  readonly mutant: string;
  readonly status: "killed" | "survived" | "suite-error";
}

/** The campaign report. There is no waiver field, by design. */
export interface MutationReport {
  readonly outcomes: readonly MutantOutcome[];
  /** Survivors grouped by their owning feature ID. */
  readonly survivorsByFeature: Readonly<Record<string, readonly string[]>>;
  readonly killed: number;
  readonly survived: number;
  /** true ONLY when every mutant was killed. */
  readonly clean: boolean;
}

/**
 * Runs every mutant in isolation against the suite. `suite` returns
 * true when all its assertions hold (which, under a mutation, means the
 * suite FAILED to notice — the mutant survived).
 */
export function runMutationCampaign(
  mutantSets: readonly MutantSet[],
  suite: () => boolean,
): MutationReport {
  const outcomes: MutantOutcome[] = [];
  for (const set of mutantSets) {
    for (const mutant of set.mutants) {
      const restore = mutant.apply();
      let status: MutantOutcome["status"];
      try {
        status = suite() ? "survived" : "killed";
      } catch {
        status = "killed"; // a throwing suite noticed the mutant
      } finally {
        restore();
      }
      outcomes.push({ featureId: set.featureId, mutant: mutant.name, status });
    }
  }
  // Sanity: the unmutated suite must pass, or every kill is meaningless.
  if (!suite()) {
    return {
      outcomes: outcomes.map((outcome) => ({ ...outcome, status: "suite-error" as const })),
      survivorsByFeature: {},
      killed: 0,
      survived: 0,
      clean: false,
    };
  }

  const survivorsByFeature: Record<string, string[]> = {};
  for (const outcome of outcomes) {
    if (outcome.status !== "survived") continue;
    (survivorsByFeature[outcome.featureId] ??= []).push(outcome.mutant);
  }
  const survived = outcomes.filter((outcome) => outcome.status === "survived").length;
  return {
    outcomes,
    survivorsByFeature,
    killed: outcomes.length - survived,
    survived,
    clean: survived === 0,
  };
}

/** Formats survivors for a gate message, feature IDs first. */
export function formatMutationSurvivors(report: MutationReport): string {
  if (report.clean) return "All mutants killed.";
  return Object.entries(report.survivorsByFeature)
    .map(([featureId, mutants]) => `${featureId}: ${mutants.join(", ")}`)
    .join("\n");
}
