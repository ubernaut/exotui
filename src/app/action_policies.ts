// Copyright 2023 Im-Beast. MIT license.

// SEC-006: nothing launches on a raw string. Every outward action — opening
// a URL, a file path, or launching a command — normalizes its target first
// (percent-decoding, control stripping detection, confusable folding via
// SEC-007 skeletons), then checks the declared policy (scheme/host
// allowlists, path prefixes, command allowlists), and returns the
// NORMALIZED target for visible confirmation. Targets bearing control
// characters or confusable spoofs are rejected before any host API could
// see them.

import { confusableSkeleton } from "../unicode/confusables.ts";
import { analyzeSourceLine } from "../unicode/source_display.ts";

/** The declared policy. */
export interface ActionPolicy {
  /** URL schemes allowed (e.g. ["https", "mailto"]). */
  readonly schemes?: readonly string[];
  /** Host allowlist; subdomains of an entry are allowed. */
  readonly hosts?: readonly string[];
  /** File path prefixes allowed. */
  readonly pathPrefixes?: readonly string[];
  /** Launchable command names. */
  readonly commands?: readonly string[];
}

/** A policy verdict, carrying the normalized target for confirmation. */
export type ActionVerdict =
  | { readonly kind: "allowed"; readonly normalized: string }
  | { readonly kind: "rejected"; readonly normalized?: string; readonly reason: string };

function hasHazards(target: string): string | undefined {
  for (const char of target) {
    const codePoint = char.codePointAt(0)!;
    if (codePoint < 0x20 || codePoint === 0x7f) return "control character in target";
  }
  const findings = analyzeSourceLine(target);
  const hazard = findings.find((finding) => finding.kind === "bidi-control" || finding.kind === "invisible");
  if (hazard) return hazard.detail;
  return undefined;
}

/** The gate. */
export class ActionPolicyGate {
  readonly #policy: ActionPolicy;

  constructor(policy: ActionPolicy) {
    this.#policy = policy;
  }

  /** Checks a URL open. */
  url(raw: string): ActionVerdict {
    const hazard = hasHazards(raw);
    if (hazard) return { kind: "rejected", reason: hazard };
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return { kind: "rejected", reason: "target is not a valid URL" };
    }
    const normalized = parsed.href;
    const scheme = parsed.protocol.replace(/:$/, "");
    if (!this.#policy.schemes?.includes(scheme)) {
      return { kind: "rejected", normalized, reason: `scheme "${scheme}" is not allowed` };
    }
    if (parsed.host) {
      const host = parsed.hostname.toLowerCase();
      // The URL parser punycodes internationalized hosts, which is exactly
      // how confusable spoofs hide: an xn-- host is rejected unless that
      // exact punycode form was allowlisted deliberately.
      if (host.split(".").some((label) => label.startsWith("xn--")) && !this.#policy.hosts?.includes(host)) {
        return { kind: "rejected", normalized, reason: `host "${host}" is a punycoded (confusable-capable) name` };
      }
      if (confusableSkeleton(host) !== host) {
        return { kind: "rejected", normalized, reason: `host "${host}" contains confusable characters` };
      }
      const allowed = this.#policy.hosts?.some((entry) => host === entry || host.endsWith(`.${entry}`));
      if (!allowed) return { kind: "rejected", normalized, reason: `host "${host}" is not allowed` };
    }
    return { kind: "allowed", normalized };
  }

  /** Checks a file-path open. */
  path(raw: string): ActionVerdict {
    const hazard = hasHazards(raw);
    if (hazard) return { kind: "rejected", reason: hazard };
    // Normalize away dot segments so ../ cannot escape a prefix.
    const segments: string[] = [];
    for (const segment of raw.split("/")) {
      if (segment === "" || segment === ".") continue;
      if (segment === "..") segments.pop();
      else segments.push(segment);
    }
    const normalized = `/${segments.join("/")}`;
    const allowed = this.#policy.pathPrefixes?.some((prefix) =>
      normalized === prefix || normalized.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)
    );
    if (!allowed) return { kind: "rejected", normalized, reason: `path "${normalized}" is outside allowed prefixes` };
    return { kind: "allowed", normalized };
  }

  /** Checks a command launch. */
  command(name: string): ActionVerdict {
    const hazard = hasHazards(name);
    if (hazard) return { kind: "rejected", reason: hazard };
    const normalized = name.trim();
    if (confusableSkeleton(normalized) !== normalized) {
      return { kind: "rejected", normalized, reason: "command name contains confusable characters" };
    }
    if (!this.#policy.commands?.includes(normalized)) {
      return { kind: "rejected", normalized, reason: `command "${normalized}" is not allowlisted` };
    }
    return { kind: "allowed", normalized };
  }
}

/** Creates an action-policy gate. */
export function createActionPolicyGate(policy: ActionPolicy): ActionPolicyGate {
  return new ActionPolicyGate(policy);
}
