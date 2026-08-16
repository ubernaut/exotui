// Copyright 2023 Im-Beast. MIT license.

// OBS-010: the support bundle as an explicit, previewed hand-off. Building
// is opt-in per section; the DEFAULT sections are only configuration
// schemas, versions, health snapshots, and OBS-008-redacted diagnostics.
// Screen text, form values, environment values, filesystem paths, and
// terminal output are SENSITIVE sections: each requires its own separate
// approval token, and the preview manifest lists exactly what a bundle
// will contain — with the sensitive sections it would EXCLUDE — before
// anything is assembled.

import type { HealthSnapshot } from "./health_snapshot.ts";
import type { RedactedSignal } from "./signal_redaction.ts";

/** The always-allowed sections. */
export type SafeBundleSection = "config-schemas" | "versions" | "health" | "redacted-diagnostics";

/** Sections that each need separate approval. */
export type SensitiveBundleSection = "screen-text" | "form-values" | "environment" | "paths" | "terminal-output";

/** The inputs a host supplies. */
export interface SupportBundleInputs {
  readonly configSchemas?: Readonly<Record<string, unknown>>;
  readonly versions?: Readonly<Record<string, string>>;
  readonly health?: HealthSnapshot;
  readonly redactedDiagnostics?: readonly RedactedSignal[];
  /** Sensitive payloads, provided only when the host collected them. */
  readonly sensitive?: Partial<Record<SensitiveBundleSection, unknown>>;
}

/** The preview manifest shown BEFORE assembly. */
export interface SupportBundleManifest {
  readonly included: readonly string[];
  /** Sensitive sections present in the inputs but NOT approved. */
  readonly excluded: readonly SensitiveBundleSection[];
  /** Sensitive sections that will be included because they were approved. */
  readonly approvedSensitive: readonly SensitiveBundleSection[];
}

/** Builds manifests and bundles under the approval rules. */
export class SupportBundleBuilder {
  readonly #inputs: SupportBundleInputs;
  readonly #approvals = new Set<SensitiveBundleSection>();

  constructor(inputs: SupportBundleInputs) {
    this.#inputs = inputs;
  }

  /** Separately approves ONE sensitive section. */
  approve(section: SensitiveBundleSection): void {
    this.#approvals.add(section);
  }

  /** The preview manifest — what a build would and would not contain. */
  manifest(): SupportBundleManifest {
    const included: string[] = [];
    if (this.#inputs.configSchemas) included.push("config-schemas");
    if (this.#inputs.versions) included.push("versions");
    if (this.#inputs.health) included.push("health");
    if (this.#inputs.redactedDiagnostics) included.push("redacted-diagnostics");
    const sensitivePresent = Object.keys(this.#inputs.sensitive ?? {}) as SensitiveBundleSection[];
    const approvedSensitive = sensitivePresent.filter((section) => this.#approvals.has(section));
    const excluded = sensitivePresent.filter((section) => !this.#approvals.has(section));
    return { included: [...included, ...approvedSensitive], excluded, approvedSensitive };
  }

  /**
   * Assembles the bundle. Sensitive sections without their own approval are
   * structurally absent — the serialization contains neither their values
   * nor their keys.
   */
  build(): string {
    const manifest = this.manifest();
    const bundle: Record<string, unknown> = { manifest };
    if (this.#inputs.configSchemas) bundle["config-schemas"] = this.#inputs.configSchemas;
    if (this.#inputs.versions) bundle["versions"] = this.#inputs.versions;
    if (this.#inputs.health) bundle["health"] = this.#inputs.health;
    if (this.#inputs.redactedDiagnostics) bundle["redacted-diagnostics"] = this.#inputs.redactedDiagnostics;
    for (const section of manifest.approvedSensitive) {
      bundle[section] = this.#inputs.sensitive?.[section];
    }
    return JSON.stringify(bundle);
  }
}

/** Creates a support-bundle builder over host-collected inputs. */
export function createSupportBundleBuilder(inputs: SupportBundleInputs): SupportBundleBuilder {
  return new SupportBundleBuilder(inputs);
}
