// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertRejects, assertStringIncludes, assertThrows } from "./deps.ts";
import {
  MermaidMarkdownCache,
  MermaidMarkdownController,
  type MermaidMarkdownControllerOptions,
  type MermaidMarkdownSettings,
  type MermaidStandardDiagram,
  type MermaidStandardOptions,
} from "../mod.mermaid.ts";
import { MarkdownSurface, TITLE_HEADING_FONTS } from "../mod.document.ts";
import { Signal } from "../src/signals/mod.ts";
import { stripStyles, textWidth } from "../src/utils/strings.ts";

function diagram(source: string, options: MermaidStandardOptions = {}): MermaidStandardDiagram {
  return {
    source,
    diagramType: "fixture",
    version: "fixture",
    svg: "<svg/>",
    scene: {
      width: 240,
      height: 100,
      title: "",
      description: "",
      diagnostics: [],
      items: [{
        kind: "text",
        text: `${source} 世界`,
        x: 10,
        y: 20,
        width: 180,
        height: 16,
        color: options.config?.theme === "dark" ? "rgb(255, 0, 0)" : "rgb(0, 255, 0)",
        fontWeight: "400",
        fontStyle: "normal",
        href: `product:${source}`,
      }],
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { resolve, reject, promise };
}

async function turns(count = 8) {
  for (let i = 0; i < count; i++) await Promise.resolve();
}

function document(code: string) {
  return `# Stack\n\nOpening.\n\n\`\`\`mermaid\n${code}\n\`\`\`\n\n## Details\n\nAfter diagram.`;
}

Deno.test("Mermaid document options retain typed Markdown formatting and do not admit a replacement diagram renderer", () => {
  const valid: MermaidMarkdownControllerOptions = { render: { headingArt: "title", wrapHeadingArt: false } };
  const invalidFont: MermaidMarkdownControllerOptions = {
    // @ts-expect-error Markdown fonts are typed, not an empty object after mapping an optional-property union.
    render: { headingFonts: "not fonts" },
  };
  const invalidDiagram: MermaidMarkdownControllerOptions = {
    // @ts-expect-error The full controller owns its measured diagram hook.
    render: { diagram: () => undefined },
  };
  assertEquals(valid.render?.headingArt, "title");
  assert(invalidFont.render && invalidDiagram.render);
});

Deno.test("Mermaid cache coalesces windows without letting one cancelled lease abort another", async () => {
  const result = deferred<MermaidStandardDiagram>();
  let calls = 0;
  let owned!: AbortSignal;
  const cache = new MermaidMarkdownCache({
    compile: (_, options) => {
      calls++;
      owned = options!.signal!;
      return result.promise;
    },
  });
  try {
    const abort = new AbortController();
    const first = cache.compile("A", { signal: abort.signal });
    const second = cache.compile("A");
    await turns();
    assertEquals(calls, 1);
    abort.abort(new DOMException("first window closed", "AbortError"));
    await assertRejects(() => first, DOMException, "first window closed");
    assert(!owned.aborted);
    result.resolve(diagram("A"));
    assertEquals((await second).source, "A");
    assertEquals((await cache.compile("A")).source, "A");
    assertEquals(calls, 1);
    assert(owned.aborted, "successful jobs release their owned signal");
    assertEquals(cache.inspect().pending, 0);
    assertEquals(cache.inspect().entries, 1);
  } finally {
    cache.dispose();
  }
});

Deno.test("Mermaid cache snapshots immutable results/config and distinguishes theme, width and trust", async () => {
  const gate = deferred<void>();
  const seen: MermaidStandardOptions[] = [];
  const cache = new MermaidMarkdownCache({
    async compile(source, options = {}) {
      await gate.promise;
      seen.push(options);
      return diagram(source, options);
    },
  });
  try {
    const config = { theme: "dark", themeVariables: { primaryColor: "#ff0000" } };
    const pending = cache.compile("A", { config, containerWidth: 720 });
    config.theme = "neutral";
    config.themeVariables.primaryColor = "#00ff00";
    gate.resolve();
    const value = await pending;
    assertEquals(seen[0]!.config?.theme, "dark");
    assertEquals(seen[0]!.config?.themeVariables, { primaryColor: "#ff0000" });
    assertThrows(() => value.scene!.width = 0, TypeError);
    assertEquals(Reflect.set(value.scene!.items[0]!, "x", 0), false);
    await cache.compile("A", {
      config: { themeVariables: { primaryColor: "#ff0000" }, theme: "dark" },
      containerWidth: 720,
    });
    assertEquals(seen.length, 1, "object key order does not change identity");
    await cache.compile("A", { config, containerWidth: 720 });
    await cache.compile("A", { config, containerWidth: 360 });
    await cache.compile("A", { config, containerWidth: 360, trusted: true });
    assertEquals(seen.length, 4);
    assertEquals(cache.inspect().entries, 4);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const invalid of [cyclic, { callback() {} }, { number: NaN }, { time: new Date() }]) {
      await assertRejects(() => cache.compile("A", { config: invalid }));
    }
  } finally {
    cache.dispose();
  }
});

Deno.test("last Mermaid cache lease cancels owned work without late retention and releases its queue slot", async () => {
  const late = deferred<MermaidStandardDiagram>();
  const signals: AbortSignal[] = [];
  let calls = 0;
  const cache = new MermaidMarkdownCache({
    compile: (code, options) => {
      signals.push(options!.signal!);
      return ++calls === 1 ? late.promise : Promise.resolve(diagram(code));
    },
  }, { maxPending: 1 });
  try {
    const abort = new AbortController();
    const first = cache.compile("A", { signal: abort.signal });
    await turns();
    abort.abort(new DOMException("only window closed", "AbortError"));
    await assertRejects(() => first, DOMException, "only window closed");
    assert(signals[0]!.aborted);
    assertEquals(cache.inspect().pending, 0);
    await cache.compile("A");
    late.resolve(diagram("STALE"));
    await turns();
    assertEquals((await cache.compile("A")).source, "A");
    assertEquals(calls, 2);
    await assertRejects(() => cache.compile("A", { signal: abort.signal }), DOMException);
    assertEquals(calls, 2);
  } finally {
    cache.dispose();
  }
});

Deno.test("Mermaid native backdrop refresh reprojects cached transparent paint rather than retaining old colors", async () => {
  let calls = 0;
  const cache = new MermaidMarkdownCache({
    compile: (code) => {
      calls++;
      const value = diagram(code);
      const item = value.scene!.items[0]!;
      if (item.kind === "text") item.color = "rgba(255,0,0,.5)";
      return Promise.resolve(value);
    },
  });
  const controller = new MermaidMarkdownController(cache, {
    source: document("A"),
    settings: { native: { background: "rgb(20,40,60)" } },
  });
  try {
    await controller.settled();
    const paint = () => controller.render(80).flatMap((row) => row.segments).find((span) => span.text === "A")!.style;
    assertEquals(paint()!.foreground, [138, 20, 30]);
    controller.settings.value = { native: { background: "rgb(40,60,80)" } };
    await controller.settled();
    const color = paint()!.foreground as readonly number[];
    // Existing normalized-float compositing may round a half-byte one unit
    // either way. The lifecycle must reflect the new backdrop, not old paint.
    assert(color.every((channel, index) => Math.abs(channel - [147.5, 30, 40][index]!) <= .5));
    assert(color[0]! > 140);
    assertEquals(calls, 1);
  } finally {
    controller.dispose();
    cache.dispose();
  }
});

Deno.test("Mermaid cache bounds LRU entries, bytes, pending jobs and timeout; failures can retry", async () => {
  let calls = 0;
  let fail = true;
  const cache = new MermaidMarkdownCache({
    compile: (source) => {
      calls++;
      if (source === "bad" && fail) {
        fail = false;
        return Promise.reject(new SyntaxError("bad source"));
      }
      return Promise.resolve(diagram(source));
    },
  }, { maxEntries: 2 });
  try {
    await cache.compile("A");
    await cache.compile("B");
    await cache.compile("A");
    await cache.compile("C");
    assertEquals(calls, 3);
    await cache.compile("B");
    assertEquals(calls, 4, "least recently used B was evicted");
    await assertRejects(() => cache.compile("bad"), SyntaxError);
    await cache.compile("bad");
    assertEquals(calls, 6);
    assertEquals(cache.inspect().entries, 2);
  } finally {
    cache.dispose();
  }
  const tiny = new MermaidMarkdownCache({ compile: (code) => Promise.resolve(diagram(code)) }, { maxBytes: 32 });
  await assertRejects(() => tiny.compile("A"), RangeError, "byte budget");
  assertEquals(tiny.inspect().entries, 0);
  tiny.dispose();
  let signal!: AbortSignal;
  const timed = new MermaidMarkdownCache({
    compile: (_, options) => {
      signal = options!.signal!;
      return new Promise(() => {});
    },
  }, { maxPending: 1, timeoutMs: 20 });
  try {
    const first = timed.compile("A");
    await assertRejects(() => timed.compile("B"), RangeError, "queue is full");
    await assertRejects(() => first, DOMException, "timed out");
    assert(signal.aborted);
    assertEquals(timed.inspect().pending, 0);
  } finally {
    timed.dispose();
  }
  for (const option of [{ maxEntries: 0 }, { maxBytes: NaN }, { maxPending: 1.5 }, { timeoutMs: 300001 }]) {
    assertThrows(
      () => new MermaidMarkdownCache({ compile: (code) => Promise.resolve(diagram(code)) }, option),
      RangeError,
    );
  }
});

Deno.test("Mermaid cache invalidation/disposal abort work, reject late caching and allow immediate retry", async () => {
  const late = deferred<MermaidStandardDiagram>();
  const signals: AbortSignal[] = [];
  let calls = 0;
  const cache = new MermaidMarkdownCache({
    compile: (code, options) => {
      signals.push(options!.signal!);
      return ++calls === 1 ? late.promise : Promise.resolve(diagram(code));
    },
  });
  const first = cache.compile("A");
  await turns();
  cache.invalidate();
  await assertRejects(() => first, DOMException, "invalidated");
  assert(signals[0]!.aborted);
  await cache.compile("A");
  late.resolve(diagram("STALE"));
  await turns();
  assertEquals((await cache.compile("A")).source, "A");
  assertEquals(calls, 2);
  cache.dispose();
  cache.dispose();
  assertEquals(cache.inspect(), { entries: 0, bytes: 0, pending: 0, revision: 2, disposed: true });
  await assertRejects(() => cache.compile("A"), Error, "disposed");
});

Deno.test("reactive Mermaid documents suppress stale source, coalesce resize/theme and retain native links", async () => {
  const old = deferred<MermaidStandardDiagram>();
  const seen: { source: string; options: MermaidStandardOptions }[] = [];
  const cache = new MermaidMarkdownCache({
    compile: (source, options = {}) => {
      seen.push({ source, options });
      return source === "OLD" ? old.promise : Promise.resolve(diagram(source, options));
    },
  });
  const source = new Signal(document("OLD"));
  const settings = new Signal<MermaidMarkdownSettings>({ compile: { config: { theme: "dark" } } });
  const controller = new MermaidMarkdownController(cache, { source, settings });
  try {
    await turns();
    assertEquals(seen[0]!.source, "OLD");
    assertStringIncludes(controller.text(80), "Rendering Mermaid");
    source.value = document("NEW");
    assertStringIncludes(controller.text(80), "Rendering Mermaid");
    controller.render(40);
    controller.render(60);
    controller.render(30);
    settings.value = { compile: { config: { theme: "neutral" } }, native: { background: "rgb(10,12,20)" } };
    assertEquals((await controller.settled()).phase, "ready");
    assert(seen[0]!.options.signal!.aborted);
    assertEquals(seen.length, 2);
    assertEquals(seen[1]!.source, "NEW");
    assertEquals(seen[1]!.options.containerWidth, 270);
    assertEquals(seen[1]!.options.config?.theme, "neutral");
    old.resolve(diagram("STALE"));
    await turns();
    assertStringIncludes(controller.text(30), "NEW 世界");
    assert(!controller.text(30).includes("STALE"));
    const visible = controller.visible(30, 30);
    const line = visible.findIndex((line) => line.text.includes("NEW"));
    assertEquals(controller.linkAt(visible[line]!.text.indexOf("NEW"), line, 30, 30), "product:NEW");
    settings.value = { compile: { config: { theme: "dark" } } };
    await controller.settled();
    const span = controller.render(30).flatMap((line) => line.segments).find((span) => span.text === "N")!;
    assertEquals(span.style?.foreground, [255, 0, 0]);
    const before = seen.length;
    settings.value = { compile: { config: { theme: "dark" } }, native: { background: "rgb(20,30,40)" } };
    await controller.settled();
    assertEquals(seen.length, before, "native backdrop refresh does not recompile unchanged engine geometry");
    cache.invalidate();
    await controller.settled();
    assertEquals(seen.length, before + 1);
  } finally {
    controller.dispose();
    cache.dispose();
    assert(!source.disposed && !settings.disposed);
    assertEquals(source.inspect().subscriptions, 0);
    assertEquals(settings.inspect().subscriptions, 0);
    source.dispose();
    settings.dispose();
  }
});

Deno.test("mounted async Mermaid keeps title policy, scroll rows/styles, immediate reflow and link dispatch", async () => {
  const cache = new MermaidMarkdownCache({ compile: (code, options) => Promise.resolve(diagram(code, options)) });
  const controller = new MermaidMarkdownController(cache, {
    source: document("HELLO"),
    render: { headingFonts: TITLE_HEADING_FONTS, headingArt: "title", wrapHeadingArt: false },
  });
  const opened: string[] = [];
  const surface = new MarkdownSurface({ controller, onLink: (href) => opened.push(href) });
  try {
    await surface.ready;
    for (const [width, height, offset] of [[80, 12, 0], [40, 9, 3], [80, 7, 5], [12, 5, 0], [80, 12, 0]] as const) {
      surface.render(width, height);
      assertEquals((await controller.settled()).phase, "ready");
      controller.scrollTo(offset, width, height);
      const actual = surface.render(width, height).map(stripStyles);
      const expected = controller.visible(width, height).map((line) =>
        line.text + " ".repeat(width - textWidth(line.text))
      );
      while (expected.length < height) expected.push(" ".repeat(width));
      assertEquals(actual, expected, `mounted async viewport ${width}x${height}`);
      assert(controller.render(width).every((line) => textWidth(line.text) <= width));
      if (width === 12) assertEquals(controller.render(width)[0]!.text, "Stack");
    }
    controller.scrollTo(4, 80, 12);
    const previous = controller.offset.peek();
    controller.settings.value = { compile: { config: { theme: "dark" } } };
    // Loading rows reserve the last native height, keeping the numeric scroll position intact.
    await turns(2);
    surface.render(80, 12);
    await controller.settled();
    assertEquals(controller.offset.peek(), previous);
    controller.scrollTo(0, 80, 30);
    surface.render(80, 30);
    const visible = controller.visible(80, 30);
    const row = visible.findIndex((line) => line.text.includes("HELLO"));
    surface.press(visible[row]!.text.indexOf("HELLO"), row);
    assertEquals(opened, ["product:HELLO"]);
    surface.dispose();
    assertEquals(controller.state.peek().phase, "ready", "surface borrows rather than destroys its controller");
    controller.source.value = document("NEXT");
    await controller.settled();
    assertStringIncludes(controller.text(80), "NEXT 世界");
  } finally {
    surface.dispose();
    controller.dispose();
    cache.dispose();
  }
});

Deno.test("async Mermaid shows safe errors and retries; disposing one window preserves another shared consumer", async () => {
  let fail = true;
  const cache = new MermaidMarkdownCache({
    compile: (code) => {
      if (fail) return Promise.reject(new SyntaxError("broken\x1b[31m\nsource 世界 e\u0301"));
      return Promise.resolve(diagram(code));
    },
  });
  const controller = new MermaidMarkdownController(cache, { source: document("A") });
  try {
    assertEquals((await controller.settled()).phase, "error");
    const text = controller.text(80);
    assertStringIncludes(text, "Mermaid error: broken [31m source");
    assertStringIncludes(text, "世界 e\u0301");
    assert(controller.render(80).every((row) => textWidth(row.text) <= 80));
    assert(!text.includes("\x1b"));
    fail = false;
    assertEquals((await controller.refresh()).phase, "ready");
  } finally {
    controller.dispose();
    cache.dispose();
  }
  const result = deferred<MermaidStandardDiagram>();
  let signal!: AbortSignal;
  const shared = new MermaidMarkdownCache({
    compile: (_, options) => {
      signal = options!.signal!;
      return result.promise;
    },
  });
  const first = new MermaidMarkdownController(shared, { source: document("A") });
  const second = new MermaidMarkdownController(shared, { source: document("A") });
  try {
    await turns();
    first.dispose();
    await first.settled();
    await turns();
    assert(!signal.aborted);
    result.resolve(diagram("A"));
    assertEquals((await second.settled()).phase, "ready");
    second.dispose();
    first.dispose();
    assertEquals(first.state.peek().phase, "disposed");
    assertEquals(second.state.peek().phase, "disposed");
    assertEquals(shared.inspect().pending, 0);
  } finally {
    first.dispose();
    second.dispose();
    shared.dispose();
  }
});
