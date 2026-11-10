// Copyright 2023 Im-Beast. MIT license.
import { extractMermaidScene } from "../../../src/content/mermaid_scene.ts";
import { renderMermaidNativeFrame } from "../../../src/content/mermaid_cells.ts";
import { projectMermaidScene } from "../../../src/content/mermaid_animation.ts";

/** Independent decoded SVG paint for host-space strokes and every fill/stroke/marker permutation. */
export async function verifyMermaidStrokeEffects(): Promise<{
  cases: number;
  paintSamples: number;
  coloredSamples: number;
  transported: number;
  animationSamples: number;
  budgetCases: number;
}> {
  const cases: { name: string; body: string; box?: string; opacity?: string }[] = [];
  for (
    const [name, transform] of [
      ["scaled", "translate(10 5) scale(2 1.5)"],
      ["skewed", "translate(30 5) skewX(25) scale(1.5 .75)"],
      ["reflected", "translate(220 5) scale(-2 1.5)"],
    ]
  ) {
    for (const cap of ["butt", "round", "square"]) {
      cases.push({
        name: `fixed-${name}-${cap}`,
        body: `<path d="M20 65 L45 20 L90 65" transform="${transform}"
        fill="none" stroke="#2850a0" stroke-width="12" stroke-linecap="${cap}" stroke-linejoin="round"
        stroke-dasharray="18 12" stroke-dashoffset="-7" vector-effect="non-scaling-stroke"/>`,
      });
    }
  }
  for (const box of ["0 0 120 90", "0 0 80 180"]) {
    cases.push({
      name: `fixed-root-${box}`,
      box,
      body: `<path d="M15 25 H65 V65" fill="none" stroke="#2850a0"
      stroke-width="10" vector-effect="non-scaling-stroke" stroke-dasharray="12 8" stroke-linecap="square"/>`,
    });
    cases.push({
      name: `fixed-calibration-${box}`,
      box,
      body: `<path d="M15 25 H65 V65" fill="none" stroke="#2850a0"
      stroke-width="10" vector-effect="non-scaling-stroke" pathLength="45" stroke-dasharray="8 6"
      stroke-dashoffset="3" stroke-linecap="round"/>`,
    });
  }
  cases.push(
    {
      name: "fixed-curved-calibration",
      body: `<path d="M25 75 C35 10 90 10 100 75" transform="translate(0 5) scale(2 1.7)"
      fill="none" stroke="#2850a0" stroke-width="12" vector-effect="non-scaling-stroke" pathLength="80"
      stroke-dasharray="10 7" stroke-dashoffset="-2" stroke-linecap="round" stroke-linejoin="round"/>`,
    },
    {
      name: "fixed-arc-calibration",
      body: `<path d="M30 65 A40 30 25 0 1 100 65" transform="translate(0 5) scale(1.8 1.4)"
      fill="none" stroke="#2850a0" stroke-width="12" vector-effect="non-scaling-stroke" pathLength="50"
      stroke-dasharray="12 7" stroke-linecap="round"/>`,
    },
    {
      name: "fixed-circle",
      body: `<circle cx="65" cy="55" r="35" transform="scale(1.8 1.6)" fill="none"
      stroke="#2850a0" stroke-width="12" vector-effect="non-scaling-stroke" stroke-dasharray="20 12"/>`,
    },
    {
      name: "fixed-disconnected",
      body: `<path d="M20 30 H90 M20 70 H90" transform="scale(2 1.5)" fill="none"
      stroke="#2850a0" stroke-width="12" vector-effect="non-scaling-stroke" stroke-dasharray="18 12"/>`,
    },
    {
      name: "fixed-zero-dot",
      body: `<path d="M50 50 L50 50" transform="scale(2 1.5)" fill="none"
      stroke="#2850a0" stroke-width="12" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`,
    },
  );
  const marker = `<defs><marker id="m" markerUnits="userSpaceOnUse" markerWidth="32" markerHeight="32"
    refX="16" refY="16" orient="0" overflow="visible"><rect x="0" y="0" width="32" height="32" fill="#a040e0"/></marker></defs>`;
  for (
    const order of [
      "normal",
      "fill stroke markers",
      "fill markers stroke",
      "stroke fill markers",
      "stroke markers fill",
      "markers fill stroke",
      "markers stroke fill",
      "stroke",
      "markers",
      "fill markers",
    ]
  ) {
    cases.push({
      name: `paint-${order}`,
      opacity: ".7",
      body: `${marker}<path d="M55 50 H180 V135 H55 Z" fill="#40c080"
      fill-opacity=".6" stroke="#e05030" stroke-opacity=".8" stroke-width="18" marker-start="url(#m)"
      paint-order="${order}"/>`,
    });
  }
  for (const units of ["userSpaceOnUse", "strokeWidth"]) {
    cases.push({
      name: `fixed-marker-${units}`,
      body: `<defs><marker id="m" markerUnits="${units}" markerWidth="3"
      markerHeight="3" refX="1.5" refY="1.5" orient="auto" overflow="visible"><path d="M0 0 L3 1.5 L0 3 Z"
      fill="#a040e0"/></marker></defs><path d="M25 50 H95" transform="scale(2 1.6)" fill="none" stroke="#2850a0"
      stroke-width="10" vector-effect="non-scaling-stroke" marker-end="url(#m)"/>`,
    });
  }
  let paintSamples = 0, coloredSamples = 0, transported = 0;
  for (const fixed of [false, true]) {
    for (const cap of ["butt", "round", "square"]) {
      for (const dash of ["8 4", "0 12", "10% 7%"]) {
        cases.push({
          name: `zero-pathLength-${fixed}-${cap}-${dash}`,
          body: `<path d="M20 40 H100" transform="scale(2 2)"
      fill="none" stroke="#2850a0" stroke-width="8" stroke-dasharray="${dash}" stroke-dashoffset="-4" pathLength="0"
      stroke-linecap="${cap}" ${fixed ? 'vector-effect="non-scaling-stroke"' : ""}/>`,
        });
      }
    }
  }
  cases.push({
    name: "fixed-calibrated-percentages",
    box: "0 0 120 90",
    body: `<path d="M20 25 H90 V65" fill="none"
    stroke="#2850a0" stroke-width="8%" stroke-dasharray="9% 6%" stroke-dashoffset="3%" pathLength="45"
    vector-effect="non-scaling-stroke"/>`,
  });
  cases.push(
    {
      name: "fixed-percentages",
      box: "0 0 120 90",
      body: `<path d="M20 25 H90 V65" fill="none" stroke="#2850a0"
      stroke-width="8%" stroke-dasharray="9% 6%" stroke-dashoffset="3%" vector-effect="non-scaling-stroke"/>`,
    },
    {
      name: "fixed-nested-viewport",
      body: `<svg x="25" y="25" width="180" height="120" viewBox="0 0 90 60"
      preserveAspectRatio="none"><path d="M15 15 H75 V45" fill="none" stroke="#2850a0" stroke-width="10"
      stroke-dasharray="18 10" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`,
    },
    {
      name: "inherited-stroke-before-fill",
      body: `<g paint-order="stroke"><rect x="45" y="40" width="145" height="100"
      fill="#40c080" fill-opacity=".6" stroke="#e05030" stroke-width="18"/></g>`,
    },
  );
  for (
    const [name, transform, box] of [
      ["diagonal", "scale(1.7 1.4)", "0 0 240 180"],
      ["skew", "skewX(25) scale(1.7 1.3)", "0 0 240 180"],
      ["reflection", "translate(230 0) scale(-1.8 1.3)", "0 0 240 180"],
      ["root", "scale(.8 .7)", "0 0 120 90"],
    ]
  ) {
    cases.push({
      name: `fixed-marker-${name}`,
      box,
      body: `<defs><marker id="m" markerUnits="strokeWidth" markerWidth="3"
      markerHeight="3" refX="1.5" refY="1.5" orient="auto-start-reverse" overflow="visible"><path d="M0 0 L3 1.5 L0 3 Z"
      fill="#a040e0"/></marker></defs><path d="M25 30 L90 70" transform="${transform}" fill="none" stroke="#2850a0"
      stroke-width="10" vector-effect="non-scaling-stroke" marker-start="url(#m)" marker-end="url(#m)"/>`,
    });
  }
  for (const fixture of cases) {
    const before = document.body.children.length;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:0";
    host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="${
      fixture.box ?? "0 0 240 180"
    }"
      preserveAspectRatio="none"><g opacity="${fixture.opacity ?? ".7"}">${fixture.body}</g></svg>`;
    document.body.append(host);
    const svg = host.querySelector("svg")!;
    const original = svg.outerHTML;
    const canvas = document.createElement("canvas"), color = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 180;
    color.width = color.height = 1;
    const context = canvas.getContext("2d")!, colors = color.getContext("2d")!;
    let url: string | undefined;
    try {
      const scene = extractMermaidScene(svg);
      if (
        fixture.name.startsWith("zero-pathLength") &&
        scene.items.some((item) => item.kind === "path" && item.paint.dash.length)
      ) {
        throw new Error("Zero pathLength retained dashes instead of the owning browser's solid paint");
      }
      if (scene.diagnostics.some((message) => /non-scaling|paint.order/.test(message))) {
        throw new Error(`Stroke effect remained diagnosed instead of rendered: ${fixture.name}`);
      }
      const box = svg.viewBox.baseVal;
      const sx = 240 / box.width, sy = 180 / box.height;
      const options = { columnUnits: 2 / sx, rowUnits: 2 / sy, background: "black" };
      const frame = renderMermaidNativeFrame(scene, options);
      if (
        JSON.stringify(frame) !== JSON.stringify(renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene)), options))
      ) {
        throw new Error(`Stroke effects lost JSON metrics/order: ${fixture.name}`);
      }
      transported++;
      if (svg.outerHTML !== original) throw new Error(`Stroke effect extraction changed source: ${fixture.name}`);
      const reference = svg.cloneNode(true) as SVGSVGElement;
      reference.setAttribute("viewBox", `${box.x - .5 / sx} ${box.y - .5 / sy} ${box.width} ${box.height}`);
      url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(reference)], { type: "image/svg+xml" }),
      );
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Cannot decode stroke effect oracle"));
        image.src = url!;
      });
      context.fillStyle = "black";
      context.fillRect(0, 0, 240, 180);
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, 240, 180).data;
      const cache = new Map<string, number[]>();
      let colored = 0;
      for (let row = 2; row < 88; row++) {
        for (let column = 2; column < 118; column++) {
          const x = column * 2, y = row * 2;
          const expected = [...pixels.slice((y * 240 + x) * 4, (y * 240 + x) * 4 + 4)];
          // Fill samples use cell centers; strokes use foreground origins. Reject
          // edges unstable across either sample, rather than calling antialiasing exact.
          if (
            ![[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]].every(([dx, dy]) => {
              const offset = ((y + dy!) * 240 + x + dx!) * 4;
              return expected.every((value, channel) => Math.abs(value - pixels[offset + channel]!) <= 4);
            })
          ) continue;
          const cell = frame.cells[row]![column]!;
          const paint = cell.char === "█" ? cell.foreground ?? cell.background ?? "black" : cell.background ?? "black";
          let actual = cache.get(paint);
          if (!actual) {
            colors.clearRect(0, 0, 1, 1);
            colors.fillStyle = paint;
            colors.fillRect(0, 0, 1, 1);
            actual = [...colors.getImageData(0, 0, 1, 1).data];
            cache.set(paint, actual);
          }
          if (!actual.every((value, channel) => Math.abs(value - expected[channel]!) <= 5)) {
            throw new Error(`Stroke effect paint mismatch ${fixture.name} at ${x},${y}: ${actual} versus ${expected}`);
          }
          paintSamples++;
          if (expected.slice(0, 3).some((value) => value > 10)) {
            colored++;
            coloredSamples++;
          }
        }
      }
      if (colored < (fixture.name === "fixed-zero-dot" ? 5 : 25)) {
        throw new Error(`Empty stroke effect oracle: ${fixture.name}`);
      }
    } finally {
      if (url) URL.revokeObjectURL(url);
      canvas.width =
        canvas.height =
        color.width =
        color.height =
          0;
      host.remove();
    }
    if (document.body.children.length !== before) throw new Error(`Stroke effect host leaked: ${fixture.name}`);
  }
  const { animationSamples, budgetCases } = verifyStrokeEffectOwnership();
  return { cases: cases.length, paintSamples, coloredSamples, transported, animationSamples, budgetCases };
}

function verifyStrokeEffectOwnership(): { animationSamples: number; budgetCases: number } {
  const before = document.body.children.length;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0";
  document.body.append(host);
  let animationSamples = 0, budgetCases = 0;
  try {
    host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 120 90">
      <defs><marker id="m" markerWidth="4" markerHeight="4" refX="2" refY="2" markerUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="purple"/></marker></defs><path d="M20 20 H90 V65 H20 Z" fill="green" stroke="red"
      stroke-width="10" stroke-dasharray="12 8" vector-effect="non-scaling-stroke" paint-order="stroke markers fill"
      pathLength="100" marker-start="url(#m)"/></svg>`;
    const svg = host.querySelector("svg")!, path = svg.querySelector("svg > path")! as SVGPathElement;
    const animation = path.animate([
      { strokeDashoffset: "0", fillOpacity: .2, strokeOpacity: .3, opacity: .4 },
      { strokeDashoffset: "20", fillOpacity: .8, strokeOpacity: .9, opacity: 1 },
    ], { duration: 1000, fill: "both" });
    try {
      const original = svg.outerHTML;
      const frames = JSON.stringify((animation.effect as KeyframeEffect).getKeyframes());
      const scene = extractMermaidScene(svg);
      if (
        svg.outerHTML !== original || JSON.stringify((animation.effect as KeyframeEffect).getKeyframes()) !== frames
      ) {
        throw new Error("Split paint capture changed source animation/markup");
      }
      const operations = scene.items.filter((item) => item.kind === "path" && item.strokeDistances);
      if (
        operations.length !== 2 || operations[0]!.kind !== "path" || operations[1]!.kind !== "path" ||
        operations[0]!.paintOrder?.join() !== "stroke" || operations[1]!.paintOrder?.join() !== "fill"
      ) {
        throw new Error("Animated markers did not remain between split stroke/fill operations");
      }
      animation.pause();
      const ratio = path.getTotalLength() / 100;
      let first = "", changed = false;
      for (const time of [0, 125, 250, 500, 750, 1000]) {
        animation.currentTime = time;
        const css = getComputedStyle(path), projected = projectMermaidScene(scene, time);
        for (const item of projected.items.filter((item) => item.kind === "path" && item.strokeDistances)) {
          if (item.kind !== "path") continue;
          for (
            const [actual, expected] of [[item.paint.dashOffset!, Number.parseFloat(css.strokeDashoffset) * ratio], [
              item.paint.fillOpacity!,
              Number(css.fillOpacity),
            ], [item.paint.strokeOpacity!, Number(css.strokeOpacity)]]
          ) {
            if (Math.abs(actual! - expected!) > 1e-3) throw new Error("Split host-stroke animation target mismatch");
            animationSamples++;
          }
        }
        if (!projected.composites?.some((group) => Math.abs(group.opacity - Number(css.opacity)) < 1e-3)) {
          throw new Error("Split paint operations lost shared animated opacity");
        }
        animationSamples++;
        const frame = renderMermaidNativeFrame(scene, { timeMs: time, background: "black" });
        if (
          JSON.stringify(frame) !== JSON.stringify(renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene)), {
            timeMs: time,
            background: "black",
          }))
        ) throw new Error("Split animation lost portable stroke metrics/order");
        const signature = JSON.stringify(frame.cells);
        if (!first) first = signature;
        else changed ||= first !== signature;
      }
      if (!changed) throw new Error("Split paint animation did not affect native cells");
    } finally {
      animation.cancel();
    }
    for (
      const content of [
        `<path d="${"M1 1 L2 2 ".repeat(4097)}" vector-effect="non-scaling-stroke" stroke="red"/>`,
        `<defs><marker id="m"><path d="M0 0 L1 1"/></marker></defs><polyline points="${"1,1 2,2 ".repeat(1026)}"
        stroke="red" paint-order="stroke markers fill" marker-mid="url(#m)"/>`,
      ]
    ) {
      host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180">${content}</svg>`;
      const svg = host.querySelector("svg")!, original = svg.outerHTML;
      let rejected = false;
      try {
        extractMermaidScene(svg);
      } catch (error) {
        if (!(error instanceof RangeError) || !/budget/.test(error.message)) throw error;
        rejected = true;
      }
      if (!rejected || svg.outerHTML !== original) throw new Error("Stroke effect budget refusal/ownership failed");
      budgetCases++;
    }
    host.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><path d="M20 40 H200" stroke="red" stroke-width="12" vector-effect="non-scaling-stroke"/></svg>';
    if (
      !renderMermaidNativeFrame(extractMermaidScene(host.querySelector("svg")!)).cells.flat().some((cell) =>
        cell.char === "█"
      )
    ) {
      throw new Error("Stroke effects did not recover after budget refusal");
    }
  } finally {
    host.remove();
  }
  if (document.body.children.length !== before) throw new Error("Stroke effect ownership probes leaked DOM");
  return { animationSamples, budgetCases };
}
