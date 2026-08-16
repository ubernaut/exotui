// Copyright 2023 Im-Beast. MIT license.

// PLG-001: the versioned plugin manifest — pure data, validated WITHOUT
// importing plugin code. Identity, package semver, host-API range,
// entrypoints, contributions, SEC-001 permission requirements, and a
// bounded state schema all parse from JSON through strict field checks;
// the host compares its own API version against the declared range with a
// small exact/caret/tilde semver matcher before any entrypoint is ever
// resolved.

import {
  createRuntimePermissionManifest,
  type RuntimePermissionManifest,
  type RuntimePermissionRequirement,
} from "../permissions.ts";

/** Current manifest schema version. */
export const PLUGIN_MANIFEST_SCHEMA_VERSION = 1 as const;

/** Declared contributions by kind. */
export interface PluginContributions {
  readonly commands: readonly string[];
  readonly slots: readonly string[];
  readonly routes: readonly string[];
  readonly themes: readonly string[];
}

/** Bounded state-schema field kinds. */
export type PluginStateFieldKind = "string" | "number" | "boolean" | "json";

/** The validated manifest. */
export interface PluginManifest {
  readonly schemaVersion: typeof PLUGIN_MANIFEST_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  /** Host API range: exact `1.2.3`, caret `^1.2.3`, or tilde `~1.2.3`. */
  readonly hostApi: string;
  readonly entrypoints: { readonly main: string; readonly worker?: string };
  readonly contributions: PluginContributions;
  readonly permissions: RuntimePermissionManifest;
  readonly stateSchema: Readonly<Record<string, PluginStateFieldKind>>;
}

/** Typed manifest validation failure. */
export class PluginManifestError extends Error {
  constructor(message: string, readonly path = "$") {
    super(`${message} at ${path}`);
    this.name = "PluginManifestError";
  }
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const RANGE_PATTERN = /^([\^~]?)(\d+)\.(\d+)\.(\d+)$/;
const STATE_KINDS = new Set<string>(["string", "number", "boolean", "json"]);

function parseSemver(version: string): [number, number, number] | undefined {
  const match = SEMVER_PATTERN.exec(version);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Does a host API version satisfy a manifest range? */
export function hostApiSatisfies(range: string, hostVersion: string): boolean {
  const host = parseSemver(hostVersion);
  const match = RANGE_PATTERN.exec(range);
  if (!host || !match) return false;
  const [_, operator, majorRaw, minorRaw, patchRaw] = match;
  const wanted: [number, number, number] = [Number(majorRaw), Number(minorRaw), Number(patchRaw)];
  const atLeast = host[0] > wanted[0] ||
    (host[0] === wanted[0] && (host[1] > wanted[1] || (host[1] === wanted[1] && host[2] >= wanted[2])));
  if (operator === "^") return host[0] === wanted[0] && atLeast;
  if (operator === "~") return host[0] === wanted[0] && host[1] === wanted[1] && host[2] >= wanted[2];
  return host[0] === wanted[0] && host[1] === wanted[1] && host[2] === wanted[2];
}

function stringField(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new PluginManifestError("must be a non-empty string", path);
  }
  return value;
}

function stringList(value: unknown, path: string, maxEntries = 128): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxEntries) {
    throw new PluginManifestError(`must be an array of at most ${maxEntries} strings`, path);
  }
  return value.map((entry, index) => stringField(entry, `${path}[${index}]`));
}

/** Validates one manifest value (already-parsed JSON). */
export function validatePluginManifest(value: unknown): PluginManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PluginManifestError("manifest must be an object");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([
    "schemaVersion",
    "id",
    "version",
    "hostApi",
    "entrypoints",
    "contributions",
    "permissions",
    "stateSchema",
  ]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new PluginManifestError(`unknown field "${key}"`);
  }
  if (record.schemaVersion !== PLUGIN_MANIFEST_SCHEMA_VERSION) {
    throw new PluginManifestError(`schemaVersion must be ${PLUGIN_MANIFEST_SCHEMA_VERSION}`, "$.schemaVersion");
  }
  const id = stringField(record.id, "$.id");
  if (!ID_PATTERN.test(id)) throw new PluginManifestError("id must be a stable lowercase identifier", "$.id");
  const version = stringField(record.version, "$.version");
  if (!parseSemver(version)) throw new PluginManifestError("version must be exact semver", "$.version");
  const hostApi = stringField(record.hostApi, "$.hostApi");
  if (!RANGE_PATTERN.test(hostApi)) {
    throw new PluginManifestError("hostApi must be exact, ^, or ~ semver", "$.hostApi");
  }

  const entrypointsRaw = record.entrypoints;
  if (typeof entrypointsRaw !== "object" || entrypointsRaw === null) {
    throw new PluginManifestError("entrypoints must be an object", "$.entrypoints");
  }
  const entrypoints = entrypointsRaw as Record<string, unknown>;
  for (const key of Object.keys(entrypoints)) {
    if (key !== "main" && key !== "worker") {
      throw new PluginManifestError(`unknown entrypoint "${key}"`, "$.entrypoints");
    }
  }
  const main = stringField(entrypoints.main, "$.entrypoints.main");
  for (const [name, path] of [["main", main], ["worker", entrypoints.worker]] as const) {
    if (path === undefined) continue;
    const entry = stringField(path, `$.entrypoints.${name}`);
    // Entrypoints must stay inside the plugin package.
    if (entry.startsWith("/") || entry.includes("..") || /^[a-z]+:/.test(entry)) {
      throw new PluginManifestError("entrypoint must be a relative in-package path", `$.entrypoints.${name}`);
    }
  }

  const contributionsRaw = (record.contributions ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(contributionsRaw)) {
    if (!["commands", "slots", "routes", "themes"].includes(key)) {
      throw new PluginManifestError(`unknown contribution kind "${key}"`, "$.contributions");
    }
  }
  const contributions: PluginContributions = {
    commands: stringList(contributionsRaw.commands, "$.contributions.commands"),
    slots: stringList(contributionsRaw.slots, "$.contributions.slots"),
    routes: stringList(contributionsRaw.routes, "$.contributions.routes"),
    themes: stringList(contributionsRaw.themes, "$.contributions.themes"),
  };

  const permissionsRaw = (record.permissions ?? {}) as {
    required?: readonly RuntimePermissionRequirement[];
    optional?: readonly RuntimePermissionRequirement[];
  };
  const permissions = createRuntimePermissionManifest({
    adapterId: id,
    required: permissionsRaw.required,
    optional: permissionsRaw.optional,
  });

  const stateRaw = (record.stateSchema ?? {}) as Record<string, unknown>;
  const stateEntries = Object.entries(stateRaw);
  if (stateEntries.length > 256) {
    throw new PluginManifestError("stateSchema exceeds 256 fields", "$.stateSchema");
  }
  const stateSchema: Record<string, PluginStateFieldKind> = {};
  for (const [key, kind] of stateEntries) {
    if (typeof kind !== "string" || !STATE_KINDS.has(kind)) {
      throw new PluginManifestError(
        `state field kind must be one of string/number/boolean/json`,
        `$.stateSchema.${key}`,
      );
    }
    stateSchema[key] = kind as PluginStateFieldKind;
  }

  return Object.freeze({
    schemaVersion: PLUGIN_MANIFEST_SCHEMA_VERSION,
    id,
    version,
    hostApi,
    entrypoints: Object.freeze({
      main,
      ...(entrypoints.worker !== undefined ? { worker: entrypoints.worker as string } : {}),
    }),
    contributions: Object.freeze(contributions),
    permissions,
    stateSchema: Object.freeze(stateSchema),
  });
}

/** Parses and validates one manifest JSON document. */
export function parsePluginManifest(json: string): PluginManifest {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new PluginManifestError("manifest JSON is invalid");
  }
  return validatePluginManifest(value);
}
