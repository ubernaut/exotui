// Copyright 2023 Im-Beast. MIT license.

// PLG-002: choosing a plugin version is a DETERMINISTIC, explainable
// decision. Every candidate is judged against the host's API version
// (via the PLG-001 range matcher) and the host's offered feature set;
// among compatible candidates the highest version wins, ties broken by
// declaration order — but an incompatible candidate can never win by
// being newest, because compatibility filters BEFORE ranking. Rejections
// are per-candidate explanations (which check failed and why), so "no
// version selected" always says what to fix.

import { hostApiSatisfies } from "./plugin_manifest.ts";

/** One installable candidate version. */
export interface PluginCandidate {
  readonly id: string;
  /** Exact semver of this candidate. */
  readonly version: string;
  /** Host-API range the candidate requires. */
  readonly hostApi: string;
  /** Host feature flags the candidate requires. */
  readonly requiredFeatures?: readonly string[];
}

/** The host environment resolution runs against. */
export interface HostEnvironment {
  readonly apiVersion: string;
  readonly features: readonly string[];
}

/** One rejected candidate with its explanation. */
export interface CandidateRejection {
  readonly version: string;
  readonly reason: string;
}

/** The resolution outcome. */
export type CompatResolution =
  | { readonly ok: true; readonly selected: PluginCandidate; readonly rejected: readonly CandidateRejection[] }
  | { readonly ok: false; readonly rejected: readonly CandidateRejection[] };

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

/** Resolves the best compatible candidate deterministically. */
export function resolvePluginCompatibility(
  candidates: readonly PluginCandidate[],
  host: HostEnvironment,
): CompatResolution {
  const rejected: CandidateRejection[] = [];
  const compatible: PluginCandidate[] = [];
  const hostFeatures = new Set(host.features);

  for (const candidate of candidates) {
    if (!hostApiSatisfies(candidate.hostApi, host.apiVersion)) {
      rejected.push({
        version: candidate.version,
        reason: `requires host API ${candidate.hostApi}, host is ${host.apiVersion}`,
      });
      continue;
    }
    const missing = (candidate.requiredFeatures ?? []).filter((feature) => !hostFeatures.has(feature));
    if (missing.length > 0) {
      rejected.push({
        version: candidate.version,
        reason: `missing host feature(s): ${missing.join(", ")}`,
      });
      continue;
    }
    compatible.push(candidate);
  }

  if (compatible.length === 0) return { ok: false, rejected };
  // Compatibility filtered FIRST; only then does "newest" rank. Stable
  // sort keeps declaration order for equal versions.
  const selected = [...compatible].sort((a, b) => compareVersions(b.version, a.version))[0]!;
  return { ok: true, selected, rejected };
}
