// Copyright 2023 Im-Beast. MIT license.
import { runtimeHost } from "../src/runtime/host.ts";
/** Actual host-side full grammar/native preparation; never modifies a live app or fake browser globals. */
import { Buffer } from "node:buffer";
import { createHeadlessMermaidRenderer, type HeadlessMermaidRenderer } from "../mod.mermaid_headless.ts";
import { type MermaidStandardDiagram, prepareMermaidMarkdown, renderMermaidNativeFrame } from "../mod.mermaid.ts";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

import { MarkdownSurface } from "../mod.document.ts";
import { MERMAID_STANDARD_FIXTURES } from "../tests/fixtures/mermaid_standard/catalogue.ts";
import { verifyMermaidFamilyGrammar } from "../tests/fixtures/mermaid_standard/grammar.ts";
import {
  MERMAID_MATH_FIXTURES,
  verifyMermaidFractions,
  verifyMermaidOperators,
  verifyMermaidRadicals,
} from "../tests/fixtures/mermaid_standard/math.ts";
import { MERMAID_ICON_DATA, MERMAID_ICON_FIXTURES } from "../tests/fixtures/mermaid_standard/icons.ts";
import { stripStyles } from "../src/utils/strings.ts";
import { verifyMermaidStrokeFeatures } from "../tests/fixtures/mermaid_standard/stroke_features.ts";
import { verifyMermaidTextFeatures } from "../tests/fixtures/mermaid_standard/text_layout.ts";
import { verifyMermaidBidiFeatures } from "../tests/fixtures/mermaid_standard/text_bidi.ts";
import {
  verifyMermaidMathTextClusters,
  verifyMermaidMathTextOrdering,
  verifyMermaidTextTransforms,
} from "../tests/fixtures/mermaid_standard/text_transform.ts";
import {
  verifyMermaidSemantics,
  verifyMermaidSemanticsTransport,
} from "../tests/fixtures/mermaid_standard/semantics.ts";
import {
  verifyMermaidAccessibility,
  verifyMermaidAccessibilityTransport,
} from "../tests/fixtures/mermaid_standard/accessibility.ts";
import {
  verifyMermaidFlowFeatures,
  verifyMermaidFlowTransport,
} from "../tests/fixtures/mermaid_standard/flow_features.ts";
import {
  verifyMermaidAnimations,
  verifyMermaidAnimationTransport,
} from "../tests/fixtures/mermaid_standard/animations.ts";
import {
  verifyMermaidInteractions,
  verifyMermaidInteractionTransport,
} from "../tests/fixtures/mermaid_standard/interactions.ts";
import {
  padNativeRow,
  verifyMermaidDocumentLifecycle,
  verifyMermaidFlexLifecycle,
} from "../tests/fixtures/mermaid_standard/lifecycle.ts";

const hadDocument = "document" in globalThis;
const pixels = new Uint8Array(32 * 16 * 4);
for (let y = 0; y < 16; y++) {
  for (let x = 0; x < 32; x++) pixels.set(x < 16 ? [255, 0, 0, 255] : [0, 255, 0, 255], (y * 32 + x) * 4);
}
const pngImage = new PNG({ width: 32, height: 16 });
pngImage.data = Buffer.from(pixels);
const png = PNG.sync.write(pngImage);
const jpg = jpeg.encode({ width: 32, height: 16, data: pixels }, 100).data;
const vector = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16" viewBox="0 0 32 16"><rect width="16" height="16" fill="red"/><rect x="16" width="16" height="16" fill="lime"/></svg>',
);
const oversized = new Uint8Array(png);
new DataView(oversized.buffer).setUint32(16, 60_000);
new DataView(oversized.buffer).setUint32(20, 40_000);
const assertionModule = runtimeHost.runtime === "bun" ? "../tests/bun_assert.ts" : "../tests/deps.ts";
const assertions: typeof import("../tests/deps.ts") = await import(assertionModule);
const assert: typeof assertions.assert = assertions.assert;
const { assertEquals, assertRejects } = assertions;
const requests = new Map<string, number>();
const imageServer = runtimeHost.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, (request) => {
  const path = new URL(request.url).pathname;
  requests.set(path, (requests.get(path) ?? 0) + 1);
  const body = path === "/image.png" ? png : path === "/image.jpg" ? jpg : path === "/image.svg" ? vector : oversized;
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": path.endsWith(".jpg") ? "image/jpeg" : path.endsWith(".svg") ? "image/svg+xml" : "image/png",
    },
  });
});
const imageOrigin = `http://127.0.0.1:${imageServer.addr.port}`;
let renderer: HeadlessMermaidRenderer | undefined;
const failures: string[] = [];
const covered = new Set<string>();
const capturedImages: MermaidStandardDiagram[] = [];
let capturedInteractions: MermaidStandardDiagram[] = [];
let capturedAnimations: MermaidStandardDiagram[] = [];
let capturedFlowFeatures: MermaidStandardDiagram[] = [];
let capturedStrokeFeatures: MermaidStandardDiagram[] = [];
let capturedTextFeatures: MermaidStandardDiagram[] = [];
let capturedTextTransforms: MermaidStandardDiagram[] = [];
let capturedAccessibility: MermaidStandardDiagram[] = [];
let capturedSemantics: MermaidStandardDiagram[] = [];
const capturedMath: { name: string; diagram: MermaidStandardDiagram }[] = [];
const capturedIcons: { name: string; diagram: MermaidStandardDiagram }[] = [];
let imageCases = 0;
try {
  renderer = await createHeadlessMermaidRenderer({
    executablePath: runtimeHost.env.get("EXOTUI_CHROMIUM") ?? "/snap/bin/chromium",
    chromiumSandbox: false,
    allowResource: (url) => url.origin === imageOrigin && url.pathname !== "/denied.png",
  });
  console.log(`ok headless:family-grammar ${JSON.stringify(await verifyMermaidFamilyGrammar(renderer))}`);
  const { retained: accessibilityScenes, ...accessibilityStats } = await verifyMermaidAccessibility(renderer);
  capturedAccessibility = accessibilityScenes;
  console.log(`ok headless:accessibility ${JSON.stringify(accessibilityStats)}`);
  const { retained: semanticScenes, ...semanticStats } = await verifyMermaidSemantics(renderer);
  capturedSemantics = semanticScenes;
  console.log(`ok headless:semantic-content ${JSON.stringify(semanticStats)}`);
  console.log(`ok headless:document-lifecycle ${JSON.stringify(await verifyMermaidDocumentLifecycle(renderer))}`);
  console.log(`ok headless:flex-lifecycle ${JSON.stringify(await verifyMermaidFlexLifecycle(renderer))}`);
  const { retained: animated, ...animationStats } = await verifyMermaidAnimations(renderer);
  capturedAnimations = animated;
  console.log(`ok headless:animations ${JSON.stringify(animationStats)}`);
  const { retained: flowScenes, ...flowStats } = await verifyMermaidFlowFeatures(renderer);
  capturedFlowFeatures = flowScenes;
  console.log(`ok headless:flow-features ${JSON.stringify(flowStats)}`);
  const { retained: strokeScenes, ...strokeStats } = await verifyMermaidStrokeFeatures(renderer);
  capturedStrokeFeatures = strokeScenes;
  console.log(`ok headless:stroke-features ${JSON.stringify(strokeStats)}`);
  const { retained: textScenes, ...textStats } = await verifyMermaidTextFeatures(renderer);
  capturedTextFeatures = textScenes;
  console.log(`ok headless:text-layout ${JSON.stringify(textStats)}`);
  const { retained: bidiScenes, ...bidiStats } = await verifyMermaidBidiFeatures(renderer);
  capturedTextFeatures.push(...bidiScenes);
  console.log(`ok headless:text-bidi ${JSON.stringify(bidiStats)}`);
  const { retained: transformedScenes, ...transformStats } = await verifyMermaidTextTransforms(renderer);
  capturedTextTransforms = transformedScenes;
  console.log(`ok headless:text-transform ${JSON.stringify(transformStats)}`);
  const { retained: mathTextScenes, ...mathTextStats } = await verifyMermaidMathTextClusters(renderer);
  capturedTextTransforms.push(...mathTextScenes);
  console.log(`ok headless:math-text-clusters ${JSON.stringify(mathTextStats)}`);
  const { retained: mathOrderingScenes, ...mathOrderingStats } = await verifyMermaidMathTextOrdering(renderer);
  capturedTextTransforms.push(...mathOrderingScenes);
  const { retained: radicalScenes, ...radicalStats } = await verifyMermaidRadicals(renderer);
  capturedTextTransforms.push(...radicalScenes);
  console.log(`ok headless:math-radicals ${JSON.stringify(radicalStats)}`);
  const { retained: operatorScenes, ...operatorStats } = await verifyMermaidOperators(renderer);
  capturedTextTransforms.push(...operatorScenes);
  console.log(`ok headless:math-operators ${JSON.stringify(operatorStats)}`);
  const { retained: fractionScenes, ...fractionStats } = await verifyMermaidFractions(renderer);
  capturedTextTransforms.push(...fractionScenes);
  console.log(`ok headless:math-fractions ${JSON.stringify(fractionStats)}`);
  console.log(`ok headless:math-text-ordering ${JSON.stringify(mathOrderingStats)}`);
  const { retained, ...interactionStats } = await verifyMermaidInteractions(renderer);
  capturedInteractions = retained;
  console.log(`ok headless:interactions ${JSON.stringify(interactionStats)}`);
  await renderer.registerIconPacks([{ name: "stack", icons: MERMAID_ICON_DATA }, {
    name: "fa",
    icons: MERMAID_ICON_DATA,
  }]);
  let lazyCalls = 0;
  await renderer.registerIconPacks([{
    name: "host-lazy",
    loader: () => {
      lazyCalls++;
      return Promise.resolve(MERMAID_ICON_DATA);
    },
  }, {
    name: "host-unused",
    loader: () => {
      throw new Error("Unused host packs must never load.");
    },
  }]);
  await renderer.parse("flowchart TD\nA --> B");
  assertEquals(lazyCalls, 0);
  const iconSource = (name: string) => `flowchart TD\nA@{icon: "${name}:signal", h: 96}`;
  const lazy = await renderer.compile(iconSource("host-lazy") + '\nB@{icon: "host-lazy:turned", h: 96}\nA --> B');
  assertEquals(lazyCalls, 1);
  assertEquals(lazy.scene!.diagnostics, []);
  capturedIcons.push({ name: "icon-lazy", diagram: JSON.parse(JSON.stringify(lazy)) });
  await renderer.registerIconPacks([{
    name: "host-lazy",
    loader: () => {
      throw new Error("A replacement loader cannot revoke a cached pack.");
    },
  }]);
  let owned: AbortSignal | undefined;
  let started!: () => void;
  const loading = new Promise<void>((done) => started = done);
  await renderer.registerIconPacks([{
    name: "host-abort",
    loader: ({ signal }) => {
      owned = signal;
      started();
      return new Promise(() => {});
    },
  }]);
  const controller = new AbortController();
  const active = renderer.compile(iconSource("host-abort"), { signal: controller.signal });
  await loading;
  controller.abort(new DOMException("real engine icon load cancelled", "AbortError"));
  await assertRejects(() => active, DOMException, "real engine icon load cancelled");
  assert(owned?.aborted);
  const restored = await renderer.compile(iconSource("host-lazy"));
  assertEquals(lazyCalls, 1);
  assertEquals(restored.scene!.diagnostics, []);
  let attempts = 0;
  await renderer.registerIconPacks([{
    name: "host-retry",
    loader: () => {
      attempts++;
      if (attempts === 1) throw new Error("observable host icon failure");
      return Promise.resolve(MERMAID_ICON_DATA);
    },
  }]);
  const failed = await renderer.compile(iconSource("host-retry"));
  assert(failed.diagnostics?.some((warning) => warning.includes("observable host icon failure")));
  assert(failed.scene!.diagnostics.some((warning) => warning.includes("missing-icon")));
  assertEquals((await renderer.compile(iconSource("host-retry"))).scene!.diagnostics, []);
  assertEquals(attempts, 2);
  await renderer.registerIconPacks([{ name: "host-bounded", loader: () => Promise.resolve(MERMAID_ICON_DATA) }], {
    limits: { maxPackBytes: 16 },
  });
  const bounded = await renderer.compile(iconSource("host-bounded"));
  assert(bounded.diagnostics?.some((warning) => warning.includes("pack byte budget")));
  await renderer.registerIconPacks([{
    name: "host-timed",
    loader: ({ signal }) => {
      owned = signal;
      return new Promise(() => {});
    },
  }], { limits: { timeoutMs: 20 } });
  const timed = await renderer.compile(iconSource("host-timed"));
  assert(owned?.aborted);
  assert(timed.diagnostics?.some((warning) => warning.includes("timed out")));
  assertEquals((await renderer.compile(iconSource("host-lazy"))).scene!.diagnostics, []);
  console.log(
    `ok headless:icon-capabilities ${
      JSON.stringify({
        lazyCalls,
        retries: attempts,
        cancellationRecovery: true,
        cacheSemantics: true,
        loaderBounds: true,
        timeout: true,
      })
    }`,
  );
  for (const fixture of MERMAID_ICON_FIXTURES) {
    const diagram = JSON.parse(
      JSON.stringify(
        await renderer.compile(
          fixture.source,
          fixture.trusted
            ? { trusted: true, config: { securityLevel: "loose", dompurifyConfig: { ADD_TAGS: ["use"] } } }
            : {},
        ),
      ),
    ) as MermaidStandardDiagram;
    assertEquals(diagram.scene!.diagnostics, []);
    const frame = renderMermaidNativeFrame(diagram.scene!);
    const nativeText = frame.cells.map((row) => row.map((cell) => cell.char).join("")).join("\n");
    for (const label of fixture.labels) assert(nativeText.includes(label), `Native icon label disappeared: ${label}`);
    const colors = fixture.name === "icon-local-use"
      ? ["rgb(0, 221, 68)"]
      : fixture.name === "icon-fontawesome-label"
      ? ["rgb(40, 37, 61)"]
      : ["rgb(255, 34, 0)", "rgb(0, 221, 68)", "rgb(34, 85, 255)"];
    for (const color of colors) {
      assert(
        frame.cells.some((row) => row.some((cell) => cell.background === color)),
        `Missing real native icon color ${color}: ${fixture.name}`,
      );
    }
    const source = `# Icons\n\n\`\`\`mermaid\n${fixture.source}\n\`\`\`\n\nAfter icons.`;
    const prepared = await prepareMermaidMarkdown(source, { compile: () => Promise.resolve(diagram) });
    const surface = new MarkdownSurface({ source, render: prepared.render });
    try {
      await surface.ready;
      for (const [columns, rows, offset] of [[80, 12, 0], [40, 9, 3], [80, 7, 5], [80, 12, 0]] as const) {
        surface.component.controller.scrollTo(offset, columns, rows);
        const actual = surface.render(columns, rows).map(stripStyles);
        const expected = surface.component.controller.visible(columns, rows).map((line) =>
          padNativeRow(line.text, columns)
        );
        while (expected.length < rows) expected.push(" ".repeat(columns));
        assertEquals(actual, expected);
      }
    } finally {
      surface.dispose();
    }
    capturedIcons.push({ name: fixture.name, diagram });
    console.log(
      `ok headless:${fixture.name} ${JSON.stringify({ nativeSize: [frame.columns, frame.rows], mountedSnapshots: 4 })}`,
    );
  }
  for (const fixture of MERMAID_MATH_FIXTURES) {
    const diagram = JSON.parse(JSON.stringify(await renderer.compile(fixture.source))) as MermaidStandardDiagram;
    const frame = renderMermaidNativeFrame(diagram.scene!);
    assertEquals(frame.diagnostics, []);
    assert(diagram.scene!.items.some((item) => item.kind === "text" && item.math));
    const source = `# Math\n\n\`\`\`mermaid\n${fixture.source}\n\`\`\`\n\nAfter math.`;
    const prepared = await prepareMermaidMarkdown(source, { compile: () => Promise.resolve(diagram) });
    const surface = new MarkdownSurface({ source, render: prepared.render });
    try {
      await surface.ready;
      for (const [columns, rows, offset] of [[80, 12, 0], [40, 9, 3], [80, 7, 5], [80, 12, 0]] as const) {
        surface.component.controller.scrollTo(offset, columns, rows);
        const actual = surface.render(columns, rows).map(stripStyles);
        const expected = surface.component.controller.visible(columns, rows).map((line) =>
          padNativeRow(line.text, columns)
        );
        while (expected.length < rows) expected.push(" ".repeat(columns));
        assertEquals(actual, expected);
      }
    } finally {
      surface.dispose();
    }
    capturedMath.push({ name: fixture.name, diagram });
    console.log(
      `ok headless:${fixture.name} ${JSON.stringify({ nativeSize: [frame.columns, frame.rows], mountedSnapshots: 4 })}`,
    );
  }
  // Real documented upstream image-shape grammar, not the transport fixture.
  for (const extension of ["png", "jpg", "svg"]) {
    const source =
      `flowchart LR\nA@{img: "${imageOrigin}/image.${extension}", label: "Image label", pos: "t", w: 80, h: 60, constraint: "off"}\nB@{img: "${imageOrigin}/image.${extension}", w: 80, h: 60, constraint: "on"}\nA --> B`;
    const diagram = await renderer.compile(source);
    assertEquals(diagram.scene?.images?.length, 1, "Repeated real Mermaid images must share captured pixels.");
    assertEquals(diagram.scene?.items.filter((item) => item.kind === "image").length, 2);
    assertEquals(
      requests.get(`/image.${extension}`),
      1,
      "Upstream rendering/reinsertion/capture must reuse one approved response.",
    );
    assertEquals(renderer.inspect().resources.pending, 0);
    assertEquals(renderer.inspect().imageDiagnostics, []);
    capturedImages.push(JSON.parse(JSON.stringify(diagram)));
    imageCases++;
    console.log(
      `ok headless:image-${extension} ${
        JSON.stringify({ images: diagram.scene!.images!.length, requests: renderer.inspect().resources.requests })
      }`,
    );
  }
  const imageSource = (path: string) => `flowchart TD\nA@{img: "${imageOrigin}${path}", w: 80, h: 60}`;
  await assertRejects(() => renderer!.compile(imageSource("/denied.png")));
  assertEquals(requests.has("/denied.png"), false);
  assert(renderer.inspect().blockedResources.includes(`${imageOrigin}/denied.png`));
  imageCases++;
  await assertRejects(() => renderer!.compile(imageSource("/oversized.png")));
  assert(renderer.inspect().imageDiagnostics.some((message) => message.includes("source-pixel budget")));
  imageCases++;
  const recovered = await renderer.compile("flowchart TD\nA --> B");
  assert(recovered.scene?.items.length);
  imageCases++;
  const catalogue = await renderer.diagramTypes();
  for (const fixture of MERMAID_STANDARD_FIXTURES) {
    try {
      const type = await renderer.parse(fixture.source);
      const source = `# Full Mermaid\n\n\`\`\`mermaid\n${fixture.source}\n\`\`\`\n\nAfter diagram.`;
      const prepared = await prepareMermaidMarkdown(source, renderer);
      const surface = new MarkdownSurface({ source, render: prepared.render });
      try {
        await surface.ready;
        for (const [columns, rows, offset] of [[80, 12, 0], [80, 7, 3], [40, 9, 4], [80, 12, 0]] as const) {
          surface.component.controller.scrollTo(offset, columns, rows);
          const actual = surface.render(columns, rows).map(stripStyles);
          const expected = surface.component.controller.visible(columns, rows).map((line) =>
            padNativeRow(line.text, columns)
          );
          while (expected.length < rows) expected.push(" ".repeat(columns));
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            const row = actual.findIndex((line, index) => line !== expected[index]);
            throw new Error(
              `Native host rows differ at ${columns}x${rows}, row ${row}: ${
                JSON.stringify({ actual: actual[row], expected: expected[row] })
              }`,
            );
          }
        }
      } finally {
        surface.dispose();
      }
      if (prepared.diagrams.length !== 1 || !prepared.diagrams[0]!.diagram.scene?.items.length) {
        throw new Error("No real full-engine native scene.");
      }
      covered.add(type);
      console.log(`ok headless:${fixture.name} ${JSON.stringify({ type, diagnostics: prepared.diagnostics })}`);
    } catch (error) {
      failures.push(fixture.name);
      console.log(`FAIL headless:${fixture.name}: ${(error as Error).message}`);
    }
  }
  const uncovered = catalogue.filter((type) => !covered.has(type));
  if (hadDocument !== ("document" in globalThis)) throw new Error("Headless compiler replaced application globals.");
  console.log(
    JSON.stringify({
      fixtures: MERMAID_STANDARD_FIXTURES.length,
      imageCases,
      mathCases: capturedMath.length,
      iconCases: MERMAID_ICON_FIXTURES.length,
      failures,
      uncovered,
      host: renderer.inspect(),
    }),
  );
  if (failures.length || uncovered.length) runtimeHost.exitCode = 1;
} finally {
  try {
    await renderer?.dispose();
  } finally {
    await imageServer.shutdown();
  }
}
// Captured pixels remain usable after the private context and process are gone.
console.log(
  `ok headless:text-transform-after-disposal ${
    JSON.stringify(await verifyMermaidFlowTransport(capturedTextTransforms))
  }`,
);
console.log(
  `ok headless:stroke-after-disposal ${JSON.stringify(await verifyMermaidFlowTransport(capturedStrokeFeatures))}`,
);
console.log(
  `ok headless:text-after-disposal ${JSON.stringify(await verifyMermaidFlowTransport(capturedTextFeatures))}`,
);
console.log(
  `ok headless:semantics-after-disposal ${JSON.stringify(await verifyMermaidSemanticsTransport(capturedSemantics))}`,
);
console.log(
  `ok headless:flow-after-disposal ${JSON.stringify(await verifyMermaidFlowTransport(capturedFlowFeatures))}`,
);
console.log(
  `ok headless:accessibility-after-disposal ${
    JSON.stringify(await verifyMermaidAccessibilityTransport(capturedAccessibility))
  }`,
);
console.log(
  `ok headless:animations-after-disposal ${JSON.stringify(await verifyMermaidAnimationTransport(capturedAnimations))}`,
);
console.log(
  `ok headless:interactions-after-disposal ${
    JSON.stringify(await verifyMermaidInteractionTransport(capturedInteractions))
  }`,
);
for (const diagram of capturedImages) {
  const frame = renderMermaidNativeFrame(diagram.scene!, { background: "black" });
  const rgba = Uint8Array.from(atob(diagram.scene!.images![0]!.rgba), (char) => char.charCodeAt(0));
  const red = `rgb(${rgba[0]}, ${rgba[1]}, ${rgba[2]})`;
  assert(frame.cells.some((row) => row.some((cell) => cell.background === red)));
  assert(
    frame.cells.some((row) =>
      row.some((cell) => cell.background === "rgb(0, 255, 0)" || cell.background === "rgb(0, 255, 1)")
    ),
  );
  assert(!frame.diagnostics.some((message) => message.includes("image-capable")));
}
console.log(`ok headless:images-after-disposal ${JSON.stringify({ diagrams: capturedImages.length })}`);
for (const { name, diagram } of capturedIcons) {
  const frame = renderMermaidNativeFrame(diagram.scene!);
  const color = name === "icon-fontawesome-label" ? "rgb(40, 37, 61)" : "rgb(0, 221, 68)";
  assert(
    frame.cells.some((row) => row.some((cell) => cell.background === color)),
    `Icon paint was lost after compiler disposal: ${name}`,
  );
  assertEquals(frame.diagnostics, []);
}
console.log(`ok headless:icons-after-disposal ${JSON.stringify({ diagrams: capturedIcons.length })}`);
for (const { name, diagram } of capturedMath) {
  const frame = renderMermaidNativeFrame(diagram.scene!);
  const text = frame.cells.map((row) => row.map((cell) => cell.char).join("")).join("\n");
  const glyphs = name === "math-matrix"
    ? ["a", "b", "c", "d", "⎛", "⎜", "⎝", "⎞", "⎟", "⎠"]
    : name === "math-accents"
    ? ["a", "b", "c", "x", "y", "z", "→"]
    : name.includes("root") || name === "math-sequence"
    ? ["√"]
    : name === "math-limits"
    ? ["∑", "∫", "n", "="]
    : name === "math-nested-fractions"
    ? ["1", "x"]
    : name === "math-scripts"
    ? ["x", "2", "y", "1"]
    : ["n", "k", "x"];
  for (const glyph of glyphs) assert(text.includes(glyph), `Missing ${glyph} after math compiler disposal: ${name}`);
  assertEquals(frame.diagnostics, []);
}
console.log(`ok headless:math-after-disposal ${JSON.stringify({ diagrams: capturedMath.length })}`);
