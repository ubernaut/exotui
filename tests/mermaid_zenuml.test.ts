// Copyright 2026 ExotUI contributors. MIT license.
import { assert, assertEquals, assertRejects } from "./deps.ts";
import { createHeadlessMermaidRenderer } from "../mod.mermaid_headless.ts";
import { type MermaidScene, renderMermaidNativeFrame } from "../mod.mermaid.ts";
import { MERMAID_ZENUML_FIXTURES } from "./fixtures/mermaid_standard/zenuml.ts";

const executablePath = Deno.env.get("EXOTUI_CHROMIUM") ?? "/snap/bin/chromium";
let available = false;
try {
  available = Deno.statSync(executablePath).isFile;
} catch { /* Explicit optional host capability. */ }

Deno.test({
  name: "ZenUML uses its official grammar for malformed bodies and recovers without constructing a viewer",
  ignore: !available,
  fn: async () => {
    const renderer = await createHeadlessMermaidRenderer({ executablePath, chromiumSandbox: false });
    try {
      for (const method of ["parse", "compile"] as const) {
        await assertRejects(() => renderer[method]("zenuml\nA.foo() {"), Error, "mismatched input '<EOF>'");
        await assertRejects(() => renderer[method]("zenuml\nA.foo() }"), Error, "no viable alternative");
        assertEquals(await renderer.parse("zenuml\nA->B: Message"), "zenuml");
        // This terse input is accepted by upstream; do not invent a stricter grammar.
        assertEquals(await renderer.parse("zenuml\nA->"), "zenuml");
      }
      // ZenUML's legacy viewer CSS must not poison later counter-capable SVGs.
      const next = await renderer.compile("flowchart LR\nA[Next family]-->B[Still usable]", {
        config: { themeCSS: '.node{counter-reset: step 3}.nodeLabel::before{content:counter(step) " ";}' },
      });
      assertEquals(next.diagramType, "flowchart-v2");
      assertEquals(renderer.inspect().pending, 0);
    } finally {
      await renderer.dispose();
    }
  },
});

Deno.test({
  name: "all sixteen documented ZenUML examples retain native scenes after compiler disposal with real root clipping",
  ignore: !available,
  fn: async () => {
    const renderer = await createHeadlessMermaidRenderer({ executablePath, chromiumSandbox: false });
    const retained: MermaidScene[] = [];
    try {
      assertEquals(MERMAID_ZENUML_FIXTURES.length, 16);
      for (const fixture of MERMAID_ZENUML_FIXTURES) {
        const diagram = await renderer.compile(fixture.source);
        assertEquals(diagram.diagramType, "zenuml");
        assertEquals(diagram.source, fixture.source);
        assert(diagram.svg.startsWith("<svg"));
        assert(!diagram.svg.includes("foreignObject"));
        const scene = JSON.parse(JSON.stringify(diagram.scene)) as MermaidScene;
        assert(scene.items.some((item) => item.kind === "path"));
        assert(scene.items.some((item) => item.kind === "text"));
        if (fixture.name === "zenuml-reply") {
          // This upstream comment exceeds the root viewBox. Retain its full
          // source/semantic text, actual viewport and intentional paint clip.
          const comment = scene.items.find((item) => item.kind === "text" && item.text.startsWith("3. use @return"));
          assert(comment?.kind === "text" && comment.clip);
          assert(comment.x + comment.width > scene.width);
          assertEquals(comment.text, "3. use @return or @reply annotator on an async message");
          assertEquals(scene.width, 363.5);
          assertEquals(scene.height, 457);
        }
        retained.push(scene);
      }
    } finally {
      await renderer.dispose();
    }
    for (const scene of retained) {
      const frame = renderMermaidNativeFrame(scene, { background: "#05080b" });
      assert(frame.cells.some((row) => row.some((cell) => cell.char.trim())));
      assertEquals(frame.diagnostics, []);
    }
  },
});
