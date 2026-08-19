import { type ApiStabilityTier, type PackageEntrypointManifest, packageEntrypoints } from "../src/api_stability.ts";
import { apiStabilityTiers, createApiInventory } from "./api_inventory.ts";
import { parse as parseJsonc } from "jsonc";

export interface PackageExportValidation {
  ok: boolean;
  missingExports: string[];
  mismatchedExports: Array<{ specifier: string; expected: string; actual: string }>;
  unexpectedExports: string[];
  missingFiles: string[];
  byStability: Record<ApiStabilityTier, PackageExportStabilityValidation>;
}

export interface PackageMetadataValidation {
  ok: boolean;
  name?: string;
  version?: string;
  expectedName: string;
  invalidName: boolean;
  invalidVersion: boolean;
  invalidPublishIncludes: boolean;
  missingPublishIncludes: string[];
  unexpectedPublishIncludes: string[];
}

export interface PackageExportStabilityValidation {
  stability: ApiStabilityTier;
  ok: boolean;
  missingExports: string[];
  mismatchedExports: Array<{ specifier: string; expected: string; actual: string }>;
  missingFiles: string[];
}

export interface StableDemoExportValidation {
  ok: boolean;
  legacyAllowedModules: string[];
  unexpectedModules: string[];
}

export interface StableAppExportValidation {
  ok: boolean;
  legacyAllowedModules: string[];
  unexpectedModules: string[];
  staleAllowedModules: string[];
}

export interface StableAppExportPolicy {
  description?: string;
  legacyAllowedModules: string[];
}

type PackageConfig = {
  name?: unknown;
  version?: unknown;
  exports?: string | Record<string, string>;
  publish?: {
    include?: unknown;
  };
};

export const STABLE_APP_EXPORT_POLICY_PATH = "docs/api-stable-app-modules.json";
export const PACKAGE_NAME = "@ubernaut/exotui";
export const PACKAGE_PUBLISH_INCLUDES = [
  "CHANGELOG.md",
  "LICENSE.md",
  "README.md",
  "mod*.ts",
  "src/**/*.ts",
] as const;

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function validatePackageMetadata(
  config: PackageConfig,
  options: { expectedName?: string; expectedPublishIncludes?: readonly string[] } = {},
): PackageMetadataValidation {
  const expectedName = options.expectedName ?? PACKAGE_NAME;
  const expectedPublishIncludes = [...(options.expectedPublishIncludes ?? PACKAGE_PUBLISH_INCLUDES)].sort();
  const name = typeof config.name === "string" ? config.name : undefined;
  const version = typeof config.version === "string" ? config.version : undefined;
  const rawInclude = config.publish?.include;
  const include = Array.isArray(rawInclude)
    ? rawInclude.filter((entry): entry is string => typeof entry === "string").sort()
    : [];
  const expected = new Set(expectedPublishIncludes);
  const actual = new Set(include);
  const missingPublishIncludes = expectedPublishIncludes.filter((entry) => !actual.has(entry));
  const unexpectedPublishIncludes = include.filter((entry) => !expected.has(entry));
  const invalidName = name !== expectedName;
  const invalidVersion = version === undefined || !SEMVER_PATTERN.test(version);
  const invalidPublishIncludes = !Array.isArray(rawInclude) ||
    rawInclude.some((entry) => typeof entry !== "string") ||
    new Set(include).size !== include.length;

  return {
    ok: !invalidName && !invalidVersion && !invalidPublishIncludes &&
      missingPublishIncludes.length === 0 && unexpectedPublishIncludes.length === 0,
    name,
    version,
    expectedName,
    invalidName,
    invalidVersion,
    invalidPublishIncludes,
    missingPublishIncludes,
    unexpectedPublishIncludes,
  };
}

export function validatePackageExports(
  config: PackageConfig,
  entrypoints: readonly PackageEntrypointManifest[] = packageEntrypoints,
  options: { exists?: (path: string) => boolean } = {},
): PackageExportValidation {
  const exists = options.exists ?? existsOnDisk;
  const actual = normalizeExports(config.exports);
  const expected = new Map<string, string>(entrypoints.map((entrypoint) => [entrypoint.specifier, entrypoint.path]));
  const missingExports: string[] = [];
  const mismatchedExports: Array<{ specifier: string; expected: string; actual: string }> = [];
  const missingFiles: string[] = [];
  const byStability = emptyStabilityValidation();

  for (const entrypoint of entrypoints) {
    const tier = byStability[entrypoint.stability];
    const actualPath = actual.get(entrypoint.specifier);
    if (actualPath === undefined) {
      missingExports.push(entrypoint.specifier);
      tier.missingExports.push(entrypoint.specifier);
    } else if (actualPath !== entrypoint.path) {
      const mismatch = { specifier: entrypoint.specifier, expected: entrypoint.path, actual: actualPath };
      mismatchedExports.push(mismatch);
      tier.mismatchedExports.push(mismatch);
    }
    if (!exists(entrypoint.path.replace(/^\.\//, ""))) {
      missingFiles.push(entrypoint.path);
      tier.missingFiles.push(entrypoint.path);
    }
  }

  for (const tier of Object.values(byStability)) {
    tier.ok = tier.missingExports.length === 0 &&
      tier.mismatchedExports.length === 0 &&
      tier.missingFiles.length === 0;
  }

  const unexpectedExports = [...actual.keys()]
    .filter((specifier) => !expected.has(specifier))
    .sort();

  return {
    ok: missingExports.length === 0 &&
      mismatchedExports.length === 0 &&
      unexpectedExports.length === 0 &&
      missingFiles.length === 0,
    missingExports,
    mismatchedExports,
    unexpectedExports,
    missingFiles,
    byStability,
  };
}

export function formatPackageExportValidation(validation: PackageExportValidation): string {
  const lines = [
    validation.ok ? "ok package exports match the stability manifest" : "fail package exports drifted from manifest",
  ];
  for (const specifier of validation.missingExports) {
    lines.push(`missing export: ${specifier}`);
  }
  for (const mismatch of validation.mismatchedExports) {
    lines.push(`mismatched export: ${mismatch.specifier} expected ${mismatch.expected} got ${mismatch.actual}`);
  }
  for (const specifier of validation.unexpectedExports) {
    lines.push(`unexpected export: ${specifier}`);
  }
  for (const path of validation.missingFiles) {
    lines.push(`missing file: ${path}`);
  }
  for (const tier of apiStabilityTiers) {
    const tierValidation = validation.byStability[tier];
    lines.push(`${tier}: ${tierValidation.ok ? "ok" : "drift"}`);
    for (const specifier of tierValidation.missingExports) {
      lines.push(`  missing export: ${specifier}`);
    }
    for (const mismatch of tierValidation.mismatchedExports) {
      lines.push(`  mismatched export: ${mismatch.specifier} expected ${mismatch.expected} got ${mismatch.actual}`);
    }
    for (const path of tierValidation.missingFiles) {
      lines.push(`  missing file: ${path}`);
    }
  }
  return lines.join("\n");
}

export function formatPackageMetadataValidation(validation: PackageMetadataValidation): string {
  const lines = [
    validation.ok ? "ok package metadata matches release policy" : "fail package metadata drifted from release policy",
  ];
  if (validation.invalidName) {
    lines.push(`invalid package name: expected ${validation.expectedName} got ${validation.name ?? "missing"}`);
  }
  if (validation.invalidVersion) {
    lines.push(`invalid package version: ${validation.version ?? "missing"}`);
  }
  if (validation.invalidPublishIncludes) {
    lines.push("invalid publish include list: expected unique string entries");
  }
  for (const entry of validation.missingPublishIncludes) {
    lines.push(`missing publish include: ${entry}`);
  }
  for (const entry of validation.unexpectedPublishIncludes) {
    lines.push(`unexpected publish include: ${entry}`);
  }
  return lines.join("\n");
}

const DEFAULT_LEGACY_STABLE_DEMO_MODULES = [
  "src/markup/demo_fixtures.ts",
  "src/three_ascii/demo_presets.ts",
  // Intentional 036/037 public modules the name heuristic false-positives
  // on ("codemoDs", "pixel_SAMPLErs", "downSAMPLE", "EXAMPLE_registry").
  "src/canvas/pixel_samplers.ts",
  "src/tooling/codemods.ts",
  "src/tooling/example_registry.ts",
  "src/visual/downsample.ts",
] as const;

export function validateStableDemoExports(
  inventory: { modules: ReadonlyArray<{ module: string }> },
  options: { legacyAllowedModules?: readonly string[] } = {},
): StableDemoExportValidation {
  const legacyAllowedModules = [...(options.legacyAllowedModules ?? DEFAULT_LEGACY_STABLE_DEMO_MODULES)].sort();
  const allowed = new Set(legacyAllowedModules);
  const unexpectedModules = inventory.modules
    .map((entry) => entry.module)
    .filter(isDemoLikeStableModule)
    .filter((module) => !allowed.has(module))
    .sort();

  return {
    ok: unexpectedModules.length === 0,
    legacyAllowedModules,
    unexpectedModules,
  };
}

export function validateStableAppExports(
  inventory: { modules: ReadonlyArray<{ module: string }> },
  options: { legacyAllowedModules?: readonly string[] } = {},
): StableAppExportValidation {
  const legacyAllowedModules = [...(options.legacyAllowedModules ?? [])].sort();
  const allowed = new Set(legacyAllowedModules);
  const stableAppModules = inventory.modules
    .map((entry) => entry.module)
    .filter((module) => module.startsWith("src/app/"))
    .sort();
  const exported = new Set(stableAppModules);
  const unexpectedModules = inventory.modules
    .map((entry) => entry.module)
    .filter((module) => module.startsWith("src/app/"))
    .filter((module) => !allowed.has(module))
    .sort();
  const staleAllowedModules = legacyAllowedModules
    .filter((module) => !exported.has(module))
    .sort();

  return {
    ok: unexpectedModules.length === 0 && staleAllowedModules.length === 0,
    legacyAllowedModules,
    unexpectedModules,
    staleAllowedModules,
  };
}

export function parseStableAppExportPolicy(
  source: string,
  path = STABLE_APP_EXPORT_POLICY_PATH,
): StableAppExportPolicy {
  const parsed = JSON.parse(source) as Partial<StableAppExportPolicy>;
  if (!Array.isArray(parsed.legacyAllowedModules)) {
    throw new Error(`${path} must contain a legacyAllowedModules array`);
  }
  const invalid = parsed.legacyAllowedModules.find((module) => typeof module !== "string" || module.length === 0);
  if (invalid !== undefined) {
    throw new Error(`${path} contains an invalid legacyAllowedModules entry`);
  }
  return {
    description: typeof parsed.description === "string" ? parsed.description : undefined,
    legacyAllowedModules: [...parsed.legacyAllowedModules].sort(),
  };
}

export async function loadStableAppExportPolicy(
  path = STABLE_APP_EXPORT_POLICY_PATH,
  readTextFile: (path: string) => string | Promise<string> = Deno.readTextFile,
): Promise<StableAppExportPolicy> {
  return parseStableAppExportPolicy(await readTextFile(path), path);
}

export function formatStableDemoExportValidation(validation: StableDemoExportValidation): string {
  const lines = [
    validation.ok
      ? "ok stable exports contain no new demo-only modules"
      : "fail stable exports include new demo-only modules",
  ];
  if (validation.legacyAllowedModules.length > 0) {
    lines.push(`legacy allowed: ${validation.legacyAllowedModules.join(", ")}`);
  }
  for (const module of validation.unexpectedModules) {
    lines.push(`unexpected stable demo export: ${module}`);
  }
  return lines.join("\n");
}

export function formatStableAppExportValidation(validation: StableAppExportValidation): string {
  const lines = [
    validation.ok
      ? "ok stable exports contain no new app/workbench modules"
      : "fail stable exports include new app/workbench modules",
  ];
  lines.push(`legacy app modules allowed: ${validation.legacyAllowedModules.length}`);
  for (const module of validation.unexpectedModules) {
    lines.push(`unexpected stable app export: ${module}`);
  }
  for (const module of validation.staleAllowedModules) {
    lines.push(`stale stable app allowlist entry: ${module}`);
  }
  return lines.join("\n");
}

function emptyStabilityValidation(): Record<ApiStabilityTier, PackageExportStabilityValidation> {
  return {
    stable: { stability: "stable", ok: true, missingExports: [], mismatchedExports: [], missingFiles: [] },
    beta: { stability: "beta", ok: true, missingExports: [], mismatchedExports: [], missingFiles: [] },
    experimental: { stability: "experimental", ok: true, missingExports: [], mismatchedExports: [], missingFiles: [] },
    internal: { stability: "internal", ok: true, missingExports: [], mismatchedExports: [], missingFiles: [] },
  };
}

function normalizeExports(exportsValue: PackageConfig["exports"]): Map<string, string> {
  if (typeof exportsValue === "string") return new Map([[".", exportsValue]]);
  return new Map(Object.entries(exportsValue ?? {}).sort(([left], [right]) => left.localeCompare(right)));
}

function existsOnDisk(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

if (import.meta.main) {
  const json = Deno.args.includes("--json");
  const quiet = Deno.args.includes("--quiet");
  const source = await Deno.readTextFile("deno.jsonc");
  const config = parseJsonc(source) as PackageConfig;
  const metadataValidation = validatePackageMetadata(config);
  const validation = validatePackageExports(config);
  const stableInventory = await createApiInventory("mod.ts");
  const stableDemoValidation = validateStableDemoExports(stableInventory);
  const stableAppPolicy = await loadStableAppExportPolicy();
  const stableAppValidation = validateStableAppExports(stableInventory, {
    legacyAllowedModules: stableAppPolicy.legacyAllowedModules,
  });

  if (json) {
    console.log(JSON.stringify(
      {
        ...validation,
        metadata: metadataValidation,
        stableDemoExports: stableDemoValidation,
        stableAppExports: stableAppValidation,
      },
      null,
      2,
    ));
  } else if (!quiet) {
    console.log(formatPackageMetadataValidation(metadataValidation));
    console.log(formatPackageExportValidation(validation));
    console.log(formatStableDemoExportValidation(stableDemoValidation));
    console.log(formatStableAppExportValidation(stableAppValidation));
  }

  if (!metadataValidation.ok || !validation.ok || !stableDemoValidation.ok || !stableAppValidation.ok) Deno.exit(1);
}

function isDemoLikeStableModule(module: string): boolean {
  return /(^|\/)(demo|example)s?([_.-]|\/)/i.test(module) ||
    /(^|\/)[^/]*(demo|fixture|sample)[^/]*\.ts$/i.test(module);
}
