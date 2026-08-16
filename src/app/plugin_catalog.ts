// Copyright 2023 Im-Beast. MIT license.

// PLG-009: the plugin catalog is CONSUMED, never obeyed. Catalog bytes
// verify through the SEC-010 integrity gate BEFORE parsing (signature
// and/or digest); entries pin each package's SHA-256, link provenance,
// and may carry revocations with reasons. Package verification checks
// candidate bytes against the catalog's pinned digest — a compromised
// mirror substituting bytes is an integrity failure naming the digests
// — and revoked packages refuse verification outright. This consumer
// has NO install method at all: it verifies and reports, and the host
// installs explicitly through its own flow, so no install is automatic.
// Offline snapshots carry their timestamp and report staleness against
// a caller-supplied clock.

import {
  type ContentIntegrityGate,
  createContentIntegrityGate,
  type IntegrityExpectation,
} from "./content_integrity.ts";

/** One catalog entry. */
export interface CatalogEntry {
  readonly id: string;
  readonly version: string;
  /** Pinned package digest, lowercase hex. */
  readonly sha256: string;
  readonly provenanceUrl?: string;
  readonly revoked?: { readonly reason: string };
}

/** The catalog document. */
export interface PluginCatalog {
  readonly version: 1;
  readonly snapshotAtMs: number;
  readonly packages: readonly CatalogEntry[];
}

/** A load outcome. */
export type CatalogLoadResult =
  | { readonly ok: true; readonly catalog: PluginCatalog }
  | { readonly ok: false; readonly reason: string };

/** A package verification outcome. */
export type PackageVerification =
  | { readonly ok: true; readonly entry: CatalogEntry }
  | { readonly ok: false; readonly reason: string };

/** The catalog consumer. Verifies; never installs. */
export class PluginCatalogConsumer {
  readonly #gate: ContentIntegrityGate;
  #catalog?: PluginCatalog;

  constructor(options: { readonly gate?: ContentIntegrityGate } = {}) {
    this.#gate = options.gate ?? createContentIntegrityGate();
  }

  /** Loads catalog bytes: SEC-010 verification precedes parsing. */
  async loadCatalog(bytes: Uint8Array, expectation: IntegrityExpectation): Promise<CatalogLoadResult> {
    const verified = await this.#gate.verify(bytes, expectation);
    if (verified.kind !== "verified") {
      return {
        ok: false,
        reason: verified.kind === "mismatch"
          ? `catalog integrity failure on ${verified.field}`
          : `catalog rejected: ${verified.kind}`,
      };
    }
    let parsed: PluginCatalog;
    try {
      parsed = JSON.parse(new TextDecoder().decode(verified.bytes));
    } catch {
      return { ok: false, reason: "catalog JSON is invalid" };
    }
    if (parsed.version !== 1 || !Array.isArray(parsed.packages)) {
      return { ok: false, reason: "catalog document shape is unsupported" };
    }
    this.#catalog = parsed;
    return { ok: true, catalog: parsed };
  }

  /** Looks an entry up (revocations included, visibly). */
  resolve(id: string, version: string): CatalogEntry | undefined {
    return this.#catalog?.packages.find((entry) => entry.id === id && entry.version === version);
  }

  /**
   * Verifies candidate package bytes against the catalog pin. Substituted
   * bytes fail with both digests named; revoked entries refuse.
   */
  async verifyPackage(id: string, version: string, bytes: Uint8Array): Promise<PackageVerification> {
    if (!this.#catalog) return { ok: false, reason: "no catalog loaded" };
    const entry = this.resolve(id, version);
    if (!entry) return { ok: false, reason: `"${id}@${version}" is not in the catalog` };
    if (entry.revoked) {
      return { ok: false, reason: `"${id}@${version}" is revoked: ${entry.revoked.reason}` };
    }
    const verified = await this.#gate.verify(bytes, { sha256: entry.sha256 });
    if (verified.kind !== "verified") {
      return {
        ok: false,
        reason: verified.kind === "mismatch"
          ? `integrity failure: catalog pins ${entry.sha256}, bytes hash to ${verified.actual}`
          : `verification rejected: ${verified.kind}`,
      };
    }
    return { ok: true, entry };
  }

  /** Offline-snapshot staleness against the caller's clock. */
  isStale(nowMs: number, maxAgeMs: number): boolean {
    if (!this.#catalog) return true;
    return nowMs - this.#catalog.snapshotAtMs > maxAgeMs;
  }
}

/** Creates a plugin catalog consumer. */
export function createPluginCatalogConsumer(
  options: { readonly gate?: ContentIntegrityGate } = {},
): PluginCatalogConsumer {
  return new PluginCatalogConsumer(options);
}
