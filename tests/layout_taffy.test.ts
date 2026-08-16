import { assert, assertEquals, assertInstanceOf, assertRejects, assertStringIncludes, assertThrows } from "./deps.ts";
import { type LayoutSolverCapabilities, TAFFY_LAYOUT_SOLVER_CAPABILITIES } from "../src/layout/capabilities.ts";
import { LayoutEngine } from "../src/layout/engine.ts";
import { createLayoutNode, type LayoutNode } from "../src/layout/solver.ts";
import { cellLength, type ComputedLayoutStyle, defaultComputedLayoutStyle } from "../src/layout/style.ts";
import {
  inspectTaffyBackendModule,
  loadTaffyLayoutSolver,
  TAFFY_BACKEND_PROTOCOL,
  TAFFY_BACKEND_PROTOCOL_VERSION,
  TaffyAdapterError,
  type TaffyBackend,
  type TaffyBackendLayoutNode,
  type TaffyBackendManifest,
  type TaffyBackendModule,
  type TaffyBackendSolveRequest,
  type TaffyBackendSolveResult,
  TaffyLayoutSolver,
  TaffyLayoutSolverLoader,
} from "../src/layout/taffy.ts";
import { runTaffyCandidateProbe } from "../scripts/taffy/probe.ts";

function capabilities(): LayoutSolverCapabilities {
  const supportAll = Object.fromEntries(
    Object.keys(TAFFY_LAYOUT_SOLVER_CAPABILITIES.style).map((field) => [field, "supported"]),
  ) as unknown as LayoutSolverCapabilities["style"];
  return {
    schemaVersion: 1,
    solverId: "taffy",
    availability: "optional",
    style: supportAll,
    displayModes: { block: "supported", flex: "supported", grid: "supported", none: "supported" },
    lengthUnits: {
      auto: "supported",
      cell: "supported",
      percent: "supported",
      fr: "supported",
      vw: "unsupported",
      vh: "unsupported",
      pw: "unsupported",
      ph: "unsupported",
      calc: "unsupported",
      "min-content": "unsupported",
      "max-content": "unsupported",
      "fit-content": "unsupported",
      minmax: "unsupported",
    },
    invariants: {
      "cell-rounding": { support: "supported", detail: "Adapter snaps absolute edges to terminal cells." },
      "overflow-inspection": { support: "supported", detail: "Adapter projects content size to shared metadata." },
      "intrinsic-measurement": { support: "supported", detail: "Bridge calls the host measurement callback." },
      "hidden-nodes": { support: "supported", detail: "Taffy returns zero hidden layouts." },
      "absolute-children": { support: "supported", detail: "Taffy handles absolute layout." },
      "min-max-constraints": { support: "supported", detail: "Taffy handles min/max constraints." },
    },
    limitations: {},
    notes: ["Protocol fixture capabilities; not evidence of a distributed backend."],
  };
}

function manifest(overrides: Partial<TaffyBackendManifest> = {}): TaffyBackendManifest {
  return {
    protocol: TAFFY_BACKEND_PROTOCOL,
    protocolVersion: TAFFY_BACKEND_PROTOCOL_VERSION,
    backendName: "protocol-test-backend",
    taffyVersion: "0.12.2",
    capabilities: capabilities(),
    ...overrides,
  };
}

function moduleWith(backend: TaffyBackend | (() => TaffyBackend | Promise<TaffyBackend>)): TaffyBackendModule {
  return {
    taffyBackendManifest: manifest(),
    createTaffyBackend: typeof backend === "function"
      ? backend as () => TaffyBackend | Promise<TaffyBackend>
      : () => backend,
  };
}

function style(patch: Partial<ComputedLayoutStyle> = {}): ComputedLayoutStyle {
  return { ...defaultComputedLayoutStyle(), ...patch };
}

function fixtureTree(): LayoutNode {
  const first = createLayoutNode({
    id: "first",
    tag: "label",
    text: "hello",
    intrinsic: { height: 3 },
    style: style({
      width: cellLength(9),
      height: cellLength(3),
    }),
  });
  const second = createLayoutNode({
    id: "second",
    tag: "panel",
    style: style({
      visibility: "hidden",
      width: cellLength(8),
      height: cellLength(4),
    }),
  });
  return createLayoutNode({
    id: "root",
    tag: "main",
    style: style({
      display: "flex",
      width: cellLength(20),
      height: cellLength(8),
      border: { top: 1, right: 1, bottom: 1, left: 1 },
      padding: { top: 1, right: 1, bottom: 1, left: 1 },
      overflowX: "auto",
      overflowY: "auto",
    }),
    children: [first, second],
  });
}

function layoutResult(root: TaffyBackendLayoutNode): TaffyBackendSolveResult {
  return {
    protocol: TAFFY_BACKEND_PROTOCOL,
    protocolVersion: TAFFY_BACKEND_PROTOCOL_VERSION,
    root,
  };
}

function projectedFixture(): TaffyBackendLayoutNode {
  return {
    id: "root",
    x: 0,
    y: 0,
    width: 20,
    height: 8,
    contentWidth: 22.2,
    contentHeight: 7.4,
    children: [
      { id: "first", x: 0.4, y: 1.5, width: 9.2, height: 3.2, children: [] },
      { id: "second", x: 10.2, y: 1, width: 8, height: 4, children: [] },
    ],
  };
}

function assertTaffyError(error: unknown, code: TaffyAdapterError["code"]): TaffyAdapterError {
  assertInstanceOf(error, TaffyAdapterError);
  assertEquals(error.code, code);
  return error;
}

Deno.test("Taffy module inspection accepts only an explicit 0.12.x protocol manifest", () => {
  const candidate = moduleWith({ solve: () => layoutResult(projectedFixture()) });
  const inspected = inspectTaffyBackendModule(candidate);
  assertEquals(inspected.backendName, "protocol-test-backend");
  assertEquals(inspected.taffyVersion, "0.12.2");
  assertEquals(inspected.capabilities.solverId, "taffy");
  assert(Object.isFrozen(inspected));
  assert(Object.isFrozen(inspected.capabilities));

  const wrongVersion = {
    ...candidate,
    taffyBackendManifest: manifest({ taffyVersion: "0.9.2" }),
  };
  assertTaffyError(
    assertThrows(() => inspectTaffyBackendModule(wrongVersion), TaffyAdapterError),
    "incompatible-taffy-version",
  );

  const wrongProtocol = {
    ...candidate,
    taffyBackendManifest: { ...manifest(), protocolVersion: 2 },
  };
  assertTaffyError(
    assertThrows(() => inspectTaffyBackendModule(wrongProtocol), TaffyAdapterError),
    "incompatible-protocol",
  );
});

Deno.test("Taffy module inspection rejects planned capability claims from a loaded backend", () => {
  const candidate = moduleWith({ solve: () => layoutResult(projectedFixture()) });
  const planned = {
    ...capabilities(),
    availability: "planned" as const,
  };
  const error = assertThrows(
    () =>
      inspectTaffyBackendModule({
        ...candidate,
        taffyBackendManifest: manifest({ capabilities: planned }),
      }),
    TaffyAdapterError,
  );
  assertTaffyError(error, "invalid-capabilities");
  assertStringIncludes(error.message, "never planned or built-in");
});

Deno.test("Taffy loader fails closed when no bridge loader is supplied", () => {
  const error = assertThrows(
    () => new TaffyLayoutSolverLoader(undefined as unknown as { loadModule: () => unknown }),
    TaffyAdapterError,
  );
  assertTaffyError(error, "backend-unavailable");
  assertStringIncludes(error.message, "opt-in");
});

Deno.test("Taffy loader reports import failures and retries without caching rejection", async () => {
  let attempts = 0;
  const loader = new TaffyLayoutSolverLoader({
    loadModule: () => {
      attempts += 1;
      if (attempts === 1) throw new Error("candidate missing");
      return moduleWith({ solve: () => layoutResult(projectedFixture()) });
    },
  });
  const failure = await assertRejects(() => loader.createSolver(), TaffyAdapterError);
  assertTaffyError(failure, "module-load-failed");
  assertStringIncludes(failure.message, "candidate missing");
  assertEquals(loader.inspect(), {
    state: "failed",
    moduleLoads: 1,
    backendCreations: 0,
    lastErrorCode: "module-load-failed",
  });

  const solver = await loader.createSolver();
  assertEquals(attempts, 2);
  assertEquals(loader.inspect(), {
    state: "ready",
    moduleLoads: 2,
    backendCreations: 1,
    lastErrorCode: undefined,
  });
  solver.dispose();
});

Deno.test("Taffy loader shares module initialization but never backend instances", async () => {
  let moduleLoads = 0;
  let backendCreations = 0;
  let disposals = 0;
  const loader = new TaffyLayoutSolverLoader({
    loadModule: async () => {
      moduleLoads += 1;
      await Promise.resolve();
      return moduleWith(() => {
        backendCreations += 1;
        return {
          solve: () => layoutResult(projectedFixture()),
          dispose: () => disposals += 1,
        };
      });
    },
  });
  const [first, second] = await Promise.all([loader.createSolver(), loader.createSolver()]);
  assertEquals(moduleLoads, 1);
  assertEquals(backendCreations, 2);
  assertEquals(loader.inspect(), {
    state: "ready",
    moduleLoads: 1,
    backendCreations: 2,
    lastErrorCode: undefined,
  });
  first.dispose();
  first.dispose();
  second.dispose();
  assertEquals(disposals, 2);

  assertEquals(loader.resetModuleCache(), true);
  const third = await loader.createSolver();
  assertEquals(moduleLoads, 2);
  assertEquals(backendCreations, 3);
  third.dispose();
});

Deno.test("Taffy loader disposes a malformed backend returned by a valid module", async () => {
  let disposals = 0;
  const loader = new TaffyLayoutSolverLoader({
    loadModule: () =>
      moduleWith(() => ({
        dispose: () => disposals += 1,
      } as unknown as TaffyBackend)),
  });
  const failure = await assertRejects(() => loader.createSolver(), TaffyAdapterError);
  assertTaffyError(failure, "invalid-backend");
  assertEquals(disposals, 1);
  assertEquals(loader.inspect(), {
    state: "ready",
    moduleLoads: 1,
    backendCreations: 0,
    lastErrorCode: "invalid-backend",
  });
});

Deno.test("Taffy adapter projects parent-relative float layouts to stable terminal boxes", async () => {
  let request: TaffyBackendSolveRequest | undefined;
  let measurement: { width: number; height: number } | undefined;
  const root = fixtureTree();
  const solver = await loadTaffyLayoutSolver({
    loadModule: () =>
      moduleWith({
        solve: (nextRequest) => {
          request = nextRequest;
          measurement = nextRequest.measure({
            nodeId: "first",
            knownWidth: null,
            knownHeight: null,
            availableWidth: 3,
            availableHeight: "max-content",
          });
          nextRequest.root.style.display = "none";
          return layoutResult(projectedFixture());
        },
      }),
  });
  const result = solver.solve({
    root,
    bounds: { column: 4.8, row: 3.9, width: 20.9, height: 8.8 },
  });

  assertEquals(request?.bounds, { column: 4, row: 3, width: 20, height: 8 });
  assert(request?.root !== root);
  assertEquals(root.style.display, "flex");
  assertEquals(measurement, { width: 5, height: 3 });
  assertEquals(result.root.rect, { column: 4, row: 3, width: 20, height: 8 });
  assertEquals(result.root.contentRect, { column: 6, row: 5, width: 16, height: 4 });
  assertEquals(result.root.scrollWidth, 22);
  assertEquals(result.root.scrollHeight, 7);
  assertEquals(result.root.visible, true);
  assertEquals(result.root.hitRegions[0]?.bounds, result.root.rect);
  assertEquals(result.boxes.map((box) => box.id), ["root", "first", "second"]);
  assertEquals(result.byId.get("first")?.rect, { column: 4, row: 5, width: 10, height: 3 });
  assertEquals(result.byId.get("second")?.rect, { column: 14, row: 4, width: 8, height: 4 });
  assertEquals(result.byId.get("second")?.visible, false);
  assertEquals(result.byId.get("second")?.hitRegions, []);
  solver.dispose();
});

Deno.test("Taffy adapter exposes host measurement without backend handles", () => {
  let measured: { width: number; height: number } | undefined;
  const solver = new TaffyLayoutSolver({
    manifest: manifest(),
    measureNode: (node, input) => {
      assertEquals(node.id, "first");
      assertEquals(input.availableWidth, "min-content");
      return { width: 7, height: 4 };
    },
    backend: {
      solve(request) {
        measured = request.measure({
          nodeId: "first",
          knownWidth: 2,
          knownHeight: null,
          availableWidth: "min-content",
          availableHeight: "max-content",
        });
        return layoutResult(projectedFixture());
      },
    },
  });
  solver.solve({ root: fixtureTree(), bounds: { column: 0, row: 0, width: 20, height: 8 } });
  assertEquals(measured, { width: 2, height: 4 });
  solver.dispose();
});

Deno.test("Taffy adapter integrates through LayoutEngine without public tree changes", () => {
  const solver = new TaffyLayoutSolver({
    manifest: manifest(),
    backend: { solve: () => layoutResult(projectedFixture()) },
  });
  const diagnostics: string[] = [];
  const engine = new LayoutEngine({
    solver,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
  });
  const result = engine.layout({
    root: fixtureTree(),
    bounds: { column: 0, row: 0, width: 20, height: 8 },
  });
  assertEquals(engine.solver.id, "taffy");
  assertEquals(result.root.id, "root");
  assertEquals(diagnostics, []);
  solver.dispose();
});

Deno.test("Taffy adapter rejects duplicate public IDs before invoking a backend", () => {
  let solves = 0;
  const duplicate = createLayoutNode({
    id: "root",
    tag: "main",
    children: [createLayoutNode({ id: "root", tag: "child" })],
  });
  const solver = new TaffyLayoutSolver({
    manifest: manifest(),
    backend: {
      solve: () => {
        solves += 1;
        return layoutResult(projectedFixture());
      },
    },
  });
  assertEquals(solver.supports(duplicate), false);
  const error = assertThrows(
    () => solver.solve({ root: duplicate, bounds: { column: 0, row: 0, width: 10, height: 5 } }),
    TaffyAdapterError,
  );
  assertTaffyError(error, "invalid-layout-tree");
  assertEquals(solves, 0);
  solver.dispose();
});

Deno.test("Taffy adapter rejects asynchronous solve results", () => {
  const backend = {
    solve: () => Promise.resolve(layoutResult(projectedFixture())),
  } as unknown as TaffyBackend;
  const solver = new TaffyLayoutSolver({ manifest: manifest(), backend });
  const error = assertThrows(
    () => solver.solve({ root: fixtureTree(), bounds: { column: 0, row: 0, width: 20, height: 8 } }),
    TaffyAdapterError,
  );
  assertTaffyError(error, "invalid-result");
  assertStringIncludes(error.message, "returned a Promise");
  solver.dispose();
});

Deno.test("Taffy adapter rejects malformed or reordered backend trees", () => {
  const projected = projectedFixture();
  const malformed: TaffyBackendLayoutNode = {
    ...projected,
    children: [{ ...projected.children[0]!, id: "second" }, projected.children[1]!],
  };
  const solver = new TaffyLayoutSolver({
    manifest: manifest(),
    backend: { solve: () => layoutResult(malformed) },
  });
  const error = assertThrows(
    () => solver.solve({ root: fixtureTree(), bounds: { column: 0, row: 0, width: 20, height: 8 } }),
    TaffyAdapterError,
  );
  assertTaffyError(error, "invalid-result");
  assertStringIncludes(error.message, 'expected "first"');
  solver.dispose();
});

Deno.test("Taffy solver disposal is idempotent and prevents reuse", () => {
  let disposals = 0;
  const solver = new TaffyLayoutSolver({
    manifest: manifest(),
    backend: {
      solve: () => layoutResult(projectedFixture()),
      dispose: () => disposals += 1,
    },
  });
  assertEquals(solver.inspect(), {
    backendName: "protocol-test-backend",
    taffyVersion: "0.12.2",
    protocolVersion: 1,
    disposed: false,
  });
  solver.dispose();
  solver.dispose();
  assertEquals(disposals, 1);
  assertEquals(solver.supports(fixtureTree()), false);
  assertEquals(solver.inspect().disposed, true);
  const error = assertThrows(
    () => solver.solve({ root: fixtureTree(), bounds: { column: 0, row: 0, width: 20, height: 8 } }),
    TaffyAdapterError,
  );
  assertTaffyError(error, "solver-disposed");
});

Deno.test("Taffy candidate probe exercises the protocol without pretending its fixture is Taffy", async () => {
  const report = await runTaffyCandidateProbe(
    "memory:protocol-fixture",
    () => moduleWith(() => probeProtocolBackend()),
    2,
  );
  assertEquals(report.ok, true);
  assert(report.checks.length >= 15);
  assert(report.checks.every((check) => check.pass));
  assertEquals(report.backend, { name: "protocol-test-backend", taffyVersion: "0.12.2" });
  assertEquals(report.loader?.state, "ready");
  assertEquals(report.loader?.backendCreations, 1);
  assertEquals(report.timings?.steadyIterations, 2);
  assertEquals(report.timings?.largeNestedNodes, 781);
});

function probeProtocolBackend(): TaffyBackend {
  return {
    solve(request) {
      if (request.root.id === "root") {
        return layoutResult({
          id: "root",
          x: 0,
          y: 0,
          width: 40,
          height: 10,
          children: [
            { id: "fixed", x: 0, y: 0, width: 10, height: 10, children: [] },
            { id: "grow", x: 10, y: 0, width: 30, height: 10, children: [] },
          ],
        });
      }
      if (request.root.id === "grid") {
        return layoutResult({
          id: "grid",
          x: 0,
          y: 0,
          width: 40,
          height: 10,
          children: [
            { id: "a", x: 0, y: 0, width: 20, height: 5, children: [] },
            { id: "b", x: 20, y: 0, width: 20, height: 5, children: [] },
            { id: "c", x: 0, y: 5, width: 20, height: 5, children: [] },
            { id: "d", x: 20, y: 5, width: 20, height: 5, children: [] },
          ],
        });
      }
      if (request.root.id === "intrinsic") {
        const measured = request.measure({
          nodeId: "text",
          knownWidth: null,
          knownHeight: null,
          availableWidth: "max-content",
          availableHeight: 3,
        });
        return layoutResult({
          id: "intrinsic",
          x: 0,
          y: 0,
          width: 20,
          height: 3,
          children: [
            { id: "text", x: 0, y: 0, width: measured.width, height: 3, children: [] },
            { id: "fill", x: measured.width, y: 0, width: 20 - measured.width, height: 3, children: [] },
          ],
        });
      }
      return layoutResult(mirrorProtocolTree(request.root, true, request.bounds.width, request.bounds.height));
    },
  };
}

function mirrorProtocolTree(
  node: LayoutNode,
  root: boolean,
  rootWidth: number,
  rootHeight: number,
): TaffyBackendLayoutNode {
  return {
    id: node.id,
    x: 0,
    y: 0,
    width: root ? rootWidth : 0,
    height: root ? rootHeight : 0,
    children: node.children.map((child) => mirrorProtocolTree(child, false, rootWidth, rootHeight)),
  };
}
