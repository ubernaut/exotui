// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertRejects, assertThrows } from "./deps.ts";
import type { IconLoader } from "mermaid";
import { MermaidIconRegistry } from "../src/content/mermaid_icons.ts";
import {
  type MermaidScene,
  MermaidStandardRenderer,
  type MermaidStandardRuntime,
  renderMermaidNativeFrame,
} from "../mod.mermaid.ts";
import { MERMAID_ICON_DATA } from "./fixtures/mermaid_standard/icons.ts";

function runtime(packs: IconLoader[]): MermaidStandardRuntime {
  return {
    initialize() {},
    parse: (source) => Promise.resolve({ diagramType: source }),
    render: () => Promise.reject(new Error("This model has no DOM.")),
    getRegisteredDiagramsMetadata: () => [],
    registerIconPacks: (added) => packs.push(...added),
  };
}

Deno.test("icon registration snapshots static JSON including aliases and preserves shared runtime order", async () => {
  const packs: IconLoader[] = [];
  const engine = runtime(packs);
  const first = new MermaidStandardRenderer(engine);
  const second = new MermaidStandardRenderer(engine);
  const icons = structuredClone(MERMAID_ICON_DATA);
  const registered = first.registerIconPacks([{ name: "short", icons }]);
  icons.icons.signal!.body = "mutated caller data";
  await Promise.all([registered, second.parse("unrelated")]);
  assertEquals(packs.length, 1);
  assert("icons" in packs[0]!);
  assertEquals(packs[0].icons, MERMAID_ICON_DATA);
  assertEquals(packs[0].name, "short");
  const before = packs.length;
  await assertRejects(() => second.registerIconPacks([{ name: "bad:name", icons }]), TypeError);
  await assertRejects(
    () =>
      second.registerIconPacks([{ name: "large", icons }], {
        limits: { maxPackBytes: 16, maxTotalBytes: 16 },
      }),
    RangeError,
    "byte budget",
  );
  assertEquals(packs.length, before);
  const unsupported = runtime([]);
  delete unsupported.registerIconPacks;
  await assertRejects(
    () => new MermaidStandardRenderer(unsupported).registerIconPacks([{ name: "x", icons }]),
    Error,
    "cannot register",
  );
});

Deno.test("lazy icons are unused until requested, coalesce concurrent requests and cache an immutable result", async () => {
  const registry = new MermaidIconRegistry();
  let calls = 0;
  let context: AbortSignal | undefined;
  const source = structuredClone(MERMAID_ICON_DATA);
  await registry.install(
    registry.prepare([{
      name: "lazy",
      loader: async ({ signal }) => {
        calls++;
        context = signal;
        await Promise.resolve();
        return source;
      },
    }]),
    () => {},
  );
  assertEquals(calls, 0);
  const operation = registry.begin();
  const [first, second] = await Promise.all([registry.load("lazy"), registry.load("lazy")]);
  assertEquals(calls, 1);
  assertEquals(first, second);
  source.icons.signal!.body = "caller changed resolved data";
  assertEquals(first, MERMAID_ICON_DATA);
  assertEquals(await registry.load("lazy"), MERMAID_ICON_DATA);
  operation.finish();
  assert(context?.aborted);
  assertEquals([...operation.diagnostics], []);
});

Deno.test("icon failures retain diagnostics, retry, and never cache results arriving after abort or timeout", async () => {
  const registry = new MermaidIconRegistry();
  let resolve!: (value: typeof MERMAID_ICON_DATA) => void;
  let calls = 0;
  let signal: AbortSignal | undefined;
  await registry.install(
    registry.prepare([{
      name: "retry",
      loader: ({ signal: current }) => {
        calls++;
        signal = current;
        return new Promise((done) => resolve = done);
      },
    }], { limits: { timeoutMs: 20 } }),
    () => {},
  );
  const cancelled = new AbortController();
  const operation = registry.begin(cancelled.signal);
  const waiting = registry.load("retry");
  while (!signal) await Promise.resolve();
  cancelled.abort(new DOMException("host cancelled icons", "AbortError"));
  await assertRejects(() => waiting, DOMException, "host cancelled");
  assert(signal?.aborted);
  resolve(MERMAID_ICON_DATA);
  await Promise.resolve();
  assertEquals(registry.bindings()[0]!.icons, undefined);
  assert([...operation.diagnostics].some((warning) => warning.includes("host cancelled")));
  operation.finish();
  const timed = registry.begin();
  await assertRejects(() => registry.load("retry"), DOMException, "timed out");
  assert(signal?.aborted);
  resolve(MERMAID_ICON_DATA);
  timed.finish();
  const recovered = registry.begin();
  resolve = undefined!;
  const loaded = registry.load("retry");
  while (!resolve) await Promise.resolve();
  resolve(MERMAID_ICON_DATA);
  assertEquals(await loaded, MERMAID_ICON_DATA);
  assertEquals(calls, 3);
  assertEquals([...recovered.diagnostics], []);
  recovered.finish();
});

Deno.test("icon allocation preflights batches and lazy totals without poisoning the registry", async () => {
  const registry = new MermaidIconRegistry();
  const size = new TextEncoder().encode(JSON.stringify(MERMAID_ICON_DATA)).length;
  let installs = 0;
  const limits = { maxPackBytes: size, maxTotalBytes: size, maxPacks: 1 };
  const install = () => {
    installs++;
  };
  await registry.install(registry.prepare([{ name: "first", icons: MERMAID_ICON_DATA }], { limits }), install);
  await assertRejects(
    () => registry.install(registry.prepare([{ name: "second", icons: MERMAID_ICON_DATA }], { limits }), install),
    RangeError,
    "count budget",
  );
  assertEquals(installs, 1);
  assertEquals(registry.bindings().map((pack) => pack.name), ["first"]);
  await registry.install(
    registry.prepare([{
      name: "second",
      loader: () => Promise.resolve(MERMAID_ICON_DATA),
    }], { limits: { ...limits, maxPacks: 2 } }),
    install,
  );
  const operation = registry.begin();
  await assertRejects(() => registry.load("second"), RangeError, "total byte budget");
  assertEquals(registry.bindings()[1]!.icons, undefined);
  operation.finish();
  assertThrows(() => registry.prepare([], { limits: { maxPacks: 0 } }), RangeError);
  assertThrows(() => registry.prepare([], { limits: { timeoutMs: Infinity } }), RangeError);
});

Deno.test("icon loader replacement keeps the upstream static cache while an explicit static pack replaces it", async () => {
  const registry = new MermaidIconRegistry();
  await registry.install(registry.prepare([{ name: "same", icons: MERMAID_ICON_DATA }]), () => {});
  let calls = 0;
  await registry.install(
    registry.prepare([{
      name: "same",
      loader: () => {
        calls++;
        return Promise.resolve({ prefix: "replacement", icons: {} });
      },
    }]),
    () => {},
  );
  const operation = registry.begin();
  assertEquals(await registry.load("same"), MERMAID_ICON_DATA);
  assertEquals(calls, 0);
  const replacement = { prefix: "replacement", icons: {} };
  await registry.install(registry.prepare([{ name: "same", icons: replacement }]), () => {});
  assertEquals(await registry.load("same"), replacement);
  operation.finish();
});

Deno.test("small native vector icons retain measured density after JSON transport and explicit coarse density warns", () => {
  const scene: MermaidScene = {
    width: 24,
    height: 24,
    title: "",
    description: "",
    diagnostics: [],
    density: { columnUnits: 1, rowUnits: 1 },
    items: [{
      kind: "path",
      closed: true,
      points: [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }],
      paint: { fill: "red", stroke: "none", strokeWidth: 0, dash: [], opacity: 1 },
    }],
  };
  const transported = JSON.parse(JSON.stringify(scene)) as MermaidScene;
  const frame = renderMermaidNativeFrame(transported);
  assertEquals([frame.columns, frame.rows], [25, 25]);
  assertEquals(frame.cells[2]![2]!.background, "red");
  assertEquals(frame.diagnostics, []);
  assert(
    renderMermaidNativeFrame(scene, { columnUnits: 9, rowUnits: 18 }).diagnostics.some((warning) =>
      warning.includes("SVG icon detail")
    ),
  );
  assertThrows(() => renderMermaidNativeFrame({ ...scene, density: { columnUnits: 0, rowUnits: 1 } }), RangeError);
  assertThrows(() => renderMermaidNativeFrame({ ...scene, density: { columnUnits: 1, rowUnits: NaN } }), RangeError);
  assertThrows(
    () => renderMermaidNativeFrame({ ...scene, density: { columnUnits: 1e-30, rowUnits: 1e-30 } }),
    RangeError,
    "cell budget",
  );
});
