// Copyright 2023 Im-Beast. MIT license.

// THEM-010: themes travel as a VERSIONED JSON document with canonical
// formatting. Version 2 carries name, RGB tokens, optional THEM-003
// computed expressions, and a `requires` feature list; import validates
// strictly (unknown top-level fields fail, and a required feature this
// host does not support fails CLOSED — declared requirements are never
// ignored). Export emits canonical JSON — sorted keys, fixed indentation
// — so identical themes serialize byte-identically and export/import
// round-trips are stable. Version 1 documents (hex color strings under
// `colors`) migrate with a reviewable per-field report instead of a
// silent rewrite.

import type { ColorExpression, Rgb } from "./theme_expressions.ts";
import { compileThemeExpressions } from "./theme_expressions.ts";

/** Current interchange version. */
export const THEME_INTERCHANGE_VERSION = 2 as const;

/** Features this host can honor in a document's `requires` list. */
export const SUPPORTED_THEME_FEATURES: readonly string[] = ["computed-tokens", "namespaced-tokens"];

/** The v2 document. */
export interface ThemeDocument {
  readonly version: typeof THEME_INTERCHANGE_VERSION;
  readonly name: string;
  readonly tokens: Readonly<Record<string, Rgb>>;
  readonly computed?: Readonly<Record<string, ColorExpression>>;
  readonly requires?: readonly string[];
}

/** Typed interchange failure. */
export class ThemeInterchangeError extends Error {
  constructor(message: string, readonly path = "$") {
    super(`${message} at ${path}`);
    this.name = "ThemeInterchangeError";
  }
}

/** One migration report entry. */
export interface ThemeMigrationEntry {
  readonly field: string;
  readonly action: "renamed" | "converted" | "defaulted" | "dropped";
  readonly detail: string;
}

const V2_FIELDS = new Set(["version", "name", "tokens", "computed", "requires"]);

function isRgb(value: unknown): value is Rgb {
  return Array.isArray(value) && value.length === 3 &&
    value.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255);
}

/** Validates one parsed v2 document; fails closed on the unknown. */
export function validateThemeDocument(value: unknown): ThemeDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ThemeInterchangeError("theme document must be an object");
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!V2_FIELDS.has(key)) throw new ThemeInterchangeError(`unknown field "${key}"`);
  }
  if (record.version !== THEME_INTERCHANGE_VERSION) {
    throw new ThemeInterchangeError(
      `version must be ${THEME_INTERCHANGE_VERSION} (migrate older documents first)`,
      "$.version",
    );
  }
  if (typeof record.name !== "string" || record.name.length === 0) {
    throw new ThemeInterchangeError("name must be a non-empty string", "$.name");
  }
  const tokensRaw = record.tokens;
  if (typeof tokensRaw !== "object" || tokensRaw === null) {
    throw new ThemeInterchangeError("tokens must be an object", "$.tokens");
  }
  const tokens: Record<string, Rgb> = {};
  for (const [token, rgb] of Object.entries(tokensRaw as Record<string, unknown>)) {
    if (!isRgb(rgb)) throw new ThemeInterchangeError("token must be [r,g,b] 0-255", `$.tokens.${token}`);
    tokens[token] = rgb;
  }
  const requires = record.requires === undefined ? [] : record.requires;
  if (!Array.isArray(requires) || requires.some((entry) => typeof entry !== "string")) {
    throw new ThemeInterchangeError("requires must be a string array", "$.requires");
  }
  // Fail CLOSED: a requirement this host cannot honor rejects the import.
  const unsupported = (requires as string[]).filter((feature) => !SUPPORTED_THEME_FEATURES.includes(feature));
  if (unsupported.length > 0) {
    throw new ThemeInterchangeError(`unsupported required feature(s): ${unsupported.join(", ")}`, "$.requires");
  }
  const computed = record.computed as Record<string, ColorExpression> | undefined;
  if (computed !== undefined) {
    // THEM-003 compilation IS the validation for computed expressions.
    compileThemeExpressions(tokens, computed);
  }
  return {
    version: THEME_INTERCHANGE_VERSION,
    name: record.name,
    tokens,
    ...(computed !== undefined ? { computed } : {}),
    ...(requires.length > 0 ? { requires: requires as string[] } : {}),
  };
}

/** Parses one JSON document (v2 only; migrate first for older). */
export function importThemeDocument(json: string): ThemeDocument {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new ThemeInterchangeError("theme JSON is invalid");
  }
  return validateThemeDocument(value);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Exports canonical JSON: sorted keys, two-space indentation, stable. */
export function exportThemeDocument(document: ThemeDocument): string {
  return JSON.stringify(canonical(validateThemeDocument(document)), null, 2);
}

/** Migrates a v1 document (hex `colors`) to v2 with a report. */
export function migrateThemeDocument(
  value: unknown,
): { document: ThemeDocument; report: readonly ThemeMigrationEntry[] } {
  const record = value as Record<string, unknown>;
  if (record?.version === THEME_INTERCHANGE_VERSION) {
    return { document: validateThemeDocument(value), report: [] };
  }
  if (record?.version !== 1) {
    throw new ThemeInterchangeError(`cannot migrate version ${String(record?.version)}`, "$.version");
  }
  const report: ThemeMigrationEntry[] = [];
  const colors = (record.colors ?? {}) as Record<string, unknown>;
  const tokens: Record<string, Rgb> = {};
  for (const [token, hex] of Object.entries(colors)) {
    const match = typeof hex === "string" ? /^#([0-9a-fA-F]{6})$/.exec(hex) : null;
    if (!match) {
      report.push({ field: `colors.${token}`, action: "dropped", detail: `not a #rrggbb color: ${String(hex)}` });
      continue;
    }
    const packed = parseInt(match[1]!, 16);
    tokens[token] = [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
    report.push({ field: `colors.${token}`, action: "converted", detail: `${hex} -> [${tokens[token]!.join(", ")}]` });
  }
  report.push({ field: "colors", action: "renamed", detail: "colors -> tokens" });
  const name = typeof record.name === "string" && record.name.length > 0 ? record.name : "migrated-theme";
  if (name === "migrated-theme") {
    report.push({ field: "name", action: "defaulted", detail: 'missing name defaulted to "migrated-theme"' });
  }
  const document = validateThemeDocument({ version: THEME_INTERCHANGE_VERSION, name, tokens });
  return { document, report };
}
