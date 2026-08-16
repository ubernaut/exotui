// Copyright 2023 Im-Beast. MIT license.

// PKG-010: entrypoint budgets are CHECKED-IN evidence, and every increase
// is attributed. A baseline records, per public entrypoint, its module
// count, total source bytes, and the module path list; comparing a fresh
// inventory against the baseline classifies every regression — new
// modules, grown modules, removed modules — by PATH, so a budget failure
// names exactly which dependency or module moved instead of an opaque
// number. Shrinkage is reported as improvement, never a failure.

/** One entrypoint's inventory. */
export interface EntrypointInventory {
  readonly modules: number;
  readonly bytes: number;
  /** Repo-relative module paths with sizes. */
  readonly paths: Readonly<Record<string, number>>;
}

/** The full baseline keyed by entrypoint file. */
export type BudgetBaseline = Readonly<Record<string, EntrypointInventory>>;

/** One attributed increase. */
export interface BudgetIncrease {
  readonly entrypoint: string;
  readonly kind: "new-module" | "grown-module" | "new-entrypoint";
  readonly path: string;
  readonly deltaBytes: number;
}

/** One improvement (informational). */
export interface BudgetImprovement {
  readonly entrypoint: string;
  readonly kind: "removed-module" | "shrunk-module";
  readonly path: string;
  readonly deltaBytes: number;
}

/** The comparison report. */
export interface BudgetReport {
  readonly ok: boolean;
  readonly increases: readonly BudgetIncrease[];
  readonly improvements: readonly BudgetImprovement[];
  /** Human summary: every increase with its attribution. */
  readonly summary: string;
}

/** Compares a fresh inventory against the checked-in baseline. */
export function compareEntrypointBudgets(
  baseline: BudgetBaseline,
  current: BudgetBaseline,
): BudgetReport {
  const increases: BudgetIncrease[] = [];
  const improvements: BudgetImprovement[] = [];

  for (const [entrypoint, inventory] of Object.entries(current)) {
    const base = baseline[entrypoint];
    if (!base) {
      increases.push({ entrypoint, kind: "new-entrypoint", path: entrypoint, deltaBytes: inventory.bytes });
      continue;
    }
    for (const [path, size] of Object.entries(inventory.paths)) {
      const baseSize = base.paths[path];
      if (baseSize === undefined) {
        increases.push({ entrypoint, kind: "new-module", path, deltaBytes: size });
      } else if (size > baseSize) {
        increases.push({ entrypoint, kind: "grown-module", path, deltaBytes: size - baseSize });
      } else if (size < baseSize) {
        improvements.push({ entrypoint, kind: "shrunk-module", path, deltaBytes: baseSize - size });
      }
    }
    for (const [path, size] of Object.entries(base.paths)) {
      if (!(path in inventory.paths)) {
        improvements.push({ entrypoint, kind: "removed-module", path, deltaBytes: size });
      }
    }
  }

  const summary = increases.length === 0 ? "All entrypoints within their checked-in budgets." : increases
    .map((increase) => `${increase.entrypoint}: ${increase.kind} ${increase.path} (+${increase.deltaBytes}B)`)
    .join("\n");
  return { ok: increases.length === 0, increases, improvements, summary };
}

/** Builds one inventory from `deno info --json` output. */
export function inventoryFromDenoInfo(
  info: { readonly modules?: readonly { specifier?: string; size?: number }[] },
  repoRootUrl: string,
): EntrypointInventory {
  const paths: Record<string, number> = {};
  let bytes = 0;
  for (const module of info.modules ?? []) {
    const specifier = module.specifier ?? "";
    if (!specifier.startsWith(repoRootUrl)) continue; // local modules only
    const path = specifier.slice(repoRootUrl.length).replace(/^\//, "");
    const size = module.size ?? 0;
    paths[path] = size;
    bytes += size;
  }
  return { modules: Object.keys(paths).length, bytes, paths };
}
