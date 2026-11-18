// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertRejects } from "./deps.ts";
import {
  createMermaidStandardRenderer,
  MERMAID_STANDARD_VERSION,
  MermaidStandardRenderer,
  type MermaidStandardRuntime,
} from "../mod.mermaid.ts";

Deno.test("full Mermaid catalogue exposes upstream families without a DOM or a flowchart-only pre-parser", async () => {
  const renderer = await createMermaidStandardRenderer();
  assertEquals(renderer.version, MERMAID_STANDARD_VERSION);
  const catalogue = await renderer.diagramTypes();
  assert(catalogue.includes("flowchart-v2"));
  assert(catalogue.includes("sequence"));
  assert(catalogue.includes("treeView"));
  assert(catalogue.includes("zenuml"), "The documented ZenUML family must not be missing from the default compiler.");
  assert(!catalogue.includes("error"));
  assert(!catalogue.includes("---"));
  // Full grammar validation/rendering runs against the real DOM in the browser
  // fixture matrix. A few DOM-free upstream parsers cannot establish parity.
  await assertRejects(() => renderer.parse("flowchart TB\nsubgraph service\nA --> B\nend"), Error, "DOM host");
});

Deno.test("default compiler factories register the documented lazy extension once without borrowing a DOM", async () => {
  const before = globalThis.document;
  const renderers = await Promise.all(Array.from({ length: 3 }, () => createMermaidStandardRenderer()));
  try {
    const catalogues = await Promise.all(renderers.map((renderer) => renderer.diagramTypes()));
    for (const catalogue of catalogues) assertEquals(catalogue.filter((type) => type === "zenuml"), ["zenuml"]);
    assertEquals(globalThis.document, before);
    await assertRejects(() => renderers[0]!.parse("zenuml\nA->B: Message"), Error, "DOM host");
  } finally {
    for (const renderer of renderers) renderer.dispose();
  }
});

Deno.test("full Mermaid compiler diagnoses a missing DOM and invalid source without replacing global objects", async () => {
  const before = globalThis.document;
  const renderer = await createMermaidStandardRenderer();
  await assertRejects(() => renderer.compile("flowchart TB\nA"), Error, "DOM host");
  await assertRejects(() => renderer.parse(""), SyntaxError);
  await assertRejects(() => renderer.parse("x".repeat(128_001)), RangeError);
  assertEquals(globalThis.document, before);
});

Deno.test("full Mermaid configuration and parse calls serialize across independent document windows", async () => {
  const received: unknown[] = [];
  let active = 0;
  const runtime: MermaidStandardRuntime = {
    initialize(config) {
      assertEquals(active, 0, "configuration changed during another window's compilation");
      received.push(config);
    },
    async parse(source) {
      active++;
      await Promise.resolve();
      await Promise.resolve();
      active--;
      return { diagramType: source };
    },
    render() {
      throw new Error("No DOM in model test.");
    },
    getRegisteredDiagramsMetadata() {
      return [{ id: "error" }, { id: "---" }, { id: "sequence" }];
    },
  };
  const first = new MermaidStandardRenderer(runtime);
  const second = new MermaidStandardRenderer(runtime);
  assertEquals(
    await Promise.all([
      first.parse("first", { config: { theme: "dark", securityLevel: "loose" } }),
      second.parse("second", { config: { theme: "neutral" } }),
    ]),
    ["first", "second"],
  );
  assertEquals((received[0] as { securityLevel: string }).securityLevel, "strict");
  assertEquals((received[1] as { theme: string }).theme, "neutral");
  assertEquals(await first.diagramTypes(), ["sequence"]);
});

Deno.test("a failed or aborted full Mermaid request cannot poison the next document", async () => {
  let fail = true;
  const runtime: MermaidStandardRuntime = {
    initialize() {},
    parse(source) {
      if (fail) {
        fail = false;
        return Promise.reject(new SyntaxError("bad input"));
      }
      return Promise.resolve({ diagramType: source });
    },
    render() {
      throw new Error("No DOM in model test.");
    },
    getRegisteredDiagramsMetadata: () => [],
  };
  const renderer = new MermaidStandardRenderer(runtime);
  await assertRejects(() => renderer.parse("first"), SyntaxError);
  assertEquals(await renderer.parse("second"), "second");
  const abort = new AbortController();
  abort.abort();
  await assertRejects(() => renderer.parse("aborted", { signal: abort.signal }), DOMException);
  assertEquals(await renderer.parse("third"), "third");
});

Deno.test("untrusted Mermaid source cannot weaken host-defined secure keys or mandatory security guards", async () => {
  let received: Record<string, unknown> | undefined;
  const secure = Object.freeze(["themeCSS", "maxEdges"]);
  const runtime: MermaidStandardRuntime = {
    initialize(config) {
      received = config;
    },
    parse: () => Promise.resolve({ diagramType: "flowchart" }),
    render() {
      throw new Error("No DOM in model test.");
    },
    getRegisteredDiagramsMetadata: () => [],
  };
  await new MermaidStandardRenderer(runtime).parse("original", { config: { secure, securityLevel: "loose" } });
  assertEquals(received!.securityLevel, "strict");
  assertEquals(
    new Set(received!.secure as string[]),
    new Set([
      "securityLevel",
      "startOnLoad",
      "suppressErrorRendering",
      "maxTextSize",
      "maxEdges",
      "secure",
      "themeCSS",
    ]),
  );
  assertEquals(secure, ["themeCSS", "maxEdges"]);
});
