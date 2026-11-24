import { assertEquals, assertExists } from "./deps.ts";
import { createAnsiThemeTokens, createTheme } from "../src/theme.ts";
import {
  BrowserCellCanvasSink,
  BrowserInputSource,
  BrowserPlatform,
  parseAnsiCell,
  renderDomNodeToHtml,
  themeTokensToCssVariables,
} from "../src/web/mod.ts";

Deno.test("mod.web imports without constructing terminal runtime", async () => {
  const web = await import("../mod.web.ts");
  const exports = web as Record<string, unknown>;

  assertEquals(typeof web.createWebTui, "function");
  assertEquals(typeof web.BrowserCellCanvasSink, "function");
  assertEquals(typeof exports.CommandRegistry, "function");
  assertEquals(typeof exports.createApp, "function");
  assertEquals(typeof exports.BenchmarkRunner, "function");
  assertEquals(typeof exports.textWidth, "function");
  assertEquals(typeof exports.DomRenderTarget, "function");
  assertEquals(typeof exports.createRemoteTerminalClient, "function");
  assertEquals(typeof exports.TerminalScreenController, "function");
  assertEquals(typeof exports.TerminalWorkspaceController, "function");
  assertEquals(typeof exports.ThreeAsciiRenderer, "function");
  assertEquals(typeof exports.ThreeAsciiObject, "function");
  assertEquals(typeof exports.probeCompatibleWebGPUDevice, "function");
  assertEquals(typeof exports.Tui, "undefined");

  const Screen = exports.TerminalScreenController as new (
    options?: { columns?: number; rows?: number },
  ) => { write(value: string): void; textRows(): string[] };
  const screen = new Screen({ columns: 6, rows: 2 });
  screen.write("web");
  assertEquals(screen.textRows()[0], "web");
});

Deno.test("parseAnsiCell extracts text and ANSI colors for browser rendering", () => {
  assertEquals(parseAnsiCell("\x1b[48;2;1;2;3m\x1b[38;5;196mX\x1b[0m"), {
    text: "X",
    foreground: "rgb(255,0,0)",
    background: "rgb(1,2,3)",
    bold: false,
    dim: false,
  });
  assertEquals(parseAnsiCell("\x1b[1;38;2;10;20;30;48;5;17mZ"), {
    text: "Z",
    foreground: "rgb(10,20,30)",
    background: "rgb(0,0,95)",
    bold: true,
    dim: false,
  });
  assertEquals(parseAnsiCell("\x1b[48;2;137;225;255m \x1b[0m"), {
    text: " ",
    background: "rgb(137,225,255)",
    bold: false,
    dim: false,
  });
  assertEquals(parseAnsiCell("\x1b[90;107mP"), {
    text: "P",
    foreground: "#475569",
    background: "#f8fafc",
    bold: false,
    dim: false,
  });
  assertEquals(parseAnsiCell("\x1b[38;5;232;48;5;255mG"), {
    text: "G",
    foreground: "rgb(8,8,8)",
    background: "rgb(238,238,238)",
    bold: false,
    dim: false,
  });
  assertEquals(parseAnsiCell("\x1b]8;;https://example.com/home\x1b\\\x1b[38;2;1;2;3mL\x1b[0m\x1b]8;;\x1b\\"), {
    text: "L",
    foreground: "rgb(1,2,3)",
    bold: false,
    dim: false,
    hyperlink: "https://example.com/home",
  });
});

Deno.test("BrowserCellCanvasSink paints dirty cells to a 2D context", () => {
  const operations: unknown[][] = [];
  const context = {
    fillStyle: "",
    font: "",
    textBaseline: "top" as CanvasTextBaseline,
    scale: (x: number, y: number) => operations.push(["scale", x, y]),
    setTransform: (...args: number[]) => operations.push(["setTransform", ...args]),
    fillRect: (x: number, y: number, width: number, height: number) =>
      operations.push(["fillRect", x, y, width, height, context.fillStyle]),
    fillText: (text: string, x: number, y: number) => operations.push(["fillText", text, x, y, context.fillStyle]),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind: string) => kind === "2d" ? context : null,
  };
  const sink = new BrowserCellCanvasSink({
    canvas: canvas as unknown as HTMLCanvasElement,
    cellWidth: 8,
    cellHeight: 16,
    devicePixelRatio: 1,
    foreground: "#fff",
    background: "#000",
  });

  sink.resize(2, 1);
  sink.flush([
    { row: 0, column: 1, value: "\x1b[31;44mA" },
  ], {
    updatedObjects: 0,
    renderedObjects: 0,
    rerenderedObjects: 0,
    intersectionUpdates: 0,
    intersectionCandidateChecks: 0,
    intersectionsDirty: false,
    dirtyRectangles: 0,
    dirtyRowRanges: 1,
    dirtyRows: 0,
    dirtyCells: 1,
    fullRedraws: 0,
    flushedCells: 1,
  });

  assertEquals(canvas.width, 16);
  assertEquals(canvas.height, 16);
  assertExists(operations.find((operation) => operation[0] === "fillRect" && operation[5] === "#3b82f6"));
  assertExists(operations.find((operation) => operation[0] === "fillText" && operation[1] === "A"));
  assertEquals(sink.inspectSink().lastStats?.flushedCells, 1);
});

Deno.test("BrowserCellCanvasSink paints truecolor block cells without quantizing to text color", () => {
  const operations: unknown[][] = [];
  const context = {
    fillStyle: "",
    font: "",
    textBaseline: "top" as CanvasTextBaseline,
    scale: (x: number, y: number) => operations.push(["scale", x, y]),
    setTransform: (...args: number[]) => operations.push(["setTransform", ...args]),
    fillRect: (x: number, y: number, width: number, height: number) =>
      operations.push(["fillRect", x, y, width, height, context.fillStyle]),
    fillText: (text: string, x: number, y: number) => operations.push(["fillText", text, x, y, context.fillStyle]),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind: string) => kind === "2d" ? context : null,
  };
  const sink = new BrowserCellCanvasSink({
    canvas: canvas as unknown as HTMLCanvasElement,
    cellWidth: 8,
    cellHeight: 16,
    devicePixelRatio: 1,
    foreground: "#fff",
    background: "#000",
  });

  sink.resize(1, 1);
  sink.flush([
    { row: 0, column: 0, value: "\x1b[48;2;137;225;255m \x1b[0m" },
  ], {
    updatedObjects: 0,
    renderedObjects: 0,
    rerenderedObjects: 0,
    intersectionUpdates: 0,
    intersectionCandidateChecks: 0,
    intersectionsDirty: false,
    dirtyRectangles: 0,
    dirtyRowRanges: 1,
    dirtyRows: 0,
    dirtyCells: 1,
    fullRedraws: 0,
    flushedCells: 1,
  });

  assertExists(operations.find((operation) => operation[0] === "fillRect" && operation[5] === "rgb(137,225,255)"));
  assertEquals(operations.some((operation) => operation[0] === "fillText"), false);
});

Deno.test("BrowserCellCanvasSink paints contiguous row ranges", () => {
  const operations: unknown[][] = [];
  const context = {
    fillStyle: "",
    font: "",
    textBaseline: "top" as CanvasTextBaseline,
    scale: (x: number, y: number) => operations.push(["scale", x, y]),
    setTransform: (...args: number[]) => operations.push(["setTransform", ...args]),
    fillRect: (x: number, y: number, width: number, height: number) =>
      operations.push(["fillRect", x, y, width, height, context.fillStyle]),
    fillText: (text: string, x: number, y: number) => operations.push(["fillText", text, x, y, context.fillStyle]),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind: string) => kind === "2d" ? context : null,
  };
  const sink = new BrowserCellCanvasSink({
    canvas: canvas as unknown as HTMLCanvasElement,
    cellWidth: 8,
    cellHeight: 16,
    devicePixelRatio: 1,
    foreground: "#fff",
    background: "#000",
  });

  sink.resize(4, 1);
  sink.flushRanges([
    { row: 0, startColumn: 1, values: ["\x1b[32mA", "\x1b[33mB"] },
  ], {
    updatedObjects: 0,
    renderedObjects: 0,
    rerenderedObjects: 0,
    intersectionUpdates: 0,
    intersectionCandidateChecks: 0,
    intersectionsDirty: false,
    dirtyRectangles: 0,
    dirtyRowRanges: 1,
    dirtyRows: 1,
    dirtyCells: 2,
    fullRedraws: 0,
    flushedCells: 2,
  }, []);

  assertExists(operations.find((operation) => operation[0] === "fillText" && operation[1] === "A"));
  assertExists(operations.find((operation) => operation[0] === "fillText" && operation[1] === "B"));
  assertEquals(sink.inspectSink().lastStats?.flushedCells, 2);
});

Deno.test("BrowserInputSource reports pointer positions in terminal cells", () => {
  const listeners = new Map<string, EventListener>();
  const operations: unknown[][] = [];
  const style = { touchAction: "auto", userSelect: "text", webkitUserSelect: "text" };
  const target = {
    tabIndex: -1,
    style,
    addEventListener: (type: string, listener: EventListener) => void listeners.set(type, listener),
    removeEventListener: (type: string) => void listeners.delete(type),
    focus: (options?: FocusOptions) => operations.push(["focus", options?.preventScroll]),
    setPointerCapture: (pointerId: number) => operations.push(["capture", pointerId]),
    hasPointerCapture: (pointerId: number) => pointerId === 7,
    releasePointerCapture: (pointerId: number) => operations.push(["release", pointerId]),
    getBoundingClientRect: () => ({
      x: 8,
      y: 16,
      left: 8,
      top: 16,
      right: 168,
      bottom: 176,
      width: 160,
      height: 160,
      toJSON: () => ({}),
    }),
  };
  const events: unknown[] = [];
  let now = 0;
  const input = new BrowserInputSource(target as unknown as HTMLElement, {
    cellWidth: 8,
    cellHeight: 16,
    now: () => ++now,
  });

  input.attach({
    emit: (type: string, event: unknown) => void events.push([type, event]),
  } as never);
  assertEquals(style, { touchAction: "none", userSelect: "none", webkitUserSelect: "none" });

  listeners.get("pointerdown")?.({
    pointerId: 7,
    screenX: 131,
    screenY: 151,
    clientX: 31,
    clientY: 51,
    movementX: 0,
    movementY: 0,
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    buttons: 1,
    button: 0,
    preventDefault: () => undefined,
  } as unknown as Event);

  listeners.get("pointermove")?.({
    pointerId: 7,
    screenX: 147,
    screenY: 183,
    clientX: 47,
    clientY: 83,
    movementX: 16,
    movementY: 32,
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: true,
    buttons: 1,
    button: 0,
    preventDefault: () => undefined,
  } as unknown as Event);

  listeners.get("pointerup")?.({
    pointerId: 7,
    screenX: 147,
    screenY: 183,
    clientX: 47,
    clientY: 83,
    movementX: 0,
    movementY: 0,
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    buttons: 0,
    button: 0,
    preventDefault: () => undefined,
  } as unknown as Event);

  assertEquals(operations, [
    ["focus", true],
    ["capture", 7],
    ["release", 7],
  ]);
  const pointerEvents = events.filter((entry) => (entry as unknown[])[0] === "pointerInput") as Array<
    [string, { kind: string; pointerId: number; device: string; coordinates: unknown; sequence: number }]
  >;
  const mouseEvents = events.filter((entry) => (entry as unknown[])[0] === "mousePress");
  assertEquals(
    pointerEvents.map(([, event]) => ({
      kind: event.kind,
      pointerId: event.pointerId,
      device: event.device,
      coordinates: event.coordinates,
      sequence: event.sequence,
    })),
    [
      {
        kind: "down",
        pointerId: 7,
        device: "mouse",
        coordinates: {
          screen: { space: "screen", x: 131, y: 151 },
          cell: { space: "cell", x: 2, y: 2 },
          local: { space: "local", x: 23, y: 35 },
        },
        sequence: 1,
      },
      {
        kind: "move",
        pointerId: 7,
        device: "mouse",
        coordinates: {
          screen: { space: "screen", x: 147, y: 183 },
          cell: { space: "cell", x: 4, y: 4 },
          local: { space: "local", x: 39, y: 67 },
        },
        sequence: 2,
      },
      {
        kind: "up",
        pointerId: 7,
        device: "mouse",
        coordinates: {
          screen: { space: "screen", x: 147, y: 183 },
          cell: { space: "cell", x: 4, y: 4 },
          local: { space: "local", x: 39, y: 67 },
        },
        sequence: 3,
      },
    ],
  );
  assertEquals(mouseEvents[0], [
    "mousePress",
    {
      key: "mouse",
      x: 2,
      y: 2,
      movementX: 0,
      movementY: 0,
      meta: false,
      ctrl: false,
      shift: false,
      buffer: new Uint8Array(),
      drag: false,
      release: false,
      button: 0,
    },
  ]);
  assertEquals(mouseEvents[1], [
    "mousePress",
    {
      key: "mouse",
      x: 4,
      y: 4,
      movementX: 16,
      movementY: 32,
      meta: false,
      ctrl: false,
      shift: true,
      buffer: new Uint8Array(),
      drag: true,
      release: false,
      button: 0,
    },
  ]);
  assertEquals(mouseEvents[2], [
    "mousePress",
    {
      key: "mouse",
      x: 4,
      y: 4,
      movementX: 0,
      movementY: 0,
      meta: false,
      ctrl: false,
      shift: false,
      buffer: new Uint8Array(),
      drag: false,
      release: true,
      button: undefined,
    },
  ]);
  input.dispose();
  assertEquals(style, { touchAction: "auto", userSelect: "text", webkitUserSelect: "text" });
});

Deno.test("BrowserInputSource maps touch cancellation and wheel scrolling", () => {
  const listeners = new Map<string, EventListener>();
  const operations: unknown[][] = [];
  const style = { touchAction: "auto", userSelect: "text", webkitUserSelect: "text" };
  const target = {
    tabIndex: -1,
    style,
    addEventListener: (type: string, listener: EventListener) => void listeners.set(type, listener),
    removeEventListener: (type: string) => void listeners.delete(type),
    focus: (options?: FocusOptions) => operations.push(["focus", options?.preventScroll]),
    setPointerCapture: (pointerId: number) => operations.push(["capture", pointerId]),
    hasPointerCapture: (pointerId: number) => pointerId === 3,
    releasePointerCapture: (pointerId: number) => operations.push(["release", pointerId]),
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 120,
      bottom: 120,
      width: 120,
      height: 120,
      toJSON: () => ({}),
    }),
  };
  const events: unknown[] = [];
  let now = 0;
  const input = new BrowserInputSource(target as unknown as HTMLElement, {
    cellWidth: 10,
    cellHeight: 20,
    now: () => ++now,
  });

  input.attach({
    emit: (type: string, event: unknown) => void events.push([type, event]),
  } as never);

  listeners.get("pointerdown")?.({
    pointerId: 3,
    pointerType: "touch",
    clientX: 25,
    clientY: 45,
    movementX: 0,
    movementY: 0,
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    buttons: 1,
    button: 0,
    preventDefault: () => undefined,
  } as unknown as Event);
  listeners.get("pointercancel")?.({
    pointerId: 3,
    pointerType: "touch",
    clientX: 25,
    clientY: 45,
    movementX: 0,
    movementY: 0,
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    buttons: 0,
    button: 0,
    preventDefault: () => undefined,
  } as unknown as Event);
  listeners.get("wheel")?.({
    clientX: 75,
    clientY: 85,
    deltaY: -120,
    metaKey: false,
    altKey: false,
    ctrlKey: true,
    shiftKey: false,
    preventDefault: () => undefined,
  } as unknown as Event);

  assertEquals(operations, [
    ["focus", true],
    ["capture", 3],
    ["release", 3],
  ]);
  const touchPointers = events.filter((entry) => (entry as unknown[])[0] === "pointerInput") as Array<
    [string, { kind: string; device: string; pointerId: number; sequence: number }]
  >;
  assertEquals(
    touchPointers.map(([, event]) => ({
      kind: event.kind,
      device: event.device,
      pointerId: event.pointerId,
      sequence: event.sequence,
    })),
    [
      { kind: "down", device: "touch", pointerId: 3, sequence: 1 },
      { kind: "cancel", device: "touch", pointerId: 3, sequence: 2 },
    ],
  );
  const mouseEvents = events.filter((entry) => (entry as unknown[])[0] === "mousePress");
  assertEquals(mouseEvents[1], [
    "mousePress",
    {
      key: "mouse",
      x: 2,
      y: 2,
      movementX: 0,
      movementY: 0,
      meta: false,
      ctrl: false,
      shift: false,
      buffer: new Uint8Array(),
      drag: false,
      release: true,
      button: undefined,
    },
  ]);
  assertEquals(events.find((entry) => (entry as unknown[])[0] === "mouseScroll"), [
    "mouseScroll",
    {
      key: "mouse",
      x: 7,
      y: 4,
      movementX: 0,
      movementY: -120,
      meta: false,
      ctrl: true,
      shift: false,
      buffer: new Uint8Array(),
      drag: false,
      scroll: -1,
    },
  ]);

  input.dispose();
});

Deno.test("BrowserInputSource emits paste and focus events", () => {
  const listeners = new Map<string, EventListener>();
  const target = {
    tabIndex: -1,
    addEventListener: (type: string, listener: EventListener) => void listeners.set(type, listener),
    removeEventListener: (type: string) => void listeners.delete(type),
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 80,
      bottom: 80,
      width: 80,
      height: 80,
      toJSON: () => ({}),
    }),
  };
  const events: unknown[] = [];
  const input = new BrowserInputSource(target as unknown as HTMLElement);

  input.attach({
    emit: (type: string, event: unknown) => void events.push([type, event]),
  } as never);

  listeners.get("focus")?.({} as Event);
  listeners.get("paste")?.({
    clipboardData: { getData: (kind: string) => kind === "text" ? "alpha\nbeta" : "" },
    preventDefault: () => undefined,
  } as unknown as Event);
  listeners.get("blur")?.({} as Event);

  assertEquals(events, [
    ["terminalFocus", { key: "focus", focused: true, buffer: new Uint8Array() }],
    ["paste", { key: "paste", text: "alpha\nbeta", buffer: new TextEncoder().encode("alpha\nbeta") }],
    ["terminalFocus", { key: "focus", focused: false, buffer: new Uint8Array() }],
  ]);

  input.dispose();
});

Deno.test("BrowserInputSource bridges text input events to key presses", () => {
  const listeners = new Map<string, EventListener>();
  const prevented: string[] = [];
  const target = {
    tabIndex: -1,
    value: "Az \n",
    addEventListener: (type: string, listener: EventListener) => void listeners.set(type, listener),
    removeEventListener: (type: string) => void listeners.delete(type),
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 80,
      bottom: 80,
      width: 80,
      height: 80,
      toJSON: () => ({}),
    }),
  };
  const events: unknown[] = [];
  const input = new BrowserInputSource(target as unknown as HTMLElement, { textInput: "target" });

  input.attach({
    emit: (type: string, event: unknown) => void events.push([type, event]),
  } as never);

  listeners.get("input")?.({
    target,
    preventDefault: () => prevented.push("input"),
  } as unknown as Event);

  assertEquals(target.value, "");
  assertEquals(prevented, ["input"]);
  assertEquals(events, [
    ["keyPress", { key: "a", meta: false, ctrl: false, shift: false, buffer: new TextEncoder().encode("A") }],
    ["keyPress", { key: "z", meta: false, ctrl: false, shift: false, buffer: new TextEncoder().encode("z") }],
    ["keyPress", { key: "space", meta: false, ctrl: false, shift: false, buffer: new TextEncoder().encode(" ") }],
    ["keyPress", { key: "return", meta: false, ctrl: false, shift: false, buffer: new TextEncoder().encode("\n") }],
  ]);

  input.dispose();
});

Deno.test("BrowserPlatform updates terminal size from ResizeObserver", () => {
  const original = globalThis.ResizeObserver;
  let resizeCallback: ResizeObserverCallback | undefined;
  let disconnected = false;
  class FakeResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      resizeCallback = callback;
    }
    observe(): void {}
    disconnect(): void {
      disconnected = true;
    }
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: FakeResizeObserver,
  });

  let width = 100;
  let height = 60;
  const root = {
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    }),
  };

  try {
    const platform = new BrowserPlatform({
      root: root as unknown as HTMLElement,
      cellWidth: 10,
      cellHeight: 20,
      textInput: false,
    });
    assertEquals(platform.size.peek(), { columns: 10, rows: 3 });

    width = 75;
    height = 85;
    resizeCallback?.([], {} as ResizeObserver);
    assertEquals(platform.size.peek(), { columns: 7, rows: 4 });

    platform.dispose();
    assertEquals(disconnected, true);
  } finally {
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: original,
    });
  }
});

Deno.test("renderDomNodeToHtml serializes semantic DOM nodes safely", () => {
  assertEquals(
    renderDomNodeToHtml({
      tag: "section",
      role: "region",
      ariaLabel: "Demo <panel>",
      className: "demo",
      style: { backgroundColor: "#000", padding: "8px" },
      children: [
        { tag: "h2", text: "Deno TUI" },
        { tag: "button", text: "Run", attributes: { type: "button", disabled: true } },
      ],
    }),
    '<section role="region" aria-label="Demo &lt;panel&gt;" class="demo" style="background-color:#000;padding:8px"><h2>Deno TUI</h2><button type="button" disabled>Run</button></section>',
  );
});

Deno.test("themeTokensToCssVariables converts ANSI theme tokens to CSS variables", () => {
  const theme = createTheme(createAnsiThemeTokens({
    foreground: { foreground: [10, 20, 30] },
    surface: { background: [1, 2, 3] },
  }));

  assertEquals(themeTokensToCssVariables(theme), {
    "--deno-tui-foreground-fg": "rgb(10,20,30)",
    "--deno-tui-muted-fg": "rgb(10,20,30)",
    "--deno-tui-accent-fg": "rgb(10,20,30)",
    "--deno-tui-success-fg": "rgb(10,20,30)",
    "--deno-tui-warning-fg": "rgb(10,20,30)",
    "--deno-tui-danger-fg": "rgb(10,20,30)",
    "--deno-tui-surface-bg": "rgb(1,2,3)",
  });
});
