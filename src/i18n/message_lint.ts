// Copyright 2023 Im-Beast. MIT license.

// LOC-008: extraction and validation tooling for message catalogs. Usages
// extract from source text by the documented call conventions with line
// numbers attached; the linter then cross-checks usages against bundles —
// missing keys, stale keys, parameter-shape drift (call site vs message,
// and locale vs locale), invalid messages (which covers non-exhaustive
// selectors: a matcher without `*` fails compilation), and untranslated
// defaults — every finding carrying its source location so CI output is
// actionable and parameter drift is a hard failure.

import { analyzeMessageFormat, MessageFormatFunctionRegistry } from "./message_format.ts";
import type { MessageBundleChunk } from "./messages.ts";

/** One extracted call site. */
export interface MessageUsage {
  readonly namespace: string;
  readonly key: string;
  /** Parameter names the call site passes. */
  readonly parameters: readonly string[];
  readonly source: { readonly file: string; readonly line: number };
}

/** One lint finding. */
export interface MessageLintFinding {
  readonly kind:
    | "missing-key"
    | "stale-key"
    | "parameter-drift"
    | "invalid-message"
    | "untranslated-default";
  readonly namespace: string;
  readonly key?: string;
  readonly locale?: string;
  readonly detail: string;
  readonly source?: { readonly file: string; readonly line: number };
}

/**
 * Extracts message usages from source text. Recognized conventions:
 * `t("namespace:key", { a, b: value })` and `resolve("namespace", "key")`.
 */
export function extractMessageUsages(source: string, file: string): MessageUsage[] {
  const usages: MessageUsage[] = [];
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    for (const match of line.matchAll(/\bt\(\s*"([\w.-]+):([\w.-]+)"\s*(?:,\s*\{([^}]*)\})?/g)) {
      const parameters = (match[3] ?? "")
        .split(",")
        .map((entry) => entry.split(":")[0]!.trim())
        .filter((name) => /^[\w$]+$/.test(name));
      usages.push({
        namespace: match[1]!,
        key: match[2]!,
        parameters: parameters.sort(),
        source: { file, line: index + 1 },
      });
    }
    for (const match of line.matchAll(/\bresolve\(\s*"([\w.-]+)"\s*,\s*"([\w.-]+)"\s*\)/g)) {
      usages.push({ namespace: match[1]!, key: match[2]!, parameters: [], source: { file, line: index + 1 } });
    }
  }
  return usages;
}

/** Options for a lint run. */
export interface MessageLintOptions {
  readonly usages: readonly MessageUsage[];
  readonly bundles: readonly MessageBundleChunk[];
  readonly defaultLocale: string;
  readonly registry?: MessageFormatFunctionRegistry;
}

/** Cross-checks usages and bundles; deterministic finding order. */
export function lintMessages(options: MessageLintOptions): MessageLintFinding[] {
  const registry = options.registry ?? new MessageFormatFunctionRegistry();
  const findings: MessageLintFinding[] = [];
  /** namespace → locale → key → message */
  const catalog = new Map<string, Map<string, Map<string, string>>>();
  for (const bundle of options.bundles) {
    const locales = catalog.get(bundle.namespace) ?? new Map<string, Map<string, string>>();
    catalog.set(bundle.namespace, locales);
    const keys = locales.get(bundle.locale) ?? new Map<string, string>();
    locales.set(bundle.locale, keys);
    for (const [key, message] of Object.entries(bundle.messages)) keys.set(key, message);
  }

  // Message validity and cross-locale parameter drift.
  for (const [namespace, locales] of catalog) {
    const defaults = locales.get(options.defaultLocale);
    for (const [locale, keys] of locales) {
      for (const [key, message] of keys) {
        const analysis = analyzeMessageFormat(message, registry);
        if (analysis.error) {
          findings.push({ kind: "invalid-message", namespace, key, locale, detail: analysis.error });
          continue;
        }
        if (locale !== options.defaultLocale && defaults?.has(key)) {
          const reference = analyzeMessageFormat(defaults.get(key)!, registry);
          if (!reference.error && reference.externalVariables.join(",") !== analysis.externalVariables.join(",")) {
            findings.push({
              kind: "parameter-drift",
              namespace,
              key,
              locale,
              detail: `locale "${locale}" needs [${
                analysis.externalVariables.join(", ")
              }] but "${options.defaultLocale}" defines [${reference.externalVariables.join(", ")}]`,
            });
          }
          if (defaults.get(key) === message) {
            findings.push({
              kind: "untranslated-default",
              namespace,
              key,
              locale,
              detail: `identical to the "${options.defaultLocale}" text`,
            });
          }
        }
      }
    }
  }

  // Usage-side checks against the default locale.
  const used = new Set<string>();
  for (const usage of options.usages) {
    used.add(`${usage.namespace} ${usage.key}`);
    const message = catalog.get(usage.namespace)?.get(options.defaultLocale)?.get(usage.key);
    if (message === undefined) {
      findings.push({
        kind: "missing-key",
        namespace: usage.namespace,
        key: usage.key,
        detail: `no "${options.defaultLocale}" message for a used key`,
        source: usage.source,
      });
      continue;
    }
    const analysis = analyzeMessageFormat(message, registry);
    if (analysis.error) continue; // already reported as invalid-message
    const wanted = analysis.externalVariables.join(",");
    const passed = [...usage.parameters].sort().join(",");
    if (wanted !== passed) {
      findings.push({
        kind: "parameter-drift",
        namespace: usage.namespace,
        key: usage.key,
        detail: `call passes [${passed}] but the message needs [${wanted}]`,
        source: usage.source,
      });
    }
  }

  // Stale keys: defined in the default locale, used nowhere.
  for (const [namespace, locales] of catalog) {
    for (const key of locales.get(options.defaultLocale)?.keys() ?? []) {
      if (!used.has(`${namespace} ${key}`)) {
        findings.push({ kind: "stale-key", namespace, key, detail: "defined but never used" });
      }
    }
  }
  return findings;
}
