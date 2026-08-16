// Copyright 2023 Im-Beast. MIT license.

// REM-003: transport security is a POLICY decision made before any remote
// traffic, not a property assumed of the socket. A transport candidate
// describes itself (scheme, TLS verification state, peer identity,
// optional channel binding); the production policy accepts only encrypted
// transports whose certificate verification actually ran — plaintext,
// unverified, or self-described-but-unproven transports are rejected with
// the reason named. Tests install an explicit fake by constructing a
// policy with `allowFakeTransports: true` and marking the candidate as a
// fake — there is no environment sniffing and no silent downgrade path.
// Accepted transports yield verified identity/channel-binding metadata
// the host can display and pin.

/** What a transport candidate claims about itself. */
export interface TransportCandidate {
  /** Connection scheme, e.g. "wss", "tls", "ws", "tcp". */
  readonly scheme: string;
  /** Did the TLS layer verify the peer certificate chain? */
  readonly tlsVerified?: boolean;
  /** Verified peer identity (subject / SAN) when tlsVerified. */
  readonly peerIdentity?: string;
  /** SHA-256 of the peer certificate, lowercase hex, when available. */
  readonly certificateSha256?: string;
  /** RFC 5929-style channel-binding token, when the stack exposes one. */
  readonly channelBinding?: string;
  /** Explicit test-only marker for fakes. */
  readonly fake?: boolean;
}

/** Metadata the host receives for an ACCEPTED transport. */
export interface VerifiedTransportIdentity {
  readonly scheme: string;
  readonly peerIdentity: string;
  readonly certificateSha256?: string;
  readonly channelBinding?: string;
  /** true only for explicitly installed test fakes. */
  readonly fake: boolean;
}

/** A policy verdict. */
export type TransportVerdict =
  | { readonly accepted: true; readonly identity: VerifiedTransportIdentity }
  | { readonly accepted: false; readonly reason: string };

/** Policy options. */
export interface TransportPolicyOptions {
  /** Explicit test hatch; production hosts leave this off. */
  readonly allowFakeTransports?: boolean;
  /** Optional pin: accepted certificates must match one of these. */
  readonly pinnedCertificates?: readonly string[];
}

const ENCRYPTED_SCHEMES = new Set(["wss", "tls", "https", "quic"]);

/** The secure-transport policy. */
export class SecureTransportPolicy {
  readonly #allowFakes: boolean;
  readonly #pins?: ReadonlySet<string>;

  constructor(options: TransportPolicyOptions = {}) {
    this.#allowFakes = options.allowFakeTransports ?? false;
    this.#pins = options.pinnedCertificates
      ? new Set(options.pinnedCertificates.map((pin) => pin.toLowerCase()))
      : undefined;
  }

  /** Judges one candidate. Rejections always name the reason. */
  evaluate(candidate: TransportCandidate): TransportVerdict {
    if (candidate.fake) {
      if (!this.#allowFakes) {
        return { accepted: false, reason: "fake transports are not allowed by this policy" };
      }
      return {
        accepted: true,
        identity: {
          scheme: candidate.scheme,
          peerIdentity: candidate.peerIdentity ?? "fake-peer",
          certificateSha256: candidate.certificateSha256,
          channelBinding: candidate.channelBinding,
          fake: true,
        },
      };
    }
    if (!ENCRYPTED_SCHEMES.has(candidate.scheme)) {
      return { accepted: false, reason: `scheme "${candidate.scheme}" is plaintext or unknown` };
    }
    if (candidate.tlsVerified !== true) {
      return { accepted: false, reason: "peer certificate verification did not run or failed" };
    }
    if (!candidate.peerIdentity) {
      return { accepted: false, reason: "verified transport carries no peer identity" };
    }
    if (this.#pins) {
      const fingerprint = candidate.certificateSha256?.toLowerCase();
      if (!fingerprint || !this.#pins.has(fingerprint)) {
        return { accepted: false, reason: "peer certificate does not match a pinned fingerprint" };
      }
    }
    return {
      accepted: true,
      identity: {
        scheme: candidate.scheme,
        peerIdentity: candidate.peerIdentity,
        certificateSha256: candidate.certificateSha256?.toLowerCase(),
        channelBinding: candidate.channelBinding,
        fake: false,
      },
    };
  }
}

/** Creates the production policy (no fakes). */
export function createSecureTransportPolicy(options: TransportPolicyOptions = {}): SecureTransportPolicy {
  return new SecureTransportPolicy(options);
}
