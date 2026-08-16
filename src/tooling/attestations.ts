// Copyright 2023 Im-Beast. MIT license.

// PKG-009: releases carry verifiable claims, not vibes. The SPDX builder
// emits a minimal SPDX-2.3 document over the real dependency inventory;
// the provenance builder emits a SLSA-style statement binding the
// artifact digest, source revision, builder identity (in CI this is the
// OIDC token subject), and the dependency inventory digest. The verifier
// re-checks all four claims from raw inputs — a clean consumer with the
// artifact bytes and the documents can verify digest, revision, builder,
// and inventory, and every mismatch names which claim broke.

/** One dependency entry. */
export interface DependencyEntry {
  readonly name: string;
  readonly specifier: string;
}

/** A minimal SPDX-2.3 document. */
export interface SpdxDocument {
  readonly spdxVersion: "SPDX-2.3";
  readonly name: string;
  readonly documentNamespace: string;
  readonly packages: readonly {
    readonly name: string;
    readonly downloadLocation: string;
    readonly filesAnalyzed: false;
  }[];
}

/** A SLSA-style provenance statement. */
export interface ProvenanceStatement {
  readonly _type: "https://in-toto.io/Statement/v1";
  readonly subject: readonly { readonly name: string; readonly digest: { readonly sha256: string } }[];
  readonly predicateType: "https://slsa.dev/provenance/v1";
  readonly predicate: {
    readonly builder: { readonly id: string };
    readonly sourceRevision: string;
    readonly dependencyInventorySha256: string;
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalInventory(dependencies: readonly DependencyEntry[]): string {
  return JSON.stringify(
    [...dependencies].sort((a, b) => a.name.localeCompare(b.name)),
  );
}

/** Builds the SPDX SBOM. */
export function buildSpdxDocument(options: {
  readonly name: string;
  readonly namespace: string;
  readonly dependencies: readonly DependencyEntry[];
}): SpdxDocument {
  return {
    spdxVersion: "SPDX-2.3",
    name: options.name,
    documentNamespace: options.namespace,
    packages: [...options.dependencies]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((dependency) => ({
        name: dependency.name,
        downloadLocation: dependency.specifier,
        filesAnalyzed: false as const,
      })),
  };
}

/** Builds the provenance statement over the artifact and inventory. */
export async function buildProvenance(options: {
  readonly artifactName: string;
  readonly artifactBytes: Uint8Array;
  readonly sourceRevision: string;
  /** In CI: the OIDC token subject; locally: an explicit identity. */
  readonly builderIdentity: string;
  readonly dependencies: readonly DependencyEntry[];
}): Promise<ProvenanceStatement> {
  return {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{
      name: options.artifactName,
      digest: { sha256: await sha256Hex(options.artifactBytes) },
    }],
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: {
      builder: { id: options.builderIdentity },
      sourceRevision: options.sourceRevision,
      dependencyInventorySha256: await sha256Hex(new TextEncoder().encode(canonicalInventory(options.dependencies))),
    },
  };
}

/** A verification outcome. */
export type AttestationVerification =
  | { readonly ok: true }
  | {
    readonly ok: false;
    readonly claim: "artifact-digest" | "source-revision" | "builder-identity" | "dependency-inventory";
    readonly detail: string;
  };

/** The clean-consumer verification: all four claims from raw inputs. */
export async function verifyAttestations(options: {
  readonly artifactBytes: Uint8Array;
  readonly provenance: ProvenanceStatement;
  readonly spdx: SpdxDocument;
  readonly expectedRevision: string;
  readonly expectedBuilder: string;
  readonly dependencies: readonly DependencyEntry[];
}): Promise<AttestationVerification> {
  const digest = await sha256Hex(options.artifactBytes);
  if (options.provenance.subject[0]?.digest.sha256 !== digest) {
    return { ok: false, claim: "artifact-digest", detail: `artifact hashes to ${digest}` };
  }
  if (options.provenance.predicate.sourceRevision !== options.expectedRevision) {
    return {
      ok: false,
      claim: "source-revision",
      detail: `provenance says ${options.provenance.predicate.sourceRevision}`,
    };
  }
  if (options.provenance.predicate.builder.id !== options.expectedBuilder) {
    return {
      ok: false,
      claim: "builder-identity",
      detail: `provenance says ${options.provenance.predicate.builder.id}`,
    };
  }
  const inventoryDigest = await sha256Hex(new TextEncoder().encode(canonicalInventory(options.dependencies)));
  if (options.provenance.predicate.dependencyInventorySha256 !== inventoryDigest) {
    return { ok: false, claim: "dependency-inventory", detail: "inventory digest mismatch" };
  }
  // The SBOM must list exactly the inventory.
  const spdxNames = options.spdx.packages.map((entry) => entry.name).sort();
  const inventoryNames = options.dependencies.map((entry) => entry.name).sort();
  if (JSON.stringify(spdxNames) !== JSON.stringify(inventoryNames)) {
    return { ok: false, claim: "dependency-inventory", detail: "SBOM packages do not match the inventory" };
  }
  return { ok: true };
}
