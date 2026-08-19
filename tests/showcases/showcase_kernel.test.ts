// Copyright 2023 Im-Beast. MIT license.

import {
  assert,
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
  assertStringIncludes,
  assertThrows,
} from "../deps.ts";
import {
  type AsyncStore,
  MemoryStore,
  POINTER_INPUT_SCHEMA_VERSION,
  type PointerInputEvent,
  type TiledWorkspaceControllerOptions,
} from "../../mod.ts";
import {
  cloneShowcaseJsonValue,
  defineShowcaseManifest,
  preflightShowcaseProvider,
  SHOWCASE_SESSION_SCHEMA,
  SHOWCASE_SESSION_VERSION,
  ShowcaseKernel,
  type ShowcaseProvider,
  type ShowcaseProviderActivationContext,
  type ShowcaseProviderActivationResult,
  type ShowcaseProviderCapability,
} from "../../src/showcase/mod.ts";

interface TestState {
  readonly count: number;
  readonly labels: readonly string[];
}

type ActivationMode = "ready" | "degraded" | "fail";

class TestProvider implements ShowcaseProvider {
  readonly id = "test-provider";
  readonly label = "Test provider";
  activations = 0;
  disposals = 0;

  constructor(
    readonly capabilities: readonly ShowcaseProviderCapability[],
    private readonly mode: ActivationMode = "ready",
  ) {}

  activate(context: ShowcaseProviderActivationContext): ShowcaseProviderActivationResult {
    this.activations += 1;
    if (context.signal.aborted) throw new Error("activation-aborted");
    if (this.mode === "fail") throw new Error("SECRET PROVIDER PAYLOAD");
    if (this.mode === "degraded") return { status: "degraded", message: "SECRET DEGRADATION PAYLOAD" };
    return { status: "ready" };
  }

  dispose(): void {
    this.disposals += 1;
  }
}

const availableCapabilities = Object.freeze([
  Object.freeze({ id: "data.read", status: "available" as const }),
  Object.freeze({ id: "data.write", status: "available" as const }),
]);

function manifest() {
  return defineShowcaseManifest({
    id: "kernel-test",
    title: "Kernel Test",
    appVersion: "1.0.0",
    routes: [{ id: "home", title: "Home" }, { id: "detail", title: "Detail" }],
    initialRouteId: "home",
    requiredCapabilities: ["data.read"],
    optionalCapabilities: ["data.write", "data.watch"],
    hosts: { terminal: true, browser: true },
  });
}

function normalizeState(value: unknown): TestState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid state");
  const input = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(input.count) || !Array.isArray(input.labels) ||
    !input.labels.every((entry) => typeof entry === "string")
  ) {
    throw new TypeError("invalid state");
  }
  return { count: input.count as number, labels: [...input.labels] as string[] };
}

const workspaceOptions = {
  windows: [
    { id: "explorer", minWidth: 8, minHeight: 3 },
    { id: "editor", minWidth: 12, minHeight: 3 },
  ],
  gap: 1,
  layout: {
    activePaneId: "pane-explorer",
    root: {
      kind: "split",
      id: "main-split",
      direction: "row",
      ratio: 0.4,
      first: { kind: "pane", id: "pane-explorer", windowId: "explorer" },
      second: { kind: "pane", id: "pane-editor", windowId: "editor" },
    },
  },
} satisfies TiledWorkspaceControllerOptions;

function advancedWindowOptions(prefix = "") {
  const explorer = `${prefix}explorer`;
  const editor = `${prefix}editor`;
  const preview = `${prefix}preview`;
  return {
    windows: [
      { id: explorer, title: "Explorer", minWidth: 8, minHeight: 3 },
      { id: editor, title: "Editor", minWidth: 12, minHeight: 3 },
      { id: preview, title: "Preview", minWidth: 10, minHeight: 3 },
    ],
    initialWorkspace: {
      version: 1 as const,
      gap: 1,
      layout: {
        activePaneId: `pane-${editor}`,
        root: {
          kind: "split" as const,
          id: `split-${prefix}main`,
          direction: "row" as const,
          ratio: 0.3,
          first: { kind: "pane" as const, id: `pane-${explorer}`, windowId: explorer },
          second: {
            kind: "split" as const,
            id: `split-${prefix}content`,
            direction: "row" as const,
            ratio: 0.62,
            first: { kind: "pane" as const, id: `pane-${editor}`, windowId: editor },
            second: { kind: "pane" as const, id: `pane-${preview}`, windowId: preview },
          },
        },
      },
    },
  };
}

Deno.test("showcase manifests are detached and provider preflight is pure", () => {
  const routes = [{ id: "home", title: "Home" }, { id: "detail", title: "Detail" }];
  const required = ["data.read"];
  const value = defineShowcaseManifest({
    id: "detached",
    title: "Detached",
    appVersion: "1",
    routes,
    initialRouteId: "home",
    requiredCapabilities: required,
    optionalCapabilities: ["data.watch"],
  });
  routes[0]!.title = "Changed";
  required[0] = "changed";

  assertEquals(value.routes[0]!.title, "Home");
  assertEquals(value.requiredCapabilities, ["data.read"]);
  assert(Object.isFrozen(value));
  assert(Object.isFrozen(value.routes));
  assert(Object.isFrozen(value.routes[0]!));
  assertThrows(() =>
    defineShowcaseManifest({
      id: "bad",
      title: "Bad",
      appVersion: "1",
      routes: [{ id: "home", title: "Home" }, { id: "home", title: "Duplicate" }],
      initialRouteId: "home",
    })
  );

  let getterCalled = false;
  const accessorManifest = {
    id: "accessor",
    appVersion: "1",
    routes: [{ id: "home", title: "Home" }],
    initialRouteId: "home",
  } as Record<string, unknown>;
  Object.defineProperty(accessorManifest, "title", {
    enumerable: true,
    get() {
      getterCalled = true;
      return "Accessor";
    },
  });
  assertThrows(() => defineShowcaseManifest(accessorManifest as never));
  assertEquals(getterCalled, false);

  const accessorArray = ["safe"];
  Object.defineProperty(accessorArray, "0", {
    enumerable: true,
    get() {
      getterCalled = true;
      return "unsafe";
    },
  });
  assertThrows(() => cloneShowcaseJsonValue(accessorArray));
  assertEquals(getterCalled, false);

  let lifecycleCalls = 0;
  const provider: ShowcaseProvider = {
    id: "preflight-provider",
    label: "Preflight provider",
    capabilities: [
      { id: "data.read", status: "degraded", reason: "content is not copied" },
      { id: "unused", status: "available" },
    ],
    activate() {
      lifecycleCalls += 1;
      return { status: "ready" };
    },
    dispose() {
      lifecycleCalls += 1;
    },
  };
  const result = preflightShowcaseProvider(value, provider);
  assertEquals(lifecycleCalls, 0);
  assertEquals(result, {
    ok: true,
    degraded: true,
    missingRequired: [],
    unavailableRequired: [],
    degradedCapabilities: ["data.read"],
    optionalUnavailable: ["data.watch"],
    capabilities: [
      { id: "data.read", status: "degraded" },
      { id: "unused", status: "available" },
    ],
  });
});

Deno.test("showcase kernel persists and restores route, state, and tiled workspace", async () => {
  const store = new MemoryStore<unknown>();
  const firstProvider = new TestProvider(availableCapabilities);
  const first = new ShowcaseKernel({
    manifest: manifest(),
    provider: firstProvider,
    initialState: { count: 0, labels: ["initial"] },
    normalizeState,
    store,
    workspace: workspaceOptions,
    now: () => 42,
  });
  await first.ready;
  assertEquals(firstProvider.activations, 1);
  assertEquals(first.navigate("detail"), true);
  first.setState({ count: 7, labels: ["persisted"] });
  assertEquals(first.workspace.setSplitRatio("main-split", 0.7), true);
  first.workspace.gap.value = 2;
  await first.flush();
  const firstSnapshot = first.snapshot();
  const firstStateReference = firstSnapshot.appState;
  await first.dispose();

  const secondProvider = new TestProvider(availableCapabilities);
  const second = new ShowcaseKernel({
    manifest: manifest(),
    provider: secondProvider,
    initialState: { count: -1, labels: ["fallback"] },
    normalizeState,
    store,
    workspace: workspaceOptions,
    now: () => 84,
  });
  await second.ready;

  assertEquals(second.routeId.peek(), "detail");
  assertEquals(second.appState.peek(), { count: 7, labels: ["persisted"] });
  assertEquals(second.workspace.snapshot().layout, firstSnapshot.workspace.layout);
  assertEquals(second.workspace.gap.peek(), 2);
  assertNotStrictEquals(second.appState.peek(), firstStateReference);
  assertEquals(secondProvider.activations, 1);
  await second.dispose();
});

Deno.test("showcase kernel persists one canonical V2 advanced-window session and restores it exactly", async () => {
  const store = new MemoryStore<unknown>();
  const first = new ShowcaseKernel({
    manifest: manifest(),
    provider: new TestProvider(availableCapabilities),
    initialState: { count: 0, labels: ["initial"] },
    normalizeState,
    store,
    workspace: { gap: 1 },
    advancedWindows: advancedWindowOptions(),
    now: () => 101,
  });
  await first.ready;
  assert(first.windowHost);
  assertStrictEquals(first.windowHost.workspace, first.workspace);
  assertEquals(first.navigate("detail"), true);
  first.setState({ count: 9, labels: ["advanced"] });
  const floatingRect = { column: 31, row: 5, width: 28, height: 12 };
  assertEquals(
    first.windowHost.execute({ kind: "set-placement", id: "preview", placement: "floating", rect: floatingRect }, {
      column: 0,
      row: 0,
      width: 100,
      height: 32,
    }).status,
    "applied",
  );
  assertEquals(
    first.windowHost.execute({ kind: "toggle-always-on-top", id: "preview" }, {
      column: 0,
      row: 0,
      width: 100,
      height: 32,
    }).status,
    "applied",
  );
  await first.flush();
  const expectedWindows = first.windowHost.snapshot();
  const persisted = await store.get("showcase:kernel-test:session") as Record<string, unknown>;
  assertEquals(persisted.schemaVersion, SHOWCASE_SESSION_VERSION);
  assert(persisted.windowing && typeof persisted.windowing === "object");
  assertEquals(Object.hasOwn(persisted.windowing, "workspace"), false);
  assertEquals(first.snapshot().workspace, expectedWindows.workspace);
  await first.dispose();

  const second = new ShowcaseKernel({
    manifest: manifest(),
    provider: new TestProvider(availableCapabilities),
    initialState: { count: -1, labels: ["fallback"] },
    normalizeState,
    store,
    workspace: { gap: 1 },
    advancedWindows: advancedWindowOptions(),
    now: () => 202,
  });
  await second.ready;
  assert(second.windowHost);
  assertEquals(second.routeId.peek(), "detail");
  assertEquals(second.appState.peek(), { count: 9, labels: ["advanced"] });
  assertEquals(second.windowHost.snapshot(), expectedWindows);
  assertEquals(
    second.windowHost.controller.inspect().windows.find((window) => window.id === "preview")?.alwaysOnTop,
    true,
  );
  await second.dispose();
});

Deno.test("showcase kernel persists only committed advanced-window geometry", async () => {
  const values = new Map<string, unknown>();
  const writes: unknown[] = [];
  const store: AsyncStore<unknown> = {
    get: (key) => Promise.resolve(values.get(key)),
    set(key, value) {
      const clone = structuredClone(value);
      values.set(key, clone);
      writes.push(clone);
      return Promise.resolve();
    },
    delete(key) {
      values.delete(key);
      return Promise.resolve();
    },
  };
  const kernel = new ShowcaseKernel({
    manifest: manifest(),
    provider: new TestProvider(availableCapabilities),
    initialState: { count: 0, labels: [] },
    normalizeState,
    store,
    workspace: { gap: 1 },
    advancedWindows: advancedWindowOptions(),
  });
  await kernel.ready;
  await kernel.flush();
  writes.length = 0;
  const host = kernel.windowHost!;
  const bounds = { column: 0, row: 0, width: 100, height: 32 };
  const options = { separatorHitSize: 3 };
  const separator = host.project(bounds, options).separators[0]!;
  const x = separator.rect.column;
  const y = separator.rect.row + Math.floor(separator.rect.height / 2);
  const committedWorkspace = kernel.snapshot().workspace;

  host.handlePointer(showcasePointer("down", x, y, 1), bounds, options);
  host.handlePointer(showcasePointer("move", x + 12, y, 2), bounds, options);
  assert(host.inspect().separatorResize);
  assert(JSON.stringify(host.snapshot().workspace) !== JSON.stringify(committedWorkspace));
  await Promise.resolve();
  assertEquals(writes.length, 0);

  kernel.setState({ count: 1, labels: ["during-drag"] });
  await kernel.flush();
  const duringDrag = writes.at(-1) as { workspace: unknown; appState: TestState };
  assertEquals(duringDrag.workspace, committedWorkspace);
  assertEquals(duringDrag.appState, { count: 1, labels: ["during-drag"] });
  host.handlePointer(showcasePointer("cancel", x + 12, y, 3), bounds, options);
  assertEquals(host.snapshot().workspace, committedWorkspace);

  host.handlePointer(showcasePointer("down", x, y, 4), bounds, options);
  host.handlePointer(showcasePointer("move", x + 5, y, 5), bounds, options);
  host.handlePointer(showcasePointer("up", x + 5, y, 6), bounds, options);
  await kernel.flush();
  const afterCommit = writes.at(-1) as { workspace: unknown };
  assertEquals(afterCommit.workspace, host.snapshot().workspace);
  assert(JSON.stringify(afterCommit.workspace) !== JSON.stringify(committedWorkspace));
  await kernel.dispose();
});

Deno.test("showcase kernel migrates tiled-only V1 sessions to V2 advanced-window state", async () => {
  const store = new MemoryStore<unknown>();
  const advanced = advancedWindowOptions();
  await store.set("legacy-advanced", {
    schema: SHOWCASE_SESSION_SCHEMA,
    schemaVersion: 1,
    showcaseId: "kernel-test",
    showcaseVersion: "1.0.0",
    providerId: "test-provider",
    routeId: "detail",
    workspace: advanced.initialWorkspace,
    appState: { count: 4, labels: ["legacy"] },
    savedAt: 7,
  });
  const kernel = new ShowcaseKernel({
    manifest: manifest(),
    provider: new TestProvider(availableCapabilities),
    initialState: { count: 0, labels: [] },
    normalizeState,
    store,
    storageKey: "legacy-advanced",
    workspace: { gap: 1 },
    advancedWindows: advanced,
  });
  await kernel.ready;
  assert(kernel.windowHost);
  assertEquals(kernel.routeId.peek(), "detail");
  assertEquals(kernel.appState.peek(), { count: 4, labels: ["legacy"] });
  assertEquals(kernel.windowHost.snapshot().placements.map((entry) => entry.placement), ["tiled", "tiled", "tiled"]);
  await kernel.flush();
  const migrated = await store.get("legacy-advanced") as Record<string, unknown>;
  assertEquals(migrated.schemaVersion, SHOWCASE_SESSION_VERSION);
  assert(migrated.windowing && typeof migrated.windowing === "object");
  await kernel.dispose();
});

Deno.test("showcase kernel rejects incompatible advanced-window sessions without partial content restore", async () => {
  const store = new MemoryStore<unknown>();
  const source = new ShowcaseKernel({
    manifest: manifest(),
    provider: new TestProvider(availableCapabilities),
    initialState: { count: 11, labels: ["source"] },
    normalizeState,
    store,
    storageKey: "incompatible-advanced",
    workspace: { gap: 1 },
    advancedWindows: advancedWindowOptions(),
  });
  await source.ready;
  source.navigate("detail");
  source.setState({ count: 77, labels: ["must-not-leak"] });
  await source.flush();
  await source.dispose();

  const target = new ShowcaseKernel({
    manifest: manifest(),
    provider: new TestProvider(availableCapabilities),
    initialState: { count: 3, labels: ["fallback"] },
    normalizeState,
    store,
    storageKey: "incompatible-advanced",
    workspace: { gap: 1 },
    advancedWindows: advancedWindowOptions("other-"),
  });
  const defaultWindows = target.windowHost!.snapshot();
  await target.ready;
  assertEquals(target.routeId.peek(), "home");
  assertEquals(target.appState.peek(), { count: 3, labels: ["fallback"] });
  assertEquals(target.windowHost!.snapshot(), defaultWindows);
  assertEquals(target.diagnostics.entries().some((entry) => entry.code === "session-restore-rejected"), true);
  await target.dispose();
});

Deno.test("showcase kernel rejects duplicate or malformed V2 windowing payloads without content leakage", async () => {
  const store = new MemoryStore<unknown>();
  const source = new ShowcaseKernel({
    manifest: manifest(),
    provider: new TestProvider(availableCapabilities),
    initialState: { count: 8, labels: ["source"] },
    normalizeState,
    store,
    storageKey: "malformed-windowing",
    workspace: { gap: 1 },
    advancedWindows: advancedWindowOptions(),
  });
  await source.ready;
  source.navigate("detail");
  await source.flush();
  await source.dispose();

  const malformed = structuredClone(await store.get("malformed-windowing")) as Record<string, unknown>;
  const windowing = malformed.windowing as Record<string, unknown>;
  windowing.workspace = malformed.workspace;
  windowing.secretPayload = "SECRET WINDOW CONTENT";
  malformed.appState = { count: 99, labels: ["SECRET APP CONTENT"] };
  await store.set("malformed-windowing", malformed);

  const target = new ShowcaseKernel({
    manifest: manifest(),
    provider: new TestProvider(availableCapabilities),
    initialState: { count: 3, labels: ["fallback"] },
    normalizeState,
    store,
    storageKey: "malformed-windowing",
    workspace: { gap: 1 },
    advancedWindows: advancedWindowOptions(),
  });
  const defaults = target.windowHost!.snapshot();
  await target.ready;
  assertEquals(target.routeId.peek(), "home");
  assertEquals(target.appState.peek(), { count: 3, labels: ["fallback"] });
  assertEquals(target.windowHost!.snapshot(), defaults);
  const diagnostics = JSON.stringify(target.diagnostics.entries());
  assertStringIncludes(diagnostics, "session-restore-rejected");
  assertEquals(diagnostics.includes("SECRET"), false);
  await target.dispose();
});

Deno.test("showcase kernel coalesces burst persistence to one in-flight and one latest snapshot", async () => {
  const values = new Map<string, unknown>();
  const writes: unknown[] = [];
  let releaseBlockedWrite!: () => void;
  let blockWrites = true;
  const blocked = new Promise<void>((resolve) => {
    releaseBlockedWrite = resolve;
  });
  const store: AsyncStore<unknown> = {
    get: (key) => Promise.resolve(values.get(key)),
    async set(key, value) {
      writes.push(structuredClone(value));
      if (writes.length >= 2 && blockWrites) await blocked;
      values.set(key, structuredClone(value));
    },
    delete(key) {
      values.delete(key);
      return Promise.resolve();
    },
  };
  const kernel = new ShowcaseKernel({
    manifest: manifest(),
    provider: new TestProvider(availableCapabilities),
    initialState: { count: 0, labels: [] },
    normalizeState,
    store,
  });
  await kernel.ready;
  while (writes.length < 1) await Promise.resolve();

  for (let count = 1; count <= 200; count += 1) kernel.setState({ count, labels: [`value-${count}`] });
  const flush = kernel.flush();
  while (writes.length < 2) await Promise.resolve();
  assertEquals(writes.length, 2);
  assertEquals(kernel.inspect().persistencePending, true);

  blockWrites = false;
  releaseBlockedWrite();
  await flush;
  assertEquals(writes.length, 3);
  const latest = values.values().next().value as { appState: TestState };
  assertEquals(latest.appState, { count: 200, labels: ["value-200"] });
  assertEquals(kernel.persistenceStatus.peek(), "ready");
  assertEquals(kernel.inspect().persistencePending, false);
  await kernel.dispose();
});

Deno.test("showcase kernel debounce coalesces idle writes and flushes the latest state", async () => {
  const values = new Map<string, unknown>();
  const writes: unknown[] = [];
  const store: AsyncStore<unknown> = {
    get: (key) => Promise.resolve(values.get(key)),
    set(key, value) {
      const clone = structuredClone(value);
      values.set(key, clone);
      writes.push(clone);
      return Promise.resolve();
    },
    delete(key) {
      values.delete(key);
      return Promise.resolve();
    },
  };
  const kernel = new ShowcaseKernel({
    manifest: manifest(),
    provider: new TestProvider(availableCapabilities),
    initialState: { count: 0, labels: [] },
    normalizeState,
    store,
    persistenceDebounceMs: 60_000,
  });
  await kernel.ready;

  for (let count = 1; count <= 100; count += 1) {
    kernel.setState({ count, labels: [`value-${count}`] });
  }
  assertEquals(writes.length, 0);
  assertEquals(kernel.inspect().persistencePending, true);

  await kernel.flush();
  assertEquals(writes.length, 1);
  assertEquals((writes[0] as { appState: TestState }).appState, { count: 100, labels: ["value-100"] });
  assertEquals(kernel.inspect().persistencePending, false);

  kernel.setState({ count: 101, labels: ["disposed-latest"] });
  await kernel.dispose();
  assertEquals(writes.length, 2);
  assertEquals((writes[1] as { appState: TestState }).appState, { count: 101, labels: ["disposed-latest"] });
});

Deno.test("showcase kernel rejects corrupt sessions without leaking their contents", async () => {
  const store = new MemoryStore<unknown>();
  await store.set("corrupt", "{SECRET CORRUPT PAYLOAD");
  const provider = new TestProvider(availableCapabilities);
  const kernel = new ShowcaseKernel({
    manifest: manifest(),
    provider,
    initialState: { count: 3, labels: ["fallback"] },
    normalizeState,
    store,
    storageKey: "corrupt",
    workspace: workspaceOptions,
  });
  await kernel.ready;

  assertEquals(kernel.routeId.peek(), "home");
  assertEquals(kernel.appState.peek(), { count: 3, labels: ["fallback"] });
  assertEquals(provider.activations, 1);
  const serializedDiagnostics = JSON.stringify(kernel.diagnostics.entries());
  assertStringIncludes(serializedDiagnostics, "session-restore-rejected");
  assertEquals(serializedDiagnostics.includes("SECRET CORRUPT PAYLOAD"), false);
  await kernel.dispose();
});

Deno.test("showcase kernel blocks missing requirements and contains provider failures", async () => {
  const blockedProvider = new TestProvider([]);
  const blocked = new ShowcaseKernel({
    manifest: manifest(),
    provider: blockedProvider,
    initialState: { count: 0, labels: [] },
    normalizeState,
  });
  await blocked.ready;
  assertEquals(blocked.providerStatus.peek(), "blocked");
  assertEquals(blockedProvider.activations, 0);
  assertEquals(blocked.snapshot().workspace.layout, {});
  assertEquals(blocked.diagnostics.entries().some((entry) => entry.code === "session-snapshot-failed"), false);
  await blocked.dispose();
  assertEquals(blockedProvider.disposals, 1);

  const failedProvider = new TestProvider(availableCapabilities, "fail");
  const failed = new ShowcaseKernel({
    manifest: manifest(),
    provider: failedProvider,
    initialState: { count: 0, labels: [] },
    normalizeState,
  });
  await failed.ready;
  assertEquals(failed.providerStatus.peek(), "failed");
  const serializedDiagnostics = JSON.stringify(failed.diagnostics.entries());
  assertStringIncludes(serializedDiagnostics, "provider-activation-failed");
  assertEquals(serializedDiagnostics.includes("SECRET PROVIDER PAYLOAD"), false);
  await failed.dispose();

  const degradedProvider = new TestProvider(availableCapabilities, "degraded");
  const degraded = new ShowcaseKernel({
    manifest: manifest(),
    provider: degradedProvider,
    initialState: { count: 0, labels: [] },
    normalizeState,
  });
  await degraded.ready;
  assertEquals(degraded.providerStatus.peek(), "degraded");
  assertEquals(JSON.stringify(degraded.diagnostics.entries()).includes("SECRET DEGRADATION PAYLOAD"), false);
  await degraded.dispose();
});

Deno.test("showcase kernel owns one workspace and disposes its lifecycle idempotently", async () => {
  const provider = new TestProvider(availableCapabilities);
  const kernel = new ShowcaseKernel({
    manifest: manifest(),
    provider,
    initialState: { count: 0, labels: [] },
    normalizeState,
    workspace: workspaceOptions,
  });
  await kernel.ready;
  const before = kernel.workspace.snapshot();
  assertEquals(before.version, 1);
  assertEquals(kernel.workspace.inspect().count, 2);

  const firstDispose = kernel.dispose();
  const secondDispose = kernel.dispose();
  assertStrictEquals(firstDispose, secondDispose);
  await firstDispose;
  assertEquals(provider.disposals, 1);
  assertEquals(kernel.providerStatus.peek(), "disposed");
  assertEquals(kernel.routeId.disposed, true);
  assertEquals(kernel.appState.disposed, true);
  assertEquals(kernel.workspace.state.disposed, true);
  assertEquals(kernel.workspace.gap.disposed, true);
  assertEquals(kernel.inspect().disposed, true);
});

function showcasePointer(
  kind: "down" | "move" | "up" | "cancel",
  column: number,
  row: number,
  sequence: number,
): PointerInputEvent {
  return {
    schemaVersion: POINTER_INPUT_SCHEMA_VERSION,
    sequence,
    timestamp: sequence,
    source: "test",
    trust: "synthetic",
    modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    pointerId: 1,
    device: "mouse",
    kind,
    coordinates: { cell: { space: "cell", x: column, y: row } },
    primary: true,
    button: kind === "down" ? 0 : null,
    buttons: kind === "up" || kind === "cancel" ? 0 : 1,
  };
}
