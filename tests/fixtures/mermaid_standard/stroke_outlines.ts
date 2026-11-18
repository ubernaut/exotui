// Copyright 2023 Im-Beast. MIT license.
import { extractMermaidScene } from "../../../src/content/mermaid_scene.ts";
import { renderMermaidNativeFrame } from "../../../src/content/mermaid_cells.ts";

/** Authored cap/join/transform/dash cases; independent browser geometry AND decoded paint are the oracles. */
export async function verifyMermaidStrokeOutlines(): Promise<{
  cases: number;
  geometrySamples: number;
  paintSamples: number;
  coloredSamples: number;
  transported: number;
}> {
  const cases: { name: string; d: string; attrs?: string; transform?: string; shape?: string; geometry?: string }[] =
    [];
  for (const cap of ["butt", "round", "square"]) {
    cases.push({ name: `cap-${cap}`, d: "M50 70 L160 100", attrs: `stroke-linecap="${cap}"` });
    cases.push({
      name: `dash-${cap}`,
      d: "M35 110 L80 35 L135 110 L180 45",
      attrs: `stroke-linecap="${cap}" stroke-dasharray="24 12" stroke-dashoffset="-7"`,
    });
    cases.push({ name: `dot-${cap}`, d: "M35 80 H200", attrs: `stroke-linecap="${cap}" stroke-dasharray="0 26"` });
  }
  for (const join of ["miter", "round", "bevel"]) {
    cases.push({ name: `join-${join}`, d: "M35 110 L80 35 L135 110 L180 45", attrs: `stroke-linejoin="${join}"` });
    cases.push({
      name: `closed-${join}`,
      d: "M45 40 L170 55 L130 135 L45 40 Z",
      attrs: `stroke-linejoin="${join}" stroke-linecap="square"`,
    });
  }
  for (const limit of [1, 2, 8]) {
    cases.push({ name: `miter-limit-${limit}`, d: "M35 130 L90 25 L115 135", attrs: `stroke-miterlimit="${limit}"` });
  }
  cases.push(
    {
      name: "closed-dash-seam",
      d: "M45 45 H175 V135 H45 Z",
      attrs: 'stroke-dasharray="40 20 15" stroke-linecap="round"',
    },
    {
      name: "calibrated-dashes",
      d: "M30 90 H210",
      attrs: 'pathLength="90" stroke-dasharray="10 8" stroke-linecap="square"',
    },
    {
      name: "anisotropic",
      d: "M20 70 H75 V140",
      transform: "translate(20 15) scale(2 .75)",
      attrs: 'stroke-linecap="round"',
    },
    {
      name: "reflected",
      d: "M25 110 L80 35 L140 110",
      transform: "translate(220 0) scale(-1 1)",
      attrs: 'stroke-linejoin="round"',
    },
    {
      name: "skewed",
      d: "M30 40 L100 100 L150 35",
      transform: "translate(10 5) skewX(18)",
      attrs: 'stroke-linecap="square"',
    },
    {
      name: "curved-round",
      d: "M30 120 C45 20 160 20 190 120",
      attrs: 'stroke-linecap="round" stroke-linejoin="round"',
    },
    { name: "curved-dashed", d: "M30 120 Q110 0 190 120", attrs: 'stroke-dasharray="22 14" stroke-linecap="round"' },
    { name: "disconnected", d: "M30 40 H200 M30 100 H200", attrs: 'stroke-dasharray="25 20" stroke-linecap="square"' },
    { name: "zero-length-round", d: "M100 80 L100 80", attrs: 'stroke-linecap="round"' },
    { name: "zero-length-square", d: "M100 80 L100 80", attrs: 'stroke-linecap="square"' },
    {
      name: "line",
      d: "",
      shape: "line",
      geometry: 'x1="35" y1="45" x2="200" y2="130"',
      attrs: 'stroke-linecap="round"',
    },
    {
      name: "polyline",
      d: "",
      shape: "polyline",
      geometry: 'points="35,130 85,35 140,130 195,40"',
      attrs: 'stroke-linejoin="round"',
    },
    {
      name: "polygon",
      d: "",
      shape: "polygon",
      geometry: 'points="40,40 195,75 105,140"',
      attrs: 'stroke-linejoin="bevel"',
    },
    { name: "rectangle", d: "", shape: "rect", geometry: 'x="40" y="35" width="155" height="110"' },
    {
      name: "rounded-rectangle",
      d: "",
      shape: "rect",
      geometry: 'x="40" y="35" width="155" height="110" rx="20" ry="12"',
    },
    { name: "circle", d: "", shape: "circle", geometry: 'cx="120" cy="90" r="58"' },
    {
      name: "ellipse",
      d: "",
      shape: "ellipse",
      geometry: 'cx="120" cy="90" rx="80" ry="45"',
      transform: "rotate(12 120 90)",
    },
    {
      name: "zero-length-line-round",
      d: "",
      shape: "line",
      geometry: 'x1="100" y1="80" x2="100" y2="80"',
      attrs: 'stroke-linecap="round"',
    },
    { name: "singular-invisible", d: "M40 90 H200", transform: "scale(0)" },
  );
  let geometrySamples = 0;
  let paintSamples = 0;
  let coloredSamples = 0;
  let transported = 0;
  for (const fixture of cases) {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:0";
    host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180">
      <g opacity=".7"><${fixture.shape ?? "path"} ${fixture.geometry ?? `d="${fixture.d}"`} transform="${
      fixture.transform ?? "translate(0 0)"
    }"
        fill="none" stroke="rgb(40,80,160)" stroke-opacity=".6" stroke-width="12" ${fixture.attrs ?? ""}/></g></svg>`;
    const before = document.body.children.length;
    document.body.append(host);
    const svg = host.querySelector("svg")!;
    const original = svg.outerHTML;
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext("2d")!;
    let url: string | undefined;
    try {
      const scene = extractMermaidScene(svg);
      const frame = renderMermaidNativeFrame(scene, { columnUnits: 2, rowUnits: 2 });
      const copy = renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene)), { columnUnits: 2, rowUnits: 2 });
      if (JSON.stringify(frame) !== JSON.stringify(copy)) {
        throw new Error(`Nonportable stroke outline: ${fixture.name}`);
      }
      transported++;
      if (svg.outerHTML !== original) throw new Error(`Stroke extraction changed source DOM: ${fixture.name}`);
      const path = svg.querySelector("path,line,polyline,polygon,rect,circle,ellipse")! as SVGGeometryElement;
      const relative = DOMMatrix.fromMatrix(path.getScreenCTM()!).inverse().multiply(svg.getScreenCTM()!);
      const hasMetricOracle = [relative.a, relative.b, relative.c, relative.d, relative.e, relative.f].every(
        Number.isFinite,
      );
      const reference = svg.cloneNode(true) as SVGSVGElement;
      reference.setAttribute("viewBox", "-.5 -.5 240 180");
      url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(reference)], { type: "image/svg+xml" }),
      );
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Cannot decode stroke reference."));
        image.src = url!;
      });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, 240, 180).data;
      const colors = new Map<string, number[]>();
      let colored = 0;
      for (let row = 1; row < 89; row++) {
        for (let column = 1; column < 119; column++) {
          const x = column * 2;
          const y = row * 2;
          const states = hasMetricOracle
            ? [[0, 0], [-.6, 0], [.6, 0], [0, -.6], [0, .6]].map(([dx, dy]) =>
              path.isPointInStroke(new DOMPoint(x + dx!, y + dy!).matrixTransform(relative))
            )
            : [false]; // Singular geometry is verified by decoded paint, not an invented DOM geometry oracle.
          if (!states.every((value) => value === states[0])) continue;
          const cell = frame.cells[row]![column]!;
          const painted = cell.char === "█" && !!cell.foreground;
          if (painted !== states[0]) {
            throw new Error(`Stroke outline geometry mismatch ${fixture.name} at ${x},${y}: ${cell.char}`);
          }
          if (hasMetricOracle) geometrySamples++;
          const reference = [...pixels.slice((y * 240 + x) * 4, (y * 240 + x) * 4 + 4)];
          // Geometry edges and SVG antialiasing are separate; only stable paint interiors qualify.
          if (
            ![[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => {
              const offset = ((y + dy!) * 240 + x + dx!) * 4;
              return reference.every((value, channel) => Math.abs(value - pixels[offset + channel]!) <= 4);
            })
          ) continue;
          let native = [0, 0, 0, 0];
          if (painted) {
            native = colors.get(cell.foreground!)!;
            if (!native) {
              colorContext.clearRect(0, 0, 1, 1);
              colorContext.fillStyle = cell.foreground!;
              colorContext.fillRect(0, 0, 1, 1);
              native = [...colorContext.getImageData(0, 0, 1, 1).data];
              colors.set(cell.foreground!, native);
            }
          }
          if (!native.every((value, channel) => Math.abs(value - reference[channel]!) <= 5)) {
            throw new Error(
              `Stroke outline paint mismatch ${fixture.name} at ${x},${y}: ${native} versus ${reference}`,
            );
          }
          paintSamples++;
          if (painted) {
            colored++;
            coloredSamples++;
          }
        }
      }
      if (
        colored <
          (fixture.name.startsWith("zero-length")
            ? 10
            : fixture.name === "dot-butt" || fixture.name === "singular-invisible"
            ? 0
            : 20)
      ) {
        throw new Error(`Insufficient colored stroke samples: ${fixture.name}`);
      }
    } finally {
      if (url) URL.revokeObjectURL(url);
      canvas.width =
        canvas.height =
        colorCanvas.width =
        colorCanvas.height =
          0;
      host.remove();
    }
    if (document.body.children.length !== before) throw new Error(`Stroke outline host leaked: ${fixture.name}`);
  }
  return { cases: cases.length, geometrySamples, paintSamples, coloredSamples, transported };
}
