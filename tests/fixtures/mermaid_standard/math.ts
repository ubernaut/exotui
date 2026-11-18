// Copyright 2023 Im-Beast. MIT license.
import { extractMermaidScene } from "../../../src/content/mermaid_scene.ts";
import { extractMathML } from "../../../src/content/mermaid_math_dom.ts";
import { clipPredicate } from "../../../src/content/mermaid_clip.ts";
import { renderMermaidNativeFrame } from "../../../src/content/mermaid_cells.ts";
import type { MermaidStandardDiagram, MermaidStandardRenderer } from "../../../mod.mermaid.ts";

/** Original paired glyph controls, including native Unicode assembly endpoints. */
export const MERMAID_MATH_FENCES = [
  { left: "(", right: ")", opening: ["⎛", "⎝"], closing: ["⎞", "⎠"] },
  { left: "[", right: "]", opening: ["⎡", "⎣"], closing: ["⎤", "⎦"] },
  { left: "{", right: "}", opening: ["⎧", "⎩"], closing: ["⎫", "⎭"] },
  { left: "⌊", right: "⌋", opening: ["│", "└"], closing: ["│", "┘"] },
  { left: "⌈", right: "⌉", opening: ["┌", "│"], closing: ["┐", "│"] },
] as const;

export const MERMAID_FRACTION_THICKNESSES = [
  null,
  "0px",
  "-2px",
  "0bad",
  "bad",
  ".5px",
  "1px",
  "4px",
  "8px",
  ".1em",
  "200%",
  "1ex",
  "1ch",
  "1rem",
  "1lh",
  "calc(2px + .1em)",
] as const;

/** Empty spaces isolate the original fraction bar for independent screenshot controls. */
export function mountMermaidFractionOriginal(
  font: string,
  direction: string,
  thickness: string | null,
  profile = "normal",
  displaystyle = "compact",
) {
  const host = document.createElement("div");
  host.id = "fraction-original-control";
  const scale = profile === "viewbox" ? 2 : 1;
  const fractionCSS = profile === "fraction-scale"
    ? "transform:scale(1.25,1.5) translate(2px,4px)"
    : profile === "padding"
    ? "padding:10px 9px 5px 6px"
    : "";
  const mathCSS = profile === "zoom"
    ? "zoom:1.5"
    : profile === "scale"
    ? "transform:scale(1.25,1.5);transform-origin:0 0"
    : "";
  host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="380" viewBox="0 0 ${700 / scale} ${
    380 / scale
  }"><a href="https://example.test/fraction"><foreignObject x="20" y="25" width="320" height="150"><math style='font:48px ${font};direction:${direction};math-style:${displaystyle};color:rgb(0,128,0);${mathCSS}'><mfrac style="${fractionCSS}"${
    thickness === null ? "" : ` linethickness="${thickness}"`
  }><mspace width="96px" height="${profile === "unbalanced" ? 75 : 18}px"></mspace><mspace width="96px" height="${
    profile === "unbalanced" ? 2 : 18
  }px"></mspace></mfrac></math></foreignObject></a></svg>`;
  document.body.append(host);
  const svg = host.querySelector("svg")!, source = svg.outerHTML;
  const fraction = host.querySelector("mfrac")!, box = fraction.getBoundingClientRect();
  const scene = extractMermaidScene(svg);
  if (svg.outerHTML !== source) throw new Error("Fraction capture changed its original source");
  const paths = scene.items.filter((item) => item.kind === "path");
  return {
    scene,
    paths,
    original: source,
    viewport: host.querySelector("foreignObject")!.getBoundingClientRect().toJSON(),
    screen: ((m) => [m.a, m.b, m.c, m.d, m.e, m.f])(svg.getScreenCTM()!),
    clip: {
      x: Math.max(0, Math.floor(box.left) - 2),
      y: Math.max(0, Math.floor(box.top) - 2),
      width: Math.ceil(box.width) + 4,
      height: Math.ceil(box.height) + 4,
    },
  };
}

export function verifyMermaidFractionDOM() {
  let cases = 0, snapshots = 0, suppressed = 0;
  const frames = document.querySelectorAll("iframe").length, children = document.body.childElementCount;
  for (const font of ["monospace", '"Liberation Mono",monospace', '"DejaVu Serif",serif']) {
    for (const direction of ["ltr", "rtl"]) {
      for (const profile of ["normal", "viewbox", "zoom", "scale", "fraction-scale", "padding", "unbalanced"]) {
        let defaultWidth = 0;
        for (const thickness of MERMAID_FRACTION_THICKNESSES) {
          try {
            const control = mountMermaidFractionOriginal(font, direction, thickness, profile);
            const noBar = thickness === "0px" || thickness === "-2px";
            if (control.paths.length !== (noBar ? 0 : 1)) {
              throw new Error(`Wrong fraction rule count: ${thickness}`);
            }
            if (noBar) suppressed++;
            else {
              const path = control.paths[0]!;
              const sy = profile === "viewbox" ? 2 : ["zoom", "scale", "fraction-scale"].includes(profile) ? 1.5 : 1;
              const width = path.paint.strokeWidth / sy;
              if (thickness === null) defaultWidth = width;
              const expected = thickness === ".1em"
                ? 4.8
                : thickness === "200%"
                ? defaultWidth * 2
                : thickness === ".5px" || thickness === "1px" || thickness === "4px" || thickness === "8px"
                ? Number.parseFloat(thickness)
                : ["0bad", "bad", "calc(2px + .1em)"].includes(thickness ?? "")
                ? defaultWidth
                : undefined;
              if (expected !== undefined && Math.abs(width - expected) > .04) {
                throw new Error(
                  `Wrong original fraction thickness: ${font}/${direction}/${profile}/${thickness}: ${width}/${expected}`,
                );
              }
              if (
                !path.strokeInverse || path.paint.stroke !== "rgb(0, 128, 0)" ||
                path.href !== "https://example.test/fraction"
              ) {
                throw new Error("Fraction rule lost affine metrics, color or link");
              }
              if (profile === "fraction-scale") {
                const inside = clipPredicate(path.clip, () => {});
                const matrix = new DOMMatrix(control.screen).inverse();
                const outside = new DOMPoint(control.viewport.left - 1, control.viewport.top + 1).matrixTransform(
                  matrix,
                );
                const within = new DOMPoint(control.viewport.left + 1, control.viewport.top + 1).matrixTransform(
                  matrix,
                );
                if (inside(outside.x, outside.y) || !inside(within.x, within.y)) {
                  throw new Error("Fraction escaped its foreignObject viewport");
                }
              }
            }
            const saved = JSON.stringify(control.scene);
            for (const options of [{ columnUnits: 2, rowUnits: 2 }, { columnUnits: 3, rowUnits: 4 }]) {
              const frame = renderMermaidNativeFrame(JSON.parse(saved), options);
              const ink = frame.cells.flat().filter((cell) => cell.char !== " ");
              if (
                (!ink.length) !== noBar ||
                ink.some((cell) =>
                  cell.foreground !== "rgb(0, 128, 0)" || cell.href !== "https://example.test/fraction"
                )
              ) {
                throw new Error(
                  `Fraction native paint/source ownership changed: ${
                    JSON.stringify({ profile, thickness, options, ink: ink.length, paths: control.paths })
                  }`,
                );
              }
              snapshots++;
            }
            if (JSON.stringify(control.scene) !== saved) throw new Error("Fraction native transport mutated source");
            cases++;
          } finally {
            document.querySelector("#fraction-original-control")?.remove();
          }
        }
      }
    }
  }
  // The Core algorithm counts in-flow children, not raw DOM child count;
  // display overrides must not synthesize a bar the original never paints.
  for (
    const body of [
      '<mfrac><mi>a</mi><mi>b</mi><mi style="position:absolute">c</mi></mfrac>',
      '<mfrac><mi>a</mi><mi>b</mi><mi style="display:none">c</mi></mfrac>',
      "<mfrac><mi>a</mi><mi>b</mi><mi>c</mi></mfrac>",
      '<mfrac style="display:inline-flex"><mi>a</mi><mi>b</mi></mfrac>',
    ]
  ) {
    const host = document.createElement("div");
    host.innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="200"><foreignObject width="500" height="200"><math style="font:48px monospace">${body}</math></foreignObject></svg>`;
    document.body.append(host);
    try {
      const svg = host.firstElementChild! as SVGSVGElement, source = svg.outerHTML;
      const paths = extractMermaidScene(svg).items.filter((item) => item.kind === "path");
      if (paths.length !== (body.includes("position:absolute") || body.includes("display:none") ? 1 : 0)) {
        throw new Error("Fraction capture ignored in-flow/display layout");
      }
      if (source !== svg.outerHTML) throw new Error("Fraction child-layout capture changed source");
      cases++;
    } finally {
      host.remove();
    }
  }
  let refusals = 0;
  for (const profile of ["nodes", "work", "attribute", "font"]) {
    const host = document.createElement("div");
    host.innerHTML = `<math style="font:${
      profile === "font" ? 0 : 48
    }px monospace"><mfrac><mspace width="96px" height="18px"></mspace><mspace width="96px" height="18px"></mspace></mfrac></math>`;
    if (profile === "attribute") host.querySelector("mfrac")!.setAttribute("linethickness", "x".repeat(4097));
    document.body.append(host);
    const math = host.firstElementChild!, source = math.outerHTML, count = document.body.childElementCount;
    try {
      let refused = false;
      try {
        extractMathML(math, {
          convert: (point) => point,
          visible: () => true,
          diagnostics: new Set(),
          budget: {
            nodes: profile === "nodes" ? 16376 : 0,
            comparisons: profile === "work" ? 999997 : 0,
          },
        });
      } catch (error) {
        if (!(error instanceof RangeError) || !/MathML/.test(error.message)) throw error;
        refused = true;
      }
      if (!refused || source !== math.outerHTML || count !== document.body.childElementCount) {
        throw new Error(`Fraction measurement refusal leaked/mutated source: ${profile}`);
      }
      refusals++;
    } finally {
      host.remove();
    }
  }
  // A successful recovery after refusals must still keep the original rule.
  try {
    if (mountMermaidFractionOriginal("monospace", "ltr", "8px").paths.length !== 1) {
      throw new Error("Fraction failed to recover");
    }
  } finally {
    document.querySelector("#fraction-original-control")?.remove();
  }
  if (document.body.childElementCount !== children || document.querySelectorAll("iframe").length !== frames) {
    throw new Error("Fraction measurement leaked an owned host");
  }
  return { cases, snapshots, suppressed, refusals };
}

/** Actual upstream TeX, in both measuring hosts; custom invalid values belong to raw MathML probes. */
export async function verifyMermaidFractions(renderer: Pick<MermaidStandardRenderer, "compile">) {
  const retained: MermaidStandardDiagram[] = [];
  for (const direction of ["ltr", "rtl"]) {
    for (const size of [24, 48]) {
      for (
        const tex of [
          String.raw`\\frac{a}{b}`,
          String.raw`\\dfrac{a}{b}`,
          String.raw`\\genfrac{}{}{4px}{}{a}{b}`,
          String.raw`\\binom{a}{b}`,
        ]
      ) {
        const source = `flowchart LR\nA["$$${tex}$$"]\nclick A "https://example.test/fraction"`;
        const diagram = await renderer.compile(source, {
          trusted: true,
          config: {
            securityLevel: "loose",
            themeCSS:
              `.katex {font-size:${size}px} math {direction:${direction};font-size:${size}px;color:rgb(0,128,0)}`,
          },
        });
        const scene = diagram.scene!,
          rules = scene.items.filter((item) => item.kind === "path").filter((item) =>
            item.points.length === 2 && item.paint.stroke === "rgb(0, 128, 0)"
          );
        if (rules.length !== (tex.includes("binom") ? 0 : 1)) {
          throw new Error("Actual compiler lost fraction rule count");
        }
        if (tex.includes("4px")) {
          // TeX px units are converted by the upstream engine to MathML em
          // units. Compare the generated attribute at its authored CSS size,
          // not an assumed literal four-screen-pixel bar after scaling.
          const attribute = /linethickness="([^"]+)"/.exec(diagram.svg)?.[1];
          if (!attribute || !/^\d+(?:\.\d+)?(?:em|px)$/.test(attribute)) {
            throw new Error(`Unexpected upstream fraction unit: ${attribute}`);
          }
          const expected = Number.parseFloat(attribute) * (attribute.endsWith("em") ? size : 1);
          if (Math.abs(rules[0]!.paint.strokeWidth - expected) > .05) {
            throw new Error(
              `Actual compiler lost authored fraction thickness: ${
                JSON.stringify({ attribute, expected, width: rules[0]!.paint.strokeWidth })
              }`,
            );
          }
        }
        for (const options of [undefined, { columnUnits: 2, rowUnits: 4 }]) {
          const cells = renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene)), options).cells.flat();
          if (
            ["a", "b"].some((value) =>
              !cells.some((cell) => cell.char === value && cell.href === "https://example.test/fraction")
            )
          ) {
            throw new Error(
              `Fraction rule overwrote its numerator/denominator: ${
                JSON.stringify({
                  direction,
                  size,
                  tex,
                  options,
                  math: scene.items.filter((item) => item.kind === "text" && item.math),
                  rules,
                  rows: renderMermaidNativeFrame(scene, options).rows,
                })
              }`,
            );
          }
        }
        retained.push(diagram);
      }
    }
  }
  return { cases: retained.length, retained };
}

/** Capture bounds come from the original operator, not a parent/base estimate or font-size guess. */
export function verifyMermaidOperatorDOM() {
  let cases = 0, snapshots = 0, fallback = 0, stretched = 0;
  for (const font of ["monospace", '"Liberation Mono",monospace', '"DejaVu Serif",serif']) {
    const bold = !font.includes("DejaVu");
    for (const profile of ["inherited-ltr", "inherited-rtl", "local-ltr", "local-rtl"]) {
      const direction = profile.endsWith("rtl") ? "rtl" : "ltr", local = profile.startsWith("local");
      for (const fence of MERMAID_MATH_FENCES) {
        const host = document.createElement("div");
        host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300">' +
          `<a href="https://example.test/operator"><foreignObject x="20" y="20" width="550" height="260"><math style='font:48px ${font};direction:${
            local ? direction === "rtl" ? "ltr" : "rtl" : direction
          };color:rgb(0,128,0);font-weight:${
            bold ? "bold" : "normal"
          }'><mrow><mo>${fence.left}</mo><mspace width="32px" height="96px" depth="4px"></mspace><mo>${fence.right}</mo></mrow></math></foreignObject></a></svg>`;
        if (local) { for (const mo of host.querySelectorAll("mo")) mo.setAttribute("style", `direction:${direction}`); }
        document.body.append(host);
        try {
          const svg = host.querySelector("svg")!, original = svg.outerHTML, inverse = svg.getScreenCTM()!.inverse();
          const frames = document.querySelectorAll("iframe").length;
          const measured = [...host.querySelectorAll("mo")].map((mo, index) => {
            const b = mo.getBoundingClientRect(), p = mo.parentElement!.getBoundingClientRect();
            if (b.height < p.height - 1) fallback++;
            if (b.height > 96) stretched++;
            const from = new DOMPoint(b.x, b.y).matrixTransform(inverse),
              to = new DOMPoint(b.right, b.bottom).matrixTransform(inverse);
            const opening = (index === 0) !== (direction === "rtl");
            return {
              source: mo.textContent!,
              ink: opening ? fence.left : fence.right,
              ends: opening ? fence.opening : fence.closing,
              x: from.x,
              y: from.y,
              width: to.x - from.x,
              height: to.y - from.y,
            };
          });
          const scene = extractMermaidScene(svg), saved = JSON.stringify(scene);
          const operators = scene.items.filter((item) => item.kind === "text").filter((item) =>
            item.math?.stretch === "vertical"
          );
          if (operators.length !== 2) throw new Error("Operator fixture lost vertical native notation");
          const automatic = renderMermaidNativeFrame(JSON.parse(saved));
          const middle = fence.left === "("
            ? ["⎜", "⎟"]
            : fence.left === "["
            ? ["⎢", "⎥"]
            : fence.left === "{"
            ? ["⎨", "⎬"]
            : ["│"];
          if (
            operators.some((item) => item.height / item.math!.rowUnits < 3 - .01) ||
            middle.some((glyph) => !automatic.cells.flat().some((cell) => cell.char === glyph))
          ) {
            throw new Error("Automatic math density drops the body of an original fence");
          }
          snapshots++;
          for (const original of measured) {
            const item = operators.find((item) => item.text === original.source)!;
            if (
              !item || item.kind !== "text" || (item.renderedText ?? item.text) !== original.ink ||
              ["x", "y", "width", "height"].some((key) => Math.abs(item[key as "x"] - original[key as "x"]) > .01)
            ) {
              throw new Error(
                `Operator lost original ink/bounds: ${font}/${profile}/${original.source}/${JSON.stringify(item)}/${
                  JSON.stringify(original)
                }`,
              );
            }
            for (const options of [{ columnUnits: 1, rowUnits: 4 }, { columnUnits: 2, rowUnits: 8 }]) {
              const cells = renderMermaidNativeFrame(JSON.parse(saved), options).cells;
              const column = Math.round(item.x / options.columnUnits),
                row = Math.round(item.y / options.rowUnits),
                length = Math.max(1, Math.round(item.height / options.rowUnits));
              for (const [offset, glyph] of [[0, original.ends[0]], [length - 1, original.ends[1]]] as const) {
                const cell = cells[row + offset]![column]!;
                if (
                  cell.char !== glyph || cell.foreground !== "rgb(0, 128, 0)" || !!cell.bold !== bold ||
                  cell.href !== "https://example.test/operator"
                ) throw new Error("Native operator lost measured endpoints/style/link");
              }
              snapshots++;
            }
          }
          if (
            svg.outerHTML !== original || JSON.stringify(scene) !== saved ||
            document.querySelectorAll("iframe").length !== frames
          ) throw new Error("Operator capture changed source/scene or leaked measurement DOM");
          cases++;
        } finally {
          host.remove();
        }
      }
      for (const glyph of ["¯", "‾", "_", "→", "←", "↔", "⃗"]) {
        const host = document.createElement("div");
        host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300">' +
          `<foreignObject x="20" y="20" width="550" height="260"><math style='font:48px ${font};direction:${direction}'><mover><mspace width="128px" height="24px"></mspace><mo>${glyph}</mo></mover></math></foreignObject></svg>`;
        document.body.append(host);
        try {
          const svg = host.querySelector("svg")!,
            source = svg.outerHTML,
            box = host.querySelector("mo")!.getBoundingClientRect(),
            inverse = svg.getScreenCTM()!.inverse();
          const a = new DOMPoint(box.x, box.y).matrixTransform(inverse),
            b = new DOMPoint(box.right, box.bottom).matrixTransform(inverse);
          if (glyph === "⃗") {
            if (box.width !== 0) throw new Error("Combining accent fixture lost zero advance");
            const mo = host.querySelector("mo")!,
              css = getComputedStyle(mo),
              canvas = document.createElement("canvas").getContext("2d")!;
            canvas.font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
            const ink = canvas.measureText(glyph);
            a.x -= ink.actualBoundingBoxLeft;
            b.x += ink.actualBoundingBoxRight;
          }
          const scene = extractMermaidScene(svg),
            operator = scene.items.find((item) => item.kind === "text" && item.math?.stretch === "horizontal");
          if (
            !operator || operator.kind !== "text" || operator.text !== glyph || Math.abs(operator.x - a.x) > .01 ||
            Math.abs(operator.y - a.y) > .01 || Math.abs(operator.width - (b.x - a.x)) > .01 ||
            Math.abs(operator.height - (b.y - a.y)) > .01 || svg.outerHTML !== source ||
            (operator.renderedText ?? operator.text) !== (glyph === "⃗" ? "→" : glyph)
          ) throw new Error(`Horizontal operator lost original bounds: ${font}/${direction}/${glyph}`);
          cases++;
        } finally {
          host.remove();
        }
      }
    }
  }
  if (!fallback || !stretched) {
    throw new Error("Operator suite did not exercise fallback and genuine math-font stretching");
  }
  return { cases, snapshots, fallback, stretched };
}

/** Real TeX fences retain logical source and actual mirrored ink through disposal and document transport. */
export async function verifyMermaidOperators(renderer: Pick<MermaidStandardRenderer, "compile">) {
  const retained: MermaidStandardDiagram[] = [];
  for (const direction of ["ltr", "rtl"]) {
    for (
      const [opening, closing, left, right] of [
        ["(", ")", "(", ")"],
        ["[", "]", "[", "]"],
        [String.raw`\\{`, String.raw`\\}`, "{", "}"],
        [String.raw`\\lfloor`, String.raw`\\rfloor`, "⌊", "⌋"],
        [String.raw`\\lceil`, String.raw`\\rceil`, "⌈", "⌉"],
      ]
    ) {
      const source = String.raw`flowchart LR
A["$$\\left${opening}\\frac{a}{b}\\right${closing}$$"]
click A "https://example.test/operator"`;
      const diagram = await renderer.compile(source, {
        trusted: true,
        config: {
          securityLevel: "loose",
          themeCSS: `math {font-family:"DejaVu Serif",serif;direction:${direction};color:rgb(0,128,0)}`,
        },
      });
      const scene = diagram.scene!,
        saved = JSON.stringify(scene),
        operators = scene.items.filter((item) => item.kind === "text" && item.math?.stretch === "vertical");
      if (operators.length !== 2) throw new Error(`Actual compiler lost fences: ${direction}/${opening}`);
      for (const [logical, mirror] of [[left, right], [right, left]]) {
        const operator = operators.find((item) => item.kind === "text" && item.text === logical);
        if (
          !operator || operator.kind !== "text" ||
          (operator.renderedText ?? operator.text) !== (direction === "rtl" ? mirror : logical)
        ) throw new Error(`Actual compiler lost fence ink: ${direction}/${opening}`);
      }
      if (diagram.source !== source || JSON.stringify(scene) !== saved) {
        throw new Error("Actual operator capture changed source");
      }
      retained.push(diagram);
    }
  }
  for (const direction of ["ltr", "rtl"]) {
    const source = String.raw`flowchart LR
A["$$\\vec{xyz}$$"]
click A "https://example.test/operator"`;
    const diagram = await renderer.compile(source, {
      trusted: true,
      config: {
        securityLevel: "loose",
        themeCSS: `math {font-family:"DejaVu Serif",serif;direction:${direction};color:rgb(0,128,0)}`,
      },
    });
    const texts = diagram.scene!.items.filter((item) => item.kind === "text");
    const accent = texts.find((item) => item.text === "⃗"),
      base = texts.filter((item) => ["x", "y", "z"].includes(item.text));
    if (
      !accent || accent.renderedText !== "→" || base.length !== 3 ||
      !(accent.width > 0 &&
        accent.width < Math.max(...base.map((item) => item.x + item.width)) - Math.min(...base.map((item) => item.x)))
    ) throw new Error("Actual vector accent lost logical text or its narrow font ink bounds");
    retained.push(diagram);
  }
  return { cases: retained.length, retained };
}

/** An unchanged original accent exposes a pixel oracle independent of Canvas TextMetrics. */
export function mountMermaidAccentOriginal(font: string, direction: string) {
  const host = document.createElement("div");
  host.id = "accent-original-control";
  host.style.cssText = "position:absolute;left:0;top:0;background:white";
  host.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="270"><foreignObject x="20" y="25" width="400" height="240"><math style='font:48px ${font};direction:${direction};color:black'><mover><mspace width="128px" height="24px"></mspace><mo>⃗</mo></mover></math></foreignObject></svg>`;
  document.body.append(host);
  try {
    const svg = host.querySelector("svg")!,
      source = svg.outerHTML,
      root = host.querySelector("math")!.getBoundingClientRect();
    const scene = extractMermaidScene(svg), item = scene.items.find((item) => item.kind === "text" && item.text === "⃗");
    if (!item || item.kind !== "text" || item.renderedText !== "→" || svg.outerHTML !== source) {
      throw new Error("Accent pixel fixture lost logical source or changed original DOM");
    }
    const transform = svg.getScreenCTM()!,
      left = new DOMPoint(item.x, item.y).matrixTransform(transform),
      right = new DOMPoint(item.x + item.width, item.y + item.height).matrixTransform(transform);
    const frame = renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene)));
    const expected = direction === "rtl" ? ["Bidirectional or vertical MathML needs native math ordering."] : [];
    if (
      !frame.cells.flat().some((cell) => cell.char === "→") ||
      JSON.stringify(scene.diagnostics) !== JSON.stringify(expected)
    ) {
      throw new Error(
        `Original accent lost native ink or needs an unresolved capability: ${
          JSON.stringify({ font, direction, item, diagnostics: scene.diagnostics })
        }`,
      );
    }
    return {
      native: { left: left.x, right: right.x, top: left.y, bottom: right.y },
      clip: {
        x: Math.floor(root.x) - 10,
        y: Math.floor(root.y) - 5,
        width: Math.ceil(root.width) + 20,
        height: Math.ceil(root.height) + 10,
      },
    };
  } catch (error) {
    host.remove();
    throw error;
  }
}

/** Real upstream TeX fixtures, covering both documented Mermaid math-label families. */
export const MERMAID_MATH_FIXTURES: readonly { name: string; source: string }[] = [
  {
    name: "math-scripts",
    source: String.raw`flowchart LR
A["$$x^2 + y_1$$"]`,
  },
  {
    name: "math-fraction-root",
    source: String.raw`flowchart LR
A["$$\\frac{a+b}{\\sqrt{c}}$$"]`,
  },
  {
    name: "math-indexed-root",
    source: String.raw`flowchart LR
A["$$\\sqrt[3]{y}$$"]`,
  },
  {
    name: "math-matrix",
    source: String.raw`flowchart LR
A["$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$"]`,
  },
  {
    name: "math-accents",
    source: String.raw`flowchart LR
A["$$\\overline{abc} + \\vec{xyz}$$"]`,
  },
  {
    name: "math-binomial-phantom",
    source: String.raw`flowchart LR
A["$$\\binom{n}{k} + \\phantom{HIDDEN}x$$"]`,
  },
  {
    name: "math-sequence",
    source: String.raw`sequenceDiagram
Alice->>Bob: $$\frac{\sqrt{x}}{y^2}$$`,
  },
  {
    name: "math-limits",
    source: String.raw`flowchart LR
A["$$\\sum_{i=1}^{n} i + \\int_{0}^{1} f(x) dx$$"]`,
  },
  {
    name: "math-nested-fractions",
    source: String.raw`flowchart LR
A["$$\\frac{1}{1+\\frac{1}{x}}$$"]`,
  },
];

const rootCases = [
  { name: "square", body: "<msqrt><mi>x</mi></msqrt>", operands: ["x"] },
  { name: "indexed", body: "<mroot><mi>x</mi><mn>3</mn></mroot>", operands: ["x", "3"] },
  {
    name: "fraction",
    body: "<msqrt><mfrac><mi>a</mi><mi>b</mi></mfrac></msqrt>",
    operands: ["a", "b"],
  },
  {
    name: "indexed-fraction",
    body: "<mroot><mfrac><mi>a</mi><mi>b</mi></mfrac><mn>3</mn></mroot>",
    operands: ["a", "b", "3"],
  },
  { name: "multi-child", body: "<msqrt><mi>x</mi><mo>+</mo><mi>y</mi></msqrt>", operands: ["x", "+", "y"] },
  {
    name: "nested",
    body: "<mroot><msqrt><mi>x</mi></msqrt><mn>3</mn></mroot>",
    operands: ["x", "3"],
    roots: 2,
  },
] as const;

/** Original operand boxes pin radical side and overbar extent without a second math layout engine. */
export function verifyMermaidRadicalDOM() {
  let cases = 0, snapshots = 0;
  for (const font of ["monospace", '"Liberation Mono",monospace']) {
    for (const profile of ["inherited-ltr", "inherited-rtl", "local-ltr", "local-rtl"]) {
      const direction = profile.endsWith("rtl") ? "rtl" : "ltr";
      const local = profile.startsWith("local");
      for (const fixture of rootCases) {
        const host = document.createElement("div");
        host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200">' +
          `<a href="https://example.test/root"><foreignObject x="20" y="20" width="550" height="160"><math style='font:24px ${font};direction:${
            local ? direction === "rtl" ? "ltr" : "rtl" : direction
          };color:rgb(0,128,0);font-weight:bold'>${fixture.body}</math></foreignObject></a></svg>`;
        if (local) {
          for (const root of host.querySelectorAll("msqrt,mroot")) {
            root.setAttribute("style", `direction:${direction}`);
          }
        }
        document.body.append(host);
        try {
          const svg = host.querySelector("svg")!, original = svg.outerHTML, inverse = svg.getScreenCTM()!.inverse();
          const measured = [...host.querySelectorAll("msqrt,mroot")].map((root) => {
            const box = root.getBoundingClientRect();
            const operands = [...root.children].slice(0, root.localName === "mroot" ? 1 : undefined)
              .map((child) => child.getBoundingClientRect());
            const left = Math.min(...operands.map((child) => child.left));
            const right = Math.max(...operands.map((child) => child.right));
            const radicalX = direction === "rtl" ? right : left - Math.min(24 * .55, left - box.left);
            if (!((direction === "rtl" ? box.right - right : left - box.left) > 0)) {
              throw new Error("Original radical fixture lacks notation space");
            }
            return {
              x: new DOMPoint(radicalX, 0).matrixTransform(inverse).x,
              left: new DOMPoint(direction === "rtl" ? box.left : left, 0).matrixTransform(inverse).x,
              right: new DOMPoint(direction === "rtl" ? right : box.right, 0).matrixTransform(inverse).x,
              top: new DOMPoint(0, box.top).matrixTransform(inverse).y,
            };
          });
          const scene = extractMermaidScene(svg), saved = JSON.stringify(scene);
          const radicals = scene.items.filter((item) => item.kind === "text").filter((item) => item.text === "√");
          if (radicals.length !== measured.length) {
            throw new Error(`Missing MathML radical: ${fixture.name}/${direction}`);
          }
          const unmatched = [...radicals];
          for (const at of measured) {
            const index = unmatched.findIndex((item) => Math.abs(item.x - at.x) < .01);
            if (index < 0) {
              throw new Error(`MathML radical is on the wrong side: ${fixture.name}/${direction}`);
            }
            unmatched.splice(index, 1);
            if (
              !scene.items.some((item) =>
                item.kind === "path" && item.points.length === 2 &&
                Math.abs(item.points[0]!.x - at.left) < .01 && Math.abs(item.points[1]!.x - at.right) < .01 &&
                item.points.every((point) => Math.abs(point.y - at.top) < .01) &&
                item.paint.stroke === "rgb(0, 128, 0)" && item.href === "https://example.test/root"
              )
            ) throw new Error(`MathML root overbar lost original extent/style/link: ${fixture.name}/${direction}`);
          }
          for (const options of [undefined, { columnUnits: 1, rowUnits: 4 }, { columnUnits: 2, rowUnits: 8 }]) {
            const frame = renderMermaidNativeFrame(JSON.parse(saved), options), cells = frame.cells.flat();
            if (cells.filter((cell) => cell.char === "√").length !== measured.length) {
              throw new Error(
                `Root ink lost after native projection: ${fixture.name}/${profile}/${JSON.stringify(options)}`,
              );
            }
            if (fixture.operands.some((value) => !cells.some((cell) => cell.char === value))) {
              throw new Error(`Root notation overwrote an operand/index: ${fixture.name}/${direction}`);
            }
            if (
              !cells.filter((cell) => cell.char === "√").every((cell) =>
                cell.foreground === "rgb(0, 128, 0)" && cell.bold && cell.href === "https://example.test/root"
              )
            ) throw new Error("Root notation lost native styles/links");
            snapshots++;
          }
          if (svg.outerHTML !== original || JSON.stringify(scene) !== saved) {
            throw new Error("Root capture mutated source");
          }
          cases++;
        } finally {
          host.remove();
        }
      }
    }
  }
  return { cases, snapshots };
}

/** Actual Mermaid math labels retain roots, indices and bars through compiler disposal/native document transport. */
export async function verifyMermaidRadicals(renderer: Pick<MermaidStandardRenderer, "compile">) {
  const retained: MermaidStandardDiagram[] = [];
  for (const direction of ["ltr", "rtl"]) {
    for (const tex of [String.raw`\\sqrt{x}`, String.raw`\\sqrt[3]{x}`, String.raw`\\sqrt{\\frac{a}{b}}`]) {
      const source = `flowchart LR\nA["$$${tex}$$"]\nclick A "https://example.test/root"`;
      const diagram = await renderer.compile(source, {
        trusted: true,
        config: { securityLevel: "loose", themeCSS: `math {direction:${direction};color:rgb(0,128,0)}` },
      });
      const scene = diagram.scene!, saved = JSON.stringify(scene);
      const texts = scene.items.filter((item) => item.kind === "text");
      const radical = texts.find((item) => item.text === "√" && item.math),
        base = texts.find((item) => item.text === (tex.includes("frac") ? "a" : "x") && item.math);
      if (!radical || !base || (radical.x > base.x) !== (direction === "rtl")) {
        throw new Error(`Actual compiler lost radical side: ${direction}/${tex}`);
      }
      const rules = scene.items.filter((item) =>
        item.kind === "path" && item.points.length === 2 && item.paint.stroke === "rgb(0, 128, 0)"
      );
      if (rules.length !== (tex.includes("frac") ? 2 : 1)) throw new Error("Actual compiler lost root/fraction bar");
      for (const options of [undefined, { columnUnits: 2, rowUnits: 4 }]) {
        const cells = renderMermaidNativeFrame(JSON.parse(saved), options).cells.flat();
        if (
          !cells.some((cell) =>
            cell.char === "√" && cell.href === "https://example.test/root" && cell.foreground === "rgb(0, 128, 0)"
          )
        ) {
          throw new Error(`Actual native root lost ink/link: ${direction}/${tex}`);
        }
      }
      if (JSON.stringify(scene) !== saved || diagram.source !== source) {
        throw new Error("Actual native root mutated scene/source");
      }
      retained.push(diagram);
    }
  }
  return { cases: retained.length, retained };
}
