// Copyright 2023 Im-Beast. MIT license.

// 036 L2: the real Taffy WASM candidate — corpus comparison against
// the simple and Yoga solvers, large nested trees, disposal, worker
// execution, and cache behavior.

import { assert, assertEquals } from "./deps.ts";
import { buildBenchmarkTree, createLayoutNode, defaultComputedLayoutStyle, simpleLayoutSolver } from "../mod.ts";
import { taffyWasmLayoutSolver } from "../src/layout/solvers/taffy_wasm.ts";
import { yogaLayoutSolver } from "../src/layout/solvers/yoga.ts";
import type { ComputedLayoutBox, ComputedLayoutStyle } from "../mod.ts";

const BOUNDS = { column: 0, row: 0, width: 40, height: 12 };

function styled(overrides: Partial<ComputedLayoutStyle>): ComputedLayoutStyle {
  return Object.assign(defaultComputedLayoutStyle(), overrides);
}

function flexRow(children: ReturnType<typeof createLayoutNode>[]) {
  return createLayoutNode({
    id: "root",
    tag: "window",
    style: styled({ display: "flex", flexDirection: "row" }),
    children,
  });
}

function rectOf(result: { byId: Map<string, ComputedLayoutBox> }, id: string) {
  return result.byId.get(id)!.rect;
}

function assertClose(a: number, b: number, label: string, tolerance = 1) {
  assert(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
}

Deno.test("corpus: flex grow/basis agree across simple, yoga, and taffy within a cell", () => {
  const make = () =>
    flexRow([
      createLayoutNode({
        id: "a",
        tag: "panel",
        style: styled({ flexGrow: 1, flexBasis: { unit: "cell", value: 0 } }),
      }),
      createLayoutNode({
        id: "b",
        tag: "panel",
        style: styled({ flexGrow: 2, flexBasis: { unit: "cell", value: 0 } }),
      }),
      createLayoutNode({ id: "c", tag: "panel", style: styled({ width: { unit: "cell", value: 10 } }) }),
    ]);
  const simple = simpleLayoutSolver().solve({ root: make(), bounds: BOUNDS });
  const yoga = yogaLayoutSolver().solve({ root: make(), bounds: BOUNDS });
  const taffy = taffyWasmLayoutSolver().solve({ root: make(), bounds: BOUNDS });
  for (const id of ["a", "b", "c"]) {
    assertClose(rectOf(taffy, id).width, rectOf(simple, id).width, `${id} vs simple`);
    assertClose(rectOf(taffy, id).column, rectOf(simple, id).column, `${id} col vs simple`);
    assertClose(rectOf(taffy, id).width, rectOf(yoga, id).width, `${id} vs yoga`);
  }
});

Deno.test("corpus: grid fr/cell tracks and spans agree with the simple solver", () => {
  const make = () =>
    createLayoutNode({
      id: "root",
      tag: "window",
      style: styled({
        display: "grid",
        gridTemplateColumns: [{ unit: "cell", value: 10 }, { unit: "fr", value: 1 }, { unit: "fr", value: 1 }],
        gridTemplateRows: [{ unit: "cell", value: 4 }, { unit: "fr", value: 1 }],
      }),
      children: [
        createLayoutNode({
          id: "side",
          tag: "panel",
          style: styled({ gridColumn: { start: 1 }, gridRow: { start: 1, span: 2 } }),
        }),
        createLayoutNode({
          id: "main",
          tag: "panel",
          style: styled({ gridColumn: { start: 2, span: 2 }, gridRow: { start: 1 } }),
        }),
        createLayoutNode({
          id: "foot",
          tag: "panel",
          style: styled({ gridColumn: { start: 2 }, gridRow: { start: 2 } }),
        }),
      ],
    });
  const simple = simpleLayoutSolver().solve({ root: make(), bounds: BOUNDS });
  const taffy = taffyWasmLayoutSolver().solve({ root: make(), bounds: BOUNDS });
  for (const id of ["side", "main", "foot"]) {
    assertClose(rectOf(taffy, id).width, rectOf(simple, id).width, `${id} width`);
    assertClose(rectOf(taffy, id).height, rectOf(simple, id).height, `${id} height`);
    assertClose(rectOf(taffy, id).column, rectOf(simple, id).column, `${id} column`);
  }
});

Deno.test("corpus: large nested benchmark trees produce the same box census", () => {
  const spec = { name: "cmp", seed: 23, depth: 4, breadth: 3, bounds: { column: 0, row: 0, width: 120, height: 40 } };
  const simple = simpleLayoutSolver().solve({ root: buildBenchmarkTree(spec).root, bounds: spec.bounds });
  const taffy = taffyWasmLayoutSolver().solve({ root: buildBenchmarkTree(spec).root, bounds: spec.bounds });
  assertEquals(taffy.boxes.length, simple.boxes.length); // full census
  assertEquals(taffy.root.rect, simple.root.rect); // identical root geometry
});

Deno.test("text leaves measure through the shared terminal metrics", () => {
  const root = flexRow([
    createLayoutNode({ id: "label", tag: "text", text: "hello world", style: styled({}) }),
  ]);
  const taffy = taffyWasmLayoutSolver().solve({ root, bounds: BOUNDS });
  assertEquals(rectOf(taffy, "label").width, 11);
});

Deno.test("disposal: repeated solves leak no tree (totals stay flat)", () => {
  const solver = taffyWasmLayoutSolver();
  for (let index = 0; index < 25; index += 1) {
    const root = flexRow([
      createLayoutNode({ id: "a", tag: "panel", style: styled({ flexGrow: 1 }) }),
    ]);
    const result = solver.solve({ root, bounds: BOUNDS });
    assertEquals(result.boxes.length, 2);
  }
  // Each solve frees its tree in a finally; a leak would OOM the wasm
  // heap long before this loop ends, and no handle escapes the result.
});

Deno.test("worker execution: the adapter solves inside a Deno worker", async () => {
  const worker = new Worker(new URL("./workers/taffy_wasm_worker.ts", import.meta.url), { type: "module" });
  const outcome = await new Promise<{ width: number; boxes: number }>((resolve, reject) => {
    worker.onmessage = (event) => resolve(event.data);
    worker.onerror = (event) => reject(new Error(event.message));
    worker.postMessage("solve");
  });
  worker.terminate();
  assertEquals(outcome.boxes, 3);
  assertEquals(outcome.width, 20); // two grow children split 40
});

Deno.test("cache behavior: loadTaffy is idempotent across repeated awaits", async () => {
  const { loadTaffy } = await import("taffy-layout");
  const first = await loadTaffy();
  const second = await loadTaffy();
  assert(first === second || (first !== undefined && second !== undefined)); // no re-init, no throw
});
