// Copyright 2023 Im-Beast. MIT license.
import { extractMermaidScene } from "../../../src/content/mermaid_scene.ts";
import { renderMermaidNativeFrame } from "../../../src/content/mermaid_cells.ts";
import { renderedTextSlices } from "../../../src/content/mermaid_text_transform_dom.ts";
import type { MermaidStandardDiagram, MermaidStandardRenderer } from "../../../mod.mermaid.ts";
import type { DiagramSemanticNode } from "../../../mod.document.ts";
import { MERMAID_BIDI_CLUSTERS } from "./text_bidi.ts";

const mathOrdering = [
  { name: "ordinary", text: "ABC", direction: "ltr", expected: "ABC", positioned: false },
  { name: "override", text: "ABC", direction: "rtl", bidi: "bidi-override", expected: "CBA" },
  { name: "implicit-hebrew", text: "אבג", direction: "ltr", expected: "גבא" },
  {
    name: "styled-hebrew",
    text: "אבג",
    style: "color:blue;font-weight:bold",
    direction: "ltr",
    expected: "גבא",
  },
  { name: "explicit-hebrew", text: "אבג", direction: "rtl", expected: "גבא" },
  { name: "hebrew-brackets", text: "א(ב)", direction: "ltr", expected: "(ב)א" },
  { name: "arabic-digits", text: "١(٢)", direction: "ltr", expected: "(٢)١" },
  { name: "mixed", text: "a(ב)", direction: "ltr", expected: "a(ב)", positioned: false },
  { name: "mixed-rtl", text: "a(ב)", direction: "rtl", expected: "(ב)a" },
  { name: "cased", text: "abc", direction: "rtl", bidi: "bidi-override", casing: "uppercase", expected: "CBA" },
  { name: "wide", text: "A😀界B", direction: "rtl", bidi: "bidi-override", expected: "B界😀A" },
  { name: "identifier", tag: "mi", text: "ABC", direction: "rtl", bidi: "bidi-override", expected: "CBA" },
  { name: "number", tag: "mn", text: "123", direction: "rtl", bidi: "bidi-override", expected: "321" },
  { name: "operator", tag: "mo", text: "ABC", direction: "rtl", bidi: "bidi-override", expected: "CBA" },
  { name: "string", tag: "ms", text: "אבג", direction: "ltr", expected: "גבא" },
] as const;

function semanticText(content: readonly DiagramSemanticNode[]): string {
  return content.map((node) => (node.text ?? "") + semanticText(node.children ?? [])).join("");
}

/** Native casing follows the actual compiler's browser, including language/context and length-changing mappings. */
export function verifyMermaidTextTransformDOM() {
  const cases = [
    { name: "uppercase", mode: "uppercase", body: "Mixed case", expected: "MIXED CASE" },
    { name: "lowercase", mode: "lowercase", body: "MIXED Case", expected: "mixed case" },
    { name: "capitalize", mode: "capitalize", body: "first second", expected: "First Second" },
    { name: "expansion", mode: "uppercase", body: "Straße", expected: "STRASSE", lang: "de" },
    { name: "turkish", mode: "uppercase", body: "istanbul", expected: "İSTANBUL", lang: "tr" },
    { name: "greek", mode: "lowercase", body: "ΟΣΟΣ", expected: "οσος", lang: "el" },
    { name: "lithuanian", mode: "lowercase", body: "Ì", expected: "i̇̀", lang: "lt" },
    { name: "contraction", mode: "uppercase", body: "i̇", expected: "I", lang: "lt" },
    { name: "unicode", mode: "uppercase", body: "a😀é 界z", expected: "A😀É 界Z" },
    {
      name: "wrapped",
      mode: "uppercase",
      body: "first second third fourth",
      expected: "FIRST SECOND THIRD FOURTH",
      width: 100,
    },
    { name: "nested", mode: "uppercase", body: "Mi<RUN>xed</RUN> case", expected: "MIXED CASE" },
    {
      name: "mixed",
      mode: "uppercase",
      body: 'AB<RUN style="text-transform:lowercase">CD</RUN> EF',
      expected: "ABcd EF",
    },
  ];
  const guard = document.createElement("div"), button = document.createElement("button");
  guard.textContent = "Keep the application selection";
  button.textContent = "Keep the application focus";
  document.body.append(guard, button);
  const selection = document.defaultView!.getSelection()!, range = document.createRange();
  const previous = Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange());
  const focused = document.activeElement as HTMLElement | null;
  range.selectNodeContents(guard);
  selection.removeAllRanges();
  selection.addRange(range);
  button.focus();
  const saved = selection.toString(), anchor = selection.anchorNode, anchorOffset = selection.anchorOffset;
  const iframeCount = document.querySelectorAll("iframe").length;
  let samples = 0;
  const assertUnchanged = () => {
    if (
      selection.toString() !== saved || selection.anchorNode !== anchor || selection.anchorOffset !== anchorOffset ||
      document.activeElement !== button || document.querySelectorAll("iframe").length !== iframeCount
    ) {
      throw new Error("Text transformation changed application selection/focus or leaked its measuring frame");
    }
  };
  try {
    for (const html of [false, true]) {
      for (const fixture of cases) {
        const host = document.createElement("div"), tag = html ? "span" : "tspan";
        const body = fixture.body.replaceAll("RUN", tag);
        const style = `font:16px monospace;text-transform:${fixture.mode}`;
        host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="200" viewBox="0 0 500 200">' +
          (html
            ? `<foreignObject x="20" y="20" width="${
              fixture.width ?? 450
            }" height="170"><div xmlns="http://www.w3.org/1999/xhtml" lang="${
              fixture.lang ?? "en"
            }" style="${style}">${body}</div></foreignObject>`
            : `<text x="20" y="60" lang="${fixture.lang ?? "en"}" style="${style}">${body}</text>`) +
          "</svg>";
        document.body.append(host);
        try {
          const svg = host.querySelector("svg")!, borrowed = svg.outerHTML;
          if (
            html && host.querySelector("foreignObject div")!.textContent &&
            (host.querySelector("foreignObject div") as HTMLElement).innerText !== fixture.expected
          ) {
            throw new Error(`Owning HTML casing oracle changed: ${fixture.name}`);
          }
          const scene = extractMermaidScene(svg);
          if (scene.diagnostics.some((message) => message.includes("Expanded or zero-advance HTML text"))) {
            throw new Error(`Ordinary casing falsely requires split-glyph layout: ${html}/${fixture.name}`);
          }
          const semantic = semanticText(scene.accessibility?.content ?? []);
          if (semantic !== fixture.expected) {
            throw new Error(`Semantic casing lost: ${html}/${fixture.name}/${semantic}`);
          }
          const value = scene.items.filter((item) => item.kind === "text").map((item) => item.text).join("");
          const normalized = fixture.name === "wrapped" ? value.replace(/\s/g, "") : value;
          const expected = fixture.name === "wrapped" ? fixture.expected.replace(/\s/g, "") : fixture.expected;
          if (normalized !== expected) throw new Error(`Native casing lost: ${html}/${fixture.name}/${value}`);
          if (
            html && fixture.name === "wrapped" &&
            new Set(scene.items.filter((item) => item.kind === "text").map((item) => item.y)).size < 2
          ) {
            throw new Error("Wrapped casing fixture did not exercise separate measured lines");
          }
          const frame = renderMermaidNativeFrame(scene);
          const painted = frame.cells.map((row) => row.map((cell) => cell.char).join("")).join("").replace(/\s/g, "");
          if (!painted.includes(fixture.expected.replace(/\s/g, ""))) {
            throw new Error(`Transformed native glyphs lost: ${html}/${fixture.name}/${painted}`);
          }
          if (fixture.name === "nested" || fixture.name === "mixed") {
            if (scene.items.filter((item) => item.kind === "text").length < 3) {
              throw new Error("Nested casing flattened style runs");
            }
          }
          if (
            JSON.stringify(renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene)))) !== JSON.stringify(frame) ||
            svg.outerHTML !== borrowed
          ) {
            throw new Error("Transformed casing changed JSON or borrowed DOM");
          }
          assertUnchanged();
          samples++;
        } finally {
          host.remove();
        }
      }
    }
    const host = document.createElement("div");
    host.style.textTransform = "uppercase";
    document.body.append(host);
    const reject = (call: () => unknown) => {
      let refused = false;
      try {
        call();
      } catch (error) {
        refused = error instanceof RangeError;
      }
      if (!refused) throw new Error("Rendered text quota or source interval was not refused");
      assertUnchanged();
    };
    try {
      for (const text of ["X".repeat(65_537), "ß".repeat(32_769)]) {
        host.textContent = text;
        const node = host.firstChild as Text;
        reject(() => renderedTextSlices(host, [{ node, start: 0, end: text.length }]));
      }
      host.textContent = "X";
      let node = host.firstChild as Text;
      reject(() => renderedTextSlices(host, Array.from({ length: 16_385 }, () => ({ node, start: 0, end: 1 }))));
      reject(() => renderedTextSlices(host, [{ node, start: 0, end: 2 }]));
      host.lang = "x".repeat(257);
      reject(() => renderedTextSlices(host, [{ node, start: 0, end: 1 }]));
      host.removeAttribute("lang");
      host.replaceChildren();
      let parent: Element = host;
      for (let i = 0; i < 129; i++) {
        const span = document.createElement("span");
        parent.append(span);
        parent = span;
      }
      parent.textContent = "X";
      node = parent.firstChild as Text;
      reject(() => renderedTextSlices(host, [{ node, start: 0, end: 1 }]));
      host.textContent = "recover";
      node = host.firstChild as Text;
      if (renderedTextSlices(host, [{ node, start: 0, end: 7 }])[0] !== "RECOVER") {
        throw new Error("Rendered text did not recover");
      }
      assertUnchanged();
    } finally {
      host.remove();
    }
  } finally {
    selection.removeAllRanges();
    for (const old of previous) selection.addRange(old);
    guard.remove();
    button.remove();
    focused?.focus();
  }
  return {
    cases: samples,
    splitCases: verifyMermaidSplitCasingDOM(),
    mathClusters: verifyMermaidMathClusterDOM(),
    mathOrdering: verifyMermaidMathOrderingDOM(),
    detachedInk: verifyMermaidDetachedInkDOM(),
    budgetCases: 6,
    selectionAndFocus: true,
    portable: true,
  };
}

/** Original font ink controls; capture is deliberately separate so screenshots can surround it. */
export function mountMermaidDetachedInkOriginal(size: number, weight: string, style: string, profile: string) {
  const host = document.createElement("div");
  host.id = "detached-ink-original-control";
  host.style.cssText = "position:absolute;left:0;top:0;background:white";
  const viewBox = profile === "viewbox" ? "0 0 350 120" : "0 0 700 240";
  host.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="240" viewBox="${viewBox}"><a href="https://example.test/detached-ink"><foreignObject x="20" y="20" width="650" height="140"><math><mtext></mtext></math></foreignObject></a></svg>`;
  const math = host.querySelector("math")!, token = host.querySelector("mtext")!;
  math.setAttribute(
    "style",
    `font:${style} ${weight} ${size}px "Liberation Mono",monospace` +
      (profile === "zoom" ? ";zoom:1.5" : profile === "scale" ? ";transform:scale(1.25,1.5);transform-origin:0 0" : ""),
  );
  token.setAttribute("style", "white-space:pre;direction:rtl;color:rgb(0,128,0)");
  token.textContent = "a(\u0332b)\u0333";
  document.body.append(host);
  const original = host.querySelector("svg")!.outerHTML;
  return { original };
}

/** Retain only portable measured geometry; an actual screenshot supplies the independent paint oracle. */
export function captureMermaidDetachedInkOriginal() {
  const svg = document.querySelector("#detached-ink-original-control svg") as SVGSVGElement;
  const source = svg.outerHTML, scene = extractMermaidScene(svg);
  const text = scene.items.find((item) => item.kind === "text" && item.text.includes(")\u0333"));
  if (text?.kind !== "text") throw new Error("Original detached ink control has no logical mark");
  const fragment = text.layout?.glyphs.flatMap((glyph) => glyph.fragments ?? []).find((fragment) =>
    fragment.rendered === "\u00a0\u0333"
  );
  if (!fragment?.ink) throw new Error("Original zero-advance ink has no measured font box");
  const m = svg.getScreenCTM()!, ink = fragment.ink;
  const a = new DOMPoint(ink.x, ink.y).matrixTransform(m),
    b = new DOMPoint(ink.x + ink.width, ink.y + ink.height).matrixTransform(m);
  const viewport = svg.querySelector("foreignObject")!.getBoundingClientRect();
  return {
    scene,
    unchanged: source === svg.outerHTML,
    bounds: { left: a.x, top: a.y, right: b.x, bottom: b.y },
    viewport: { left: viewport.left, top: viewport.top, right: viewport.right, bottom: viewport.bottom },
  };
}

function verifyMermaidDetachedInkDOM() {
  let cases = 0, snapshots = 0;
  for (const size of [24, 36]) {
    for (const weight of ["normal", "bold"]) {
      for (const style of ["normal", "italic"]) {
        for (const profile of ["normal", "viewbox", "zoom", "scale"]) {
          const { original } = mountMermaidDetachedInkOriginal(size, weight, style, profile);
          try {
            const capture = captureMermaidDetachedInkOriginal();
            if (
              !capture.unchanged || document.querySelector("#detached-ink-original-control svg")!.outerHTML !== original
            ) {
              throw new Error("Detached ink capture changed original source");
            }
            const saved = JSON.stringify(capture.scene);
            for (const options of [undefined, { columnUnits: 1, rowUnits: 4 }, { columnUnits: 2, rowUnits: 8 }]) {
              const frame = renderMermaidNativeFrame(JSON.parse(saved), options);
              const marks = frame.cells.flat().filter((cell) => cell.char === "\u00a0\u0333");
              if (
                marks.length !== 1 || marks[0]!.href !== "https://example.test/detached-ink" ||
                marks[0]!.foreground !== "rgb(0, 128, 0)" || Boolean(marks[0]!.bold) !== (weight === "bold") ||
                Boolean(marks[0]!.italic) !== (style === "italic")
              ) {
                throw new Error(
                  `Detached ink/style/link lost: ${size}/${weight}/${style}/${profile}/${
                    JSON.stringify({
                      options,
                      marks,
                      scene: capture.scene,
                      ink: frame.cells.flat().filter((cell) => cell.char.trim()),
                    })
                  }`,
                );
              }
              snapshots++;
            }
            if (JSON.stringify(capture.scene) !== saved) {
              throw new Error("Detached ink projection changed portable source");
            }
            cases++;
          } finally {
            document.querySelector("#detached-ink-original-control")?.remove();
          }
        }
      }
    }
  }
  return { cases, snapshots };
}

/** Independent original Range geometry pins ordinary MathML's visual order and the unchanged math baseline. */
function verifyMermaidMathOrderingDOM() {
  let checks = 0, snapshots = 0;
  for (const font of ["monospace", '"Liberation Mono",monospace']) {
    for (const fixture of mathOrdering) {
      const host = document.createElement("div");
      const tag = "tag" in fixture ? fixture.tag : "mtext";
      host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="240" viewBox="0 0 700 240">' +
        `<a href="https://example.test/math-order"><foreignObject x="20" y="20" width="650" height="140"><math><mrow><${tag}></${tag}><mspace width="0px" height="0px" depth="0px"></mspace></mrow></math></foreignObject></a>` +
        '<text x="650" y="210" style="font:24px monospace;direction:rtl;unicode-bidi:bidi-override">UV</text></svg>';
      host.querySelector("math")!.setAttribute("style", `font:24px ${font}`);
      const token = host.querySelector(tag)!;
      token.setAttribute(
        "style",
        `white-space:pre;color:rgb(0,128,0);direction:${fixture.direction};unicode-bidi:${
          "bidi" in fixture ? fixture.bidi : "normal"
        };text-transform:${"casing" in fixture ? fixture.casing : "none"};${"style" in fixture ? fixture.style : ""}`,
      );
      token.textContent = fixture.text;
      document.body.append(host);
      try {
        const svg = host.querySelector("svg")!, original = svg.outerHTML, inverse = svg.getScreenCTM()!.inverse();
        const range = document.createRange(), walker = document.createTreeWalker(token, NodeFilter.SHOW_TEXT);
        const measured: { text: string; x: number }[] = [];
        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          for (
            const { segment, index } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(node.data)
          ) {
            range.setStart(node, index);
            range.setEnd(node, index + segment.length);
            measured.push({
              text: segment,
              x: new DOMPoint(range.getBoundingClientRect().x, 0).matrixTransform(inverse).x,
            });
          }
        }
        const baseline = new DOMPoint(0, host.querySelector("mspace")!.getBoundingClientRect().top - 24 * .3)
          .matrixTransform(inverse).y;
        const frames = document.querySelectorAll("iframe").length;
        const scene = extractMermaidScene(svg), saved = JSON.stringify(scene);
        const texts = scene.items.filter((item) => item.kind === "text"), math = texts.filter((item) => item.math);
        if (scene.diagnostics.includes("Bidirectional or vertical MathML needs native math ordering.")) {
          throw new Error(`Supported horizontal MathML falsely requires ordering: ${fixture.name}`);
        }
        const positioned = !("positioned" in fixture) || fixture.positioned;
        if (math.some((item) => Math.abs(item.y - baseline) > .01)) {
          throw new Error(`MathML ordering moved the original baseline: ${fixture.name}/${font}`);
        }
        if (math.some((item) => Boolean(item.layout)) !== positioned) {
          throw new Error(
            `Ordinary MathML lost measured visual ordering: ${fixture.name}/${font}/${JSON.stringify(measured)}`,
          );
        }
        if (positioned) {
          const glyphs = math.flatMap((item) => item.layout?.glyphs ?? []);
          if (
            glyphs.length !== measured.length || glyphs.some((glyph, i) => Math.abs(glyph.x - measured[i]!.x) > .01)
          ) {
            throw new Error(`MathML ordering discarded original glyph geometry: ${fixture.name}/${font}`);
          }
          if (
            !math.every((item) => item.layout?.sequence === math[0]!.layout!.sequence) ||
            math[0]!.layout!.sequence === texts.find((item) => item.text === "UV")!.layout?.sequence
          ) {
            throw new Error("MathML ordering collided with another native label sequence");
          }
        }
        for (const options of [undefined, { columnUnits: 1, rowUnits: 4 }, { columnUnits: 2, rowUnits: 8 }]) {
          const frame = renderMermaidNativeFrame(JSON.parse(saved), options), cells = frame.cells.flat();
          const text = cells.map(({ char }) => char).join("").replace(/\s/g, "");
          if (text !== fixture.expected + "VU") {
            throw new Error(`MathML visual ink lost: ${fixture.name}/${font}/${text}`);
          }
          if (
            !cells.filter(({ char }) => char.trim() && char !== "U" && char !== "V").every((cell) =>
              cell.foreground ===
                (fixture.name === "styled-hebrew" ? "rgb(0, 0, 255)" : "rgb(0, 128, 0)") &&
              (fixture.name !== "styled-hebrew" || cell.bold) &&
              cell.href === "https://example.test/math-order"
            )
          ) throw new Error("MathML ordering lost native style or link");
          snapshots++;
        }
        if (
          JSON.stringify(scene) !== saved || svg.outerHTML !== original ||
          document.querySelectorAll("iframe").length !== frames
        ) {
          throw new Error("Math order mutated source or JSON");
        }
        checks++;
      } finally {
        host.remove();
      }
    }
  }
  let diagnosticCases = 0;
  for (
    const body of [
      '<math style="font:24px monospace;direction:rtl"><mtext>ABC</mtext></math>',
      '<math style="font:24px monospace"><mtext style="writing-mode:vertical-rl">ABC</mtext></math>',
      '<math style="font:24px monospace"><mrow><mo style="direction:rtl">)</mo><mfrac style="font-size:48px"><mi>a</mi><mi>b</mi></mfrac></mrow></math>',
    ]
  ) {
    const host = document.createElement("div");
    host.innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="240"><foreignObject width="700" height="240">${body}</foreignObject></svg>`;
    document.body.append(host);
    try {
      const svg = host.querySelector("svg")!, original = svg.outerHTML, scene = extractMermaidScene(svg);
      if (
        scene.diagnostics.includes("Bidirectional or vertical MathML needs native math ordering.") !==
          (diagnosticCases !== 1) ||
        svg.outerHTML !== original
      ) {
        throw new Error(
          `Unsupported MathML ordering lost its diagnostic or changed source: ${diagnosticCases}/${
            JSON.stringify(scene.diagnostics)
          }/${svg.outerHTML === original}`,
        );
      }
      // Current Chromium forces this authored vertical token horizontal;
      // ignored CSS is not evidence of a vertical native capability gap.
      if (diagnosticCases === 1 && getComputedStyle(host.querySelector("mtext")!).writingMode !== "horizontal-tb") {
        throw new Error("Original MathML writing-mode profile changed");
      }
      if (
        diagnosticCases === 2 && !scene.items.some((item) => item.kind === "text" && item.math?.stretch === "vertical")
      ) {
        throw new Error("RTL operator diagnostic fixture did not exercise a stretched delimiter");
      }
      diagnosticCases++;
    } finally {
      host.remove();
    }
  }
  return { checks, snapshots, diagnosticCases };
}

/** Original scalar boxes pin MathML bracket positions; a later SVG label must have a different native sequence. */
function verifyMermaidMathClusterDOM() {
  let checks = 0, snapshots = 0;
  for (const generated of [false, true]) {
    for (const font of ["monospace", '"Liberation Mono",monospace']) {
      for (const fixture of MERMAID_BIDI_CLUSTERS) {
        const host = document.createElement("div");
        host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="240" viewBox="0 0 700 240">' +
          (generated ? '<style>.token::before{content:"Q";color:blue;font-weight:bold}</style>' : "") +
          '<a href="https://example.test/math-cluster"><foreignObject x="20" y="20" width="650" height="140"><math><mtext class="token"></mtext></math></foreignObject></a>' +
          '<text x="650" y="210" style="font:24px monospace;direction:rtl;unicode-bidi:bidi-override">UV</text></svg>';
        const math = host.querySelector("math")!, token = host.querySelector("mtext")!;
        math.setAttribute("style", `font:24px ${font}`);
        token.setAttribute("style", `white-space:pre;direction:${fixture.direction};color:rgb(0,128,0)`);
        token.textContent = fixture.label;
        document.body.append(host);
        try {
          const svg = host.querySelector("svg")!, original = svg.outerHTML;
          const range = document.createRange(),
            scalar = Math.max(fixture.label.lastIndexOf(")"), fixture.label.lastIndexOf("]"));
          range.setStart(token.firstChild!, scalar);
          range.setEnd(token.firstChild!, scalar + 1);
          const x = new DOMPoint(range.getBoundingClientRect().x, 0).matrixTransform(svg.getScreenCTM()!.inverse()).x;
          const scene = extractMermaidScene(svg),
            saved = JSON.stringify(scene),
            texts = scene.items.filter((item) => item.kind === "text");
          const mathTexts = texts.filter((item) => item.math), svgText = texts.find((item) => item.text === "UV")!;
          const fragments = mathTexts.flatMap((item) =>
            item.layout?.glyphs.flatMap((glyph) => glyph.fragments ?? []) ?? []
          );
          const base = fragments.find((fragment) => fragment.rendered === fixture.closing);
          if (!base || Math.abs(base.x - x) > .01) {
            throw new Error(`Math cluster lost original scalar geometry: ${fixture.line}/${generated}/${font}`);
          }
          if (
            !mathTexts.every((item) => item.layout && item.layout.sequence === mathTexts[0]!.layout!.sequence) ||
            mathTexts[0]!.layout!.sequence === svgText.layout?.sequence
          ) throw new Error("Math/SVG label sequences collided or split one math token");
          for (const options of [undefined, { columnUnits: 1, rowUnits: 4 }, { columnUnits: 2, rowUnits: 8 }]) {
            const frame = renderMermaidNativeFrame(JSON.parse(saved), options), cells = frame.cells.flat();
            const bases = cells.map((cell) => cell.char).join("").replace(/[\s\p{Mark}\p{Cf}]/gu, "");
            if (bases !== (generated ? "Q" : "") + fixture.bases + "VU") {
              throw new Error(`Math split lost neighboring ink: ${fixture.line}/${bases}`);
            }
            for (const fragment of fragments) {
              if (
                !cells.some((cell) =>
                  cell.char === fragment.rendered && cell.href === "https://example.test/math-cluster"
                )
              ) {
                throw new Error(
                  `Math split fragment lost native ink or host-controlled link: ${
                    JSON.stringify({
                      font,
                      generated,
                      line: fixture.line,
                      options,
                      fragment,
                      mathTexts,
                      ink: cells.filter((cell) => cell.char.trim()).map((cell) => ({
                        char: cell.char,
                        href: cell.href,
                      })),
                    })
                  }`,
                );
              }
            }
            if (
              generated && !cells.some((cell) => cell.char === "Q" && cell.foreground === "rgb(0, 0, 255)" && cell.bold)
            ) throw new Error("Math generated prefix lost its independent style");
            snapshots++;
          }
          if (JSON.stringify(scene) !== saved || svg.outerHTML !== original) {
            throw new Error("Math split capture changed portable or original source");
          }
          checks++;
        } finally {
          host.remove();
        }
      }
    }
  }
  const host = document.createElement("div");
  host.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="240"><foreignObject width="700" height="240">' +
    '<math style="font:24px monospace"><mtext style="white-space:pre">א(\u0332ב)\u0333</mtext></math>' +
    `<div>${"X".repeat(65_531)}</div></foreignObject></svg>`;
  document.body.append(host);
  try {
    const svg = host.querySelector("svg")!,
      original = svg.outerHTML,
      frames = document.querySelectorAll("iframe").length;
    let error: unknown;
    try {
      extractMermaidScene(svg);
    } catch (value) {
      error = value;
    }
    if (!(error instanceof RangeError) || !error.message.includes("character budget")) {
      throw new Error("Positioned MathML bypassed the shared scene text budget");
    }
    if (svg.outerHTML !== original || document.querySelectorAll("iframe").length !== frames) {
      throw new Error("Math text quota refusal changed source or leaked private state");
    }
  } finally {
    host.remove();
  }
  return { checks, snapshots, budgetCases: 1 };
}

/** A label needs positioned casing only when split ink is actually present in that same foreignObject. */
function verifyMermaidSplitCasingDOM() {
  let checks = 0;
  for (const scope of ["ordinary", "same-label", "separate-label", "single-grapheme"]) {
    const host = document.createElement("div");
    const ordinary =
      '<div xmlns="http://www.w3.org/1999/xhtml" style="font:24px monospace;text-transform:uppercase">Straße</div>';
    const cluster = '<span style="text-transform:none;direction:ltr">א(\u0332ב)\u0333</span>';
    const markup = scope === "ordinary"
      ? ordinary
      : scope === "same-label"
      ? ordinary.replace("Straße", `Straße ${cluster}`)
      : scope === "single-grapheme"
      ? ordinary.replace("Straße", "a(\u0332b)\u0333").replace("uppercase", "uppercase;direction:rtl")
      : ordinary;
    host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="650" height="240">' +
      `<foreignObject x="20" y="20" width="600" height="100">${markup}</foreignObject>` +
      (scope === "separate-label"
        ? `<foreignObject x="20" y="140" width="600" height="80"><div xmlns="http://www.w3.org/1999/xhtml" style="font:24px monospace">${cluster}</div></foreignObject>`
        : "") +
      "</svg>";
    document.body.append(host);
    try {
      const svg = host.querySelector("svg")!,
        original = svg.outerHTML,
        frameCount = document.querySelectorAll("iframe").length;
      const scene = extractMermaidScene(svg), saved = JSON.stringify(scene);
      const texts = scene.items.filter((item) => item.kind === "text");
      const separated = texts.some((item) => item.layout?.glyphs.some((glyph) => glyph.fragments));
      const warning = scene.diagnostics.some((message) => message.includes("Expanded or zero-advance HTML text"));
      if (warning !== (scope === "same-label")) {
        throw new Error(`Split casing diagnostic escaped its required scope: ${scope}`);
      }
      if (separated !== (scope !== "ordinary")) {
        throw new Error(`Split casing fixture lost its measured fragments: ${scope}`);
      }
      const frame = renderMermaidNativeFrame(JSON.parse(saved));
      const bases = frame.cells.flat().map((cell) => cell.char).join("").replace(/[\s\p{Mark}\p{Cf}]/gu, "");
      const expected = scope === "ordinary" ? "STRASSE" : scope === "single-grapheme" ? "A(B)" : "STRASSE(ב)א";
      if (bases !== expected) throw new Error(`Mixed casing lost native base characters: ${scope}/${bases}`);
      if (
        svg.outerHTML !== original || document.querySelectorAll("iframe").length !== frameCount ||
        JSON.stringify(scene) !== saved
      ) {
        throw new Error("Split casing capture changed source or leaked measurement state");
      }
      checks++;
    } finally {
      host.remove();
    }
  }
  return checks;
}

/** Both upstream label modes preserve themeCSS casing in native scenes and disposed document transport. */
export async function verifyMermaidTextTransforms(renderer: Pick<MermaidStandardRenderer, "compile">) {
  const retained: MermaidStandardDiagram[] = [];
  for (const htmlLabels of [false, true]) {
    for (
      const [mode, label, expected] of [
        ["uppercase", "Mixed case", "MIXED CASE"],
        ["uppercase", "Straße", "STRASSE"],
        ["lowercase", "MIXED Case", "mixed case"],
        ["capitalize", "first second", "First Second"],
      ]
    ) {
      const diagram = await renderer.compile(`flowchart LR\nA["${label}"]`, {
        trusted: true,
        config: { htmlLabels, flowchart: { htmlLabels }, themeCSS: `text, .nodeLabel { text-transform:${mode}; }` },
      });
      const value = diagram.scene!.items.filter((item) => item.kind === "text").map((item) => item.text).join("");
      if (diagram.scene!.diagnostics.some((message) => message.includes("Expanded or zero-advance HTML text"))) {
        throw new Error(`Actual ordinary Mermaid casing falsely requires split-glyph layout: ${htmlLabels}/${mode}`);
      }
      if (value !== expected) throw new Error(`Actual Mermaid casing lost: ${htmlLabels}/${mode}/${value}`);
      if (semanticText(diagram.scene!.accessibility?.content ?? []) !== expected) {
        throw new Error(`Actual Mermaid semantic casing lost: ${htmlLabels}/${mode}`);
      }
      const frame = renderMermaidNativeFrame(diagram.scene!);
      if (
        !frame.cells.some((row) =>
          row.map((cell) => cell.char).join("").replace(/\s/g, "").includes(expected!.replace(/\s/g, ""))
        )
      ) {
        throw new Error(`Actual Mermaid native casing not painted: ${htmlLabels}/${mode}`);
      }
      const copy = JSON.parse(JSON.stringify(diagram)) as MermaidStandardDiagram;
      if (JSON.stringify(renderMermaidNativeFrame(copy.scene!)) !== JSON.stringify(frame)) {
        throw new Error("Actual casing JSON changed");
      }
      retained.push(copy);
    }
  }
  return { cases: retained.length, retained };
}

/** Real Mermaid MathML, with and without generated prefixes, survives disposal and ordinary native document transport. */
export async function verifyMermaidMathTextClusters(renderer: Pick<MermaidStandardRenderer, "compile">) {
  const retained: MermaidStandardDiagram[] = [];
  for (const generated of [false, true]) {
    for (const fixture of MERMAID_BIDI_CLUSTERS) {
      const source =
        `flowchart LR\nA["<math><mtext class='math-cluster' style='white-space:pre;direction:${fixture.direction}'>${fixture.label}</mtext></math>"]\nclick A href "https://example.test/math-cluster"`;
      const diagram = await renderer.compile(source, {
        trusted: true,
        config: {
          securityLevel: "loose",
          htmlLabels: true,
          flowchart: { htmlLabels: true },
          themeCSS: ".nodeLabel math{font:24px monospace}" +
            (generated ? '.nodeLabel .math-cluster::before{content:"Q";color:blue;font-weight:bold}' : ""),
        },
      });
      if (diagram.source !== source || !diagram.scene) {
        throw new Error("Math cluster compiler lost author source or portable scene");
      }
      const copy = JSON.parse(JSON.stringify(diagram)) as MermaidStandardDiagram;
      const texts = copy.scene!.items.filter((item) => item.kind === "text");
      if (!texts.some((item) => item.math && item.layout?.glyphs.some((glyph) => glyph.fragments))) {
        throw new Error("Actual MathML compiler discarded measured cluster layout");
      }
      const frame = renderMermaidNativeFrame(copy.scene!), cells = frame.cells.flat();
      const bases = cells.map((cell) => cell.char.replace(/[\p{Mark}\p{Cf}]/gu, "")).filter((char) =>
        /^[\p{Letter}\p{Number}()[\]]+$/u.test(char)
      ).join("");
      if (bases !== (generated ? "Q" : "") + fixture.bases) {
        throw new Error(`Actual MathML cluster lost native ink: ${fixture.line}/${generated}/${bases}`);
      }
      if (
        !cells.some((cell) => cell.char === fixture.closing && cell.href === "https://example.test/math-cluster")
      ) throw new Error("Actual MathML bracket lost host-controlled node link");
      if (
        generated && !cells.some((cell) => cell.char === "Q" && cell.foreground === "rgb(0, 0, 255)" && cell.bold)
      ) throw new Error("Actual generated MathML prefix lost style");
      retained.push(copy);
    }
  }
  // Actual upstream labels must preserve font ink, not only the raw DOM controls.
  for (const size of [24, 36]) {
    for (const weight of ["normal", "bold"]) {
      for (const style of ["normal", "italic"]) {
        const source =
          'flowchart LR\nA["<math><mtext class=\'math-ink\'>a(̲b)̳</mtext></math>"]\nclick A href "https://example.test/detached-ink"';
        const diagram = await renderer.compile(source, {
          trusted: true,
          config: {
            securityLevel: "loose",
            htmlLabels: true,
            flowchart: { htmlLabels: true },
            themeCSS:
              `.nodeLabel math{font:${style} ${weight} ${size}px "Liberation Mono",monospace}.math-ink{white-space:pre;direction:rtl;color:green}`,
          },
        });
        const copy = JSON.parse(JSON.stringify(diagram)) as MermaidStandardDiagram;
        const texts = copy.scene!.items.filter((item) => item.kind === "text");
        if (
          !texts.some((item) => item.layout?.glyphs.some((glyph) => glyph.fragments?.some((fragment) => fragment.ink)))
        ) {
          throw new Error("Actual MathML compiler discarded ready-font ink bounds");
        }
        for (const options of [undefined, { columnUnits: 1, rowUnits: 4 }, { columnUnits: 2, rowUnits: 8 }]) {
          const marks = renderMermaidNativeFrame(copy.scene!, options).cells.flat().filter((cell) =>
            cell.char === "\u00a0\u0333"
          );
          if (
            marks.length !== 1 || marks[0]!.href !== "https://example.test/detached-ink" ||
            marks[0]!.foreground !== "rgb(0, 128, 0)" || Boolean(marks[0]!.bold) !== (weight === "bold") ||
            Boolean(marks[0]!.italic) !== (style === "italic")
          ) {
            throw new Error(
              `Actual compiler detached ink/style/link lost: ${size}/${weight}/${style}/${JSON.stringify(options)}`,
            );
          }
        }
        retained.push(copy);
      }
    }
  }
  return { cases: retained.length, retained };
}

/** Ordinary implicit/explicit bidi MathML remains native after the real compiler and measuring document are disposed. */
export async function verifyMermaidMathTextOrdering(renderer: Pick<MermaidStandardRenderer, "compile">) {
  const retained: MermaidStandardDiagram[] = [];
  for (const fixture of mathOrdering) {
    const tag = "tag" in fixture ? fixture.tag : "mtext";
    const source =
      `flowchart LR\nA["<math><${tag} class='math-order'>${fixture.text}</${tag}></math>"]\nclick A href "https://example.test/math-order"`;
    const diagram = await renderer.compile(source, {
      trusted: true,
      config: {
        securityLevel: "loose",
        htmlLabels: true,
        flowchart: { htmlLabels: true },
        themeCSS:
          `.nodeLabel math{font:24px monospace}.math-order{white-space:pre;color:green;direction:${fixture.direction};unicode-bidi:${
            "bidi" in fixture ? fixture.bidi : "normal"
          };text-transform:${"casing" in fixture ? fixture.casing : "none"};${
            "style" in fixture ? fixture.style : ""
          }}`,
      },
    });
    const copy = JSON.parse(JSON.stringify(diagram)) as MermaidStandardDiagram;
    const texts = copy.scene!.items.filter((item) => item.kind === "text").filter((item) => item.math);
    if (texts.some((item) => Boolean(item.layout)) !== (!("positioned" in fixture) || fixture.positioned)) {
      throw new Error(`Actual MathML lost measured ordering: ${fixture.name}`);
    }
    const cells = renderMermaidNativeFrame(copy.scene!).cells.flat();
    const glyphs = new Set(
      [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(fixture.expected)].map(({ segment }) =>
        segment
      ),
    );
    const value = cells.filter((cell) => cell.href === "https://example.test/math-order" && glyphs.has(cell.char)).map(
      (cell) => cell.char,
    ).join("");
    if (value !== fixture.expected || diagram.source !== source) {
      throw new Error(`Actual MathML ordering lost ink or source: ${fixture.name}/${value}`);
    }
    if (
      fixture.name === "styled-hebrew" &&
      !cells.some((cell) => cell.char === "ב" && cell.foreground === "rgb(0, 0, 255)" && cell.bold)
    ) {
      throw new Error("Actual styled MathML ordering lost its independent style");
    }
    retained.push(copy);
  }
  return { cases: retained.length, retained };
}
