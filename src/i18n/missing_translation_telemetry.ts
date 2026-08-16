// Copyright 2023 Im-Beast. MIT license.

// LOC-010: missing-translation telemetry that cannot leak. Reports carry
// exactly the catalog coordinates — namespace, key, requested locale,
// bundle version, and the fallback path the resolution walked — and the
// report shape has NO field for runtime parameter values: privacy is
// structural. Emission flows through the OBS-008 redaction pipeline with a
// fixed schema, so even a hostile caller stuffing values into the key
// field faces truncation and cardinality limits downstream.

import type { MessageBundleRegistry, MessageResolution } from "./messages.ts";
import { createSignalRedactionPipeline, SignalRedactionPipeline } from "../runtime/signal_redaction.ts";
import type { RedactedSignal } from "../runtime/signal_redaction.ts";

/** One privacy-safe report. */
export interface MissingTranslationReport {
  readonly namespace: string;
  readonly key: string;
  readonly requestedLocale: string;
  readonly bundleVersion: string;
  /** The fallback chain the resolution consulted. */
  readonly fallbackPath: readonly string[];
  readonly outcome: "missing" | "fallback";
}

const SIGNAL_NAME = "i18n.missing-translation";

/** The reporter. */
export class MissingTranslationTelemetry {
  readonly #pipeline: SignalRedactionPipeline;
  #reports: MissingTranslationReport[] = [];
  #emitted: RedactedSignal[] = [];

  constructor(pipeline: SignalRedactionPipeline = createSignalRedactionPipeline()) {
    this.#pipeline = pipeline;
    this.#pipeline.declare(SIGNAL_NAME, {
      allow: ["namespace", "key", "requestedLocale", "bundleVersion", "fallbackPath", "outcome"],
      maxLength: 128,
      maxCardinality: 256,
    });
  }

  /**
   * Reports one resolution that missed or fell back. The report is BUILT
   * from catalog coordinates only — there is no parameter through which
   * runtime message data could arrive.
   */
  report(
    registry: MessageBundleRegistry,
    namespace: string,
    resolution: MessageResolution,
    requestedLocale: string,
  ): MissingTranslationReport | undefined {
    if (resolution.provenance === "exact") return undefined;
    const version = registry.inspect().find((entry) => entry.namespace === namespace)?.version ?? "0.0";
    const report: MissingTranslationReport = {
      namespace,
      key: resolution.key,
      requestedLocale,
      bundleVersion: version,
      fallbackPath: resolution.consulted,
      outcome: resolution.provenance === "missing" ? "missing" : "fallback",
    };
    this.#reports.push(report);
    this.#emitted.push(this.#pipeline.process(SIGNAL_NAME, {
      namespace: report.namespace,
      key: report.key,
      requestedLocale: report.requestedLocale,
      bundleVersion: report.bundleVersion,
      fallbackPath: report.fallbackPath.join(">"),
      outcome: report.outcome,
    }));
    return report;
  }

  /** The reports (catalog coordinates only, by construction). */
  reports(): readonly MissingTranslationReport[] {
    return [...this.#reports];
  }

  /** What exporters see — post-redaction signals only. */
  exported(): readonly RedactedSignal[] {
    return [...this.#emitted];
  }
}

/** Creates the missing-translation reporter. */
export function createMissingTranslationTelemetry(
  pipeline?: SignalRedactionPipeline,
): MissingTranslationTelemetry {
  return new MissingTranslationTelemetry(pipeline);
}
