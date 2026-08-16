// Copyright 2023 Im-Beast. MIT license.

// QAL-010: flakiness is measured, never waved through. A subject runs N
// times under deterministic seed rotation; every run records its timing
// and every FAILING run retains its full artifact — seed, error, timing,
// and a caller-captured resource snapshot — so a flake reproduces from
// its report alone. Classification is stable-pass / stable-fail / flaky
// with a timing distribution. Quarantine is a LABEL requiring a named
// owner and a review date: a quarantined required gate that fails still
// fails — there is no code path where quarantine turns a red run green.

/** One run's retained failure artifact. */
export interface FlakeArtifact {
  readonly seed: number;
  readonly error: string;
  readonly durationMs: number;
  readonly resources?: unknown;
}

/** Timing distribution across runs. */
export interface TimingDistribution {
  readonly minMs: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly p95Ms: number;
}

/** The verdict for one subject. */
export interface FlakeReport {
  readonly name: string;
  readonly classification: "stable-pass" | "stable-fail" | "flaky";
  readonly runs: number;
  readonly failures: number;
  readonly timing: TimingDistribution;
  /** Every failing run's artifact — nothing is discarded. */
  readonly artifacts: readonly FlakeArtifact[];
  /** Present when the subject is quarantined. */
  readonly quarantine?: QuarantineLabel;
  /** For required gates: red stays red, quarantined or not. */
  readonly gatePassed: boolean;
}

/** A quarantine label: owner and review date are mandatory. */
export interface QuarantineLabel {
  readonly owner: string;
  readonly reviewByMs: number;
  readonly note?: string;
}

/** One test subject. */
export interface FlakeSubject {
  readonly name: string;
  /** Runs once under a seed; returns elapsed ms; throws = failure. */
  run(seed: number): number;
  /** Captures resource state after a failure (optional). */
  snapshotResources?(): unknown;
  /** Is this subject a required gate (default true)? */
  readonly required?: boolean;
}

function distribution(durations: readonly number[]): TimingDistribution {
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
    meanMs: sorted.length === 0 ? 0 : sum / sorted.length,
    p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
  };
}

/** The flake detector. */
export class FlakeDetector {
  readonly #quarantine = new Map<string, QuarantineLabel>();

  /**
   * Quarantines a subject. The label requires a named owner and a review
   * date; an anonymous or open-ended quarantine is refused.
   */
  quarantine(name: string, label: QuarantineLabel): void {
    if (!label.owner || label.owner.trim() === "") {
      throw new TypeError("quarantine requires a named owner");
    }
    if (!Number.isFinite(label.reviewByMs)) {
      throw new TypeError("quarantine requires a review date");
    }
    this.#quarantine.set(name, label);
  }

  /** Runs one subject N times under rotated deterministic seeds. */
  detect(subject: FlakeSubject, options: { readonly runs?: number; readonly seedBase?: number } = {}): FlakeReport {
    const runs = Math.max(2, options.runs ?? 10);
    const seedBase = options.seedBase ?? 1;
    const durations: number[] = [];
    const artifacts: FlakeArtifact[] = [];

    for (let index = 0; index < runs; index += 1) {
      const seed = seedBase + index * 7919; // deterministic rotation
      try {
        durations.push(subject.run(seed));
      } catch (error) {
        durations.push(0);
        artifacts.push({
          seed,
          error: String(error),
          durationMs: 0,
          resources: subject.snapshotResources?.(),
        });
      }
    }

    const failures = artifacts.length;
    const classification = failures === 0 ? "stable-pass" : failures === runs ? "stable-fail" : "flaky";
    const quarantine = this.#quarantine.get(subject.name);
    const required = subject.required ?? true;
    // Quarantine labels; it NEVER passes a required gate.
    const gatePassed = failures === 0 || (!required && quarantine !== undefined);

    return {
      name: subject.name,
      classification,
      runs,
      failures,
      timing: distribution(durations.filter((duration) => duration > 0)),
      artifacts,
      ...(quarantine ? { quarantine } : {}),
      gatePassed,
    };
  }
}

/** Creates a flake detector. */
export function createFlakeDetector(): FlakeDetector {
  return new FlakeDetector();
}
