// Copyright 2023 Im-Beast. MIT license.

/**
 * Fails when a source module is reachable from nothing.
 *
 *   deno run -A scripts/orphan_modules.ts            # report
 *   deno run -A scripts/orphan_modules.ts --check    # gate
 *   deno run -A scripts/orphan_modules.ts --update   # rewrite the allowlist
 *
 * A type check answers a narrower question than it appears to: `deno check
 * mod.ts` walks what `mod.ts` imports, so a module nothing imports is checked
 * by nothing and can rot while every suite stays green. Plan 040 deleted
 * `HitTargetStack` and both suites passed because its only callers were files
 * nothing under test reached; `packages/exomux/audio_scripted.ts` sat
 * unreferenced beside a copy of itself for weeks. This asks the question those
 * incidents needed asked: does anything import this at all?
 *
 * Reachability is taken from `deno info --json`, not from grepping imports, so
 * re-export chains, type-only imports and dynamic specifiers all count.
 */

/** One package with its own module resolution. */
export interface ReachabilityScope {
  readonly id: string;
  /** Config that resolves this scope's imports. */
  readonly config: string;
  /** Entry modules whose graphs count as coverage. */
  readonly entrypoints: readonly string[];
  /** Directories whose every `.ts` file is also a root (tests, examples, scripts). */
  readonly rootDirectories: readonly string[];
  /** Directories whose `.ts` files must be reachable from something above. */
  readonly sourceDirectories: readonly string[];
  /** Source paths to skip entirely (never candidates). */
  readonly excludes?: readonly string[];
}

export const REACHABILITY_SCOPES: readonly ReachabilityScope[] = Object.freeze([
  {
    id: "library",
    config: "deno.jsonc",
    entrypoints: [
      "mod.ts",
      "mod.app.ts",
      "mod.web.ts",
      "mod.remote.ts",
      "mod.theme.ts",
      "mod.testing.ts",
      "src/showcase/mod.ts",
    ],
    // Examples and scripts are entrypoints in their own right, and tests are
    // the other thing that legitimately keeps a module alive.
    rootDirectories: ["tests", "examples", "scripts", "app"],
    sourceDirectories: ["src"],
  },
  {
    id: "exomux",
    config: "packages/exomux/deno.json",
    entrypoints: ["packages/exomux/main.ts", "packages/exomux/mod.ts"],
    rootDirectories: ["packages/exomux/tests"],
    sourceDirectories: ["packages/exomux"],
    excludes: ["packages/exomux/tests"],
  },
]);

export const ORPHAN_ALLOWLIST_PATH = "budgets/reachable_modules.json";

/** The checked-in list of modules that are knowingly reachable from nothing. */
export interface OrphanAllowlist {
  readonly description?: string;
  readonly allowed: readonly string[];
}

export interface ReachabilityResult {
  readonly scope: string;
  /** Sources nothing imports, allowlist not applied. */
  readonly unreachable: readonly string[];
}

export interface ReachabilityReport {
  readonly results: readonly ReachabilityResult[];
  /** Unreachable and not allowed: the failure. */
  readonly unexpected: readonly string[];
  /** Allowed but now reachable (or gone): the list has drifted. */
  readonly stale: readonly string[];
}

/** Parses the allowlist, rejecting a shape that would silently allow everything. */
export function parseOrphanAllowlist(source: string, path = ORPHAN_ALLOWLIST_PATH): OrphanAllowlist {
  const parsed = JSON.parse(source) as Partial<OrphanAllowlist>;
  if (!Array.isArray(parsed.allowed)) throw new Error(`${path} must contain an "allowed" array`);
  const invalid = parsed.allowed.find((entry) => typeof entry !== "string" || entry.length === 0);
  if (invalid !== undefined) throw new Error(`${path} contains an invalid entry`);
  return { description: parsed.description, allowed: [...parsed.allowed].sort() };
}

/** Compares what is unreachable against what is allowed to be. */
export function evaluateReachability(
  results: readonly ReachabilityResult[],
  allowlist: OrphanAllowlist,
): ReachabilityReport {
  const allowed = new Set(allowlist.allowed);
  const unreachable = new Set(results.flatMap((result) => [...result.unreachable]));
  return {
    results,
    unexpected: [...unreachable].filter((module) => !allowed.has(module)).sort(),
    stale: [...allowed].filter((module) => !unreachable.has(module)).sort(),
  };
}

export function formatReachabilityReport(report: ReachabilityReport): string {
  const lines: string[] = [];
  for (const result of report.results) {
    lines.push(`${result.scope}: ${result.unreachable.length} unreachable`);
  }
  for (const module of report.unexpected) lines.push(`unreachable, and not allowed: ${module}`);
  for (const module of report.stale) lines.push(`stale allowlist entry (now reachable, or gone): ${module}`);
  lines.push(report.unexpected.length === 0 && report.stale.length === 0 ? "ok reachability" : "fail reachability");
  return lines.join("\n");
}

async function* walkTypeScript(dir: string): AsyncGenerator<string> {
  let entries: AsyncIterable<Deno.DirEntry>;
  try {
    entries = Deno.readDir(dir);
  } catch {
    return;
  }
  for await (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) yield* walkTypeScript(path);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) yield path;
  }
}

/** Every local module `deno info` reaches from the given roots, as repo paths. */
async function reachableFrom(roots: readonly string[], config: string, cwd: string): Promise<Set<string>> {
  const temp = await Deno.makeTempFile({ suffix: ".ts" });
  try {
    const body = roots.map((root, index) => `import * as module${index} from "${cwd}/${root}";`).join("\n");
    await Deno.writeTextFile(temp, `${body}\nexport {};\n`);
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["info", "--json", "--config", config, temp],
      cwd,
      stdout: "piped",
      stderr: "null",
    }).output();
    if (!output.success) throw new Error(`deno info failed for scope config ${config}`);
    const graph = JSON.parse(new TextDecoder().decode(output.stdout)) as { modules?: { local?: string }[] };
    const reached = new Set<string>();
    for (const module of graph.modules ?? []) {
      if (typeof module.local === "string" && module.local.startsWith(`${cwd}/`)) {
        reached.add(module.local.slice(cwd.length + 1));
      }
    }
    return reached;
  } finally {
    await Deno.remove(temp).catch(() => {});
  }
}

/** Runs one scope: collects roots, resolves the graph, lists what it never reached. */
export async function analyzeScope(scope: ReachabilityScope, cwd = Deno.cwd()): Promise<ReachabilityResult> {
  const roots = [...scope.entrypoints];
  for (const directory of scope.rootDirectories) {
    for await (const file of walkTypeScript(`${cwd}/${directory}`)) roots.push(file.slice(cwd.length + 1));
  }
  const reached = await reachableFrom(roots, scope.config, cwd);

  const unreachable: string[] = [];
  for (const directory of scope.sourceDirectories) {
    for await (const file of walkTypeScript(`${cwd}/${directory}`)) {
      const relative = file.slice(cwd.length + 1);
      if (scope.excludes?.some((prefix) => relative.startsWith(`${prefix}/`))) continue;
      if (!reached.has(relative)) unreachable.push(relative);
    }
  }
  return { scope: scope.id, unreachable: unreachable.sort() };
}

if (import.meta.main) {
  const check = Deno.args.includes("--check");
  const update = Deno.args.includes("--update");
  const quiet = Deno.args.includes("--quiet");
  const cwd = Deno.cwd();

  const results: ReachabilityResult[] = [];
  for (const scope of REACHABILITY_SCOPES) results.push(await analyzeScope(scope, cwd));

  if (update) {
    const allowed = results.flatMap((result) => [...result.unreachable]).sort();
    const existing = parseOrphanAllowlist(await Deno.readTextFile(ORPHAN_ALLOWLIST_PATH));
    await Deno.writeTextFile(
      ORPHAN_ALLOWLIST_PATH,
      `${JSON.stringify({ description: existing.description, allowed }, null, 2)}\n`,
    );
    console.log(`wrote ${allowed.length} allowed modules`);
    Deno.exit(0);
  }

  const allowlist = parseOrphanAllowlist(await Deno.readTextFile(ORPHAN_ALLOWLIST_PATH));
  const report = evaluateReachability(results, allowlist);
  if (!quiet) console.log(formatReachabilityReport(report));
  if (check && (report.unexpected.length > 0 || report.stale.length > 0)) Deno.exit(1);
}
