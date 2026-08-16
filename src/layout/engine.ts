// Copyright 2023 Im-Beast. MIT license.
import type { Rectangle } from "../types.ts";
import {
  inspectLayoutTreeCompatibility,
  type LayoutDiagnostic,
  resolveLayoutSolverCapabilities,
} from "./capabilities.ts";
import { simpleLayoutSolver } from "./solvers/simple.ts";
import type { LayoutNode, LayoutSolver, LayoutSolverResult } from "./solver.ts";

/** Options for configuring a layout engine. */
export interface LayoutEngineOptions {
  solver?: LayoutSolver;
  onDiagnostic?: (diagnostic: LayoutDiagnostic) => void;
}

/** Public interface describing a layout run request. */
export interface LayoutRunOptions {
  bounds: Rectangle;
  root: LayoutNode;
}

/** Renderer-neutral layout engine that delegates solving to a pluggable backend. */
export class LayoutEngine {
  readonly solver: LayoutSolver;
  readonly #onDiagnostic?: (diagnostic: LayoutDiagnostic) => void;

  constructor(options: LayoutEngineOptions = {}) {
    this.solver = options.solver ?? simpleLayoutSolver();
    this.#onDiagnostic = options.onDiagnostic;
  }

  layout(options: LayoutRunOptions): LayoutSolverResult {
    if (!this.solver.supports(options.root)) {
      throw new LayoutSolverUnsupportedError(this.solver.id, options.root.tag);
    }
    if (this.#onDiagnostic) {
      const capabilities = resolveLayoutSolverCapabilities(this.solver);
      for (const diagnostic of inspectLayoutTreeCompatibility(options.root, capabilities)) {
        this.#onDiagnostic(diagnostic);
      }
    }
    const result = this.solver.solve({
      root: options.root,
      bounds: options.bounds,
    });
    applyLayoutVisualOffsets(options.root, result);
    return result;
  }
}

/**
 * Applies C1 scalar `offset` translations as an engine post-pass: the styled
 * node's solved box subtree (rects, content rects, hit regions) moves without
 * touching siblings, scroll metadata, or normal flow — and because it runs
 * after solving, every backend supports it identically.
 */
function applyLayoutVisualOffsets(node: LayoutNode, result: LayoutSolverResult): void {
  const { offsetX, offsetY } = node.style;
  if ((offsetX !== 0 || offsetY !== 0) && Number.isFinite(offsetX) && Number.isFinite(offsetY)) {
    const box = result.byId.get(node.id);
    if (box) translateLayoutBoxSubtree(box, Math.trunc(offsetX), Math.trunc(offsetY));
  }
  for (const child of node.children) applyLayoutVisualOffsets(child, result);
}

function translateLayoutBoxSubtree(
  box: LayoutSolverResult["root"],
  columns: number,
  rows: number,
): void {
  box.rect = { ...box.rect, column: box.rect.column + columns, row: box.rect.row + rows };
  box.contentRect = { ...box.contentRect, column: box.contentRect.column + columns, row: box.contentRect.row + rows };
  box.hitRegions = box.hitRegions.map((region) => ({
    ...region,
    bounds: { ...region.bounds, column: region.bounds.column + columns, row: region.bounds.row + rows },
  }));
  for (const child of box.children) translateLayoutBoxSubtree(child, columns, rows);
}

/** Error thrown when a solver cannot handle a layout tree. */
export class LayoutSolverUnsupportedError extends Error {
  constructor(solverId: string, rootTag: string) {
    super(`Layout solver "${solverId}" does not support root tag "${rootTag}".`);
    this.name = "LayoutSolverUnsupportedError";
  }
}

/** Creates a renderer-neutral layout engine. */
export function createLayoutEngine(options: LayoutEngineOptions = {}): LayoutEngine {
  return new LayoutEngine(options);
}

/** Runs layout with the default built-in solver. */
export function layoutTree(root: LayoutNode, bounds: Rectangle): LayoutSolverResult {
  return createLayoutEngine().layout({ root, bounds });
}
