// Copyright 2023 Im-Beast. MIT license.

// PKG-005: the downstream contract-test surface. Third-party adapters —
// terminal backends, layout solvers, themes, and plugins — call one
// public runner and receive a STABLE conformance report ({subject,
// checks[], passed, failed}) without importing anything from this
// repository's internal test suite: every check exercises only public
// contracts. Checks are independent (one failure never hides another),
// named, and carry details, so an adapter author reads exactly which
// obligation broke.

import { parsePluginManifest } from "../app/plugin_manifest.ts";
import {
  createHostContributionRegistry,
  enablePlugin,
  installPlugin,
  type LifecyclePlugin,
  uninstallPlugin,
} from "../app/plugin_lifecycle.ts";

/** One conformance check outcome. */
export interface ContractCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly detail?: string;
}

/** The stable report every runner returns. */
export interface ConformanceReport {
  readonly subject: string;
  readonly checks: readonly ContractCheck[];
  readonly passed: number;
  readonly failed: number;
  readonly conformant: boolean;
}

function report(subject: string, checks: ContractCheck[]): ConformanceReport {
  const failed = checks.filter((check) => !check.passed).length;
  return { subject, checks, passed: checks.length - failed, failed, conformant: failed === 0 };
}

function check(name: string, run: () => true | string): ContractCheck {
  try {
    const outcome = run();
    return outcome === true ? { name, passed: true } : { name, passed: false, detail: outcome };
  } catch (error) {
    return { name, passed: false, detail: String(error) };
  }
}

/** Terminal-backend contract: write/dispose obligations. */
export function runBackendContract(backend: {
  write(data: string): number;
  dispose(): void;
}): ConformanceReport {
  let disposals = 0;
  const counted = {
    write: backend.write.bind(backend),
    dispose: () => {
      disposals += 1;
      backend.dispose();
    },
  };
  return report("terminal-backend", [
    check("write returns accepted byte count", () => {
      const accepted = counted.write("probe");
      return Number.isInteger(accepted) && accepted >= 0 && accepted <= 5 ||
        `write("probe") returned ${accepted}`;
    }),
    check("empty writes are accepted", () => counted.write("") === 0 || 'write("") must return 0'),
    check("dispose is callable twice without throwing", () => {
      counted.dispose();
      counted.dispose();
      return disposals === 2 || "dispose was intercepted";
    }),
  ]);
}

/** Layout-solver contract: finite deterministic boxes. */
export function runSolverContract(solver: {
  solve(tree: { width: number; height: number; children: { width: number; height: number }[] }): {
    boxes: { width: number; height: number }[];
  };
}): ConformanceReport {
  const tree = { width: 40, height: 10, children: [{ width: 10, height: 2 }, { width: 15, height: 3 }] };
  return report("layout-solver", [
    check("solve returns one box per child", () => {
      const { boxes } = solver.solve(tree);
      return boxes.length === tree.children.length || `expected 2 boxes, got ${boxes.length}`;
    }),
    check("boxes are finite non-negative integers", () => {
      const { boxes } = solver.solve(tree);
      const bad = boxes.find((box) =>
        !Number.isInteger(box.width) || !Number.isInteger(box.height) || box.width < 0 || box.height < 0
      );
      return bad === undefined || `non-integer or negative box ${JSON.stringify(bad)}`;
    }),
    check("solving is deterministic", () => {
      const first = JSON.stringify(solver.solve(tree));
      const second = JSON.stringify(solver.solve(tree));
      return first === second || "two identical solves differed";
    }),
  ]);
}

/** Theme contract: the seven-token compatibility profile. */
export function runThemeContract(theme: {
  tokens: Readonly<Record<string, (text: string) => string>>;
}): ConformanceReport {
  const required = ["foreground", "muted", "accent", "success", "warning", "danger", "surface"];
  return report("theme", [
    check("all seven compatibility tokens are present", () => {
      const missing = required.filter((token) => typeof theme.tokens[token] !== "function");
      return missing.length === 0 || `missing token(s): ${missing.join(", ")}`;
    }),
    check("tokens style text without destroying it", () => {
      for (const token of required) {
        const style = theme.tokens[token];
        if (typeof style !== "function") continue;
        if (!style("probe").includes("probe")) return `token "${token}" drops its text`;
      }
      return true;
    }),
  ]);
}

/** Plugin contract: manifest validity plus a clean lifecycle arc. */
export function runPluginContract(options: {
  readonly manifestJson: string;
  readonly plugin: LifecyclePlugin;
}): ConformanceReport {
  return report("plugin", [
    check("manifest validates against PLG-001", () => {
      parsePluginManifest(options.manifestJson);
      return true;
    }),
    check("install/enable/uninstall arc completes and disposes", () => {
      const registry = createHostContributionRegistry();
      const empty = registry.snapshot();
      if (!installPlugin(registry, options.plugin).ok) return "install failed";
      if (!enablePlugin(registry, options.plugin).ok) return "enable failed";
      if (!uninstallPlugin(registry, options.plugin).ok) return "uninstall failed";
      return registry.snapshot() === empty || "uninstall left registry residue";
    }),
  ]);
}
