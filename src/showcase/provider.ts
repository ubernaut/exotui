// Copyright 2023 Im-Beast. MIT license.

import type { DiagnosticSeverity } from "../../mod.ts";
import type { ShowcaseManifest } from "./manifest.ts";

/** Provider capability health advertised before activation. */
export type ShowcaseCapabilityStatus = "available" | "degraded" | "unavailable";

/** One static provider capability. */
export interface ShowcaseProviderCapability {
  readonly id: string;
  readonly status: ShowcaseCapabilityStatus;
  readonly reason?: string;
}

/** Content-safe diagnostic input available to showcase providers. */
export interface ShowcaseProviderDiagnosticInput {
  readonly code: string;
  readonly severity?: DiagnosticSeverity;
}

/** Restricted reporter that prevents providers from placing arbitrary content in shared diagnostics. */
export interface ShowcaseDiagnosticReporter {
  report(input: ShowcaseProviderDiagnosticInput): void;
}

/** Context passed exactly once when a provider passes preflight. */
export interface ShowcaseProviderActivationContext {
  readonly signal: AbortSignal;
  readonly diagnostics: ShowcaseDiagnosticReporter;
}

/** Successful provider activation health. */
export interface ShowcaseProviderActivationResult {
  readonly status: "ready" | "degraded";
  readonly message?: string;
}

/** Fixture or production provider boundary consumed by the shared kernel. */
export interface ShowcaseProvider {
  readonly id: string;
  readonly label: string;
  readonly capabilities: readonly ShowcaseProviderCapability[];
  activate(
    context: ShowcaseProviderActivationContext,
  ): ShowcaseProviderActivationResult | Promise<ShowcaseProviderActivationResult>;
  dispose(): void | Promise<void>;
}

/** Provider lifecycle exposed without leaking provider errors or data. */
export type ShowcaseProviderStatus =
  | "inactive"
  | "blocked"
  | "activating"
  | "ready"
  | "degraded"
  | "failed"
  | "disposed";

/** Clone-safe result of comparing a manifest with static provider capabilities. */
export interface ShowcaseProviderPreflight {
  readonly ok: boolean;
  readonly degraded: boolean;
  readonly missingRequired: readonly string[];
  readonly unavailableRequired: readonly string[];
  readonly degradedCapabilities: readonly string[];
  readonly optionalUnavailable: readonly string[];
  readonly capabilities: readonly Readonly<{ id: string; status: ShowcaseCapabilityStatus }>[];
}

/** Purely compares declared requirements with static provider capability status. */
export function preflightShowcaseProvider(
  manifest: ShowcaseManifest,
  provider: Pick<ShowcaseProvider, "capabilities">,
): ShowcaseProviderPreflight {
  const capabilities = normalizeCapabilities(provider.capabilities);
  const byId = new Map(capabilities.map((capability) => [capability.id, capability.status]));
  const missingRequired: string[] = [];
  const unavailableRequired: string[] = [];
  for (const id of manifest.requiredCapabilities) {
    const status = byId.get(id);
    if (status === undefined) missingRequired.push(id);
    else if (status === "unavailable") unavailableRequired.push(id);
  }
  const degradedCapabilities = capabilities
    .filter((capability) => capability.status === "degraded")
    .map((capability) => capability.id);
  const optionalUnavailable = manifest.optionalCapabilities.filter((id) => {
    const status = byId.get(id);
    return status === undefined || status === "unavailable";
  });
  const ok = missingRequired.length === 0 && unavailableRequired.length === 0;
  return Object.freeze({
    ok,
    degraded: ok && (degradedCapabilities.length > 0 || optionalUnavailable.length > 0),
    missingRequired: Object.freeze(missingRequired),
    unavailableRequired: Object.freeze(unavailableRequired),
    degradedCapabilities: Object.freeze(degradedCapabilities),
    optionalUnavailable: Object.freeze(optionalUnavailable),
    capabilities: Object.freeze(capabilities),
  });
}

function normalizeCapabilities(
  input: readonly ShowcaseProviderCapability[],
): Readonly<{ id: string; status: ShowcaseCapabilityStatus }>[] {
  if (
    !Array.isArray(input) || input.length > 256 || Object.getOwnPropertySymbols(input).length > 0 ||
    Object.getOwnPropertyNames(input).length !== input.length + 1
  ) {
    throw new TypeError("Invalid showcase provider capabilities.");
  }
  const seen = new Set<string>();
  const output: Readonly<{ id: string; status: ShowcaseCapabilityStatus }>[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const arrayDescriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!arrayDescriptor?.enumerable || !("value" in arrayDescriptor)) {
      throw new TypeError("Invalid showcase provider capability.");
    }
    const capability = arrayDescriptor.value as unknown;
    if (!capability || typeof capability !== "object" || Array.isArray(capability)) {
      throw new TypeError("Invalid showcase provider capability.");
    }
    const prototype = Object.getPrototypeOf(capability);
    if (prototype !== Object.prototype && prototype !== null || Object.getOwnPropertySymbols(capability).length > 0) {
      throw new TypeError("Invalid showcase provider capability.");
    }
    const values: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(capability)) {
      const descriptor = Object.getOwnPropertyDescriptor(capability, key);
      if (
        !descriptor?.enumerable || !("value" in descriptor) ||
        (key !== "id" && key !== "status" && key !== "reason")
      ) {
        throw new TypeError("Invalid showcase provider capability.");
      }
      values[key] = descriptor.value;
    }
    const id = values.id;
    if (typeof id !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/.test(id) || seen.has(id)) {
      throw new TypeError("Invalid showcase provider capability id.");
    }
    const status = values.status;
    if (status !== "available" && status !== "degraded" && status !== "unavailable") {
      throw new TypeError("Invalid showcase provider capability status.");
    }
    if (values.reason !== undefined && (typeof values.reason !== "string" || values.reason.length > 512)) {
      throw new TypeError("Invalid showcase provider capability reason.");
    }
    seen.add(id);
    output.push(Object.freeze({ id, status }));
  }
  return output;
}
