// Copyright 2023 Im-Beast. MIT license.
/** Actual browser bidi contexts, glyph ink and disposed portable transport; not a full shaping conformance claim. */
import { extractMermaidScene, type MermaidStandardRenderer, renderMermaidNativeFrame } from "../../../mod.mermaid.ts";
import { prepareMermaidMarkdown } from "../../../src/content/mermaid_markdown.ts";
import { MarkdownController } from "../../../mod.document.ts";
import { measuredTextDirectionResolver } from "../../../src/content/mermaid_text_transform_dom.ts";

function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const chars = (frame: ReturnType<typeof renderMermaidNativeFrame>) =>
  frame.cells.flat().map((cell) => cell.char).join("").replace(/\s/g, "");
const cases = [
  { name: "override-parentheses", body: "(ABC)", css: "direction:rtl;unicode-bidi:bidi-override", paint: "(CBA)" },
  { name: "override-brackets", body: "[ABC]", css: "direction:rtl;unicode-bidi:bidi-override", paint: "[CBA]" },
  { name: "override-angles", body: "&lt;ABC&gt;", css: "direction:rtl;unicode-bidi:bidi-override", paint: "<CBA>" },
  { name: "ltr-latin", body: "(ABC)", css: "direction:ltr", paint: "(ABC)" },
  { name: "rtl-latin", body: "(ABC)", css: "direction:rtl", paint: "(ABC)" },
  { name: "rtl-hebrew", body: "שלום (אב)", css: "direction:rtl", paint: "(בא)םולש" },
  { name: "ltr-hebrew", body: "abc (אב) def", css: "direction:ltr", paint: "abc(בא)def" },
  { name: "rtl-latin-context", body: "אב (ABC) גד", css: "direction:rtl", paint: "דג(ABC)בא" },
  {
    name: "ltr-isolate",
    body: 'אב <span style="direction:ltr;unicode-bidi:isolate">(ABC)</span> גד',
    css: "direction:rtl",
    paint: "דג(ABC)בא",
  },
  { name: "ltr-unicode-isolate", body: "אב \u2066(ABC)\u2069 גד", css: "direction:rtl", paint: "דג(ABC)בא" },
  { name: "combining-ltr", body: "a(\u0332b)\u0333", css: "direction:ltr", paint: "a(\u0332b)\u0333" },
  {
    name: "combining-override",
    body: "a(\u0332b)\u0333",
    css: "direction:rtl;unicode-bidi:bidi-override",
    paint: "(\u0333b)\u0332a",
  },
  {
    name: "tab-ltr-arabic-digits",
    body: "١\t(٢)",
    css: "direction:ltr;white-space:pre",
    paint: "١(٢)",
    htmlOnly: true,
  },
  {
    name: "tab-rtl-arabic-digits",
    body: "١\t(٢)",
    css: "direction:rtl;white-space:pre",
    paint: "(٢)١",
    htmlOnly: true,
  },
  {
    name: "rtl-isolate-override",
    body: 'ABC <span style="direction:rtl;unicode-bidi:isolate-override">(DEF)</span> GHI',
    css: "direction:ltr",
    paint: "ABC(FED)GHI",
  },
];

/** Unicode 17 BidiCharacterTest lines 86, 88, 90, 104 and 110: independent base ink, not whole-label shaping claims. */
export const MERMAID_BIDI_CLUSTERS = [
  { line: 86, label: "a(\u0332b)\u0333", direction: "rtl", closing: ")", bases: "a(b)" },
  { line: 88, label: "א(\u0332ב)\u0333", direction: "ltr", closing: "(", bases: "(ב)א" },
  { line: 90, label: "١(\u0332٢)\u0333", direction: "ltr", closing: "(", bases: "(٢)١" },
  { line: 104, label: "A\u200f[א]\u200d\u20d6", direction: "ltr", closing: "[", bases: "A[א]" },
  { line: 110, label: "A\u200f[\u200d\u20d6א]\u200d\u20d6", direction: "ltr", closing: "[", bases: "A[א]" },
] as const;

/** Original scalar boxes independently pin split-cluster base ink, geometry, styles and all neighboring characters. */
export function verifyMermaidBidiClusters() {
  let checks = 0, snapshots = 0;
  for (const html of [true, false]) {
    for (const font of ["monospace", '"Liberation Mono",monospace']) {
      for (const fixture of MERMAID_BIDI_CLUSTERS) {
        const host = document.createElement("div");
        host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="180" viewBox="0 0 700 180">' +
          (html
            ? '<foreignObject x="20" y="20" width="650" height="140"><div xmlns="http://www.w3.org/1999/xhtml"><a href="https://example.test/cluster"></a></div></foreignObject>'
            : '<a href="https://example.test/cluster"><text x="650" y="60"></text></a>') +
          "</svg>";
        const target = host.querySelector<HTMLElement | SVGTextElement>(html ? "a" : "text")!;
        target.style.cssText = `font:24px ${font};white-space:pre;direction:${fixture.direction};` +
          "font-weight:bold;font-style:italic;color:rgb(0,128,0);fill:rgb(0,128,0)";
        if (html) {
          const parent = target.parentElement!;
          parent.style.cssText = `font:24px ${font};white-space:pre;direction:${fixture.direction}`;
        } else if (fixture.direction === "ltr") target.setAttribute("x", "20");
        target.textContent = fixture.label;
        document.body.append(host);
        try {
          const svg = host.querySelector("svg")!, original = svg.outerHTML;
          const index = Math.max(fixture.label.lastIndexOf(")"), fixture.label.lastIndexOf("]"));
          const node = target.firstChild as Text;
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const raw = html ? range.getBoundingClientRect() : (target as SVGTextElement).getExtentOfChar(index);
          const point = html
            ? new DOMPoint(raw.x, raw.y).matrixTransform(svg.getScreenCTM()!.inverse())
            : new DOMPoint(raw.x + raw.width / 2, raw.y + raw.height / 2);
          const scene = extractMermaidScene(svg), saved = JSON.stringify(scene);
          const texts = scene.items.filter((item) => item.kind === "text");
          const fragments = texts.flatMap((item) =>
            item.layout?.glyphs.flatMap((glyph) => glyph.fragments ?? []) ?? []
          );
          const base = fragments.find((fragment) => fragment.rendered === fixture.closing);
          require(base, `Cluster ${fixture.line}/${html}/${font} lost separately measured closing base`);
          require(
            Math.abs(base.x - point.x) < .01 && Math.abs(base.y - point.y) < .01,
            `Cluster ${fixture.line} closing base follows a whole-grapheme union instead of its scalar box`,
          );
          require(
            fragments.some((fragment) => /\p{Mark}/u.test(fragment.rendered)),
            "Displaced mark lost portable ink",
          );
          for (const density of [undefined, { columnUnits: 1, rowUnits: 4 }, { columnUnits: 2, rowUnits: 8 }]) {
            const frame = renderMermaidNativeFrame(JSON.parse(saved), density);
            const cells = frame.cells.flat();
            const bases = cells.map((cell) => cell.char).join("").replace(/[\s\p{Mark}\p{Cf}]/gu, "");
            require(bases === fixture.bases, `Cluster ${fixture.line}/${html}/${font} lost neighboring ink: ${bases}`);
            for (const fragment of fragments) {
              require(
                cells.some((cell) => cell.char === fragment.rendered),
                "Measured fragment disappeared in native paint",
              );
            }
            for (const cell of cells.filter((cell) => /[\p{Letter}\p{Number}\p{Mark}()[\]]/u.test(cell.char))) {
              require(
                cell.bold && cell.italic && cell.href === "https://example.test/cluster",
                "Split ink lost style/link",
              );
            }
            snapshots++;
          }
          require(
            JSON.stringify(scene) === saved && svg.outerHTML === original,
            "Split-cluster capture changed source",
          );
          checks++;
        } finally {
          host.remove();
        }
      }
    }
  }
  return { checks, snapshots };
}

let originalHost: HTMLDivElement | undefined;
/** Mount a borrowed-text cluster and return its original closing scalar's box for same-font pixel controls. */
export function mountMermaidClusterOriginal(index: number, html: boolean, secondFont: boolean) {
  const fixture = MERMAID_BIDI_CLUSTERS[index]!;
  const font = secondFont ? '"Liberation Mono",monospace' : "monospace";
  originalHost = document.createElement("div");
  originalHost.style.cssText = "position:fixed;left:0;top:0;background:white;width:700px;height:180px";
  originalHost.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="180">' +
    (html
      ? '<foreignObject x="20" y="20" width="650" height="140"><div xmlns="http://www.w3.org/1999/xhtml"></div></foreignObject>'
      : `<text x="${fixture.direction === "rtl" ? 650 : 20}" y="60"></text>`) +
    "</svg>";
  const target = originalHost.querySelector<HTMLElement | SVGTextElement>("foreignObject div,text")!;
  target.style.cssText = `font:24px ${font};white-space:pre;direction:${fixture.direction}`;
  target.textContent = fixture.label;
  document.body.append(originalHost);
  const scalar = Math.max(fixture.label.lastIndexOf(")"), fixture.label.lastIndexOf("]"));
  const range = document.createRange();
  range.setStart(target.firstChild!, scalar);
  range.setEnd(target.firstChild!, scalar + 1);
  const box = html ? range.getBoundingClientRect() : (target as SVGTextElement).getExtentOfChar(scalar);
  const raw = { x: box.x, y: box.y, width: box.width, height: box.height };
  return {
    line: fixture.line,
    correct: fixture.closing,
    wrong: fixture.closing === "(" ? ")" : fixture.closing === ")" ? "(" : "]",
    html,
    font,
    box: raw,
  };
}
/** A candidate changes only the owned original fixture, retaining the scalar's exact font and origin. */
export function replaceMermaidClusterOriginal(reference: ReturnType<typeof mountMermaidClusterOriginal>, ink: string) {
  const target = originalHost!.querySelector<HTMLElement | SVGTextElement>("foreignObject div,text")!;
  if (reference.html) {
    const span = document.createElement("span");
    span.textContent = ink;
    span.style.cssText = `position:absolute;left:${reference.box.x - 20}px;top:${reference.box.y - 20}px;` +
      `font:24px ${reference.font};direction:ltr;unicode-bidi:bidi-override`;
    target.replaceChildren(span);
  } else {
    target.textContent = ink;
    target.setAttribute("x", String(reference.box.x));
    target.style.direction = "ltr";
    target.style.unicodeBidi = "bidi-override";
  }
}
/** Mount an original CSS/SVG override for independent screenshot comparison. */
export function mountMermaidBidiOriginal(index: number) {
  if (index === 6) {
    originalHost = document.createElement("div");
    originalHost.dataset.affinity = "true";
    originalHost.style.cssText = "position:fixed;left:0;top:0;background:white;width:650px;height:150px";
    originalHost.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="650" height="150">' +
      '<foreignObject x="20" y="20" width="600" height="100"><div xmlns="http://www.w3.org/1999/xhtml" style="font:48px monospace;white-space:pre;direction:ltr">١\t(٢)</div></foreignObject></svg>';
    document.body.append(originalHost);
    const scene = extractMermaidScene(originalHost.querySelector("svg")!);
    require(chars(renderMermaidNativeFrame(scene)) === "١(٢)", "Tab-affinity original lost native mirrored paint");
    return { html: true, label: "١\t(٢)", reversed: "١\t(٢(", mirrored: "١\t(٢)" };
  }
  const html = index < 3, label = ["(ABC)", "[ABC]", "<ABC>"][index % 3]!;
  const escaped = label.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  originalHost = document.createElement("div");
  originalHost.style.cssText = "position:fixed;left:0;top:0;background:white;width:650px;height:150px";
  originalHost.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="650" height="150">' +
    (html
      ? `<foreignObject x="20" y="20" width="600" height="100"><div xmlns="http://www.w3.org/1999/xhtml" style="font:48px monospace;direction:rtl;unicode-bidi:bidi-override">${escaped}</div></foreignObject>`
      : `<text x="600" y="70" style="font:48px monospace;direction:rtl;unicode-bidi:bidi-override">${escaped}</text>`) +
    "</svg>";
  document.body.append(originalHost);
  const frame = renderMermaidNativeFrame(extractMermaidScene(originalHost.querySelector("svg")!));
  const reversed = [...label].reverse().join("");
  const mirrored = reversed.replace(
    /[()[\]<>]/g,
    (char) => ({ "(": ")", ")": "(", "[": "]", "]": "[", "<": ">", ">": "<" })[char]!,
  );
  require(chars(frame) === mirrored, "Original bidi pixels fixture lost native mirrored paint");
  return { html, label, reversed, mirrored };
}
/** Only change the owned fixture; fixed alignment retains the original glyph origin. */
export function replaceMermaidBidiOriginal(value: string) {
  const target = originalHost!.querySelector<HTMLElement | SVGTextElement>("foreignObject div, text")!;
  target.style.direction = "ltr";
  target.style.unicodeBidi = originalHost!.dataset.affinity ? "bidi-override" : "normal";
  target.style.textAlign = originalHost!.dataset.affinity ? "left" : "right";
  target.style.setProperty("text-anchor", "end");
  target.textContent = value;
}
export function disposeMermaidBidiOriginal() {
  originalHost?.remove();
  originalHost = undefined;
}

/** Ambiguous direction probes are lazy, retain inline bidi scopes and release their private document on every refusal. */
export function verifyMermaidBidiAffinity() {
  const host = document.createElement("div"), guard = document.createElement("button");
  host.style.cssText = "font:24px monospace;white-space:pre;direction:ltr";
  host.textContent = "١\t(٢)";
  guard.textContent = "Retain application selection and focus";
  document.body.append(host, guard);
  const selection = document.getSelection()!, range = document.createRange();
  const previous = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange());
  const focused = document.activeElement as HTMLElement | null;
  range.selectNodeContents(guard);
  selection.removeAllRanges();
  selection.addRange(range);
  guard.focus();
  const saved = selection.toString(), anchor = selection.anchorNode, offset = selection.anchorOffset;
  const originalFrames = document.querySelectorAll("iframe").length;
  const observer = new MutationObserver(() => {});
  observer.observe(document.body, { childList: true });
  const projections = () =>
    observer.takeRecords().flatMap((record) => [...record.addedNodes])
      .filter((node) => node instanceof HTMLIFrameElement).length;
  let probes = 0, budgetChecks = 0;
  const unchanged = () =>
    require(
      document.querySelectorAll("iframe").length === originalFrames && selection.toString() === saved &&
        selection.anchorNode === anchor && selection.anchorOffset === offset && document.activeElement === guard,
      "Bidi direction probe leaked a document or changed application selection/focus",
    );
  const refuse = (call: () => unknown) => {
    let rejected = false;
    try {
      call();
    } catch (error) {
      rejected = error instanceof RangeError;
    }
    require(rejected, "Bidi direction probe failed to enforce its resource/source bounds");
    unchanged();
    budgetChecks++;
  };
  try {
    let node = host.firstChild as Text;
    const original = host.outerHTML;
    const resolver = measuredTextDirectionResolver(host, [
      { node, start: 2, end: 3 },
      { node, start: 4, end: 5 },
    ]);
    require(projections() === 0, "Unused bidi fallback allocated a private document");
    unchanged();
    require(
      resolver(node, 2, 3) === "rtl" && resolver(node, 4, 5) === "rtl",
      "Split native affinity lost RTL brackets",
    );
    require(resolver(node, 0, 1) === undefined, "Unmeasured source interval gained invented direction");
    require(projections() === 1, "Bidi fallback remeasured its scope instead of caching the private result");
    require(host.outerHTML === original, "Direction fallback split the borrowed source");
    unchanged();
    probes += 2;
    refuse(() => measuredTextDirectionResolver(host, [{ node, start: -1, end: 1 }])(node, -1, 1));
    refuse(() => measuredTextDirectionResolver(host, [{ node, start: 0, end: 6 }])(node, 0, 6));
    refuse(() => measuredTextDirectionResolver(host, [{ node, start: 0, end: 0 }])(node, 0, 0));
    refuse(() =>
      measuredTextDirectionResolver(host, [
        { node, start: 0, end: 3 },
        { node, start: 2, end: 4 },
      ])(node, 0, 3)
    );
    refuse(() =>
      measuredTextDirectionResolver(host, Array.from({ length: 16_385 }, () => ({ node, start: 0, end: 1 })))(
        node,
        0,
        1,
      )
    );
    host.textContent = "X".repeat(65_537);
    node = host.firstChild as Text;
    refuse(() => measuredTextDirectionResolver(host, [{ node, start: 0, end: 1 }])(node, 0, 1));
    host.textContent = "X".repeat(8192);
    node = host.firstChild as Text;
    refuse(() =>
      measuredTextDirectionResolver(
        host,
        Array.from({ length: 8192 }, (_, start) => ({ node, start, end: start + 1 })),
      )(node, 0, 1)
    );
    host.replaceChildren();
    let parent: Element = host;
    for (let index = 0; index < 129; index++) {
      const child = document.createElement("span");
      parent.append(child);
      parent = child;
    }
    parent.textContent = "(";
    node = parent.firstChild as Text;
    refuse(() => measuredTextDirectionResolver(host, [{ node, start: 0, end: 1 }])(node, 0, 1));
    host.innerHTML = 'אב <span style="direction:ltr;unicode-bidi:isolate">(ABC)</span> גד';
    host.style.direction = "rtl";
    node = host.querySelector("span")!.firstChild as Text;
    const nested = measuredTextDirectionResolver(host, [{ node, start: 0, end: 1 }, { node, start: 4, end: 5 }]);
    require(nested(node, 0, 1) === "ltr" && nested(node, 4, 5) === "ltr", "Fallback lost nested isolate direction");
    unchanged();
    probes += 2;
  } finally {
    observer.disconnect();
    selection.removeAllRanges();
    for (const saved of previous) selection.addRange(saved);
    host.remove();
    guard.remove();
    focused?.focus();
  }
  return { probes, budgetChecks, selectionAndFocus: true };
}

/** Extract actual SVG/HTML boxes without mutating author markup, application selection or borrowed styles. */
export function verifyMermaidBidiDOM() {
  let checks = 0;
  for (const html of [true, false]) {
    for (const fixture of cases) {
      if (!html && (fixture.body.includes("span") || ("htmlOnly" in fixture && fixture.htmlOnly))) continue;
      const host = document.createElement("div");
      const css = `font:24px monospace;${fixture.css}`;
      host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="650" height="150" viewBox="0 0 650 150">' +
        (html
          ? `<foreignObject x="20" y="20" width="600" height="100"><div xmlns="http://www.w3.org/1999/xhtml" style="${css}">${fixture.body}</div></foreignObject>`
          : `<text x="${
            fixture.css.includes("direction:rtl") ? 600 : 20
          }" y="60" style="${css}">${fixture.body}</text>`) +
        "</svg>";
      document.body.append(host);
      try {
        const svg = host.querySelector("svg")!, original = svg.outerHTML;
        const scene = extractMermaidScene(svg);
        const portable = JSON.parse(JSON.stringify(scene));
        const frame = renderMermaidNativeFrame(portable);
        require(
          chars(frame) === fixture.paint,
          `${html ? "HTML" : "SVG"} ${fixture.name}: ${
            JSON.stringify({
              actual: chars(frame),
              expected: fixture.paint,
              items: scene.items,
              diagnostics: frame.diagnostics,
            })
          }`,
        );
        require(
          !frame.diagnostics.some((message) => message.includes("unambiguous")),
          `${fixture.name}: unresolved glyph direction`,
        );
        require(
          svg.outerHTML === original && host.children.length === 1,
          "Bidi capture mutated original DOM or leaked a probe",
        );
        require(JSON.stringify(scene) === JSON.stringify(portable), "Native bidi paint mutated portable source");
        checks++;
      } finally {
        host.remove();
      }
    }
  }
  return { checks };
}

/** Explicitly unsupported font-only mirrors retain logical glyphs and diagnostics. */
export function verifyMermaidBidiGuards() {
  let checks = 0;
  for (const html of [false, true]) {
    const host = document.createElement("div");
    host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150">' +
      (html
        ? '<foreignObject width="300" height="150"><div xmlns="http://www.w3.org/1999/xhtml" style="font:24px monospace;direction:rtl">∫</div></foreignObject>'
        : '<text x="100" y="60" style="font:24px monospace;direction:rtl">∫</text>') +
      "</svg>";
    document.body.append(host);
    try {
      const svg = host.querySelector("svg")!, original = svg.outerHTML;
      const scene = extractMermaidScene(svg);
      require(
        scene.diagnostics.some((message) => message.includes("without a Unicode character substitute")),
        "Font-only mirrored glyph was silently counted as supported",
      );
      require(
        scene.items.some((item) => item.kind === "text" && item.text === "∫"),
        "Unsupported glyph lost logical source",
      );
      require(svg.outerHTML === original, "Unsupported mirror capture changed original markup");
      checks++;
    } finally {
      host.remove();
    }
  }
  return { checks };
}

/** A character substitution must not change the layout strategy of otherwise ordinary SVG text. */
export function verifyMermaidBidiAnchors() {
  let checks = 0;
  for (const [logical, painted] of [["(", ")"], [")", "("], ["[", "]"], ["]", "["], ["<", ">"], [">", "<"]]) {
    const original = document.createElement("div"), reference = document.createElement("div");
    const markup = (text: string, direction: string, x: number) =>
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150">' +
      `<a href="https://example.test/glyph"><text x="${x}" y="60" ` +
      `style="font:24px monospace;fill:rgb(0,128,0);font-weight:bold;font-style:italic;direction:${direction}">` +
      text.replaceAll("<", "&lt;").replaceAll(">", "&gt;") + "</text></a></svg>";
    original.innerHTML = markup(logical!, "rtl", 100);
    document.body.append(original, reference);
    try {
      const svg = original.querySelector("svg")!, owner = svg.querySelector("text")!;
      const expectedX = Math.min(owner.getStartPositionOfChar(0).x, owner.getEndPositionOfChar(0).x);
      reference.innerHTML = markup(painted!, "ltr", expectedX);
      const borrowed = svg.outerHTML, scene = extractMermaidScene(svg);
      const comparison = extractMermaidScene(reference.querySelector("svg")!);
      const text = scene.items.find((item) => item.kind === "text")!;
      const counterpart = comparison.items.find((item) => item.kind === "text")!;
      require(text.kind === "text" && counterpart.kind === "text", "Glyph anchor fixture lost SVG text");
      require(text.text === logical && counterpart.text === painted, "Glyph anchor capture changed logical text");
      for (const key of ["x", "y", "width", "height"] as const) {
        require(Math.abs(text[key] - counterpart[key]) < .001, `Glyph anchor fixture bounds differ: ${key}`);
      }
      const saved = JSON.stringify(scene);
      for (const density of [undefined, { columnUnits: 8, rowUnits: 16 }, { columnUnits: 12, rowUnits: 24 }]) {
        const frame = renderMermaidNativeFrame(JSON.parse(saved), density);
        const expected = renderMermaidNativeFrame(comparison, density);
        require(
          JSON.stringify(frame.cells) === JSON.stringify(expected.cells),
          `Mirrored SVG ${logical} shifted native cells despite equal original glyph bounds`,
        );
        checks++;
      }
      require(!text.layout && text.renderedText === painted, "Ordinary SVG mirror forced positioned glyph layout");
      require(JSON.stringify(scene) === saved && svg.outerHTML === borrowed, "Glyph anchor probe changed source");
    } finally {
      original.remove();
      reference.remove();
    }
  }
  return { checks };
}

/** Use the real upstream grammar/layout, then verify separate logical text and native/Markdown glyph ink. */
export async function verifyMermaidBidiFeatures(renderer: Pick<MermaidStandardRenderer, "compile">) {
  let checks = 0, snapshots = 0;
  const retained = [];
  for (const htmlLabels of [true, false]) {
    const fixtures: { label: string; logical: string; paint: string; css: string; basesOnly?: boolean }[] = [
      ["(ABC)", "(CBA)"],
      ["[ABC]", "[CBA]"],
      ["<ABC>", "<CBA>"],
      ["(", ")"],
      [")", "("],
      ["[", "]"],
      ["]", "["],
      ["<", ">"],
      [">", "<"],
    ].map(([label, paint]) => ({
      label: label!,
      logical: label!,
      paint: paint!,
      css: "direction:rtl;unicode-bidi:bidi-override",
    }));
    fixtures.push(
      { label: "a(\u0332b)\u0333", logical: "a(\u0332b)\u0333", paint: "a(\u0332b)\u0333", css: "direction:ltr" },
      {
        label: "a(\u0332b)\u0333",
        logical: "a(\u0332b)\u0333",
        paint: "(\u0333b)\u0332a",
        css: "direction:rtl;unicode-bidi:bidi-override",
      },
    );
    if (htmlLabels) {
      fixtures.push(
        { label: "١\t(٢)", logical: "١\t(٢)", paint: "١(٢)", css: "direction:ltr;white-space:pre" },
        { label: "١\t(٢)", logical: "١\t(٢)", paint: "(٢)١", css: "direction:rtl;white-space:pre" },
      );
    }
    fixtures.push(...MERMAID_BIDI_CLUSTERS.map((fixture) => ({
      label: fixture.label,
      logical: fixture.label,
      paint: fixture.bases,
      css: `direction:${fixture.direction};white-space:pre`,
      basesOnly: true,
    })));
    for (const { label, logical, paint, css, basesOnly } of fixtures) {
      const source = `flowchart LR\nA["${label!.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}"]`;
      const diagram = await renderer.compile(source, {
        config: {
          htmlLabels,
          flowchart: { htmlLabels },
          themeCSS: `text,tspan,.nodeLabel,.nodeLabel p{${css};font-family:monospace}`,
        },
      });
      require(diagram.source === source && diagram.scene, "Bidi compiler changed author source or lost its scene");
      require(
        diagram.scene.items.filter((item) => item.kind === "text").map((item) => item.text).join("")
          .replace(basesOnly ? /\p{Cf}/gu : /$^/g, "") === logical.replace(basesOnly ? /\p{Cf}/gu : /$^/g, ""),
        `Bidi paint replaced logical text: ${JSON.stringify({ label, logical, items: diagram.scene.items })}`,
      );
      const portable = JSON.parse(JSON.stringify(diagram));
      const frame = renderMermaidNativeFrame(portable.scene);
      let actual = frame.cells.flat().map((cell) => cell.char).filter((char) =>
        /^[\p{Letter}\p{Number}\p{Mark}\p{Cf}()[\]<>]+$/u.test(char)
      ).join("");
      if (basesOnly) {
        actual = actual.replace(/[\p{Mark}\p{Cf}]/gu, "");
        require(
          diagram.scene.items.some((item) =>
            item.kind === "text" && item.layout?.glyphs.some((glyph) => glyph.fragments)
          ),
          "Actual cluster compiler discarded measured fragment layout",
        );
      }
      require(actual === paint, `Upstream ${htmlLabels ? "HTML" : "SVG"} bidi paint: ${actual} !== ${paint}`);
      const prepared = await prepareMermaidMarkdown(`\`\`\`mermaid\n${source}\n\`\`\``, {
        compile: () => Promise.resolve(portable),
      });
      const controller = new MarkdownController({ source: prepared.source, render: prepared.render });
      try {
        for (const width of [160, 80]) {
          const rows = controller.render(width);
          require(
            rows.map((row) => row.text).join("").replace(basesOnly ? /[\s\p{Mark}\p{Cf}]/gu : /\s/g, "").includes(
              paint,
            ),
            "Markdown lost mirrored glyph ink",
          );
          snapshots++;
        }
      } finally {
        controller.dispose();
      }
      retained.push(portable);
      checks++;
    }
  }
  return { checks, snapshots, retained };
}
