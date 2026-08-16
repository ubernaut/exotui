// Copyright 2023 Im-Beast. MIT license.

// SEC-010: verify BEFORE parse. Every fetched bundle, theme, plugin, or
// cached artifact carries a host-supplied expectation — a SHA-256 digest
// and/or a signature the host's verifier vouches for — and the gate hands
// back the bytes only after the expectation holds. A mismatch is a typed
// failure naming what diverged; there is no code path that returns the
// content anyway, so unsigned fallback cannot happen silently — a host
// that wants it must call `acceptUnverified` explicitly, which brands the
// result as unverified.

/** What the host expects of an artifact. */
export interface IntegrityExpectation {
  /** Lowercase hex SHA-256 of the exact bytes. */
  readonly sha256?: string;
  /** Opaque signature checked by the host-supplied verifier. */
  readonly signature?: string;
}

/** A host-supplied signature verifier (Ed25519, minisign, whatever). */
export type SignatureVerifier = (bytes: Uint8Array, signature: string) => boolean | Promise<boolean>;

/** A verification outcome. */
export type IntegrityResult =
  | { readonly kind: "verified"; readonly bytes: Uint8Array; readonly sha256: string }
  | { readonly kind: "unverified"; readonly bytes: Uint8Array }
  | {
    readonly kind: "mismatch";
    readonly field: "sha256" | "signature";
    readonly expected: string;
    readonly actual: string;
  }
  | { readonly kind: "no-expectation" };

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The verification gate. */
export class ContentIntegrityGate {
  readonly #verifier?: SignatureVerifier;

  constructor(options: { readonly verifier?: SignatureVerifier } = {}) {
    this.#verifier = options.verifier;
  }

  /**
   * Verifies bytes against the expectation. The bytes are only reachable
   * through a "verified" result; mismatches carry the divergence instead.
   * An empty expectation is its own failure — absence of a pin is never
   * treated as a pass.
   */
  async verify(bytes: Uint8Array, expectation: IntegrityExpectation): Promise<IntegrityResult> {
    if (expectation.sha256 === undefined && expectation.signature === undefined) {
      return { kind: "no-expectation" };
    }
    const actual = await sha256Hex(bytes);
    if (expectation.sha256 !== undefined && actual !== expectation.sha256.toLowerCase()) {
      return { kind: "mismatch", field: "sha256", expected: expectation.sha256.toLowerCase(), actual };
    }
    if (expectation.signature !== undefined) {
      if (!this.#verifier) {
        return {
          kind: "mismatch",
          field: "signature",
          expected: expectation.signature,
          actual: "no verifier installed",
        };
      }
      const valid = await this.#verifier(bytes, expectation.signature);
      if (!valid) {
        return { kind: "mismatch", field: "signature", expected: expectation.signature, actual: "verification failed" };
      }
    }
    return { kind: "verified", bytes, sha256: actual };
  }

  /**
   * The ONLY unsigned path, and it is explicit: the host names the reason
   * and receives a result branded "unverified" that downstream loaders can
   * refuse.
   */
  acceptUnverified(bytes: Uint8Array, reason: string): IntegrityResult {
    if (reason.trim() === "") throw new TypeError("acceptUnverified requires a stated reason");
    return { kind: "unverified", bytes };
  }
}

/** Creates a content-integrity gate. */
export function createContentIntegrityGate(
  options: { readonly verifier?: SignatureVerifier } = {},
): ContentIntegrityGate {
  return new ContentIntegrityGate(options);
}
