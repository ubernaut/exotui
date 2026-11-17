import { runtimeHost } from "../../src/runtime/host.ts";
// Copyright 2023 Im-Beast. MIT license.
import type { Rectangle } from "../../src/types.ts";
import type { LayoutNode, LayoutSolverResult } from "../../src/layout/solver.ts";
import { createLayoutNode } from "../../src/layout/solver.ts";
import { cellLength, type ComputedLayoutStyle, defaultComputedLayoutStyle, frLength } from "../../src/layout/style.ts";
import { type TaffyAdapterError, TaffyLayoutSolverLoader } from "../../src/layout/taffy.ts";

interface ProbeCheck {
  id: string;
  pass: boolean;
  detail: string;
}

interface TaffyCandidateProbeReport {
  schemaVersion: 1;
  ok: boolean;
  candidate: string;
  backend?: {
    name: string;
    taffyVersion: string;
  };
  loader?: ReturnType<TaffyLayoutSolverLoader["inspect"]>;
  timings?: {
    coldLoadMs: number;
    firstSolveMs: number;
    largeNestedNodes: number;
    largeNestedSolveMs: number;
    steadyIterations: number;
    steadyTotalMs: number;
    steadyAverageMs: number;
  };
  checks: ProbeCheck[];
  error?: {
    name: string;
    code?: string;
    message: string;
  };
}

const FLEX_BOUNDS: Rectangle = { column: 0, row: 0, width: 40, height: 10 };
const GRID_BOUNDS: Rectangle = { column: 0, row: 0, width: 40, height: 10 };
const INTRINSIC_BOUNDS: Rectangle = { column: 0, row: 0, width: 20, height: 3 };

/** Runs the deterministic protocol, layout, measurement, lifecycle, and timing gate for one candidate wrapper. */
export async function runTaffyCandidateProbe(
  candidate: string,
  loadModule: () => unknown | Promise<unknown>,
  steadyIterations = 100,
): Promise<TaffyCandidateProbeReport> {
  const checks: ProbeCheck[] = [];
  const loader = new TaffyLayoutSolverLoader({ loadModule });
  const coldStartedAt = performance.now();
  try {
    const solver = await loader.createSolver();
    const coldLoadMs = performance.now() - coldStartedAt;
    const inspection = solver.inspect();

    checks.push({
      id: "taffy-0.12",
      pass: /^0\.12\.\d+$/.test(inspection.taffyVersion),
      detail: `reported ${inspection.taffyVersion}`,
    });
    checks.push({
      id: "flex-capability",
      pass: solver.capabilities.displayModes.flex === "supported",
      detail: `reported ${solver.capabilities.displayModes.flex}`,
    });
    checks.push({
      id: "grid-capability",
      pass: solver.capabilities.displayModes.grid === "supported",
      detail: `reported ${solver.capabilities.displayModes.grid}`,
    });
    checks.push({
      id: "intrinsic-capability",
      pass: ["supported", "partial"].includes(solver.capabilities.invariants["intrinsic-measurement"].support),
      detail: solver.capabilities.invariants["intrinsic-measurement"].detail,
    });

    const firstStartedAt = performance.now();
    const flex = solver.solve({ root: flexFixture(), bounds: FLEX_BOUNDS });
    const firstSolveMs = performance.now() - firstStartedAt;
    checkRect(checks, flex, "flex-root", "root", FLEX_BOUNDS);
    checkRect(checks, flex, "flex-fixed", "fixed", { column: 0, row: 0, width: 10, height: 10 });
    checkRect(checks, flex, "flex-grow", "grow", { column: 10, row: 0, width: 30, height: 10 });

    const grid = solver.solve({ root: gridFixture(), bounds: GRID_BOUNDS });
    checkRect(checks, grid, "grid-root", "grid", GRID_BOUNDS);
    checkRect(checks, grid, "grid-a", "a", { column: 0, row: 0, width: 20, height: 5 });
    checkRect(checks, grid, "grid-b", "b", { column: 20, row: 0, width: 20, height: 5 });
    checkRect(checks, grid, "grid-c", "c", { column: 0, row: 5, width: 20, height: 5 });
    checkRect(checks, grid, "grid-d", "d", { column: 20, row: 5, width: 20, height: 5 });

    const intrinsic = solver.solve({ root: intrinsicFixture(), bounds: INTRINSIC_BOUNDS });
    checkRect(checks, intrinsic, "intrinsic-text", "text", { column: 0, row: 0, width: 3, height: 3 });
    checkRect(checks, intrinsic, "intrinsic-fill", "fill", { column: 3, row: 0, width: 17, height: 3 });

    const largeRoot = largeNestedFixture();
    const largeNestedStartedAt = performance.now();
    const large = solver.solve({ root: largeRoot, bounds: { column: 0, row: 0, width: 80, height: 40 } });
    const largeNestedSolveMs = performance.now() - largeNestedStartedAt;
    const largeNestedNodes = countNodes(largeRoot);
    checks.push({
      id: "large-nested-tree",
      pass: large.boxes.length === largeNestedNodes,
      detail: `expected ${largeNestedNodes} projected boxes; received ${large.boxes.length}`,
    });

    const iterations = Math.max(1, Math.floor(steadyIterations));
    const steadyStartedAt = performance.now();
    for (let index = 0; index < iterations; index += 1) {
      solver.solve({ root: index % 2 === 0 ? flexFixture() : gridFixture(), bounds: FLEX_BOUNDS });
    }
    const steadyTotalMs = performance.now() - steadyStartedAt;
    solver.dispose();
    checks.push({
      id: "disposal",
      pass: solver.inspect().disposed && !solver.supports(flexFixture()),
      detail: "dispose is observable and disables reuse",
    });

    return {
      schemaVersion: 1,
      ok: checks.every((check) => check.pass),
      candidate,
      backend: { name: inspection.backendName, taffyVersion: inspection.taffyVersion },
      loader: loader.inspect(),
      timings: {
        coldLoadMs,
        firstSolveMs,
        largeNestedNodes,
        largeNestedSolveMs,
        steadyIterations: iterations,
        steadyTotalMs,
        steadyAverageMs: steadyTotalMs / iterations,
      },
      checks,
    };
  } catch (cause) {
    const error = cause as Partial<TaffyAdapterError>;
    return {
      schemaVersion: 1,
      ok: false,
      candidate,
      loader: loader.inspect(),
      checks,
      error: {
        name: cause instanceof Error ? cause.name : "Error",
        code: typeof error.code === "string" ? error.code : undefined,
        message: cause instanceof Error ? cause.message : String(cause),
      },
    };
  }
}

function flexFixture() {
  return createLayoutNode({
    id: "root",
    tag: "main",
    style: style({
      display: "flex",
      flexDirection: "row",
      width: cellLength(40),
      height: cellLength(10),
    }),
    children: [
      createLayoutNode({
        id: "fixed",
        tag: "panel",
        style: style({ width: cellLength(10), height: cellLength(10), flexShrink: 0 }),
      }),
      createLayoutNode({
        id: "grow",
        tag: "panel",
        style: style({ height: cellLength(10), flexGrow: 1 }),
      }),
    ],
  });
}

function gridFixture() {
  return createLayoutNode({
    id: "grid",
    tag: "main",
    style: style({
      display: "grid",
      width: cellLength(40),
      height: cellLength(10),
      gridTemplateColumns: [frLength(1), frLength(1)],
      gridTemplateRows: [cellLength(5), cellLength(5)],
    }),
    children: ["a", "b", "c", "d"].map((id) => createLayoutNode({ id, tag: "panel" })),
  });
}

function intrinsicFixture() {
  return createLayoutNode({
    id: "intrinsic",
    tag: "main",
    style: style({
      display: "flex",
      flexDirection: "row",
      width: cellLength(20),
      height: cellLength(3),
    }),
    children: [
      createLayoutNode({ id: "text", tag: "label", text: "abc", style: style({ flexShrink: 0 }) }),
      createLayoutNode({ id: "fill", tag: "panel", style: style({ flexGrow: 1 }) }),
    ],
  });
}

function largeNestedFixture() {
  let nextId = 0;
  return branch(4);

  function branch(depth: number): LayoutNode {
    const id = `nested-${nextId++}`;
    const children: LayoutNode[] = depth === 0 ? [] : Array.from({ length: 5 }, () => branch(depth - 1));
    return createLayoutNode({
      id,
      tag: children.length === 0 ? "label" : "panel",
      text: children.length === 0 ? "x" : undefined,
      style: style({ display: children.length === 0 ? "block" : "flex", flexDirection: "column" }),
      children,
    });
  }
}

function countNodes(root: LayoutNode): number {
  let count = 1;
  for (const child of root.children) count += countNodes(child);
  return count;
}

function style(patch: Partial<ComputedLayoutStyle> = {}): ComputedLayoutStyle {
  return { ...defaultComputedLayoutStyle(), ...patch };
}

function checkRect(
  checks: ProbeCheck[],
  result: LayoutSolverResult,
  checkId: string,
  nodeId: string,
  expected: Rectangle,
): void {
  const actual = result.byId.get(nodeId)?.rect;
  const pass = actual !== undefined && actual.column === expected.column && actual.row === expected.row &&
    actual.width === expected.width && actual.height === expected.height;
  checks.push({
    id: checkId,
    pass,
    detail: `expected ${rectLabel(expected)}; received ${actual ? rectLabel(actual) : "missing"}`,
  });
}

function rectLabel(rect: Rectangle): string {
  return `${rect.column},${rect.row} ${rect.width}x${rect.height}`;
}

function candidateArgument(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]!;
    if (value === "--module") return args[index + 1];
    if (value.startsWith("--module=")) return value.slice("--module=".length);
  }
  return undefined;
}

function iterationsArgument(args: readonly string[]): number {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]!;
    const raw = value === "--iterations"
      ? args[index + 1]
      : value.startsWith("--iterations=")
      ? value.slice("--iterations=".length)
      : undefined;
    if (raw !== undefined) {
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 100;
    }
  }
  return 100;
}

function moduleSpecifier(candidate: string): string {
  if (/^[a-z][a-z+.-]*:/i.test(candidate)) return candidate;
  const base = new URL(`file://${runtimeHost.cwd().replaceAll("\\", "/")}/`);
  return new URL(candidate, base).href;
}

if (import.meta.main) {
  const candidate = candidateArgument(runtimeHost.args);
  if (!candidate) {
    console.error(
      "Usage: deno run -A scripts/taffy/probe.ts --module ./path/to/taffy-bridge-wrapper.ts [--iterations 100]",
    );
    runtimeHost.exit(2);
  }
  const specifier = moduleSpecifier(candidate);
  const report = await runTaffyCandidateProbe(
    specifier,
    () => import(specifier),
    iterationsArgument(runtimeHost.args),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) runtimeHost.exit(1);
}
