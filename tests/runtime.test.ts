import { assertEquals, assertRejects } from "./deps.ts";
import {
  createRuntimePlan,
  detectRuntimeCapabilities,
  formatRuntimeCapabilities,
  formatRuntimePlan,
  runtimeCapabilityEntries,
  summarizeRuntimeCapabilities,
} from "../src/runtime/capabilities.ts";
import {
  createTerminalPlan,
  createTerminalPortabilityReport,
  detectTerminalCapabilities,
  detectTerminalEnvironment,
  formatTerminalCapabilities,
  formatTerminalEnvironment,
  formatTerminalPlan,
  formatTerminalPortabilityReport,
  terminalCapabilityEntries,
  terminalEnvironmentDiagnostics,
} from "../src/runtime/terminal_capabilities.ts";
import {
  createTerminalSessionController,
  terminalMouseSequences,
  terminalSessionSequences,
} from "../src/runtime/terminal_session.ts";
import {
  createRuntimeProfileCatalogReport,
  createRuntimeProfileController,
  createRuntimeProfileRegistry,
  findRuntimeProfile,
  formatRuntimeProfileCatalogMarkdown,
  inspectRuntimeProfileCatalog,
  queryRuntimeProfiles,
  runtimeProfiles,
} from "../src/runtime/profiles.ts";
import {
  createRuntimeRendererBackendCatalogReport,
  createRuntimeRendererBackendController,
  createRuntimeRendererBackendRegistry,
  formatRuntimeRendererBackendCatalogMarkdown,
  inspectRuntimeRendererBackendCatalog,
  queryRuntimeRendererBackends,
  runtimeRendererBackends,
  selectRuntimeRendererBackend,
} from "../src/runtime/renderer_backends.ts";
import { AsyncScheduler, runTaskBatch } from "../src/runtime/scheduler.ts";
import {
  createRuntimeWorkloadRegistry,
  createRuntimeWorkloadReport,
  formatRuntimeWorkloadMarkdown,
  inspectRuntimeWorkload,
} from "../src/runtime/telemetry.ts";
import { createRenderLoop, FrameScheduler, MicrotaskScheduler, RenderLoop } from "../src/runtime/render_loop.ts";
import {
  createStorageFallbackDiagnostic,
  formatStorageErrorDetail,
  StorageFallbackDiagnostics,
} from "../src/runtime/storage_diagnostics.ts";
import {
  DiagnosticsCollector,
  formatDiagnostics,
  formatDiagnosticsMarkdown,
  formatDiagnosticStatus,
  summarizeDiagnostics,
} from "../src/runtime/diagnostics.ts";
import { createPersistentSignal, createRuntimeStore, JsonFileStore, MemoryStore } from "../src/runtime/storage.ts";
import { runWorkerBatch, type WorkerLike, WorkerPool, WorkerPoolTerminatedError } from "../src/runtime/worker_pool.ts";

Deno.test("detectRuntimeCapabilities accepts an injected scope", () => {
  const scope = {
    Worker: class {},
    navigator: { gpu: {} },
    indexedDB: {},
  } as unknown as typeof globalThis;

  assertEquals(detectRuntimeCapabilities(scope), {
    workers: true,
    webgpu: true,
    webgl: false,
    offscreenCanvas: false,
    indexedDb: true,
  });
});

Deno.test("runtime capability helpers expose labeled summaries", () => {
  const capabilities = {
    workers: true,
    webgpu: false,
    webgl: true,
    offscreenCanvas: false,
    indexedDb: true,
  };

  assertEquals(runtimeCapabilityEntries(capabilities).map((entry) => [entry.id, entry.label, entry.available]), [
    ["workers", "Workers", true],
    ["webgpu", "WebGPU", false],
    ["webgl", "WebGL", true],
    ["offscreenCanvas", "OffscreenCanvas", false],
    ["indexedDb", "IndexedDB", true],
  ]);
  assertEquals(summarizeRuntimeCapabilities(capabilities).available, 3);
  assertEquals(summarizeRuntimeCapabilities(capabilities).missing, 2);
  assertEquals(
    formatRuntimeCapabilities(capabilities),
    [
      "Runtime capabilities: 3/5 available",
      "ok Workers",
      "missing WebGPU",
      "ok WebGL",
      "missing OffscreenCanvas",
      "ok IndexedDB",
    ].join("\n"),
  );
});

Deno.test("DiagnosticsCollector records bounded structured fallback diagnostics", () => {
  const diagnostics = new DiagnosticsCollector(1);
  const events: Array<number | undefined> = [];
  const unsubscribe = diagnostics.subscribe((entry) => events.push(entry?.id));

  diagnostics.report({
    source: "storage",
    code: "indexeddb-unavailable",
    severity: "warning",
    message: "IndexedDB unavailable; using memory store.",
    time: 100,
  });
  const second = diagnostics.report({
    source: "graphics",
    code: "kitty-unavailable",
    severity: "warning",
    message: "Kitty graphics unavailable; using no-op raster surface.",
    detail: "blocked",
    context: { mode: "unknown" },
    time: 101,
  });

  assertEquals(diagnostics.inspect().count, 1);
  assertEquals(diagnostics.inspect().bySeverity.warning, 1);
  assertEquals(diagnostics.entries()[0], second);
  assertEquals(
    formatDiagnostics(diagnostics.entries()),
    "WARNING graphics/kitty-unavailable: Kitty graphics unavailable; using no-op raster surface. (blocked)",
  );

  diagnostics.clear();
  unsubscribe();

  assertEquals(events, [1, 2, undefined]);
  assertEquals(formatDiagnostics(diagnostics.entries()), "Diagnostics: none");
});

Deno.test("diagnostic report helpers summarize status bars and markdown", () => {
  const diagnostics = new DiagnosticsCollector();
  diagnostics.report({
    source: "storage",
    code: "indexeddb-unavailable",
    severity: "info",
    message: "IndexedDB unavailable; using memory store.",
    time: 10,
  });
  diagnostics.report({
    source: "process",
    code: "spawn-failed",
    severity: "error",
    message: "Process failed | command missing",
    detail: "ENOENT\nmissing",
    time: 11,
    context: { command: "missing-demo" },
  });

  const entries = diagnostics.entries();
  const summary = summarizeDiagnostics(entries);
  assertEquals(summary.count, 2);
  assertEquals(summary.ok, false);
  assertEquals(summary.highestSeverity, "error");
  assertEquals(summary.bySeverity, { debug: 0, info: 1, warning: 0, error: 1 });
  assertEquals(summary.latest?.context, { command: "missing-demo" });
  summary.latest!.context!.command = "mutated";
  assertEquals(diagnostics.entries().at(-1)?.context, { command: "missing-demo" });

  assertEquals(
    formatDiagnosticStatus(entries, { label: "runtime" }),
    "runtime 2 error (1 error, 1 info) latest process/spawn-failed",
  );
  assertEquals(formatDiagnosticStatus([], { label: "runtime" }), "runtime ok");
  assertEquals(
    formatDiagnosticsMarkdown(entries, "Runtime Diagnostics"),
    [
      "# Runtime Diagnostics",
      "",
      "2 diagnostic(s), highest severity: error.",
      "",
      "| Severity | Source | Code | Message | Detail |",
      "| --- | --- | --- | --- | --- |",
      "| info | storage | indexeddb-unavailable | IndexedDB unavailable; using memory store. |  |",
      "| error | process | spawn-failed | Process failed \\| command missing | ENOENT missing |",
    ].join("\n"),
  );
});

Deno.test("runtime plans choose worker storage and renderer strategies", () => {
  const fullPlan = createRuntimePlan({
    workers: true,
    webgpu: true,
    webgl: true,
    offscreenCanvas: true,
    indexedDb: true,
  });

  assertEquals(fullPlan.workers.strategy, "worker-pool");
  assertEquals(fullPlan.storage.strategy, "indexeddb");
  assertEquals(fullPlan.renderer.strategy, "webgpu");
  assertEquals(fullPlan.renderer.accelerated, true);

  const fallbackPlan = createRuntimePlan({
    workers: false,
    webgpu: false,
    webgl: true,
    offscreenCanvas: true,
    indexedDb: false,
  });

  assertEquals(fallbackPlan.workers.strategy, "main-thread");
  assertEquals(fallbackPlan.storage.strategy, "memory");
  assertEquals(fallbackPlan.renderer.strategy, "webgl");
  assertEquals(formatRuntimePlan(fallbackPlan).includes("renderer webgl"), true);

  const conservativePlan = createRuntimePlan({
    workers: true,
    webgpu: true,
    webgl: true,
    offscreenCanvas: true,
    indexedDb: true,
  }, {
    preferWorkers: false,
    preferPersistentStorage: false,
    preferGpuRenderer: false,
  });

  assertEquals(conservativePlan.workers.strategy, "main-thread");
  assertEquals(conservativePlan.storage.strategy, "memory");
  assertEquals(conservativePlan.renderer.strategy, "cpu");
});

Deno.test("terminal capability helpers detect color input and interaction support", () => {
  const capabilities = detectTerminalCapabilities({
    isTty: true,
    platform: "linux",
    env: {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      LANG: "en_US.UTF-8",
      TERM_PROGRAM: "WezTerm",
    },
  });

  assertEquals(capabilities, {
    interactive: true,
    colorDepth: "truecolor",
    unicode: true,
    widthMode2027: true,
    synchronizedUpdates: true,
    kittyGraphics: true,
    sixel: true,
    hyperlinks: true,
    mouse: true,
    sgrMouse: true,
    bracketedPaste: true,
    focusEvents: true,
    alternateScreen: true,
    cursorShape: true,
  });
  assertEquals(terminalCapabilityEntries(capabilities).map((entry) => [entry.id, entry.available]), [
    ["interactive", true],
    ["unicode", true],
    ["hyperlinks", true],
    ["widthMode2027", true],
    ["synchronizedUpdates", true],
    ["kittyGraphics", true],
    ["sixel", true],
    ["mouse", true],
    ["sgrMouse", true],
    ["bracketedPaste", true],
    ["focusEvents", true],
    ["alternateScreen", true],
    ["cursorShape", true],
  ]);
  assertEquals(
    formatTerminalCapabilities(capabilities).split("\n").slice(0, 3),
    [
      "Terminal capabilities: 13/13 available, truecolor color",
      "ok Interactive TTY",
      "ok Unicode",
    ],
  );
});

Deno.test("terminal plans choose portable fallbacks from preferences and detected features", () => {
  const dumb = detectTerminalCapabilities({
    isTty: true,
    env: { TERM: "dumb", LANG: "C" },
    platform: "linux",
  });

  assertEquals(dumb.interactive, false);
  assertEquals(dumb.colorDepth, "none");

  const forced = detectTerminalCapabilities({
    isTty: false,
    forceColor: "2",
    env: { TERM: "xterm", LANG: "C" },
    platform: "linux",
  });
  assertEquals(forced.colorDepth, "ansi256");

  const plan = createTerminalPlan({
    interactive: true,
    colorDepth: "ansi256",
    unicode: false,
    widthMode2027: false,
    synchronizedUpdates: false,
    kittyGraphics: false,
    sixel: false,
    hyperlinks: false,
    mouse: true,
    sgrMouse: false,
    bracketedPaste: false,
    focusEvents: false,
    alternateScreen: true,
    cursorShape: false,
  }, {
    preferUnicode: true,
    preferHyperlinks: true,
  });

  assertEquals(plan.colorDepth, "ansi256");
  assertEquals(plan.textMode, "ascii");
  assertEquals(plan.mouseProtocol, "vt200");
  assertEquals(plan.alternateScreen, true);
  assertEquals(plan.bracketedPaste, false);
  assertEquals(plan.hyperlinks, false);
  assertEquals(
    formatTerminalPlan(plan),
    [
      "Terminal plan:",
      "color    ansi256",
      "text     ascii",
      "mouse    vt200",
      "screen   alternate",
      "paste    plain",
      "focus    plain",
      "links    plain",
    ].join("\n"),
  );
});

Deno.test("terminal environment diagnostics explain tmux ssh and color fallback", () => {
  const detection = {
    isTty: true,
    platform: "linux",
    env: {
      TERM: "screen-256color",
      TMUX: "/tmp/tmux-1000/default,123,0",
      SSH_TTY: "/dev/pts/4",
      LANG: "en_US.UTF-8",
    },
  };
  const environment = detectTerminalEnvironment(detection);
  const diagnostics = terminalEnvironmentDiagnostics(environment);
  const report = createTerminalPortabilityReport({ detection });

  assertEquals(environment.multiplexer, "tmux");
  assertEquals(environment.remote, true);
  assertEquals(environment.colorDepth, "ansi256");
  assertEquals(environment.truecolor, false);
  assertEquals(diagnostics.map((diagnostic) => diagnostic.id), [
    "tmux-truecolor-missing",
    "remote-session",
  ]);
  assertEquals(formatTerminalEnvironment(environment).includes("mux      tmux"), true);
  assertEquals(report.environment.multiplexer, "tmux");
  assertEquals(report.plan.colorDepth, "ansi256");
  assertEquals(formatTerminalPortabilityReport(report).includes("Terminal environment:"), true);
});

Deno.test("terminal session helpers compose setup and teardown sequences", () => {
  const plan = createTerminalPlan({
    interactive: true,
    colorDepth: "truecolor",
    unicode: true,
    widthMode2027: false,
    synchronizedUpdates: false,
    kittyGraphics: false,
    sixel: false,
    hyperlinks: true,
    mouse: true,
    sgrMouse: true,
    bracketedPaste: true,
    focusEvents: true,
    alternateScreen: true,
    cursorShape: true,
  });

  assertEquals(terminalMouseSequences("none"), { enter: "", exit: "" });
  assertEquals(terminalMouseSequences("x10"), { enter: "\x1b[?9h", exit: "\x1b[?9l" });
  assertEquals(terminalMouseSequences("vt200"), { enter: "\x1b[?1000h", exit: "\x1b[?1000l" });
  assertEquals(terminalMouseSequences("sgr"), {
    enter: "\x1b[?1000h\x1b[?1006h",
    exit: "\x1b[?1006l\x1b[?1000l",
  });
  assertEquals(terminalSessionSequences({ plan }), {
    enter: "\x1b[?1049h\x1b[?25l\x1b[?2004h\x1b[?1004h\x1b[?1000h\x1b[?1006h",
    exit: "\x1b[?1006l\x1b[?1000l\x1b[?1004l\x1b[?2004l\x1b[?25h\x1b[?1049l",
  });
  assertEquals(terminalSessionSequences({ plan, hideCursor: false }).enter.includes("\x1b[?25l"), false);
});

Deno.test("terminal session helpers skip setup sequences for noninteractive plans", () => {
  const plan = createTerminalPlan(detectTerminalCapabilities({
    isTty: false,
    env: { TERM: "xterm-256color", LANG: "en_US.UTF-8" },
    platform: "linux",
  }));

  assertEquals(terminalSessionSequences({ plan }), { enter: "", exit: "" });
  assertEquals(createTerminalSessionController({ write: () => 0 }, { plan }).inspect(), {
    active: false,
    alternateScreen: false,
    bracketedPaste: false,
    focusEvents: false,
    mouseProtocol: "none",
    hideCursor: false,
  });
});

Deno.test("TerminalSessionController writes enter and exit sequences idempotently", async () => {
  const decoder = new TextDecoder();
  const writes: string[] = [];
  const plan = createTerminalPlan({
    interactive: true,
    colorDepth: "ansi16",
    unicode: true,
    widthMode2027: false,
    synchronizedUpdates: false,
    kittyGraphics: false,
    sixel: false,
    hyperlinks: false,
    mouse: true,
    sgrMouse: false,
    bracketedPaste: false,
    focusEvents: false,
    alternateScreen: true,
    cursorShape: false,
  });
  const controller = createTerminalSessionController({
    write(data) {
      writes.push(decoder.decode(data));
      return data.length;
    },
  }, { plan });

  assertEquals(controller.inspect(), {
    active: false,
    alternateScreen: true,
    bracketedPaste: false,
    focusEvents: false,
    mouseProtocol: "vt200",
    hideCursor: true,
  });
  await controller.enter();
  await controller.enter();
  assertEquals(controller.active, true);
  assertEquals(writes, ["\x1b[?1049h\x1b[?25l\x1b[?1000h"]);
  await controller.dispose();
  await controller.exit();
  assertEquals(controller.active, false);
  assertEquals(writes, ["\x1b[?1049h\x1b[?25l\x1b[?1000h", "\x1b[?1000l\x1b[?25h\x1b[?1049l"]);
});

Deno.test("runtime profiles expose named strategy policies", () => {
  const capabilities = {
    workers: true,
    webgpu: false,
    webgl: true,
    offscreenCanvas: true,
    indexedDb: false,
  };
  const registry = createRuntimeProfileRegistry();

  assertEquals(registry.ids(), ["balanced", "throughput", "portable", "ephemeral"]);
  assertEquals(runtimeProfiles().map((profile) => profile.id), [
    "balanced",
    "throughput",
    "portable",
    "ephemeral",
  ]);
  assertEquals(findRuntimeProfile("Throughput")?.id, "throughput");
  assertEquals(registry.plan("balanced", capabilities).renderer.strategy, "webgl");
  assertEquals(registry.plan("portable", capabilities), {
    capabilities,
    workers: {
      strategy: "main-thread",
      accelerated: false,
      reason: "Worker usage was disabled by runtime plan preferences.",
    },
    storage: {
      strategy: "memory",
      accelerated: false,
      reason: "IndexedDB is unavailable, so settings should use memory or a custom store.",
    },
    renderer: {
      strategy: "cpu",
      accelerated: false,
      reason: "GPU renderer usage was disabled by runtime plan preferences.",
    },
  });
  assertEquals(registry.unregister("ephemeral"), true);
  assertEquals(registry.has("ephemeral"), false);
});

Deno.test("RuntimeProfileController selects profiles and derives plans", () => {
  const invalid: string[] = [];
  const controller = createRuntimeProfileController({
    activeId: "throughput",
    capabilities: {
      workers: true,
      webgpu: false,
      webgl: true,
      offscreenCanvas: true,
      indexedDb: true,
    },
    onInvalidProfile: (id) => invalid.push(id),
  });

  assertEquals(controller.activeId.peek(), "throughput");
  assertEquals(controller.plan()?.renderer.strategy, "webgl");
  assertEquals(controller.nextProfile(), "portable");
  assertEquals(controller.previousProfile(), "throughput");
  assertEquals(controller.setProfile("missing"), false);
  assertEquals(invalid, ["missing"]);

  controller.activeId.value = "missing";
  assertEquals(controller.activeId.peek(), "balanced");
  assertEquals(invalid, ["missing", "missing"]);
  assertEquals(controller.inspect().active?.id, "balanced");
  assertEquals(controller.catalog({ tag: "performance" }).profiles.map((profile) => profile.id), ["throughput"]);
});

Deno.test("runtime profile catalogs filter inspect and format reports", () => {
  const capabilities = {
    workers: true,
    webgpu: true,
    webgl: true,
    offscreenCanvas: true,
    indexedDb: true,
  };
  const profiles = queryRuntimeProfiles(runtimeProfiles(), { rendererStrategy: "webgpu" }, capabilities);
  const portable = queryRuntimeProfiles(runtimeProfiles(), { search: "portable", accelerated: false }, {
    ...capabilities,
    indexedDb: false,
  });
  const report = createRuntimeProfileCatalogReport({
    capabilities,
    query: { tag: "performance" },
  });
  const markdown = formatRuntimeProfileCatalogMarkdown({
    capabilities,
    query: { storageStrategy: "memory" },
    title: "Memory Profiles",
  });

  assertEquals(profiles.map((profile) => profile.id), ["balanced", "throughput", "ephemeral"]);
  assertEquals(portable.map((profile) => profile.id), ["portable"]);
  assertEquals(report.profiles.map((profile) => profile.id), ["throughput"]);
  assertEquals(inspectRuntimeProfileCatalog(report.profiles), {
    count: 1,
    accelerated: 1,
    workerStrategies: ["worker-pool"],
    storageStrategies: ["indexeddb"],
    rendererStrategies: ["webgpu"],
    tags: ["performance", "visualization"],
  });
  assertEquals(
    markdown,
    [
      "# Memory Profiles",
      "",
      "1 profiles, 1 with at least one accelerated strategy.",
      "",
      "| Profile | Workers | Storage | Renderer | Tags |",
      "| --- | --- | --- | --- | --- |",
      "| Ephemeral | worker-pool | memory | webgpu | memory, testing |",
    ].join("\n"),
  );
});

Deno.test("runtime renderer backends select capability-aware render paths", () => {
  const capabilities = {
    workers: true,
    webgpu: false,
    webgl: true,
    offscreenCanvas: true,
    indexedDb: false,
  };
  const registry = createRuntimeRendererBackendRegistry();

  assertEquals(registry.ids(), ["webgpu-three-ascii", "webgl-canvas", "terminal-cpu"]);
  assertEquals(registry.select(capabilities)?.id, "webgl-canvas");
  assertEquals(registry.select({ ...capabilities, webgl: false })?.id, "terminal-cpu");
  assertEquals(registry.select({ ...capabilities, webgl: false }, { allowCpuFallback: false }), undefined);
  assertEquals(selectRuntimeRendererBackend(runtimeRendererBackends(), capabilities, { tag: "ascii" }), undefined);
  assertEquals(
    selectRuntimeRendererBackend(runtimeRendererBackends(), { ...capabilities, webgpu: true }, { tag: "ascii" })?.id,
    "webgpu-three-ascii",
  );

  registry.unregister("webgl-canvas");
  assertEquals(registry.has("webgl-canvas"), false);
});

Deno.test("runtime renderer backend catalogs query inspect and format reports", () => {
  const capabilities = {
    workers: false,
    webgpu: true,
    webgl: false,
    offscreenCanvas: false,
    indexedDb: false,
  };
  const queried = queryRuntimeRendererBackends(runtimeRendererBackends(), { search: "ascii gpu" }, capabilities);
  const report = createRuntimeRendererBackendCatalogReport({
    capabilities,
    query: { tag: "gpu" },
  });
  const markdown = formatRuntimeRendererBackendCatalogMarkdown({
    capabilities,
    query: { available: true },
    title: "Renderers",
  });

  assertEquals(queried.map((backend) => backend.id), ["webgpu-three-ascii"]);
  assertEquals(report.backends.map((backend) => [backend.id, backend.available, backend.missingCapabilities]), [
    ["webgpu-three-ascii", true, []],
    ["webgl-canvas", false, ["webgl"]],
  ]);
  assertEquals(inspectRuntimeRendererBackendCatalog(report.backends), {
    count: 2,
    available: 1,
    accelerated: 1,
    strategies: ["webgl", "webgpu"],
    capabilities: ["webgl", "webgpu"],
    tags: ["ascii", "canvas", "fallback", "gpu", "three", "visualization"],
  });
  assertEquals(
    markdown,
    [
      "# Renderers",
      "",
      "2 backends, 2 available, 1 accelerated.",
      "",
      "Selected: WebGPU Three ASCII.",
      "",
      "| Backend | Strategy | Available | Missing | Tags |",
      "| --- | --- | --- | --- | --- |",
      "| WebGPU Three ASCII | webgpu | yes | - | ascii, gpu, three, visualization |",
      "| Terminal CPU | cpu | yes | - | fallback, portable, terminal |",
    ].join("\n"),
  );
});

Deno.test("RuntimeRendererBackendController tracks active and selected backends", () => {
  const invalid: string[] = [];
  let capabilities = {
    workers: true,
    webgpu: false,
    webgl: true,
    offscreenCanvas: true,
    indexedDb: false,
  };
  const controller = createRuntimeRendererBackendController({
    capabilities: () => capabilities,
    selection: { allowCpuFallback: true },
    onInvalidBackend: (id) => invalid.push(id),
  });

  assertEquals(controller.activeId.peek(), "webgl-canvas");
  assertEquals(controller.selected()?.id, "webgl-canvas");
  assertEquals(controller.nextBackend(), "terminal-cpu");
  assertEquals(controller.previousBackend(), "webgl-canvas");
  assertEquals(controller.setBackend("missing"), false);
  assertEquals(invalid, ["missing"]);

  capabilities = { ...capabilities, webgpu: true };
  assertEquals(controller.setSelectedBackend(), "webgpu-three-ascii");
  assertEquals(controller.catalog({ available: true }).selected?.id, "webgpu-three-ascii");
  assertEquals(controller.inspect().active?.accelerated, true);

  controller.registry.unregister("webgpu-three-ascii");
  controller.activeId.value = "terminal-cpu";
  controller.activeId.value = "webgpu-three-ascii";
  assertEquals(controller.activeId.peek(), "webgl-canvas");
  assertEquals(invalid, ["missing", "webgpu-three-ascii"]);
});

Deno.test("AsyncScheduler respects the configured concurrency limit", async () => {
  const scheduler = new AsyncScheduler({ concurrency: 1 });
  const order: string[] = [];

  const first = scheduler.run(async () => {
    order.push("first:start");
    await Promise.resolve();
    order.push("first:end");
  });
  const second = scheduler.run(() => {
    order.push("second");
  });

  await Promise.all([first, second]);
  assertEquals(order, ["first:start", "first:end", "second"]);
});

Deno.test("AsyncScheduler runs higher priority queued tasks first", async () => {
  const scheduler = new AsyncScheduler({ concurrency: 1 });
  const order: string[] = [];
  const releaseFirst = deferred<void>();

  const first = scheduler.run(async () => {
    order.push("first");
    await releaseFirst.promise;
  });
  const low = scheduler.run(() => order.push("low"), { priority: 0 });
  const high = scheduler.run(() => order.push("high"), { priority: 10 });

  assertEquals(scheduler.running(), 1);
  assertEquals(scheduler.pending(), 2);

  releaseFirst.resolve();
  await Promise.all([first, low, high]);

  assertEquals(order, ["first", "high", "low"]);
});

Deno.test("AsyncScheduler aborts pending tasks", async () => {
  const scheduler = new AsyncScheduler({ concurrency: 1 });
  const releaseFirst = deferred<void>();
  const controller = new AbortController();
  let ran = false;

  const first = scheduler.run(() => releaseFirst.promise);
  const second = scheduler.run(() => {
    ran = true;
  }, { signal: controller.signal }).catch((error) => error);

  assertEquals(scheduler.pending(), 1);
  controller.abort();
  const error = await second;

  assertEquals(error.name, "AbortError");
  assertEquals(ran, false);
  assertEquals(scheduler.pending(), 0);

  releaseFirst.resolve();
  await first;
});

Deno.test("AsyncScheduler inspects capacity and waits for idle", async () => {
  const scheduler = new AsyncScheduler({ concurrency: 1 });
  const releaseFirst = deferred<void>();
  const order: string[] = [];

  const first = scheduler.run(async () => {
    order.push("first:start");
    await releaseFirst.promise;
    order.push("first:end");
  });
  const second = scheduler.run(() => order.push("second"));
  const idle = scheduler.waitForIdle().then(() => order.push("idle"));

  assertEquals(scheduler.capacity(), 1);
  assertEquals(scheduler.idle(), false);
  assertEquals(scheduler.inspect(), {
    concurrency: 1,
    running: 1,
    pending: 1,
    idle: false,
    scheduled: 2,
    completed: 0,
    failed: 0,
    cancelled: 0,
    maxRunning: 1,
    maxPending: 1,
  });

  releaseFirst.resolve();
  await Promise.all([first, second, idle]);

  assertEquals(scheduler.inspect(), {
    concurrency: 1,
    running: 0,
    pending: 0,
    idle: true,
    scheduled: 2,
    completed: 2,
    failed: 0,
    cancelled: 0,
    maxRunning: 1,
    maxPending: 1,
  });
  assertEquals(order, ["first:start", "first:end", "second", "idle"]);
});

Deno.test("RenderLoop runs immediate ticks through an injectable timer", () => {
  const timer = new TestRenderLoopTimer();
  const frames: Array<[number, number]> = [];
  const loop = createRenderLoop({
    intervalMs: 25,
    timer,
    tick: ({ frame, deltaMs }) => frames.push([frame, deltaMs]),
  });

  loop.start();
  assertEquals(frames, [[1, 0]]);
  assertEquals(timer.pendingCount(), 1);

  timer.advance(25);
  timer.flushNext();
  assertEquals(frames, [[1, 0], [2, 25]]);
  assertEquals(loop.inspect(), {
    running: true,
    frame: 2,
    intervalMs: 25,
    frameBudgetMs: 25,
    lastStartedAt: 25,
    lastDurationMs: 0,
    averageDurationMs: 0,
    maxDurationMs: 0,
    overBudgetFrames: 0,
    lastError: undefined,
  });

  loop.stop();
  assertEquals(loop.running, false);
  assertEquals(timer.pendingCount(), 0);
});

Deno.test("RenderLoop compensates its next delay for time spent rendering", () => {
  const timer = new TestRenderLoopTimer();
  const frames: Array<[number, number]> = [];
  const loop = new RenderLoop({
    intervalMs: 16,
    timer,
    tick: ({ frame, deltaMs }) => {
      frames.push([frame, deltaMs]);
      timer.advance(6);
    },
  });

  loop.start();
  assertEquals(timer.lastDelay(), 10);
  timer.advance(10);
  timer.flushNext();
  assertEquals(frames, [[1, 0], [2, 16]]);
  assertEquals(timer.lastDelay(), 10);
  loop.stop();
});

Deno.test("RenderLoop supports delayed start manual steps and interval updates", () => {
  const timer = new TestRenderLoopTimer();
  const frames: number[] = [];
  const loop = new RenderLoop({
    intervalMs: 10,
    immediate: false,
    timer,
    tick: ({ frame }) => frames.push(frame),
  });

  loop.start();
  assertEquals(frames, []);
  assertEquals(timer.lastDelay(), 10);

  loop.intervalMs = 5;
  loop.step();
  assertEquals(frames, [1]);
  timer.advance(10);
  timer.flushNext();
  assertEquals(frames, [1, 2]);
  assertEquals(timer.lastDelay(), 5);
});

Deno.test("RenderLoop tracks duration pressure against the frame budget", () => {
  const timer = new TestRenderLoopTimer();
  const loop = new RenderLoop({
    intervalMs: 10,
    immediate: false,
    timer,
    tick: ({ frame }) => timer.advance(frame === 1 ? 12 : 4),
  });

  loop.step();
  loop.step();

  assertEquals(loop.inspect(), {
    running: false,
    frame: 2,
    intervalMs: 10,
    frameBudgetMs: 10,
    lastStartedAt: 12,
    lastDurationMs: 4,
    averageDurationMs: 8,
    maxDurationMs: 12,
    overBudgetFrames: 1,
    lastError: undefined,
  });
});

Deno.test("RenderLoop reports errors and stops after failed ticks", () => {
  const timer = new TestRenderLoopTimer();
  const errors: unknown[] = [];
  const failure = new Error("render failed");
  const loop = createRenderLoop({
    timer,
    onError: (error) => errors.push(error),
    tick: () => {
      throw failure;
    },
  });

  loop.start();
  assertEquals(loop.running, false);
  assertEquals(errors, [failure]);
  assertEquals(loop.inspect().lastError, failure);
  assertEquals(timer.pendingCount(), 0);
});

Deno.test("MicrotaskScheduler coalesces pending work and runs the latest callback", () => {
  const queue: Array<() => void> = [];
  const scheduler = new MicrotaskScheduler({
    queueMicrotask: (callback) => queue.push(callback),
  });
  const runs: string[] = [];

  assertEquals(scheduler.schedule(() => runs.push("first")), true);
  assertEquals(scheduler.schedule(() => runs.push("latest")), false);
  assertEquals(queue.length, 1);
  assertEquals(scheduler.inspect(), { scheduled: true, flushed: 0, cancelled: 0 });

  queue.shift()!();

  assertEquals(runs, ["latest"]);
  assertEquals(scheduler.inspect(), { scheduled: false, flushed: 1, cancelled: 0 });
});

Deno.test("MicrotaskScheduler can cancel or synchronously flush pending work", () => {
  const queue: Array<() => void> = [];
  const scheduler = new MicrotaskScheduler({
    queueMicrotask: (callback) => queue.push(callback),
  });
  const runs: string[] = [];

  assertEquals(scheduler.schedule(() => runs.push("cancelled")), true);
  assertEquals(scheduler.cancel(), true);
  assertEquals(scheduler.cancel(), false);
  queue.shift()!();
  assertEquals(runs, []);
  assertEquals(scheduler.inspect(), { scheduled: false, flushed: 0, cancelled: 1 });

  assertEquals(scheduler.schedule(() => runs.push("flushed")), true);
  assertEquals(scheduler.flush(), true);
  assertEquals(scheduler.flush(), false);
  queue.shift()!();
  assertEquals(runs, ["flushed"]);
  assertEquals(scheduler.inspect(), { scheduled: false, flushed: 1, cancelled: 1 });
});

Deno.test("MicrotaskScheduler reports callback errors without leaving stale scheduled state", () => {
  const queue: Array<() => void> = [];
  const failure = new Error("draw failed");
  const errors: unknown[] = [];
  const scheduler = new MicrotaskScheduler({
    queueMicrotask: (callback) => queue.push(callback),
    onError: (error) => errors.push(error),
  });

  assertEquals(
    scheduler.schedule(() => {
      throw failure;
    }),
    true,
  );
  queue.shift()!();

  assertEquals(errors, [failure]);
  assertEquals(scheduler.inspect(), { scheduled: false, flushed: 1, cancelled: 0 });
});

Deno.test("FrameScheduler coalesces invalidations behind a frame interval", () => {
  const timer = new TestRenderLoopTimer();
  const scheduler = new FrameScheduler({ timer, intervalMs: 16 });
  const runs: string[] = [];

  assertEquals(scheduler.schedule(() => runs.push("first")), true);
  assertEquals(timer.pendingCount(), 1);
  assertEquals(timer.lastDelay(), 0);
  assertEquals(scheduler.schedule(() => runs.push("latest")), false);

  timer.flushNext();
  assertEquals(runs, ["latest"]);
  assertEquals(scheduler.inspect(), {
    scheduled: false,
    flushed: 1,
    cancelled: 0,
    intervalMs: 16,
    lastFlushAt: 0,
  });

  timer.advance(5);
  assertEquals(scheduler.schedule(() => runs.push("delayed")), true);
  assertEquals(timer.lastDelay(), 11);
  timer.advance(11);
  timer.flushNext();

  assertEquals(runs, ["latest", "delayed"]);
  assertEquals(scheduler.inspect().lastFlushAt, 16);
});

Deno.test("FrameScheduler spaces frames from callback completion", () => {
  const timer = new TestRenderLoopTimer();
  const scheduler = new FrameScheduler({ timer, intervalMs: 16 });
  const runs: string[] = [];

  assertEquals(
    scheduler.schedule(() => {
      runs.push("slow");
      timer.advance(40);
    }),
    true,
  );
  timer.flushNext();

  assertEquals(runs, ["slow"]);
  assertEquals(scheduler.inspect().lastFlushAt, 40);

  assertEquals(scheduler.schedule(() => runs.push("next")), true);
  assertEquals(timer.lastDelay(), 16);
  timer.advance(16);
  timer.flushNext();

  assertEquals(runs, ["slow", "next"]);
  assertEquals(scheduler.inspect().lastFlushAt, 56);
});

Deno.test("FrameScheduler can cancel flush and report callback errors", () => {
  const timer = new TestRenderLoopTimer();
  const failure = new Error("frame failed");
  const errors: unknown[] = [];
  const scheduler = new FrameScheduler({
    timer,
    intervalMs: 20,
    onError: (error) => errors.push(error),
  });
  const runs: string[] = [];

  assertEquals(scheduler.schedule(() => runs.push("cancelled")), true);
  assertEquals(scheduler.cancel(), true);
  assertEquals(scheduler.cancel(), false);
  timer.flushNext();
  assertEquals(runs, []);
  assertEquals(scheduler.inspect(), {
    scheduled: false,
    flushed: 0,
    cancelled: 1,
    intervalMs: 20,
    lastFlushAt: undefined,
  });

  assertEquals(
    scheduler.schedule(() => {
      throw failure;
    }),
    true,
  );
  timer.flushNext();

  assertEquals(errors, [failure]);
  assertEquals(scheduler.inspect().flushed, 1);
});

Deno.test("AsyncScheduler can clear queued work without stopping active work", async () => {
  const scheduler = new AsyncScheduler({ concurrency: 1 });
  const releaseFirst = deferred<void>();
  let ran = false;
  const reason = new Error("cancel queued");

  const first = scheduler.run(() => releaseFirst.promise);
  const second = scheduler.run(() => {
    ran = true;
  }).catch((error) => error);

  assertEquals(scheduler.clearPending(reason), 1);
  assertEquals(await second, reason);
  assertEquals(ran, false);
  assertEquals(scheduler.inspect(), {
    concurrency: 1,
    running: 1,
    pending: 0,
    idle: false,
    scheduled: 2,
    completed: 0,
    failed: 0,
    cancelled: 1,
    maxRunning: 1,
    maxPending: 1,
  });

  releaseFirst.resolve();
  await first;
  await scheduler.waitForIdle();
  assertEquals(scheduler.idle(), true);
});

Deno.test("AsyncScheduler schedule exposes cancellable task handles", async () => {
  const scheduler = new AsyncScheduler({ concurrency: 1 });
  const releaseFirst = deferred<void>();
  const cancelReason = new Error("no longer visible");
  let ran = false;

  const first = scheduler.schedule(() => releaseFirst.promise, { priority: 1 });
  const second = scheduler.schedule(() => {
    ran = true;
    return "second";
  }, { priority: 5 });

  assertEquals(first.inspect(), { priority: 1, sequence: 0, status: "running" });
  assertEquals(second.inspect(), { priority: 5, sequence: 1, status: "queued" });
  assertEquals(second.cancel(cancelReason), true);
  assertEquals(second.inspect(), { priority: 5, sequence: 1, status: "cancelled" });
  assertEquals(second.cancel(), false);
  assertEquals(await second.promise.catch((error) => error), cancelReason);
  assertEquals(ran, false);

  releaseFirst.resolve();
  await first.promise;
  assertEquals(first.inspect(), { priority: 1, sequence: 0, status: "settled" });
  assertEquals(scheduler.inspect(), {
    concurrency: 1,
    running: 0,
    pending: 0,
    idle: true,
    scheduled: 2,
    completed: 1,
    failed: 0,
    cancelled: 1,
    maxRunning: 1,
    maxPending: 1,
  });
});

Deno.test("AsyncScheduler schedule handles running and aborted task states", async () => {
  const scheduler = new AsyncScheduler({ concurrency: 1 });
  const controller = new AbortController();
  const releaseFirst = deferred<void>();

  const first = scheduler.schedule(() => releaseFirst.promise);
  const aborted = scheduler.schedule(() => "never", { signal: controller.signal });
  controller.abort();

  assertEquals(aborted.inspect().status, "cancelled");
  assertEquals(await aborted.promise.catch((error) => error.name), "AbortError");
  assertEquals(first.cancel(), false);
  assertEquals(first.inspect().status, "running");

  releaseFirst.resolve();
  await first.promise;
  assertEquals(first.inspect().status, "settled");
});

Deno.test("AsyncScheduler records failed task telemetry", async () => {
  const scheduler = new AsyncScheduler({ concurrency: 2 });
  const failure = new Error("task failed");

  const error = await scheduler.run(() => {
    throw failure;
  }).catch((caught) => caught);

  assertEquals(error, failure);
  assertEquals(scheduler.inspect(), {
    concurrency: 2,
    running: 0,
    pending: 0,
    idle: true,
    scheduled: 1,
    completed: 0,
    failed: 1,
    cancelled: 0,
    maxRunning: 1,
    maxPending: 1,
  });
});

Deno.test("runTaskBatch preserves input order while using scheduler priority", async () => {
  const scheduler = new AsyncScheduler({ concurrency: 1 });
  const releaseFirst = deferred<void>();
  const execution: number[] = [];

  const batch = runTaskBatch([
    {
      input: 1,
      priority: 0,
      task: async (value) => {
        execution.push(value);
        await releaseFirst.promise;
        return value * 10;
      },
    },
    { input: 2, priority: 0 },
    { input: 3, priority: 10 },
  ], {
    scheduler,
    task: (value) => {
      execution.push(value);
      return value * 10;
    },
  });

  await Promise.resolve();
  assertEquals(scheduler.inspect(), {
    concurrency: 1,
    running: 1,
    pending: 2,
    idle: false,
    scheduled: 3,
    completed: 0,
    failed: 0,
    cancelled: 0,
    maxRunning: 1,
    maxPending: 2,
  });

  releaseFirst.resolve();
  const results = await batch;

  assertEquals(execution, [1, 3, 2]);
  assertEquals(results, [
    { input: 1, index: 0, value: 10 },
    { input: 2, index: 1, value: 20 },
    { input: 3, index: 2, value: 30 },
  ]);
});

Deno.test("runTaskBatch supports abortable batch work", async () => {
  const scheduler = new AsyncScheduler({ concurrency: 1 });
  const releaseFirst = deferred<void>();
  const controller = new AbortController();

  const batch = runTaskBatch([1, 2], {
    scheduler,
    signal: controller.signal,
    task: async (value) => {
      if (value === 1) await releaseFirst.promise;
      return value;
    },
  }).catch((error) => error);

  await Promise.resolve();
  controller.abort();
  releaseFirst.resolve();

  const error = await batch;
  assertEquals(error.name, "AbortError");
  await scheduler.waitForIdle();
  assertEquals(scheduler.inspect(), {
    concurrency: 1,
    running: 0,
    pending: 0,
    idle: true,
    scheduled: 2,
    completed: 1,
    failed: 0,
    cancelled: 1,
    maxRunning: 1,
    maxPending: 1,
  });
});

Deno.test("MemoryStore implements the async store contract", async () => {
  const store = new MemoryStore<number>();
  await store.set("answer", 42);
  assertEquals(await store.get("answer"), 42);
  await store.delete("answer");
  assertEquals(await store.get("answer"), undefined);
});

Deno.test("JsonFileStore persists async store values through an injected JSON file adapter", async () => {
  const files = new Map<string, string>();
  const missing = new Error("missing");
  const fileSystem = {
    readTextFile: (path: string): Promise<string> => {
      const value = files.get(path);
      if (value === undefined) return Promise.reject(missing);
      return Promise.resolve(value);
    },
    writeTextFile: (path: string, data: string): Promise<void> => {
      files.set(path, data);
      return Promise.resolve();
    },
    isNotFound: (error: unknown) => error === missing,
  };
  const path = "workspaces.json";
  const store = new JsonFileStore<number>(path, fileSystem);

  assertEquals(await store.get("missing"), undefined);
  await store.set("answer", 42);
  assertEquals(await store.get("answer"), 42);
  assertEquals(JSON.parse(files.get(path) ?? "{}"), { answer: 42 });

  const restored = new JsonFileStore<number>(path, fileSystem);
  assertEquals(await restored.get("answer"), 42);
  await restored.delete("answer");
  assertEquals(await restored.get("answer"), undefined);
  assertEquals(JSON.parse(files.get(path) ?? "{}"), {});
});

Deno.test("createStorageFallbackDiagnostic formats stable storage failure codes", () => {
  const diagnostic = createStorageFallbackDiagnostic({
    source: "web-workbench",
    storage: "IndexedDB",
    operation: "workspace persist",
    error: new Error("blocked"),
    context: { workspace: "default" },
  });

  assertEquals(diagnostic, {
    source: "web-workbench",
    code: "indexeddb-workspace-persist-failed",
    severity: "warning",
    message: "IndexedDB workspace persist failed; continuing with in-memory state.",
    detail: "blocked",
    context: {
      storage: "IndexedDB",
      operation: "workspace persist",
      workspace: "default",
    },
  });
});

Deno.test("StorageFallbackDiagnostics suppresses duplicate fallback chatter", () => {
  const diagnostics = new DiagnosticsCollector();
  const storage = new StorageFallbackDiagnostics(diagnostics);

  const first = storage.report({
    source: "demo",
    storage: "localStorage",
    operation: "read",
    error: "denied",
  });
  const second = storage.report({
    source: "demo",
    storage: "localStorage",
    operation: "read",
    error: "denied",
  });

  assertEquals(first?.code, "localstorage-read-failed");
  assertEquals(second, undefined);
  assertEquals(diagnostics.inspect().count, 1);
});

Deno.test("formatStorageErrorDetail handles unknown exception values", () => {
  assertEquals(formatStorageErrorDetail(null), undefined);
  assertEquals(formatStorageErrorDetail("quota"), "quota");
  assertEquals(formatStorageErrorDetail({ name: "QuotaExceededError" }), '{"name":"QuotaExceededError"}');
});

Deno.test("createRuntimeStore falls back to memory without IndexedDB", async () => {
  const diagnostics = new DiagnosticsCollector();
  const store = createRuntimeStore<number>({
    databaseName: "deno-tui-test",
    scope: {} as typeof globalThis,
    diagnostics,
  });

  await store.set("answer", 42);
  assertEquals(await store.get("answer"), 42);
  assertEquals(diagnostics.entries().map((entry) => [entry.source, entry.code, entry.severity]), [
    ["storage", "indexeddb-unavailable", "info"],
  ]);
});

Deno.test("IndexedDbStore reports blocked open diagnostics", async () => {
  const diagnostics = new DiagnosticsCollector();
  const error = new Error("blocked by browser policy");
  const request = {
    error,
    result: undefined,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  } as {
    error: Error;
    result: unknown;
    onsuccess: (() => void) | null;
    onerror: (() => void) | null;
    onupgradeneeded: (() => void) | null;
  };
  const scope = {
    indexedDB: {
      open: () => {
        queueMicrotask(() => request.onerror?.());
        return request;
      },
    },
  } as unknown as typeof globalThis;
  const store = createRuntimeStore<number>({
    databaseName: "deno-tui-test",
    scope,
    diagnostics,
  });

  await assertRejects(() => store.get("answer"), Error, "blocked by browser policy");
  assertEquals(diagnostics.entries().map((entry) => [entry.source, entry.code, entry.severity, entry.detail]), [
    ["storage", "indexeddb-open-failed", "warning", "blocked by browser policy"],
  ]);
});

Deno.test("PersistentSignal loads, persists, and resets values", async () => {
  const store = new MemoryStore<number>();
  await store.set("count", 7);
  const persisted = createPersistentSignal({
    key: "count",
    initialValue: 0,
    store,
  });

  assertEquals(persisted.value.peek(), 0);
  assertEquals(await persisted.ready, 7);
  assertEquals(persisted.value.peek(), 7);

  persisted.update((value) => value + 1);
  await persisted.flush();
  assertEquals(await store.get("count"), 8);

  await persisted.reset();
  assertEquals(persisted.value.peek(), 0);
  assertEquals(await store.get("count"), undefined);
});

Deno.test("PersistentSignal preserves local changes made before storage is ready", async () => {
  const store = new DeferredStore<number>();
  const persisted = createPersistentSignal({
    key: "count",
    initialValue: 0,
    store,
  });

  persisted.set(5);
  store.resolveGet(2);

  assertEquals(await persisted.ready, 5);
  await persisted.flush();
  assertEquals(await store.get("count"), 5);
});

Deno.test("WorkerPool runs module worker jobs", async () => {
  const workerUrl = new URL("./fixtures/sum_worker.ts", import.meta.url);
  const permission = await Deno.permissions.query({ name: "read", path: workerUrl });
  if (permission.state !== "granted") {
    return;
  }

  const pool = new WorkerPool<number[], number>({
    workerUrl,
    size: 2,
    name: "deno-tui-test",
  });

  try {
    assertEquals(await Promise.all([pool.run([1, 2]), pool.run([3, 4])]), [3, 7]);
  } finally {
    pool.terminate();
  }
});

Deno.test("WorkerPool exposes pending work and ignores aborted worker responses", async () => {
  const workers: TestWorker[] = [];
  const pool = new WorkerPool<number, number>({
    workerUrl: new URL("./fixtures/sum_worker.ts", import.meta.url),
    size: 2,
    workerFactory: (_url, _options) => {
      const worker = new TestWorker();
      workers.push(worker);
      return worker;
    },
  });
  const controller = new AbortController();
  const aborted = pool.run(4, { signal: controller.signal }).catch((error) => error);

  assertEquals(pool.size, 2);
  assertEquals(pool.pendingCount(), 1);
  assertEquals(workers[0].messages, [{ id: 1, payload: 4 }]);

  controller.abort();
  const error = await aborted;
  assertEquals(error.name, "AbortError");
  assertEquals(pool.pendingCount(), 0);

  workers[0].respond({ id: 1, ok: true, result: 8 });
  assertEquals(pool.pendingCount(), 0);
  pool.terminate();
});

Deno.test("WorkerPool inspects status and waits for idle", async () => {
  const workers: TestWorker[] = [];
  const pool = new WorkerPool<number, number>({
    workerUrl: new URL("./fixtures/sum_worker.ts", import.meta.url),
    size: 2,
    workerFactory: () => {
      const worker = new TestWorker();
      workers.push(worker);
      return worker;
    },
  });
  const order: string[] = [];

  const first = pool.run(1).then((value) => order.push(`first:${value}`));
  const second = pool.run(2).then((value) => order.push(`second:${value}`));
  const idle = pool.waitForIdle().then(() => order.push("idle"));

  assertEquals(pool.inspect(), {
    size: 2,
    pending: 2,
    idle: false,
    terminated: false,
    nextWorkerIndex: 0,
  });
  assertEquals(workers[0].messages, [{ id: 1, payload: 1 }]);
  assertEquals(workers[1].messages, [{ id: 2, payload: 2 }]);

  workers[1].respond({ id: 2, ok: true, result: 20 });
  await Promise.resolve();
  assertEquals(pool.inspect(), {
    size: 2,
    pending: 1,
    idle: false,
    terminated: false,
    nextWorkerIndex: 0,
  });

  workers[0].respond({ id: 1, ok: true, result: 10 });
  await Promise.all([first, second, idle]);

  assertEquals(order, ["second:20", "first:10", "idle"]);
  assertEquals(pool.inspect(), {
    size: 2,
    pending: 0,
    idle: true,
    terminated: false,
    nextWorkerIndex: 0,
  });
  pool.terminate();
});

Deno.test("runtime workload telemetry normalizes schedulers and worker pools", () => {
  const workers: TestWorker[] = [];
  const pool = new WorkerPool<number, number>({
    workerUrl: new URL("./fixtures/sum_worker.ts", import.meta.url),
    size: 2,
    workerFactory: () => {
      const worker = new TestWorker();
      workers.push(worker);
      return worker;
    },
  });
  const jobs = [
    pool.run(1).catch(() => undefined),
    pool.run(2).catch(() => undefined),
    pool.run(3).catch(() => undefined),
  ];

  const schedulerSource = {
    id: "ui-scheduler",
    label: "UI Scheduler",
    inspect: () => ({
      concurrency: 2,
      running: 2,
      pending: 1,
      idle: false,
      scheduled: 3,
      completed: 0,
      failed: 0,
      cancelled: 0,
      maxRunning: 2,
      maxPending: 1,
    }),
  };
  const report = createRuntimeWorkloadReport({
    sources: [
      schedulerSource,
      { id: "workers", label: "Workers", inspect: () => pool.inspect() },
    ],
  });
  const markdown = formatRuntimeWorkloadMarkdown({
    title: "Runtime Pressure",
    sources: [schedulerSource],
  });

  assertEquals(inspectRuntimeWorkload(schedulerSource), {
    id: "ui-scheduler",
    label: "UI Scheduler",
    kind: "scheduler",
    capacity: 2,
    running: 2,
    queued: 1,
    pending: 3,
    saturation: 1.5,
    idle: false,
    terminated: false,
    state: "queued",
  });
  assertEquals(report.workloads.map((workload) => [workload.id, workload.kind, workload.state, workload.saturation]), [
    ["ui-scheduler", "scheduler", "queued", 1.5],
    ["workers", "worker-pool", "queued", 1.5],
  ]);
  assertEquals(report.inspection, {
    count: 2,
    running: 4,
    queued: 2,
    pending: 6,
    capacity: 4,
    saturated: 2,
    terminated: 0,
    idle: false,
    maxSaturation: 1.5,
  });
  assertEquals(
    markdown,
    [
      "# Runtime Pressure",
      "",
      "1 workloads, 3 pending, 1 saturated.",
      "",
      "| Workload | Kind | State | Running | Queued | Capacity | Saturation |",
      "| --- | --- | --- | ---: | ---: | ---: | ---: |",
      "| UI Scheduler | scheduler | queued | 2 | 1 | 2 | 1.50 |",
    ].join("\n"),
  );

  pool.terminate();
  assertEquals(inspectRuntimeWorkload({ id: "workers", inspect: () => pool.inspect() }).state, "terminated");
  void Promise.all(jobs);
});

Deno.test("RuntimeWorkloadRegistry tracks dynamic workload sources with disposable replacement", () => {
  const scheduler = new AsyncScheduler({ concurrency: 1 });
  const first = scheduler.schedule(() => new Promise(() => undefined));
  const second = scheduler.schedule(() => undefined);
  void first.promise.catch(() => undefined);
  void second.promise.catch(() => undefined);
  const registry = createRuntimeWorkloadRegistry();

  const disposeUi = registry.register({
    id: "ui",
    label: "UI Work",
    inspect: () => scheduler.inspect(),
  });
  const disposeReplacement = registry.register({
    id: "ui",
    label: "Replacement UI",
    kind: "scheduler",
    inspect: () => scheduler.inspect(),
  });
  disposeUi();

  assertEquals(registry.has("ui"), true);
  assertEquals(registry.get("ui")?.label, "Replacement UI");
  assertEquals(registry.inspect(), {
    count: 1,
    running: 1,
    queued: 1,
    pending: 2,
    capacity: 1,
    saturated: 1,
    terminated: 0,
    idle: false,
    maxSaturation: 2,
    sourceIds: ["ui"],
    labels: ["Replacement UI"],
    kinds: ["scheduler"],
  });
  assertEquals(registry.report().workloads.map((workload) => workload.state), ["queued"]);
  const sources = registry.sources();
  sources[0]!.label = "Mutated";
  sources.push({ id: "mutated", inspect: () => scheduler.inspect() });
  assertEquals(registry.sources().map((source) => source.label ?? source.id), ["Replacement UI"]);
  assertEquals(
    registry.markdown({ title: "Workloads" }),
    [
      "# Workloads",
      "",
      "1 workloads, 2 pending, 1 saturated.",
      "",
      "| Workload | Kind | State | Running | Queued | Capacity | Saturation |",
      "| --- | --- | --- | ---: | ---: | ---: | ---: |",
      "| Replacement UI | scheduler | queued | 1 | 1 | 1 | 2.00 |",
    ].join("\n"),
  );

  disposeReplacement();
  assertEquals(registry.inspect(), {
    count: 0,
    running: 0,
    queued: 0,
    pending: 0,
    capacity: 0,
    saturated: 0,
    terminated: 0,
    idle: true,
    maxSaturation: 0,
    sourceIds: [],
    labels: [],
    kinds: [],
  });

  registry.register({
    id: "again",
    inspect: () => scheduler.inspect(),
  });
  registry.clear();
  assertEquals(registry.sources(), []);
  first.cancel();
  second.cancel();
});

Deno.test("runWorkerBatch preserves input order while dispatching through the pool", async () => {
  const workers: TestWorker[] = [];
  const pool = new WorkerPool<number, number>({
    workerUrl: new URL("./fixtures/sum_worker.ts", import.meta.url),
    size: 2,
    workerFactory: () => {
      const worker = new TestWorker();
      workers.push(worker);
      return worker;
    },
  });

  const batch = runWorkerBatch(pool, [1, 2, 3]);
  assertEquals(pool.pendingCount(), 3);
  assertEquals(workers[0].messages, [{ id: 1, payload: 1 }, { id: 3, payload: 3 }]);
  assertEquals(workers[1].messages, [{ id: 2, payload: 2 }]);

  workers[1].respond({ id: 2, ok: true, result: 20 });
  workers[0].respond({ id: 3, ok: true, result: 30 });
  workers[0].respond({ id: 1, ok: true, result: 10 });

  assertEquals(await batch, [
    { input: 1, index: 0, value: 10 },
    { input: 2, index: 1, value: 20 },
    { input: 3, index: 2, value: 30 },
  ]);
  assertEquals(pool.idle(), true);
  pool.terminate();
});

Deno.test("WorkerPool rejects queued work when terminated", async () => {
  const pool = new WorkerPool<number, number>({
    workerUrl: new URL("./fixtures/sum_worker.ts", import.meta.url),
    size: 1,
    workerFactory: () => new TestWorker(),
  });

  pool.terminate();
  const error = await pool.run(1).catch((caught) => caught);
  assertEquals(error instanceof WorkerPoolTerminatedError, true);
});

class DeferredStore<T> extends MemoryStore<T> {
  #deferred = false;
  #pendingGet:
    | {
      resolve: (value: T | undefined) => void;
      key: string;
    }
    | undefined;

  override get(key: string): Promise<T | undefined> {
    if (this.#deferred || this.#pendingGet) return super.get(key);
    this.#deferred = true;
    return new Promise((resolve) => {
      this.#pendingGet = { resolve, key };
    });
  }

  resolveGet(value: T | undefined): void {
    const pending = this.#pendingGet;
    if (!pending) return;
    this.#pendingGet = undefined;
    pending.resolve(value);
  }
}

class TestRenderLoopTimer {
  #now = 0;
  #nextId = 0;
  #pending = new Map<number, { callback: () => void; delay: number }>();
  #lastDelay = 0;

  setTimeout(callback: () => void, delay: number): number {
    const id = ++this.#nextId;
    this.#lastDelay = delay;
    this.#pending.set(id, { callback, delay });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.#pending.delete(handle as number);
  }

  now(): number {
    return this.#now;
  }

  advance(ms: number): void {
    this.#now += ms;
  }

  flushNext(): void {
    const [id, pending] = this.#pending.entries().next().value ?? [];
    if (id === undefined || pending === undefined) return;
    this.#pending.delete(id);
    pending.callback();
  }

  pendingCount(): number {
    return this.#pending.size;
  }

  lastDelay(): number {
    return this.#lastDelay;
  }
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class TestWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly messages: unknown[] = [];
  terminated = false;

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(message: unknown): void {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
}
