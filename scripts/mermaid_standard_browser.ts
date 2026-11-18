// Copyright 2023 Im-Beast. MIT license.
/** Isolated browser conformance probe; no writes to the preview or the maintainer's desktop. */
import * as esbuild from "esbuild";
import { Buffer } from "node:buffer";
import { dirname, resolve } from "node:path";
import { type Browser, chromium, type Page } from "playwright";
import { PNG } from "pngjs";
import { runtimeHost } from "../src/runtime/host.ts";
import { browserRuntimeHostStub } from "../src/runtime/bun_browser_bundle.ts";
import { MERMAID_STANDARD_FIXTURES } from "../tests/fixtures/mermaid_standard/catalogue.ts";
import { MERMAID_SCENE_FIXTURES } from "../tests/fixtures/mermaid_standard/scenes.ts";
import {
  FILTER_REFERENCE_CASES,
  MARKER_REFERENCE_CASES,
  SVG_REFERENCE_CASES,
} from "../tests/fixtures/mermaid_standard/filter_references.ts";
import { MERMAID_MATH_FENCES, MERMAID_MATH_FIXTURES } from "../tests/fixtures/mermaid_standard/math.ts";
import { MERMAID_ICON_DATA, MERMAID_ICON_FIXTURES } from "../tests/fixtures/mermaid_standard/icons.ts";
import {
  semanticAXGeneratedTextQuirk,
  semanticAXMetadata,
  semanticAXTree,
} from "../tests/fixtures/mermaid_standard/semantic_ax.ts";

const root = new URL("..", import.meta.url).pathname;
const findPackageJSON = runtimeHost.runtime === "deno" ? (await import("node:module")).findPackageJSON : undefined;
const outputRoot = resolve(root, ".mermaid-conformance-assets");
const build = await esbuild.build({
  entryPoints: [
    resolve(root, "mod.mermaid.ts"),
    resolve(root, "mod.document.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/lifecycle.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/grammar.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/zenuml_dom.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/zenuml_parser.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/filter_references.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/interactions.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/animations.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/flow_features.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/accessibility.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/semantics.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/stroke_outlines.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/stroke_effects.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/stroke_features.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/text_layout.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/text_bidi.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/text_decoration.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/wide_cells.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/text_transform.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/math.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/svg_browser.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/quotes.ts"),
    resolve(root, "tests/fixtures/mermaid_standard/quote_context.ts"),
  ],
  outdir: outputRoot,
  bundle: true,
  splitting: true,
  format: "esm",
  target: "es2022",
  write: false,
  plugins: runtimeHost.runtime === "bun" ? [browserRuntimeHostStub] : [{
    name: "deno-npm-resolution",
    setup(build) {
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        // Deno keeps npm packages in its cache, not a repo node_modules tree.
        // Resolve each dependency from its real importing package.
        const name = args.path.startsWith("@") ? args.path.split("/").slice(0, 2).join("/") : args.path.split("/")[0]!;
        const metadata = findPackageJSON?.(name, args.importer || import.meta.url);
        if (!metadata) throw new Error(`Cannot resolve browser package ${args.path}`);
        const pkg = JSON.parse(runtimeHost.readTextFileSync(metadata));
        const subpath = args.path === name ? "." : `.${args.path.slice(name.length)}`;
        const conditions = new Set(["browser", "default", args.kind === "require-call" ? "require" : "import"]);
        const select = (entry: unknown): string | undefined => {
          if (typeof entry === "string") return entry;
          if (Array.isArray(entry)) return entry.map(select).find(Boolean);
          if (entry && typeof entry === "object") {
            for (const [condition, target] of Object.entries(entry)) {
              if (conditions.has(condition)) {
                const selected = select(target);
                if (selected) return selected;
              }
            }
          }
        };
        let target: string | undefined;
        if (pkg.exports) {
          if (typeof pkg.exports === "object" && Object.keys(pkg.exports).some((key) => key.startsWith("."))) {
            target = select(pkg.exports[subpath]);
            if (!target) {
              for (const [pattern, entry] of Object.entries(pkg.exports)) {
                const [prefix, suffix] = pattern.split("*");
                if (suffix !== undefined && subpath.startsWith(prefix!) && subpath.endsWith(suffix)) {
                  target = select(entry)?.replaceAll(
                    "*",
                    subpath.slice(prefix!.length, subpath.length - suffix.length),
                  );
                  if (target) break;
                }
              }
            }
          } else if (subpath === ".") target = select(pkg.exports);
          if (!target) throw new Error(`No browser export for ${args.path}`);
        } else {
          target = subpath !== "."
            ? subpath
            : typeof pkg.browser === "string"
            ? pkg.browser
            : pkg.module ?? pkg.main ?? "index.js";
        }
        return { path: resolve(dirname(metadata), target!) };
      });
    },
  }],
});
esbuild.stop();
const assets = new Map(build.outputFiles!.map((file) => [file.path.slice(outputRoot.length), file.contents]));
const server = runtimeHost.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, (request) => {
  const path = new URL(request.url).pathname;
  if (path === "/" || path === "/zenuml-worker-denied") {
    return new Response("<!doctype html><title>Mermaid conformance</title>", {
      headers: {
        "content-type": "text/html",
        ...path === "/zenuml-worker-denied"
          ? {
            "content-security-policy":
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:; worker-src 'none'",
          }
          : {},
      },
    });
  }
  const asset = assets.get(path);
  return asset
    ? new Response(new Uint8Array(asset), { headers: { "content-type": "text/javascript" } })
    : new Response("Not found", { status: 404 });
});
const executablePath = runtimeHost.env.get("EXOTUI_CHROMIUM") ?? "/snap/bin/chromium";
let browser: Browser | undefined;
const failures: string[] = [];
async function verifyDetachedInkPage(page: Page) {
  let cases = 0, unchangedPixels = 0;
  for (const size of [24, 36]) {
    for (const weight of ["normal", "bold"]) {
      for (const style of ["normal", "italic"]) {
        for (const profile of ["normal", "viewbox", "zoom", "scale"]) {
          await page.evaluate(
            async ({ size, weight, style, profile }) =>
              (await import("/tests/fixtures/mermaid_standard/text_transform.js")).mountMermaidDetachedInkOriginal(
                size,
                weight,
                style,
                profile,
              ),
            { size, weight, style, profile },
          );
          try {
            const clip = { x: 0, y: 0, width: 700, height: 240 };
            const original = PNG.sync.read(await page.screenshot({ clip }));
            const capture = await page.evaluate(async () =>
              (await import("/tests/fixtures/mermaid_standard/text_transform.js")).captureMermaidDetachedInkOriginal()
            );
            const after = PNG.sync.read(await page.screenshot({ clip }));
            await page.evaluate(() => {
              const token = document.querySelector("#detached-ink-original-control mtext")!;
              token.textContent = token.textContent!.slice(0, -1);
            });
            const without = PNG.sync.read(await page.screenshot({ clip }));
            let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, changed = 0;
            for (let y = 0; y < original.height; y++) {
              for (let x = 0; x < original.width; x++) {
                const index = (y * original.width + x) * 4;
                if (original.data[index] !== after.data[index]) changed++;
                if (original.data[index] !== without.data[index]) {
                  left = Math.min(left, x);
                  top = Math.min(top, y);
                  right = Math.max(right, x + 1);
                  bottom = Math.max(bottom, y + 1);
                }
              }
            }
            if (changed || !capture.unchanged) {
              throw new Error("Ink capture changed original paint or source");
            }
            unchangedPixels++;
            const bounds = capture.bounds, viewport = capture.viewport;
            const scaleX = profile === "viewbox" ? 2 : profile === "zoom" ? 1.5 : profile === "scale" ? 1.25 : 1;
            const scaleY = profile === "viewbox" ? 2 : profile === "zoom" || profile === "scale" ? 1.5 : 1;
            // Font metrics bound the vector ink. Independent original pixels can
            // include one local antialiased edge pixel before SVG/CSS scaling.
            if (
              !Number.isFinite(left) || Math.abs(left - Math.max(bounds.left, viewport.left)) > scaleX + .05 ||
              Math.abs(right - Math.min(bounds.right, viewport.right)) > scaleX + .05 ||
              Math.abs(top - Math.max(bounds.top, viewport.top)) > scaleY + .05 ||
              Math.abs(bottom - Math.min(bounds.bottom, viewport.bottom)) > scaleY + .05
            ) {
              throw new Error(
                `Detached ink differs from original paint: ${
                  JSON.stringify({
                    size,
                    weight,
                    style,
                    profile,
                    bounds,
                    viewport,
                    pixels: { left, top, right, bottom },
                  })
                }`,
              );
            }
            cases++;
          } finally {
            await page.evaluate(() => document.querySelector("#detached-ink-original-control")?.remove());
          }
        }
      }
    }
  }
  return { cases, unchangedPixels };
}
async function verifyBidiPage(page: Page) {
  let originalPixels = 0;
  for (let index = 0; index < 7; index++) {
    const path = "/tests/fixtures/mermaid_standard/text_bidi.js";
    const reference = await page.evaluate(
      async ({ path, index }) => (await import(path)).mountMermaidBidiOriginal(index),
      { path, index },
    );
    try {
      const original = PNG.sync.read(await page.screenshot());
      const changed = (other: PNG) => {
        let pixels = 0;
        for (let at = 0; at < original.data.length; at += 4) {
          if (
            original.data.subarray(at, at + 4).some((byte: number, offset: number) => byte !== other.data[at + offset])
          ) pixels++;
        }
        return pixels;
      };
      await page.evaluate(async ({ path, value }) => (await import(path)).replaceMermaidBidiOriginal(value), {
        path,
        value: reference.mirrored,
      });
      const mirrored = changed(PNG.sync.read(await page.screenshot()));
      await page.evaluate(async ({ path, value }) => (await import(path)).replaceMermaidBidiOriginal(value), {
        path,
        value: reference.reversed,
      });
      const unmirrored = changed(PNG.sync.read(await page.screenshot()));
      if (mirrored !== 0 || unmirrored === 0) {
        throw new Error(`Original bidi glyph pixels differ: ${JSON.stringify({ reference, mirrored, unmirrored })}`);
      }
      originalPixels += unmirrored;
    } finally {
      await page.evaluate(async (path) => (await import(path)).disposeMermaidBidiOriginal(), path);
    }
  }
  let clusterPixels = 0, clusterControls = 0;
  const path = "/tests/fixtures/mermaid_standard/text_bidi.js";
  for (let index = 0; index < 5; index++) {
    for (const html of [true, false]) {
      for (const secondFont of [false, true]) {
        const reference = await page.evaluate(
          async ({ path, index, html, secondFont }) =>
            (await import(path)).mountMermaidClusterOriginal(index, html, secondFont),
          { path, index, html, secondFont },
        );
        try {
          const { box } = reference;
          // Only pixels wholly inside the scalar box: rounding outward includes
          // adjacent glyphs and is not evidence about this bracket's own ink.
          const clip = {
            x: Math.ceil(box.x),
            y: Math.ceil(box.y),
            width: Math.floor(box.x + box.width) - Math.ceil(box.x),
            height: Math.floor(box.y + box.height) - Math.ceil(box.y),
          };
          const original = PNG.sync.read(await page.screenshot({ clip }));
          const changes = async (ink: string) => {
            await page.evaluate(
              async ({ path, reference, ink }) => (await import(path)).replaceMermaidClusterOriginal(reference, ink),
              { path, reference, ink },
            );
            const candidate = PNG.sync.read(await page.screenshot({ clip }));
            let changed = 0;
            for (let at = 0; at < original.data.length; at += 4) {
              if (
                original.data.subarray(at, at + 4).some((value: number, offset: number) =>
                  value !== candidate.data[at + offset]
                )
              ) changed++;
            }
            return changed;
          };
          const correct = await changes(reference.correct), wrong = await changes(reference.wrong);
          if (correct || !wrong) {
            throw new Error(`Original cluster base ink differs: ${JSON.stringify({ reference, correct, wrong })}`);
          }
          clusterPixels += wrong;
          clusterControls++;
        } finally {
          await page.evaluate(async (path) => (await import(path)).disposeMermaidBidiOriginal(), path);
        }
      }
    }
  }
  return await page.evaluate(async ({ originalPixels, clusterPixels, clusterControls }) => {
    const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
    const probe = await import(
      "/tests/fixtures/mermaid_standard/text_bidi.js"
    ) as typeof import("../tests/fixtures/mermaid_standard/text_bidi.ts");
    const transport = await import(
      "/tests/fixtures/mermaid_standard/flow_features.js"
    ) as typeof import("../tests/fixtures/mermaid_standard/flow_features.ts");
    const dom = probe.verifyMermaidBidiDOM();
    const guards = probe.verifyMermaidBidiGuards();
    const anchors = probe.verifyMermaidBidiAnchors();
    const affinity = probe.verifyMermaidBidiAffinity();
    const clusters = probe.verifyMermaidBidiClusters();
    const renderer = await module.createMermaidStandardRenderer();
    let result: Awaited<ReturnType<typeof probe.verifyMermaidBidiFeatures>>;
    try {
      result = await probe.verifyMermaidBidiFeatures(renderer);
    } finally {
      renderer.dispose();
    }
    const { retained, ...stats } = result;
    return {
      ...stats,
      originalPixels,
      clusterPixels,
      clusterControls,
      clusters,
      dom,
      guards,
      anchors,
      affinity,
      transport: await transport.verifyMermaidFlowTransport(retained),
    };
  }, { originalPixels, clusterPixels, clusterControls });
}
async function verifyRadicalOriginalPage(page: Page) {
  let cases = 0, differencePixels = 0;
  for (const font of ["monospace", '"Liberation Mono",monospace']) {
    for (const height of [18, 60]) {
      const boxes = await page.evaluate(({ font, height }) => {
        const host = document.createElement("div");
        host.id = "radical-original-control";
        host.style.cssText = "position:absolute;left:0;top:0;background:white";
        host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">' +
          `<foreignObject x="20" y="20" width="350" height="150"><math style='font:48px ${font};direction:ltr;color:black'><msqrt><mspace width="32px" height="${height}px" depth="4px"></mspace></msqrt></math></foreignObject></svg>`;
        document.body.append(host);
        const root = host.querySelector("msqrt")!, base = host.querySelector("mspace")!;
        const a = root.getBoundingClientRect(), b = base.getBoundingClientRect();
        const width = Math.floor(b.left - a.left);
        if (!(width > 0)) throw new Error("Original radical control has no glyph region");
        return {
          ltr: { x: a.left, y: a.top, width, height: Math.ceil(a.height) },
          rtl: { x: a.left + b.width, y: a.top, width, height: Math.ceil(a.height) },
        };
      }, { font, height });
      try {
        const ltr = PNG.sync.read(await page.screenshot({ clip: boxes.ltr }));
        await page.evaluate(() => document.querySelector("#radical-original-control math")!.setAttribute("dir", "rtl"));
        // Override the authored direction too; the MathML dir attribute is only a presentational hint.
        await page.evaluate(() =>
          (document.querySelector("#radical-original-control math") as HTMLElement).style.direction = "rtl"
        );
        const rtl = PNG.sync.read(await page.screenshot({ clip: boxes.rtl }));
        if (ltr.width !== rtl.width || ltr.height !== rtl.height) {
          throw new Error("Original radical control changed size");
        }
        let correct = 0, wrong = 0, ink = 0;
        for (let y = 0; y < ltr.height; y++) {
          for (let x = 0; x < ltr.width; x++) {
            const at = (y * ltr.width + x) * 4, mirrored = (y * ltr.width + ltr.width - 1 - x) * 4;
            if (ltr.data[at]! < 250) ink++;
            if (ltr.data.subarray(at, at + 4).some((value: number, i: number) => value !== rtl.data[at + i])) correct++;
            if (ltr.data.subarray(at, at + 4).some((value: number, i: number) => value !== rtl.data[mirrored + i])) {
              wrong++;
            }
          }
        }
        if (!ink || correct || !wrong) {
          throw new Error(
            `Original radical glyph profile changed: ${JSON.stringify({ font, height, ink, correct, wrong })}`,
          );
        }
        differencePixels += wrong;
        cases++;
      } finally {
        await page.evaluate(() => document.querySelector("#radical-original-control")!.remove());
      }
    }
  }
  return { cases, differencePixels };
}

async function verifyRadicalPage(page: Page) {
  const pixels = await verifyRadicalOriginalPage(page);
  return await page.evaluate(async (pixels) => {
    const module = await import("/mod.mermaid.js"), probe = await import("/tests/fixtures/mermaid_standard/math.js");
    const dom = probe.verifyMermaidRadicalDOM(), renderer = await module.createMermaidStandardRenderer();
    let result;
    try {
      result = await probe.verifyMermaidRadicals(renderer);
    } finally {
      renderer.dispose();
    }
    const transport = await import("/tests/fixtures/mermaid_standard/flow_features.js");
    return { pixels, dom, cases: result.cases, transport: await transport.verifyMermaidFlowTransport(result.retained) };
  }, pixels);
}

async function verifyOperatorOriginalPage(page: Page) {
  let cases = 0, differencePixels = 0, accentCases = 0;
  for (const font of ["monospace", '"Liberation Mono",monospace', '"DejaVu Serif",serif']) {
    for (const { left, right } of MERMAID_MATH_FENCES) {
      const setup = async (direction: string, first: string, last: string) =>
        await page.evaluate(({ font, direction, first, last }) => {
          const host = document.createElement("div");
          host.id = "operator-original-control";
          host.style.cssText = "position:absolute;left:0;top:0;background:white";
          host.innerHTML =
            `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="270"><foreignObject x="20" y="25" width="400" height="240"><math style='font:48px ${font};direction:${direction};color:black'><mrow><mo>${first}</mo><mspace width="32px" height="96px" depth="4px"></mspace><mo>${last}</mo></mrow></math></foreignObject></svg>`;
          document.body.append(host);
          const mo = [...host.querySelectorAll("mo")].sort((a, b) =>
            a.getBoundingClientRect().left - b.getBoundingClientRect().left
          )[0]!;
          const box = mo.getBoundingClientRect();
          return {
            source: mo.textContent,
            clip: {
              x: Math.floor(box.left),
              y: Math.floor(box.top),
              width: Math.ceil(box.width),
              height: Math.ceil(box.height) + 1,
            },
          };
        }, { font, direction, first, last });
      const remove = () => page.evaluate(() => document.querySelector("#operator-original-control")?.remove());
      try {
        const a = await setup("ltr", left, right), ltr = PNG.sync.read(await page.screenshot({ clip: a.clip }));
        await remove();
        const b = await setup("rtl", left, right), rtl = PNG.sync.read(await page.screenshot({ clip: b.clip }));
        await remove();
        // The wrong glyph's MATH variant may have different metrics. Compare
        // its paint in the same original-sized region, not a scaled bitmap.
        const c = await setup("ltr", right, left),
          wrong = PNG.sync.read(
            await page.screenshot({ clip: { ...c.clip, width: b.clip.width, height: b.clip.height } }),
          );
        if (
          a.source !== left || b.source !== right || c.source !== right || ltr.width !== rtl.width ||
          ltr.height !== rtl.height || wrong.width !== rtl.width || wrong.height !== rtl.height
        ) {
          throw new Error(
            `Original operator pixel geometry changed: ${JSON.stringify({ font, left, right, a, b, c })}`,
          );
        }
        let correct = 0, incorrect = 0, ink = 0;
        for (let at = 0; at < rtl.data.length; at += 4) {
          if (rtl.data[at]! < 250) ink++;
          if (rtl.data.subarray(at, at + 4).some((byte: number, offset: number) => byte !== ltr.data[at + offset])) {
            correct++;
          }
          if (rtl.data.subarray(at, at + 4).some((byte: number, offset: number) => byte !== wrong.data[at + offset])) {
            incorrect++;
          }
        }
        if (correct || !incorrect || !ink) {
          throw new Error(
            `Original operator mirror pixels differ: ${JSON.stringify({ font, left, right, correct, incorrect, ink })}`,
          );
        }
        differencePixels += incorrect;
        cases++;
      } finally {
        await remove();
      }
    }
  }
  for (const font of ["monospace", '"Liberation Mono",monospace', '"DejaVu Serif",serif']) {
    for (const direction of ["ltr", "rtl"]) {
      const reference = await page.evaluate(
        async ({ font, direction }) =>
          (await import("/tests/fixtures/mermaid_standard/math.js")).mountMermaidAccentOriginal(font, direction),
        {
          font,
          direction,
        },
      );
      try {
        const png = PNG.sync.read(await page.screenshot({ clip: reference.clip }));
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        for (let y = 0; y < png.height; y++) {
          for (let x = 0; x < png.width; x++) {
            if (png.data[(y * png.width + x) * 4]! < 200) {
              left = Math.min(left, x);
              right = Math.max(right, x + 1);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y + 1);
            }
          }
        }
        const ink = {
          left: left + reference.clip.x,
          right: right + reference.clip.x,
          top: top + reference.clip.y,
          bottom: bottom + reference.clip.y,
        };
        if (
          Object.entries(ink).some(([key, value]) =>
            !Number.isFinite(value) || Math.abs(value - reference.native[key as "left"]) > 2
          ) || reference.native.right - reference.native.left > 20
        ) {
          throw new Error(
            `Zero-advance accent differs from original pixel ink: ${
              JSON.stringify({ font, direction, reference, ink })
            }`,
          );
        }
        accentCases++;
      } finally {
        await page.evaluate(() => document.querySelector("#accent-original-control")!.remove());
      }
    }
  }
  return { cases, differencePixels, accentCases };
}

async function verifyOperatorPage(page: Page) {
  const pixels = await verifyOperatorOriginalPage(page);
  return await page.evaluate(async (pixels) => {
    const module = await import("/mod.mermaid.js"), probe = await import("/tests/fixtures/mermaid_standard/math.js");
    const dom = probe.verifyMermaidOperatorDOM(), renderer = await module.createMermaidStandardRenderer();
    let result;
    try {
      result = await probe.verifyMermaidOperators(renderer);
    } finally {
      renderer.dispose();
    }
    const transport = await import("/tests/fixtures/mermaid_standard/flow_features.js");
    return { pixels, dom, cases: result.cases, transport: await transport.verifyMermaidFlowTransport(result.retained) };
  }, pixels);
}

async function verifyFractionPage(page: Page) {
  let pixelCases = 0, suppressedPixels = 0;
  for (const font of ["monospace", '"Liberation Mono",monospace', '"DejaVu Serif",serif']) {
    for (const direction of ["ltr", "rtl"]) {
      for (const mathStyle of ["compact", "normal"]) {
        for (const profile of ["normal", "viewbox", "unbalanced", "fraction-scale"]) {
          for (const thickness of ["0px", "-2px", "0bad", "4px", "8px", ".1em", "200%"]) {
            const control = await page.evaluate(async ({ font, direction, thickness, profile, mathStyle }) => {
              const probe = await import("/tests/fixtures/mermaid_standard/math.js");
              return probe.mountMermaidFractionOriginal(font, direction, thickness, profile, mathStyle);
            }, { font, direction, thickness, profile, mathStyle });
            try {
              const png = PNG.sync.read(await page.screenshot({ clip: control.clip }));
              let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
              for (let y = 0; y < png.height; y++) {
                for (let x = 0; x < png.width; x++) {
                  const index = (y * png.width + x) * 4;
                  if (png.data[index]! < 200 && png.data[index + 2]! < 200) {
                    left = Math.min(left, x);
                    right = Math.max(right, x + 1);
                    top = Math.min(top, y);
                    bottom = Math.max(bottom, y + 1);
                  }
                }
              }
              if (thickness === "0px" || thickness === "-2px") {
                if (Number.isFinite(left) || control.paths.length) {
                  throw new Error("Original zero-rule fraction acquired paint");
                }
                suppressedPixels++;
              } else {
                if (!Number.isFinite(left) || control.paths.length !== 1) {
                  throw new Error("Original fraction rule is missing");
                }
                const path = control.paths[0]!;
                const screen: { x: number; y: number }[] = await page.evaluate(({ matrix, points }) => {
                  const transform = new DOMMatrix(matrix);
                  return points.map(({ x, y }: { x: number; y: number }) => {
                    const point = new DOMPoint(x, y).matrixTransform(transform);
                    return { x: point.x, y: point.y };
                  });
                }, { matrix: control.screen, points: path.points });
                // Pixel bounds include partially covered edge rows. Measure
                // coverage at the bar's interior so antialiasing does not
                // incorrectly turn a 7.5px transformed rule into a 9px rule.
                const column = Math.floor((left + right) / 2);
                let inkHeight = 0, moment = 0;
                for (let y = 0; y < png.height; y++) {
                  const coverage = 1 - png.data[(y * png.width + column) * 4]! / 255;
                  inkHeight += coverage;
                  moment += coverage * (y + .5);
                }
                const center = control.clip.y + moment / inkHeight;
                // Chromium snaps MathML's fractional bars in local CSS pixels
                // before the SVG transform. Independent before/after controls
                // show a 4.8px bar painted as 4px, or 8px under a 2x viewBox.
                // Bound that host rasterization, not an assumed device-pixel
                // rule; exact authored integer widths have separate DOM checks.
                const localScale = profile === "viewbox" ? 2 : profile === "fraction-scale" ? 1.5 : 1;
                const mismatch = Math.abs(center - screen[0]!.y) > localScale + .25 ||
                  Math.abs(inkHeight - path.paint.strokeWidth) > localScale + .05 ||
                  Math.abs(
                      control.clip.x + left - Math.max(control.viewport.left, Math.min(...screen.map(({ x }) => x))),
                    ) > 1.05 ||
                  Math.abs(
                      control.clip.x + right - Math.min(control.viewport.right, Math.max(...screen.map(({ x }) => x))),
                    ) > 1.05;
                if (mismatch) {
                  throw new Error(
                    `Fraction differs from original pixels: ${
                      JSON.stringify({
                        font,
                        direction,
                        mathStyle,
                        profile,
                        thickness,
                        center,
                        ink: {
                          left: control.clip.x + left,
                          right: control.clip.x + right,
                          top: control.clip.y + top,
                          bottom: control.clip.y + bottom,
                        },
                        inkHeight,
                        path,
                        screen,
                      })
                    }`,
                  );
                }
              }
              pixelCases++;
            } finally {
              await page.evaluate(() => document.querySelector("#fraction-original-control")?.remove());
            }
          }
        }
      }
    }
  }
  return await page.evaluate(async (pixels) => {
    const module = await import("/mod.mermaid.js"), probe = await import("/tests/fixtures/mermaid_standard/math.js");
    const dom = probe.verifyMermaidFractionDOM(), renderer = await module.createMermaidStandardRenderer();
    let result;
    try {
      result = await probe.verifyMermaidFractions(renderer);
    } finally {
      renderer.dispose();
    }
    const transport = await import("/tests/fixtures/mermaid_standard/flow_features.js");
    return { pixels, dom, cases: result.cases, transport: await transport.verifyMermaidFlowTransport(result.retained) };
  }, { cases: pixelCases, suppressed: suppressedPixels });
}

try {
  conformance: {
    browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-gpu"] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    if (runtimeHost.args.includes("--svg-only")) {
      await page.goto(`http://127.0.0.1:${server.addr.port}/`);
      const probe = await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/svg_browser.js")).verifyMermaidSvgBrowser()
      );
      console.log(`ok browser:official-svg ${JSON.stringify(probe)}`);
      break conformance;
    }
    if (runtimeHost.args.includes("--ink-overhang-only")) {
      await page.goto(`http://127.0.0.1:${server.addr.port}/`);
      const probe = await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/wide_cells.js")).verifyBrowserInkOverhang()
      );
      console.log(`ok browser:ink-overhang ${JSON.stringify(probe)}`);
      const planes = await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/wide_cells.js")).verifyBrowserOwnedPlanes()
      );
      console.log(`ok browser:owned-planes ${JSON.stringify(planes)}`);
      break conformance;
    }
    if (runtimeHost.args.includes("--math-fractions-dom-only")) {
      await page.goto(`http://127.0.0.1:${server.addr.port}/`);
      const dom = await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/math.js")).verifyMermaidFractionDOM()
      );
      console.log(`ok browser:math-fractions-dom ${JSON.stringify(dom)}`);
      break conformance;
    }
    if (runtimeHost.args.includes("--math-fractions-only")) {
      await page.goto(`http://127.0.0.1:${server.addr.port}/`);
      console.log(`ok browser:math-fractions ${JSON.stringify(await verifyFractionPage(page))}`);
      break conformance;
    }
    if (runtimeHost.args.includes("--math-operators-only")) {
      await page.goto(`http://127.0.0.1:${server.addr.port}/`);
      console.log(`ok browser:math-operators ${JSON.stringify(await verifyOperatorPage(page))}`);
      break conformance;
    }
    if (runtimeHost.args.includes("--math-radicals-only")) {
      await page.goto(`http://127.0.0.1:${server.addr.port}/`);
      console.log(`ok browser:math-radicals ${JSON.stringify(await verifyRadicalPage(page))}`);
      break conformance;
    }
    if (runtimeHost.args.includes("--text-bidi-only")) {
      await page.goto(`http://127.0.0.1:${server.addr.port}/`);
      console.log(`ok browser:text-bidi ${JSON.stringify(await verifyBidiPage(page))}`);
      break conformance;
    }
    if (runtimeHost.args.includes("--text-transform-only")) {
      await page.goto(`http://127.0.0.1:${server.addr.port}/`);
      console.log(`ok browser:detached-ink-original ${JSON.stringify(await verifyDetachedInkPage(page))}`);
      const dom = await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/text_transform.js")).verifyMermaidTextTransformDOM()
      );
      console.log(`ok browser:text-transform-dom ${JSON.stringify(dom)}`);
      const result = await page.evaluate(async () => {
        const module = await import("/mod.mermaid.js"),
          probe = await import("/tests/fixtures/mermaid_standard/text_transform.js");
        const renderer = await module.createMermaidStandardRenderer();
        let result;
        try {
          result = await probe.verifyMermaidTextTransforms(renderer);
          const math = await probe.verifyMermaidMathTextClusters(renderer);
          result.retained.push(...math.retained);
          result.cases += math.cases;
          const order = await probe.verifyMermaidMathTextOrdering(renderer);
          result.retained.push(...order.retained);
          result.cases += order.cases;
        } finally {
          renderer.dispose();
        }
        const transport = await import("/tests/fixtures/mermaid_standard/flow_features.js");
        const ink = await import("/tests/fixtures/mermaid_standard/wide_cells.js");
        return {
          cases: result.cases,
          transport: await transport.verifyMermaidFlowTransport(result.retained),
          browserInk: await ink.verifyMermaidBrowserInk(result.retained),
        };
      });
      console.log(`ok browser:math-text-clusters ${JSON.stringify(result)}`);
      break conformance;
    }
    let filterReferencePixels = 0;
    let filterReferenceDisposedCells = 0;
    for (let index = 0; index < SVG_REFERENCE_CASES.length; index++) {
      const referencePage = await browser.newPage({ viewport: { width: 320, height: 240 } });
      try {
        await referencePage.goto(`http://127.0.0.1:${server.addr.port}/`);
        const reference = await referencePage.evaluate(async (index) => {
          const path = "/tests/fixtures/mermaid_standard/filter_references.js";
          return (await import(path)).mountFilterReference(index);
        }, index);
        const original = PNG.sync.read(await referencePage.screenshot());
        if (
          reference.native !== reference.expected ||
          JSON.stringify(reference.diagnostics) !== JSON.stringify(reference.expectedDiagnostics) ||
          reference.policy !== "skip-function"
        ) throw new Error(`Filter reference regression: ${JSON.stringify(reference)}`);
        for (const sample of reference.samples) {
          const at = (sample.y * original.width + sample.x) * 4;
          const pixels = [...original.data.subarray(at, at + 3)];
          if (
            JSON.stringify(pixels) !== JSON.stringify(sample.originalExpected) ||
            sample.native !== sample.nativeExpected
          ) {
            throw new Error(`Filter pixels differ (${reference.name}): ${JSON.stringify({ ...sample, pixels })}`);
          }
          filterReferencePixels++;
        }
        filterReferenceDisposedCells += await referencePage.evaluate(async () => {
          const path = "/tests/fixtures/mermaid_standard/filter_references.js";
          return (await import(path)).verifyFilterReferenceDisposal();
        });
      } finally {
        await referencePage.close();
      }
    }
    await page.goto(`http://127.0.0.1:${server.addr.port}/`);
    const filterReferenceBounds = await page.evaluate(async () => {
      const path = "/tests/fixtures/mermaid_standard/filter_references.js";
      return (await import(path)).verifyFilterReferenceBounds();
    });
    console.log(
      `ok browser:filter-references ${
        JSON.stringify({
          cases: FILTER_REFERENCE_CASES.length,
          markerCases: MARKER_REFERENCE_CASES.length,
          totalCases: SVG_REFERENCE_CASES.length,
          pixels: filterReferencePixels,
          disposedCells: filterReferenceDisposedCells,
          bounds: filterReferenceBounds,
        })
      }`,
    );
    if (runtimeHost.args.includes("--filter-references-only")) {
      console.log("ok browser:filter-references-only (not full catalogue coverage)");
      break conformance;
    }
    const parserPage = await browser.newPage();
    try {
      await parserPage.goto(`http://127.0.0.1:${server.addr.port}/`);
      const cdp = await parserPage.context().newCDPSession(parserPage);
      await cdp.send("Debugger.enable");
      const remote = await cdp.send("Runtime.evaluate", {
        expression: 'import("/tests/fixtures/mermaid_standard/zenuml_parser.js").then(m => m.officialZenUmlParse())',
        awaitPromise: true,
      });
      if (!remote.result.objectId) throw new Error("Missing public SDK parser reference.");
      const source = await cdp.send("Runtime.callFunctionOn", {
        objectId: remote.result.objectId,
        functionDeclaration: "function(){return this.toString()}",
        returnByValue: true,
      });
      const binding = /([\w$]+)\.ErrorDetails\.length\s*=\s*0/.exec(source.result.value)?.[1];
      if (!binding) throw new Error("Missing actual SDK parser closure binding.");
      const breakpoint = await cdp.send("Debugger.setBreakpointOnFunctionCall", { objectId: remote.result.objectId });
      const stop = new Promise<{ callFrames: { callFrameId: string }[] }>((resolve) =>
        cdp.once("Debugger.paused", resolve)
      );
      const pending = parserPage.evaluate(async () =>
        (await (await import("/tests/fixtures/mermaid_standard/zenuml_parser.js")).officialZenUmlParse())("A.foo()")
      );
      const event = await stop;
      const errors = await cdp.send("Debugger.evaluateOnCallFrame", {
        callFrameId: event.callFrames[0]!.callFrameId,
        expression: `${binding}.Errors`,
      });
      if (!errors.result.objectId) throw new Error("Missing actual SDK Errors array.");
      const countErrors = async () =>
        (await cdp.send("Runtime.callFunctionOn", {
          objectId: errors.result.objectId,
          functionDeclaration: "function(){return this.length}",
          returnByValue: true,
        })).result.value;
      const before = await countErrors();
      await cdp.send("Debugger.removeBreakpoint", { breakpointId: breakpoint.breakpointId });
      await cdp.send("Debugger.resume");
      await pending;
      await cdp.send("Debugger.disable");
      let workers = 0, closed = 0;
      parserPage.on("worker", (worker) => {
        workers++;
        worker.on("close", () => closed++);
      });
      const lifetime = await parserPage.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/zenuml_parser.js")).verifyZenUmlParserLifetime()
      );
      await parserPage.evaluate(() =>
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      );
      const after = await countErrors();
      if (before !== 0 || after !== 0 || workers !== 21 || closed !== 21) {
        throw new Error(`Retained ZenUML state: ${JSON.stringify({ before, after, workers, closed })}`);
      }
      console.log(
        `ok browser:zenuml-parser-lifetime ${JSON.stringify({ ...lifetime, before, after, workers, closed })}`,
      );
      for (const dispose of [false, true]) {
        const attached = new Promise<unknown>((resolve) => cdp.once("Target.attachedToTarget", resolve));
        await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
        const cancellation = parserPage.evaluate(
          async (dispose) =>
            (await import("/tests/fixtures/mermaid_standard/zenuml_parser.js")).verifyZenUmlActiveCancellation(dispose),
          dispose,
        );
        await attached;
        await parserPage.evaluate(async () =>
          (await import("/tests/fixtures/mermaid_standard/zenuml_parser.js")).cancelActiveZenUmlParser()
        );
        const result = await cancellation;
        await cdp.send("Target.setAutoAttach", { autoAttach: false, waitForDebuggerOnStart: false, flatten: true });
        const recovered = await parserPage.evaluate(async () =>
          (await import("/tests/fixtures/mermaid_standard/zenuml_parser.js")).verifyZenUmlRecovery()
        );
        console.log(`ok browser:zenuml-parser-cancellation ${JSON.stringify({ ...result, recovered })}`);
      }
      const beforeCache = { workers, closed };
      const cache = await parserPage.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/zenuml_parser.js")).verifyZenUmlValidCacheBound()
      );
      await parserPage.evaluate(() =>
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      );
      if (
        workers - beforeCache.workers !== cache.expectedWorkers || closed - beforeCache.closed !== cache.expectedWorkers
      ) {
        throw new Error(`ZenUML cache is not bounded: ${JSON.stringify({ beforeCache, workers, closed, cache })}`);
      }
      console.log(`ok browser:zenuml-parser-cache ${JSON.stringify(cache)}`);
      const attached = new Promise<unknown>((resolve) => cdp.once("Target.attachedToTarget", resolve));
      await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
      const timeout = parserPage.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/zenuml_parser.js")).verifyZenUmlTimeout()
      );
      await attached;
      const timeoutResult = await timeout;
      await cdp.send("Target.setAutoAttach", { autoAttach: false, waitForDebuggerOnStart: false, flatten: true });
      const timeoutRecovered = await parserPage.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/zenuml_parser.js")).verifyZenUmlRecovery()
      );
      if (await countErrors() !== 0) throw new Error("Parser lifecycle requests add SDK errors.");
      console.log(
        `ok browser:zenuml-parser-timeout ${JSON.stringify({ ...timeoutResult, recovered: timeoutRecovered })}`,
      );
      const urls = await parserPage.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/zenuml_parser.js")).verifyZenUmlUrlOwnership(false)
      );
      console.log(`ok browser:zenuml-parser-url-ownership ${JSON.stringify(urls)}`);
      const parity = await parserPage.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/zenuml_parser.js")).verifyZenUmlGrammarParity()
      );
      console.log(`ok browser:zenuml-parser-parity ${JSON.stringify(parity)}`);
      await cdp.detach();
    } finally {
      await parserPage.close();
    }
    const deniedPage = await browser.newPage();
    try {
      await deniedPage.goto(`http://127.0.0.1:${server.addr.port}/zenuml-worker-denied`);
      const denied = await deniedPage.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/zenuml_parser.js")).verifyZenUmlUrlOwnership(true)
      );
      console.log(`ok browser:zenuml-worker-capability-denied ${JSON.stringify(denied)}`);
    } finally {
      await deniedPage.close();
    }
    if (runtimeHost.args.includes("--zenuml-parser-only")) {
      console.log("ok browser:zenuml-parser-only (not full catalogue coverage)");
      break conformance;
    }
    for (const borrowedSDK of [false, true]) {
      const extensionPage = await browser.newPage();
      try {
        await extensionPage.goto(`http://127.0.0.1:${server.addr.port}/`);
        const ownership = await extensionPage.evaluate(
          async (borrowedSDK) =>
            (await import("/tests/fixtures/mermaid_standard/zenuml_dom.js")).verifyZenUmlStyleOwnership(borrowedSDK),
          borrowedSDK,
        );
        if (!ownership.noViewer) throw new Error("ZenUML created a legacy viewer.");
        console.log(`ok browser:zenuml-style-ownership ${JSON.stringify(ownership)}`);
      } finally {
        await extensionPage.close();
      }
    }
    const generatedProbeRequests: string[] = [];
    await page.route("https://generated-probe.invalid/**", (route) => {
      generatedProbeRequests.push(route.request().url());
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.addr.port}/`);
    const pixelDifference = (left: Uint8Array, right: Uint8Array) => {
      const a = PNG.sync.read(Buffer.from(left)), b = PNG.sync.read(Buffer.from(right));
      if (a.width !== b.width || a.height !== b.height) throw new Error("Original decoration screenshot size changes.");
      let pixels = 0;
      const colors: Record<string, number> = {};
      for (let offset = 0; offset < a.data.length; offset += 4) {
        if ([0, 1, 2, 3].some((channel) => a.data[offset + channel] !== b.data[offset + channel])) {
          pixels++;
          const color = [0, 1, 2].map((channel) => a.data[offset + channel]).join(",");
          colors[color] = (colors[color] ?? 0) + 1;
        }
      }
      return { pixels, colors };
    };
    let decorationCases = 0;
    try {
      for (let index = 0, count = 1; index < count; index++) {
        const original = await page.evaluate(
          async (index) =>
            (await import("/tests/fixtures/mermaid_standard/text_decoration.js")).mountTextDecorationOriginal(index),
          index,
        );
        count = original.count;
        const before = await page.screenshot({ clip: { x: 0, y: 0, width: 320, height: 230 } });
        await page.evaluate(async () =>
          (await import("/tests/fixtures/mermaid_standard/text_decoration.js")).captureTextDecorationOriginal()
        );
        const restored = await page.screenshot({ clip: { x: 0, y: 0, width: 320, height: 230 } });
        if (pixelDifference(before, restored).pixels) {
          throw new Error(`Decoration capture changes original pixels: ${original.name}`);
        }
        await page.evaluate(async () =>
          (await import("/tests/fixtures/mermaid_standard/text_decoration.js")).disableTextDecorationOriginal()
        );
        const undecorated = await page.screenshot({ clip: { x: 0, y: 0, width: 320, height: 230 } });
        const changed = pixelDifference(before, undecorated);
        if (
          !!changed.pixels !== original.painted || (original.ink && !changed.colors[original.ink]) ||
          original.inks?.some((ink: string) => !changed.colors[ink])
        ) {
          throw new Error(`Original decoration pixels differ: ${JSON.stringify({ ...original, changed })}`);
        }
        decorationCases++;
      }
      const guards = await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/text_decoration.js")).verifyTextDecorationGuards()
      );
      const canvas = await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/text_decoration.js")).verifyBrowserTextDecorations()
      );
      console.log(`ok browser:text-decoration-pixels ${JSON.stringify({ decorationCases, ...guards, canvas })}`);
      if (runtimeHost.args.includes("--text-decorations-only")) {
        console.log("ok browser:text-decorations-only (not full catalogue coverage)");
        break conformance;
      }
      const wide = await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/wide_cells.js")).verifyBrowserWideCells()
      );
      console.log(`ok browser:wide-cell-pixels ${JSON.stringify(wide)}`);
      const ink = await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/wide_cells.js")).verifyBrowserInkOverhang()
      );
      console.log(`ok browser:ink-overhang ${JSON.stringify(ink)}`);
      const planes = await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/wide_cells.js")).verifyBrowserOwnedPlanes()
      );
      console.log(`ok browser:owned-planes ${JSON.stringify(planes)}`);
    } finally {
      await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/text_decoration.js")).disposeTextDecorationOriginal()
      );
    }
    const contextCases = await page.evaluate(async () =>
      (await import("/tests/fixtures/mermaid_standard/quote_context.js")).MERMAID_QUOTE_CONTEXT_FIXTURES.length
    );
    const contextSession = await page.context().newCDPSession(page);
    const plainAX = (nodes: ReturnType<typeof semanticAXTree>): string =>
      nodes.map((node): string => node.role === "StaticText" ? node.name ?? "" : plainAX(node.children ?? [])).join("");
    try {
      for (let index = 0; index < contextCases; index++) {
        const fixture = await page.evaluate(
          async (index) =>
            (await import("/tests/fixtures/mermaid_standard/quote_context.js")).mountMermaidQuoteContextComparison(
              index,
            ),
          index,
        );
        const original = plainAX(
          semanticAXTree(
            (await contextSession.send("Accessibility.getFullAXTree")).nodes,
            "Authoritative quote context",
          ),
        );
        if (original !== fixture.expected) {
          throw new Error(`Original quotation context differs: ${JSON.stringify({ ...fixture, original })}`);
        }
        await page.evaluate(async () =>
          (await import("/tests/fixtures/mermaid_standard/quote_context.js")).captureMermaidQuoteContextComparison()
        );
        const tree = (await contextSession.send("Accessibility.getFullAXTree")).nodes;
        const restored = plainAX(semanticAXTree(tree, "Authoritative quote context"));
        const companion = plainAX(semanticAXTree(tree, "Native quote companion"));
        if (restored !== original || companion !== original) {
          throw new Error(
            `Original/companion quotation context differs: ${
              JSON.stringify({ ...fixture, original, restored, companion })
            }`,
          );
        }
        console.log(`ok browser:quotation-context ${fixture.name}`);
      }
    } finally {
      await contextSession.detach();
      await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/quote_context.js")).disposeMermaidQuoteContextComparison()
      );
    }
    console.log(
      `ok browser:quotation-context-guards ${
        JSON.stringify(
          await page.evaluate(async () =>
            (await import("/tests/fixtures/mermaid_standard/quote_context.js")).verifyMermaidQuoteContextGuards()
          ),
        )
      }`,
    );
    const strokeOutlines = await page.evaluate(async () => {
      const probe = await import(
        "/tests/fixtures/mermaid_standard/stroke_outlines.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/stroke_outlines.ts");
      return await probe.verifyMermaidStrokeOutlines();
    });
    console.log(`ok browser:stroke-outlines ${JSON.stringify(strokeOutlines)}`);
    const strokeEffects = await page.evaluate(async () => {
      const probe = await import(
        "/tests/fixtures/mermaid_standard/stroke_effects.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/stroke_effects.ts");
      return await probe.verifyMermaidStrokeEffects();
    });
    console.log(`ok browser:stroke-effects ${JSON.stringify(strokeEffects)}`);
    const semantics = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const probe = await import(
        "/tests/fixtures/mermaid_standard/semantics.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/semantics.ts");
      const renderer = await module.createMermaidStandardRenderer();
      let result: Awaited<ReturnType<typeof probe.verifyMermaidSemantics>>;
      try {
        result = await probe.verifyMermaidSemantics(renderer);
      } finally {
        renderer.dispose();
      }
      return {
        ...result,
        transport: await probe.verifyMermaidSemanticsTransport(result.retained),
        browserWideCells: await (await import("/tests/fixtures/mermaid_standard/wide_cells.js"))
          .verifyMermaidBrowserWideCells(result.retained),
        actions: probe.verifyMermaidSemanticDOMActions(result.retained[15]!),
        references: probe.verifyMermaidSemanticReferences(),
        generatedGuards: probe.verifyMermaidGeneratedContentGuards(),
      };
    });
    const semanticSession = await page.context().newCDPSession(page);
    await page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    if (generatedProbeRequests.length) {
      throw new Error(`Generated probes attempted unauthorized resources: ${generatedProbeRequests}`);
    }
    let comparedSemanticTrees = 0;
    let comparedSVGSemanticTrees = 0;
    let generatedAXCorrections = 0;
    try {
      for (const diagram of semantics.retained) {
        await page.evaluate(async (diagram) => {
          const probe = await import("/tests/fixtures/mermaid_standard/semantics.js");
          probe.mountMermaidSemanticComparison(diagram);
        }, diagram);
        const tree = await semanticSession.send("Accessibility.getFullAXTree");
        const upstream = semanticAXTree(tree.nodes, "Authoritative SVG semantics"),
          native = semanticAXTree(tree.nodes, "Native companion semantics");
        if (JSON.stringify(upstream) !== JSON.stringify(native)) {
          if (semanticAXGeneratedTextQuirk(upstream, native, diagram.source)) generatedAXCorrections++;
          else {
            throw new Error(
              `Actual content AX subtree differs: ${JSON.stringify({ source: diagram.source, upstream, native })}`,
            );
          }
        }
        comparedSemanticTrees++;
      }
      const svgCases = await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/semantics.js")).MERMAID_SEMANTIC_SVG_FIXTURES.length
      );
      for (let index = 0; index < svgCases; index++) {
        const name = await page.evaluate(
          async (index) =>
            (await import("/tests/fixtures/mermaid_standard/semantics.js")).mountMermaidSemanticSVGComparison(index),
          index,
        );
        const tree = await semanticSession.send("Accessibility.getFullAXTree");
        const upstream = semanticAXTree(tree.nodes, "Authoritative SVG semantics"),
          native = semanticAXTree(tree.nodes, "Native companion semantics");
        if (JSON.stringify(upstream) !== JSON.stringify(native)) {
          if (semanticAXGeneratedTextQuirk(upstream, native, name.name)) generatedAXCorrections++;
          else {
            throw new Error(`Actual SVG content AX subtree differs: ${JSON.stringify({ name, upstream, native })}`);
          }
        }
        if (name.metadata) {
          for (const label of ["Authoritative SVG semantics", "Native companion semantics"]) {
            const actual = semanticAXMetadata(tree.nodes, label);
            if (JSON.stringify(actual) !== JSON.stringify(name.metadata)) {
              throw new Error(`Actual SVG metadata differs: ${JSON.stringify({ name, label, actual })}`);
            }
          }
        }
        comparedSVGSemanticTrees++;
      }
    } finally {
      await semanticSession.detach();
      await page.evaluate(async () => {
        (await import("/tests/fixtures/mermaid_standard/semantics.js")).disposeMermaidSemanticComparison();
      });
    }
    const { retained: _semanticScenes, ...semanticStats } = semantics;
    console.log(
      `ok browser:semantic-content ${
        JSON.stringify({ ...semanticStats, comparedSemanticTrees, comparedSVGSemanticTrees, generatedAXCorrections })
      }`,
    );
    const automaticQuotes = await page.evaluate(async () =>
      (await import("/tests/fixtures/mermaid_standard/quotes.js")).mountMermaidAutoQuoteComparison()
    );
    const quoteSession = await page.context().newCDPSession(page);
    try {
      const source = semanticAXTree(
        (await quoteSession.send("Accessibility.getFullAXTree")).nodes,
        "Authoritative automatic quotes",
      );
      const plain = (node: typeof source[number]): string =>
        node.role === "StaticText" ? node.name ?? "" : (node.children ?? []).map(plain).join("");
      for (const fixture of automaticQuotes) {
        const row = source.find((node) => node.name === fixture.label);
        const actual = row && plain(row);
        if (actual !== fixture.expected) {
          throw new Error(`Actual automatic quotation differs: ${JSON.stringify({ ...fixture, actual })}`);
        }
      }
      console.log(`ok browser:automatic-quotes ${automaticQuotes.length} independent locale/alias/default cases`);
    } finally {
      await quoteSession.detach();
      await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/quotes.js")).disposeMermaidAutoQuoteComparison()
      );
    }
    const accessibility = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const probe = await import(
        "/tests/fixtures/mermaid_standard/accessibility.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/accessibility.ts");
      const renderer = await module.createMermaidStandardRenderer();
      let result: Awaited<ReturnType<typeof probe.verifyMermaidAccessibility>>;
      try {
        result = await probe.verifyMermaidAccessibility(renderer);
      } finally {
        renderer.dispose();
      }
      const { retained, ...stats } = result;
      return {
        ...stats,
        transport: await probe.verifyMermaidAccessibilityTransport(retained),
        dom: await probe.mountMermaidAccessibilityDOM(retained.at(-1)!),
      };
    });
    try {
      const session = await page.context().newCDPSession(page);
      try {
        const tree = await session.send("Accessibility.getFullAXTree");
        const diagram = tree.nodes.find((node) => !node.ignored && node.name?.value === accessibility.dom.title);
        if (
          !diagram || diagram.role?.value !== "graphics-document" ||
          diagram.description?.value !== accessibility.dom.description.replace(/\s+/g, " ").trim()
        ) {
          throw new Error(`Actual Chromium AX diagram semantics differ: ${JSON.stringify(diagram)}`);
        }
        if (
          diagram.properties?.find((property) => property.name === "roledescription")?.value.value !==
            accessibility.dom.roleDescription
        ) {
          throw new Error("Actual Chromium AX role description lost");
        }
        console.log(
          `ok browser:accessibility ${
            JSON.stringify({ ...accessibility, axRole: diagram.role.value, axDescription: diagram.description.value })
          }`,
        );
      } finally {
        await session.detach();
      }
    } finally {
      await page.evaluate(async () => {
        const probe = await import("/tests/fixtures/mermaid_standard/accessibility.js");
        probe.disposeMermaidAccessibilityDOM();
        if (document.getElementById("exotui-accessibility-fixture")) {
          throw new Error("Accessibility fixture leaked DOM");
        }
      });
    }
    const catalogue = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const renderer = await module.createMermaidStandardRenderer();
      return await renderer.diagramTypes();
    });
    const grammar = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const probe = await import(
        "/tests/fixtures/mermaid_standard/grammar.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/grammar.ts");
      const renderer = await module.createMermaidStandardRenderer();
      try {
        return await probe.verifyMermaidFamilyGrammar(renderer);
      } finally {
        renderer.dispose();
      }
    });
    console.log(`ok browser:family-grammar ${JSON.stringify(grammar)}`);
    const animations = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const probe = await import(
        "/tests/fixtures/mermaid_standard/animations.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/animations.ts");
      const renderer = await module.createMermaidStandardRenderer();
      let result: Awaited<ReturnType<typeof probe.verifyMermaidAnimations>>;
      try {
        result = await probe.verifyMermaidAnimations(renderer);
      } finally {
        renderer.dispose();
      }
      const { retained, ...stats } = result;
      return {
        ...stats,
        transport: await probe.verifyMermaidAnimationTransport(retained),
        dom: probe.verifyMermaidAnimationDOM(),
      };
    });
    console.log(`ok browser:animations ${JSON.stringify(animations)}`);
    const flowFeatures = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const probe = await import(
        "/tests/fixtures/mermaid_standard/flow_features.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/flow_features.ts");
      const renderer = await module.createMermaidStandardRenderer();
      const dom = probe.verifyMermaidBezierDOM();
      let result: Awaited<ReturnType<typeof probe.verifyMermaidFlowFeatures>>;
      try {
        result = await probe.verifyMermaidFlowFeatures(renderer);
      } finally {
        renderer.dispose();
      }
      const { retained, ...stats } = result;
      return {
        ...stats,
        transport: await probe.verifyMermaidFlowTransport(retained),
        dom,
      };
    });
    console.log(`ok browser:flow-features ${JSON.stringify(flowFeatures)}`);
    const strokeFeatures = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const probe = await import(
        "/tests/fixtures/mermaid_standard/stroke_features.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/stroke_features.ts");
      const transport = await import(
        "/tests/fixtures/mermaid_standard/flow_features.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/flow_features.ts");
      const renderer = await module.createMermaidStandardRenderer();
      let result: Awaited<ReturnType<typeof probe.verifyMermaidStrokeFeatures>>;
      try {
        result = await probe.verifyMermaidStrokeFeatures(renderer);
      } finally {
        renderer.dispose();
      }
      const { retained, ...stats } = result;
      return { ...stats, transport: await transport.verifyMermaidFlowTransport(retained) };
    });
    console.log(`ok browser:stroke-features ${JSON.stringify(strokeFeatures)}`);
    const textTransforms = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const probe = await import(
        "/tests/fixtures/mermaid_standard/text_transform.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/text_transform.ts");
      const transport = await import(
        "/tests/fixtures/mermaid_standard/flow_features.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/flow_features.ts");
      const dom = probe.verifyMermaidTextTransformDOM();
      const renderer = await module.createMermaidStandardRenderer();
      let result: Awaited<ReturnType<typeof probe.verifyMermaidTextTransforms>>;
      try {
        result = await probe.verifyMermaidTextTransforms(renderer);
        const math = await probe.verifyMermaidMathTextClusters(renderer);
        result.retained.push(...math.retained);
        result.cases += math.cases;
        const order = await probe.verifyMermaidMathTextOrdering(renderer);
        result.retained.push(...order.retained);
        result.cases += order.cases;
      } finally {
        renderer.dispose();
      }
      const { retained, ...stats } = result;
      const ink = await import("/tests/fixtures/mermaid_standard/wide_cells.js");
      return {
        ...stats,
        dom,
        transport: await transport.verifyMermaidFlowTransport(retained),
        browserInk: await ink.verifyMermaidBrowserInk(retained),
      };
    });
    console.log(`ok browser:text-transform ${JSON.stringify(textTransforms)}`);
    console.log(`ok browser:detached-ink-original ${JSON.stringify(await verifyDetachedInkPage(page))}`);
    const textFeatures = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const probe = await import(
        "/tests/fixtures/mermaid_standard/text_layout.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/text_layout.ts");
      const transport = await import(
        "/tests/fixtures/mermaid_standard/flow_features.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/flow_features.ts");
      const dom = probe.verifyMermaidTextDOM();
      const renderer = await module.createMermaidStandardRenderer();
      let result: Awaited<ReturnType<typeof probe.verifyMermaidTextFeatures>>;
      try {
        result = await probe.verifyMermaidTextFeatures(renderer);
      } finally {
        renderer.dispose();
      }
      const { retained, ...stats } = result;
      return { ...stats, dom, transport: await transport.verifyMermaidFlowTransport(retained) };
    });
    console.log(`ok browser:text-layout ${JSON.stringify(textFeatures)}`);
    const bidiFeatures = await verifyBidiPage(page);
    console.log(`ok browser:text-bidi ${JSON.stringify(bidiFeatures)}`);
    let rootViewportPixels = 0;
    try {
      for (const visible of [false, true]) {
        const reference = await page.evaluate(
          async (visible) =>
            (await import("/tests/fixtures/mermaid_standard/text_layout.js")).mountMermaidRootViewportOriginal(visible),
          visible,
        );
        const original = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: 320, height: 240 } }));
        if (reference.clipped === visible) throw new Error("Root overflow policy changed during extraction.");
        for (const sample of reference.samples) {
          const at = (sample.y * original.width + sample.x) * 4;
          const painted = original.data[at] === 0 && original.data[at + 1] === 128 && original.data[at + 2] === 0;
          if (painted !== sample.painted) {
            throw new Error(`Root clip differs from original pixels: ${JSON.stringify(sample)}`);
          }
          rootViewportPixels++;
        }
      }
    } finally {
      await page.evaluate(async () =>
        (await import("/tests/fixtures/mermaid_standard/text_layout.js")).disposeMermaidRootViewportOriginal()
      );
    }
    console.log(`ok browser:root-viewport-pixels ${rootViewportPixels}`);
    const lifecycle = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const probe = await import(
        "/tests/fixtures/mermaid_standard/lifecycle.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/lifecycle.ts");
      return await probe.verifyMermaidDocumentLifecycle(await module.createMermaidStandardRenderer());
    });
    console.log(`ok browser:document-lifecycle ${JSON.stringify(lifecycle)}`);
    const flex = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const probe = await import(
        "/tests/fixtures/mermaid_standard/lifecycle.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/lifecycle.ts");
      return await probe.verifyMermaidFlexLifecycle(await module.createMermaidStandardRenderer());
    });
    console.log(`ok browser:flex-lifecycle ${JSON.stringify(flex)}`);
    const interactions = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const probe = await import(
        "/tests/fixtures/mermaid_standard/interactions.js"
      ) as typeof import("../tests/fixtures/mermaid_standard/interactions.ts");
      const renderer = await module.createMermaidStandardRenderer();
      let result: Awaited<ReturnType<typeof probe.verifyMermaidInteractions>>;
      try {
        result = await probe.verifyMermaidInteractions(renderer);
      } finally {
        renderer.dispose();
      }
      const { retained, ...stats } = result;
      return {
        ...stats,
        transport: await probe.verifyMermaidInteractionTransport(retained),
        dom: probe.verifyMermaidInteractionDOM(document),
      };
    });
    console.log(`ok browser:interactions ${JSON.stringify(interactions)}`);
    const covered = new Set<string>();
    for (const fixture of MERMAID_ICON_FIXTURES) {
      try {
        const result = await page.evaluate(async ({ fixture, icons }) => {
          const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
          const renderer = await module.createMermaidStandardRenderer();
          await renderer.registerIconPacks([{ name: "stack", icons }, { name: "fa", icons }]);
          const diagram = await renderer.compile(
            fixture.source,
            fixture.trusted
              ? { trusted: true, config: { securityLevel: "loose", dompurifyConfig: { ADD_TAGS: ["use"] } } }
              : {},
          );
          const scene = JSON.parse(JSON.stringify(diagram.scene!)) as NonNullable<typeof diagram.scene>;
          if (scene.diagnostics.length) throw new Error(`Icon capture diagnostics: ${scene.diagnostics}`);
          const normal = module.renderMermaidNativeFrame(scene);
          const nativeText = module.mermaidNativeLines(normal).join("\n");
          for (const label of fixture.labels) {
            if (!nativeText.includes(label)) throw new Error(`Native icon label disappeared: ${label}`);
          }
          const colors = fixture.name === "icon-local-use"
            ? [[0, 221, 68]]
            : fixture.name === "icon-fontawesome-label"
            ? [[40, 37, 61]]
            : [[255, 34, 0], [0, 221, 68], [34, 85, 255]];
          for (const [r, g, b] of colors) {
            if (!normal.cells.some((row) => row.some((cell) => cell.background === `rgb(${r}, ${g}, ${b})`))) {
              throw new Error(`Native icon lost its actual color rgb(${r}, ${g}, ${b}).`);
            }
          }
          const documents = await import("/mod.document.js") as typeof import("../mod.document.ts");
          const { padNativeRow } = await import("/tests/fixtures/mermaid_standard/lifecycle.js");
          const source = `# Icons\n\n\`\`\`mermaid\n${fixture.source}\n\`\`\`\n\nAfter icons.`;
          const prepared = await module.prepareMermaidMarkdown(source, { compile: () => Promise.resolve(diagram) });
          const surface = new documents.MarkdownSurface({ source, render: prepared.render });
          try {
            await surface.ready;
            for (const [width, height, offset] of [[80, 12, 0], [40, 9, 3], [80, 7, 5], [80, 12, 0]] as const) {
              surface.component.controller.scrollTo(offset, width, height);
              // deno-lint-ignore no-control-regex
              const actual = surface.render(width, height).map((row) => row.replace(/\x1b\[[0-9;]*m/g, ""));
              const expected = surface.component.controller.visible(width, height).map((row) =>
                padNativeRow(row.text, width)
              );
              while (expected.length < height) expected.push(" ".repeat(width));
              if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error("Mounted icon rows changed during immediate scroll/resize.");
              }
            }
          } finally {
            surface.dispose();
          }
          // Independently rasterize the authoritative SVG, rather than checking
          // our extracted paths against their own projected coordinates.
          const parsed = new DOMParser().parseFromString(diagram.svg, "image/svg+xml");
          const root = parsed.documentElement;
          root.setAttribute("width", String(scene.width));
          root.setAttribute("height", String(scene.height));
          root.removeAttribute("style");
          // A data SVG is origin-clean even when it contains HTML labels; a
          // blob SVG with foreignObject taints Chromium's canvas.
          const url = `data:image/svg+xml;charset=utf-8,${
            encodeURIComponent(new XMLSerializer().serializeToString(root))
          }`;
          const image = new Image();
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(scene.width * 2);
          canvas.height = Math.ceil(scene.height * 2);
          try {
            image.src = url;
            await image.decode();
            const context = canvas.getContext("2d")!;
            context.drawImage(image, 0, 0, scene.width * 2, scene.height * 2);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            const frame = module.renderMermaidNativeFrame(scene, { columnUnits: 1, rowUnits: 1 });
            const counts = new Array(colors.length).fill(0);
            for (let y = 1; y < Math.floor(scene.height) - 1; y++) {
              for (let x = 1; x < Math.floor(scene.width) - 1; x++) {
                const px = x * 2 + 1;
                const py = y * 2 + 1;
                const at = (py * canvas.width + px) * 4;
                const index = colors.findIndex(([r, g, b]) =>
                  pixels[at] === r && pixels[at + 1] === g && pixels[at + 2] === b && pixels[at + 3] === 255
                );
                if (index < 0) continue;
                // Exclude antialiasing/resampling boundaries and source text.
                if (
                  [[-2, 0], [2, 0], [0, -2], [0, 2]].some(([dx, dy]) => {
                    const near = ((py + dy!) * canvas.width + px + dx!) * 4;
                    return [0, 1, 2, 3].some((channel) => pixels[near + channel] !== pixels[at + channel]);
                  })
                ) continue;
                const [r, g, b] = colors[index]!;
                if (frame.cells[y]![x]!.background !== `rgb(${r}, ${g}, ${b})`) {
                  throw new Error(`Native icon/Chromium differs at ${x},${y}: ${JSON.stringify(frame.cells[y]![x])}`);
                }
                counts[index]++;
              }
            }
            if (counts.some((count) => !count)) throw new Error(`No independent icon color comparisons: ${counts}`);
            return {
              type: diagram.diagramType,
              colors: colors.length,
              paintComparisons: counts.reduce((a, b) => a + b, 0),
              nativeSize: [normal.columns, normal.rows],
              mountedSnapshots: 4,
            };
          } finally {
            canvas.width = canvas.height = 0;
            image.src = "";
          }
        }, { fixture, icons: MERMAID_ICON_DATA });
        console.log(`ok ${fixture.name} ${JSON.stringify(result)}`);
      } catch (error) {
        failures.push(fixture.name);
        console.log(`FAIL ${fixture.name}: ${(error as Error).stack ?? error}`);
      }
    }
    const iconCapabilities = await page.evaluate(async (icons) => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const first = await module.createMermaidStandardRenderer();
      const second = await module.createMermaidStandardRenderer();
      const source = (name: string) => `flowchart TD\nA@{icon: "${name}:signal", h: 96}`;
      const require = (condition: unknown, message: string) => {
        if (!condition) throw new Error(message);
      };
      let calls = 0;
      await first.registerIconPacks([
        {
          name: "cap-unused",
          loader: () => {
            throw new Error("An unused pack must never load.");
          },
        },
        {
          name: "cap-lazy",
          loader: () => {
            calls++;
            return Promise.resolve(icons);
          },
        },
      ]);
      await first.parse("flowchart TD\nA --> B");
      require(calls === 0, "Lazy registration/parse loaded an unused pack.");
      const diagram = await second.compile(source("cap-lazy") + '\nB@{icon: "cap-lazy:turned", h: 96}\nA --> B');
      require(calls === 1 && !diagram.scene!.diagnostics.length, "Shared runtime lazy packs did not load once.");
      await second.registerIconPacks([{
        name: "cap-lazy",
        loader: () => {
          throw new Error("Sticky cache must win.");
        },
      }]);
      const cached = await first.compile(source("cap-lazy"));
      require(
        calls === 1 && !cached.scene!.diagnostics.length,
        "Replacing a loader discarded upstream's static cache.",
      );
      let attempts = 0;
      await first.registerIconPacks([{
        name: "cap-retry",
        loader: () => {
          attempts++;
          if (attempts === 1) throw new Error("observable icon loader failure");
          return Promise.resolve(icons);
        },
      }]);
      const failed = await first.compile(source("cap-retry"));
      require(
        failed.diagnostics?.some((warning) => warning.includes("observable icon loader failure")),
        "Upstream swallowed the host loader failure.",
      );
      require(
        failed.scene!.diagnostics.some((warning) => warning.includes("missing-icon")),
        "A placeholder was silently counted as an available icon.",
      );
      const retry = await first.compile(source("cap-retry"));
      require(attempts === 2 && !retry.scene!.diagnostics.length, "Icon loader failure poisoned later compilation.");
      let owned: AbortSignal | undefined;
      const controller = new AbortController();
      await first.registerIconPacks([{
        name: "cap-abort",
        loader: ({ signal }) => {
          owned = signal;
          controller.abort(new DOMException("host cancelled icon load", "AbortError"));
          return new Promise(() => {});
        },
      }]);
      let cancelled = false;
      const children = document.body.children.length;
      try {
        await first.compile(source("cap-abort"), { signal: controller.signal });
      } catch (error) {
        cancelled = error instanceof DOMException && error.name === "AbortError";
      }
      require(
        cancelled && owned?.aborted && children === document.body.children.length,
        "Cancelled icon work leaked a loader or measuring DOM.",
      );
      await first.registerIconPacks([{
        name: "cap-timeout",
        loader: ({ signal }) => {
          owned = signal;
          return new Promise(() => {});
        },
      }], { limits: { timeoutMs: 20 } });
      const timed = await first.compile(source("cap-timeout"));
      require(
        owned?.aborted && timed.diagnostics?.some((warning) => warning.includes("timed out")),
        "Timed-out icon loader was silent or retained its signal.",
      );
      const recovered = await second.compile(source("cap-lazy"));
      require(
        !recovered.scene!.diagnostics.length && children === document.body.children.length,
        "Icon interruption poisoned the shared runtime queue.",
      );
      const missing = await first.compile(source("cap-unregistered"));
      require(
        missing.scene!.diagnostics.some((warning) => warning.includes("missing-icon")),
        "Unregistered icons need an explicit placeholder diagnostic.",
      );
      const fontFallback = await first.compile('flowchart TD\nA["far:fa-unregistered Missing font icon"]');
      require(
        fontFallback.scene!.diagnostics.some((warning) => warning.includes("FontAwesome CSS")),
        "An unresolved CSS icon fallback was silently dropped.",
      );
      const markup =
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><foreignObject width="100" height="40"><div xmlns="http://www.w3.org/1999/xhtml">before <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" class="label-icon"><text x="1" y="16">Q</text></svg> after</div></foreignObject></svg>';
      const embedded = await new module.MermaidStandardRenderer({
        initialize() {},
        parse: () => Promise.resolve({ diagramType: "inline-svg-text" }),
        render: () => Promise.resolve({ svg: markup, diagramType: "inline-svg-text" }),
        getRegisteredDiagramsMetadata: () => [],
      }, { document }).compile("known host inline SVG");
      require(
        embedded.scene!.items.filter((item) => item.kind === "text" && item.text === "Q").length === 1,
        "An inline icon's SVG text was captured again as an HTML label.",
      );
      require(embedded.scene!.density?.rowUnits === 5, "Small inline SVG density did not survive extraction.");
      return {
        lazyCalls: calls,
        retries: attempts,
        sharedRuntime: true,
        cacheSemantics: true,
        failureTimeoutCancellation: true,
        cleanup: true,
      };
    }, MERMAID_ICON_DATA);
    console.log(`ok icon-capabilities ${JSON.stringify(iconCapabilities)}`);
    for (const fixture of MERMAID_MATH_FIXTURES) {
      try {
        const result = await page.evaluate(async (fixture) => {
          const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
          const renderer = await module.createMermaidStandardRenderer();
          const diagram = await renderer.compile(fixture.source);
          const scene = JSON.parse(JSON.stringify(diagram.scene!)) as NonNullable<typeof diagram.scene>;
          const measuring = document.createElement("div");
          measuring.style.cssText = "position:fixed;left:-10000px;top:0";
          measuring.innerHTML = diagram.svg;
          document.body.append(measuring);
          try {
            const markup = measuring.innerHTML;
            module.extractMermaidScene(measuring.querySelector("svg")!);
            if (measuring.innerHTML !== markup) throw new Error("Math baseline probes changed the source DOM.");
          } finally {
            measuring.remove();
          }
          const frame = module.renderMermaidNativeFrame(scene);
          const labels = scene.items.filter((item) => item.kind === "text" && item.math);
          const require = (condition: unknown, message: string) => {
            if (!condition) throw new Error(message);
          };
          require(labels.length && !frame.diagnostics.length, `Math capture failed: ${frame.diagnostics}`);
          const locate = (value: string) => {
            const locations = frame.cells.flatMap((row, y) =>
              row.flatMap((cell, x) => cell.char === value ? [{ x, y }] : [])
            );
            require(locations.length, `Missing native math glyph ${value}`);
            return locations[0]!;
          };
          if (fixture.name === "math-scripts") {
            require(
              locate("2").y < locate("x").y && locate("1").y > locate("y").y,
              "Scripts collapsed onto their base row.",
            );
            require(
              locate("x").y === locate("y").y && locate("+").y === locate("x").y,
              "Math base tokens lost their baseline.",
            );
          } else if (fixture.name === "math-fraction-root" || fixture.name === "math-sequence") {
            require(
              labels.some((item) => item.kind === "text" && item.text === "√"),
              "Radical decoration absent from measured scene.",
            );
            const numerator = locate(fixture.name === "math-sequence" ? "x" : "a");
            const denominator = locate(fixture.name === "math-sequence" ? "y" : "c");
            require(numerator.y < denominator.y, "Fraction rows overlap.");
            require(
              frame.cells.slice(numerator.y + 1, denominator.y).some((row) => row.some((cell) => cell.char === "─")),
              "Fraction bar missing between numerator and denominator.",
            );
            locate("√");
          } else if (fixture.name === "math-indexed-root") {
            require(locate("3").y < locate("y").y, "Root degree lost its vertical position.");
            locate("√");
          } else if (fixture.name === "math-matrix") {
            require(
              locate("a").y === locate("b").y && locate("c").y === locate("d").y && locate("a").y < locate("c").y,
              "Matrix row alignment was lost.",
            );
            require(locate("a").x < locate("b").x && locate("c").x < locate("d").x, "Matrix columns collapsed.");
            locate("⎛");
            locate("⎜");
            locate("⎝");
            locate("⎞");
            locate("⎟");
            locate("⎠");
          } else if (fixture.name === "math-binomial-phantom") {
            require(
              !module.mermaidNativeLines(frame).join("").includes("HIDDEN") &&
                !labels.some((item) => item.kind === "text" && item.text.includes("HIDDEN")),
              "Math phantom became visible.",
            );
            require(
              !scene.items.some((item) =>
                item.kind === "path" && item.paint.fill === "none" && item.points.length === 2
              ),
              "Binomial gained a fraction bar.",
            );
          } else if (fixture.name === "math-accents") {
            require(
              labels.some((item) => item.kind === "text" && item.math!.stretch === "horizontal"),
              "Math accent lacks native stretching.",
            );
            locate("→");
          } else if (fixture.name === "math-limits") {
            require(
              locate("n").y < locate("∑").y && locate("=").y > locate("∑").y,
              "Summation limits lost their rows.",
            );
            locate("∫");
          } else if (fixture.name === "math-nested-fractions") {
            require(
              scene.items.filter((item) =>
                item.kind === "path" && item.points.length === 2 && item.paint.fill === "none"
              )
                .length >= 2,
              "Nested fraction rules missing.",
            );
            require(locate("1").y < locate("x").y, "Nested fraction denominator lost its position.");
          }
          const documents = await import("/mod.document.js") as typeof import("../mod.document.ts");
          const { padNativeRow } = await import("/tests/fixtures/mermaid_standard/lifecycle.js");
          const source = `# Math\n\n\`\`\`mermaid\n${fixture.source}\n\`\`\`\n\nAfter math.`;
          const prepared = await module.prepareMermaidMarkdown(source, {
            compile: () => Promise.resolve({ ...diagram, scene }),
          });
          const surface = new documents.MarkdownSurface({ source, render: prepared.render });
          try {
            await surface.ready;
            for (const [width, height, offset] of [[80, 12, 0], [40, 9, 3], [80, 7, 5], [80, 12, 0]] as const) {
              surface.component.controller.scrollTo(offset, width, height);
              // deno-lint-ignore no-control-regex
              const actual = surface.render(width, height).map((row) => row.replace(/\x1b\[[0-9;]*m/g, ""));
              const expected = surface.component.controller.visible(width, height).map((row) =>
                padNativeRow(row.text, width)
              );
              while (expected.length < height) expected.push(" ".repeat(width));
              require(
                JSON.stringify(actual) === JSON.stringify(expected),
                `Math Markdown scrolling lost cells at ${width}x${height}/${offset}.`,
              );
              await Promise.resolve();
              await Promise.resolve();
            }
          } finally {
            surface.dispose();
          }
          require(!document.querySelectorAll("[id^=exotui-mermaid-standard-]").length, "Math compiler leaked its DOM.");
          return { labels: labels.length, nativeSize: [frame.columns, frame.rows], mountedSnapshots: 4 };
        }, fixture);
        console.log(`ok ${fixture.name} ${JSON.stringify(result)}`);
      } catch (error) {
        failures.push(fixture.name);
        console.log(`FAIL ${fixture.name}: ${(error as Error).message}`);
      }
    }
    const mathBounds = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:-10000px;top:0";
      document.body.append(host);
      const reject = (body: string, message: string) => {
        host.innerHTML =
          `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><foreignObject width="400" height="200">${body}</foreignObject></svg>`;
        const markup = host.innerHTML;
        const children = document.body.children.length;
        let rejected = false;
        try {
          module.extractMermaidScene(host.querySelector("svg")!);
        } catch (error) {
          rejected = error instanceof RangeError && error.message.includes(message);
        }
        if (!rejected || host.innerHTML !== markup || document.body.children.length !== children) {
          throw new Error(`Math budget/cleanup regression: ${message}`);
        }
      };
      try {
        reject(`<math xmlns="http://www.w3.org/1998/Math/MathML">${"<mi>x</mi>".repeat(4096)}</math>`, "node budget");
        reject(
          `<div xmlns="http://www.w3.org/1999/xhtml">${
            `<math xmlns="http://www.w3.org/1998/Math/MathML">${'<mspace width="0" height="1px"/>'.repeat(4095)}</math>`
              .repeat(5)
          }</div>`,
          "node budget",
        );
        reject(
          `<math xmlns="http://www.w3.org/1998/Math/MathML">${
            "<mfrac><mi>a</mi><mi>b</mi></mfrac>".repeat(580)
          }</math>`,
          "layout-work budget",
        );
        return { perRootNodes: 4096, perSceneNodes: 16384, layoutComparisons: 1000000, cleanup: true };
      } finally {
        host.remove();
      }
    });
    console.log(`ok scene-math-bounds ${JSON.stringify(mathBounds)}`);
    console.log(`ok browser:math-radicals ${JSON.stringify(await verifyRadicalPage(page))}`);
    console.log(`ok browser:math-operators ${JSON.stringify(await verifyOperatorPage(page))}`);
    console.log(`ok browser:math-fractions ${JSON.stringify(await verifyFractionPage(page))}`);
    const invalidMath = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const renderer = await module.createMermaidStandardRenderer();
      const hosts = document.body.children.length;
      let rejected = false;
      try {
        await renderer.compile(String.raw`flowchart LR
A["$$\\notAValidKaTeXCommand{x}$$"]`);
      } catch (error) {
        rejected = String(error).includes("Undefined control sequence");
      }
      if (!rejected || document.body.children.length !== hosts) {
        throw new Error("Invalid upstream math did not reject/clean up.");
      }
      const recovered = await renderer.compile('flowchart LR\nA["$$x^2$$"]');
      if (!recovered.scene!.items.some((item) => item.kind === "text" && item.math)) {
        throw new Error("Invalid math poisoned the compiler queue.");
      }
      const legacy = await renderer.compile('flowchart LR\nA["$$x^2$$"]', { config: { forceLegacyMathML: true } });
      if (!legacy.scene!.diagnostics.some((message) => message.includes("Legacy KaTeX HTML notation"))) {
        throw new Error("Legacy math gap was silently counted as native support.");
      }
      return { upstreamGrammar: true, recovery: true, cleanup: true, legacyDiagnostic: true };
    });
    console.log(`ok math-invalid ${JSON.stringify(invalidMath)}`);
    const paintBounds = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const container = document.createElement("div");
      container.style.cssText = "position:fixed;left:-10000px;top:0";
      container.innerHTML =
        `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><defs><linearGradient id="large">${
          new Array(4097).fill(0).map((_, index) => `<stop offset="${index / 4096}" stop-color="red"/>`).join("")
        }</linearGradient></defs>${'<rect width="10" height="10" fill="url(#large)"/>'.repeat(17)}</svg>`;
      document.body.append(container);
      try {
        const svg = container.querySelector("svg")!;
        const reject = (message: string) => {
          const original = container.innerHTML;
          let rejected = false;
          try {
            module.extractMermaidScene(svg);
          } catch (error) {
            rejected = error instanceof RangeError && error.message.includes(message);
          }
          if (!rejected || container.innerHTML !== original) {
            throw new Error(`SVG paint budget/cleanup regression: ${message}`);
          }
        };
        reject("gradient exceeds its stop budget");
        svg.querySelector("linearGradient")!.lastElementChild!.remove();
        reject("referenced-gradient-stop budget");
        return { definitionStops: 4096, maximumReferencedStops: 65_536, cleanup: true };
      } finally {
        container.remove();
      }
    });
    console.log(`ok scene-paint-bounds ${JSON.stringify(paintBounds)}`);
    const filterBounds = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const container = document.createElement("div");
      container.style.cssText = "position:fixed;left:-10000px;top:0";
      container.innerHTML =
        `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><defs><filter id="large">${
          "<feColorMatrix/>".repeat(257)
        }</filter></defs>${'<rect width="10" height="10" filter="url(#large)"/>'.repeat(257)}</svg>`;
      document.body.append(container);
      try {
        const svg = container.querySelector("svg")!;
        const reject = () => {
          const original = container.innerHTML;
          let rejected = false;
          try {
            module.extractMermaidScene(svg);
          } catch (error) {
            rejected = error instanceof RangeError && error.message.includes("filter-node budget");
          }
          if (!rejected || container.innerHTML !== original) throw new Error("SVG filter budget/cleanup regression.");
        };
        reject();
        svg.querySelector("filter")!.lastElementChild!.remove();
        reject();
        return { graphNodes: 256, maximumReferencedNodes: 65_536, cleanup: true };
      } finally {
        container.remove();
      }
    });
    console.log(`ok scene-filter-bounds ${JSON.stringify(filterBounds)}`);
    const useBounds = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const container = document.createElement("div");
      container.style.cssText = "position:fixed;left:-10000px;top:0";
      document.body.append(container);
      const reject = (contents: string, message: string) => {
        container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${contents}</svg>`;
        const markup = container.innerHTML;
        const children = document.body.childElementCount;
        let rejected = false;
        try {
          module.extractMermaidScene(container.querySelector("svg")!);
        } catch (error) {
          rejected = error instanceof RangeError && error.message.includes(message);
        }
        if (!rejected || markup !== container.innerHTML || children !== document.body.childElementCount) {
          throw new Error(`SVG use budget/cleanup regression: ${message}`);
        }
      };
      try {
        reject(
          `<defs><g id="many">${'<rect width="1" height="1"/>'.repeat(4096)}</g></defs><use href="#many"/>`,
          "referenced-node/instance budget",
        );
        reject(
          `<defs><g id="many">${'<rect width="1" height="1"/>'.repeat(1023)}</g></defs>${
            '<use href="#many"/>'.repeat(17)
          }`,
          "referenced-node/instance budget",
        );
        reject(
          `<defs><rect id="many" width="1" height="1"/></defs>${'<use href="#many"/>'.repeat(2049)}`,
          "referenced-node/instance budget",
        );
        reject(
          `<defs>${
            new Array(34).fill(0).map((_, i) =>
              `<g id="depth${i}">${i === 33 ? '<rect width="1" height="1"/>' : `<use href="#depth${i + 1}"/>`}</g>`
            ).join("")
          }</defs><use href="#depth0"/>`,
          "reference-depth budget",
        );
        return { perInstanceNodes: 4096, referencedNodes: 16_384, instances: 2048, depth: 32, cleanup: true };
      } finally {
        container.remove();
      }
    });
    console.log(`ok scene-use-bounds ${JSON.stringify(useBounds)}`);
    const markerBounds = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const container = document.createElement("div");
      container.style.cssText = "position:fixed;left:-10000px;top:0";
      document.body.append(container);
      const reject = (contents: string, message: string) => {
        container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">${contents}</svg>`;
        const markup = container.innerHTML;
        const children = document.body.childElementCount;
        let rejected = false;
        try {
          module.extractMermaidScene(container.querySelector("svg")!);
        } catch (error) {
          rejected = error instanceof RangeError && error.message.includes(message);
        }
        if (!rejected || container.innerHTML !== markup || document.body.childElementCount !== children) {
          throw new Error(
            `SVG marker budget/cleanup regression: ${message} (rejected=${rejected}, markup=${
              container.innerHTML === markup
            }, children=${document.body.childElementCount === children})`,
          );
        }
      };
      const source = (count: number) =>
        `<path d="M0 0 ${"L1 1 L0 0 ".repeat(count)}" fill="none" stroke="none" style="marker:url(#m)"/>`;
      try {
        reject(
          `<defs><marker id="m">${'<rect width="1" height="1"/>'.repeat(4096)}</marker></defs>${source(1)}`,
          "referenced-node budget",
        );
        reject(
          `<defs><marker id="m">${'<rect width="1" height="1"/>'.repeat(1023)}</marker></defs>${source(10)}`,
          "referenced-node budget",
        );
        reject(`<defs><marker id="m"><rect width="1" height="1"/></marker></defs>${source(1024)}`, "instance budget");
        reject(
          `<defs><marker id="m" font-family="${"x".repeat(32768)}"><rect width="1" height="1"/></marker></defs>${
            source(512)
          }`,
          "style budget",
        );
        reject(
          `<defs>${
            Array.from({ length: 34 }, (_, i) =>
              `<marker id="depth${i}"><path d="M0 0 L1 1" marker-end="url(#depth${i + 1})"/></marker>`).join("")
          }</defs><path d="M0 0 L1 1" marker-end="url(#depth0)"/>`,
          "reference-depth budget",
        );
        return {
          perInstanceNodes: 4096,
          nodes: 16_384,
          instances: 2048,
          styleBytes: 32 * 1024 * 1024,
          depth: 32,
          cleanup: true,
        };
      } finally {
        container.remove();
      }
    });
    console.log(`ok scene-marker-bounds ${JSON.stringify(markerBounds)}`);
    const imageBounds = await page.evaluate(async () => {
      const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
      const bytes = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4"><rect width="8" height="4" fill="red"/></svg>',
      );
      const markup =
        `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><image href="host:bounded-image" width="40" height="20"/></svg>`;
      const runtime = {
        initialize() {},
        parse: () => Promise.resolve({ diagramType: "image-budget" }),
        render: () => Promise.resolve({ diagramType: "image-budget", svg: markup }),
        getRegisteredDiagramsMetadata: () => [],
      };
      const hosts = document.body.children.length;
      const compile = (images: import("../mod.mermaid.ts").MermaidImageOptions, signal?: AbortSignal) =>
        new module.MermaidStandardRenderer(runtime, { document, images }).compile("image fixture", { signal });
      const denied = await compile({});
      if (!denied.scene!.diagnostics.some((message) => message.includes("explicit host image loader"))) {
        throw new Error("Missing loader silently accepted.");
      }
      const load = () => Promise.resolve({ body: bytes, contentType: "image/svg+xml" });
      for (const limits of [{ maxBytes: 1 }, { maxSourcePixels: 1 }]) {
        let rejected = false;
        try {
          await compile({ load, limits });
        } catch (error) {
          rejected = error instanceof RangeError;
        }
        if (!rejected) throw new Error("Image budget did not reject before capture.");
      }
      const bounded = await compile({ load, limits: { maxRasterPixels: 32, maxTotalRasterPixels: 32 } });
      if (bounded.scene!.images!.some((image) => image.width * image.height > 32)) {
        throw new Error("SVG viewport capture evaded raster limit.");
      }
      let owned: AbortSignal | undefined;
      let timedOut = false;
      try {
        await compile({
          limits: { timeoutMs: 20 },
          load: (_url, { signal }) => {
            owned = signal;
            return new Promise(() => {});
          },
        });
      } catch (error) {
        timedOut = error instanceof DOMException && error.name === "TimeoutError";
      }
      if (!timedOut || !owned?.aborted) throw new Error("Image timeout did not cancel owned loader.");
      const controller = new AbortController();
      const pending = compile({
        load: (_url, { signal }) => {
          owned = signal;
          controller.abort(new DOMException("image capture cancelled", "AbortError"));
          return Promise.reject(new Error("loader rejected after cancellation"));
        },
      }, controller.signal);
      let cancelled = false;
      try {
        await pending;
      } catch (error) {
        cancelled = error instanceof DOMException && error.name === "AbortError";
      }
      if (!cancelled || !owned?.aborted || document.body.children.length !== hosts) {
        throw new Error("Cancelled image capture leaked its DOM/capability.");
      }
      const recovered = await compile({ load });
      if (!recovered.scene!.images?.length || document.body.children.length !== hosts) {
        throw new Error("Image failure poisoned the renderer queue.");
      }
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "red";
      context.fillRect(0, 0, 1, 1);
      const binary = atob(canvas.toDataURL("image/png").split(",")[1]!);
      const percent = `data:image/png,${
        Array.from(binary, (byte) => `%${byte.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")
      }`;
      canvas.width = canvas.height = 0;
      const encodedRuntime = {
        ...runtime,
        render: () =>
          Promise.resolve({ diagramType: "image-budget", svg: markup.replace("host:bounded-image", percent) }),
      };
      const encoded = await new module.MermaidStandardRenderer(encodedRuntime, { document }).compile(
        "percent encoded PNG",
      );
      if (encoded.scene?.images?.length !== 1 || atob(encoded.scene.images[0]!.rgba).charCodeAt(0) !== 255) {
        throw new Error("Percent-encoded binary image did not capture.");
      }
      return { byteAndSourceBounds: true, rasterPixels: 32, timeoutAndAbort: true, cleanup: true, recovery: true };
    });
    console.log(`ok scene-image-bounds ${JSON.stringify(imageBounds)}`);
    for (const fixture of MERMAID_SCENE_FIXTURES) {
      try {
        const result = await page.evaluate(async (fixture) => {
          const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
          const container = document.createElement("div");
          container.style.cssText = "position:fixed;left:-10000px;top:0";
          container.innerHTML = fixture.svg;
          try {
            const initialMarkup = container.innerHTML;
            // Controlled SVG runtime isolates geometry but uses the actual compiler
            // lifecycle to capture assets before its temporary DOM is disposed.
            const compiler = new module.MermaidStandardRenderer({
              initialize() {},
              parse: () => Promise.resolve({ diagramType: "scene-fixture" }),
              render: () => Promise.resolve({ svg: fixture.svg, diagramType: "scene-fixture" }),
              getRegisteredDiagramsMetadata: () => [],
            }, { document });
            const scene = (await compiler.compile("scene fixture")).scene!;
            compiler.dispose();
            // Mount the independent original only after the owned compiler SVG
            // is gone. Otherwise its duplicate IDs make the compiler borrow the
            // original's paint servers, violating the ownership-policy oracle.
            document.body.append(container);
            if (container.innerHTML !== initialMarkup) {
              throw new Error("Scene extraction left temporary DOM mutations behind.");
            }
            const frame = module.renderMermaidNativeFrame(scene, { columnUnits: 5, rowUnits: 10 });
            if (fixture.name.startsWith("marker-")) {
              const transported = JSON.parse(JSON.stringify(scene)) as typeof scene;
              const portable = module.renderMermaidNativeFrame(transported, { columnUnits: 5, rowUnits: 10 });
              if (JSON.stringify(portable) !== JSON.stringify(frame)) {
                throw new Error("Marker scene changed after JSON transport/compiler disposal.");
              }
              module.extractMermaidScene(container.querySelector("svg")!);
              if (container.innerHTML !== initialMarkup) {
                throw new Error("Direct marker extraction left temporary probes.");
              }
            }
            const paths = scene.items.filter((item) => item.kind === "path");
            const labels = scene.items.filter((item) => item.kind === "text");
            const require = (condition: unknown, message: string) => {
              if (!condition) throw new Error(message);
            };
            let strokeComparisons: number | undefined;
            let clipComparisons: number | undefined;
            let paintComparisons: number | undefined;
            let expectedDiagnostics: string[] = [];
            if (fixture.name === "mathml-styles-links-and-hidden") {
              require(
                labels.length === 4 && labels.every((item) => item.math && item.href === "https://example.test/math"),
                "Math token capture lost links or exposed hidden/annotation text.",
              );
              require(labels.every((item) => item.color === "rgb(20, 80, 160)"), "Math color was not preserved.");
              const native = module.renderMermaidNativeFrame(scene);
              const exponent = native.cells.flat().find((cell) => cell.char === "2");
              require(
                exponent?.href === "https://example.test/math" && exponent.bold && exponent.foreground?.includes("0.5"),
                "Math glyph lost composite opacity, emphasis or link.",
              );
              const markup = container.innerHTML;
              module.extractMermaidScene(container.querySelector("svg")!);
              require(container.innerHTML === markup, "Direct math extraction leaked its baseline probes.");
            } else if (fixture.name === "unsupported-paint-diagnostics") {
              expectedDiagnostics = [
                "SVG filter primitive needs scene expansion: feTurbulence",
              ];
              const dash = scene.animations?.find((track) =>
                track.target.kind === "path" && track.target.property === "dashOffset"
              );
              require(
                dash?.timing.duration === 10000 && module.mermaidAnimationValue(dash, 5000) === 5,
                "Supported authored dash animation lost its native track/phase.",
              );
            } else if (
              [
                "gradient-and-group-paint",
                "css-blend-mode-paint",
                "filter-functions-and-primitives",
                "spatial-filter-paint",
                "local-use-shape-style-and-paint",
                "use-symbol-svg-viewports",
                "image-svg-affine-fit-and-compositing",
                "image-svg-without-viewbox",
                "marker-vertices-directions-and-subpaths",
                "marker-viewports-style-context-and-opacity",
              ].includes(fixture.name)
            ) {
              const original = container.querySelector("svg")!;
              const width = original.width.baseVal.value;
              const height = original.height.baseVal.value;
              const canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              const context = canvas.getContext("2d")!;
              const colorCanvas = document.createElement("canvas");
              colorCanvas.width = colorCanvas.height = 1;
              const colorContext = colorCanvas.getContext("2d")!;
              const colors = new Map<string, number[]>();
              const referenceSVG = original.cloneNode(true) as SVGSVGElement;
              // Native fills sample y=(row+.5)*10 (an integer). Raster pixels
              // sample at integer+.5; shift only the reference viewport so both
              // compare the same geometric point, including steep radial ramps.
              referenceSVG.setAttribute("viewBox", `0 -0.5 ${width} ${height}`);
              const image = new Image();
              const url = URL.createObjectURL(
                new Blob([new XMLSerializer().serializeToString(referenceSVG)], { type: "image/svg+xml" }),
              );
              try {
                await new Promise<void>((resolve, reject) => {
                  image.onload = () => resolve();
                  image.onerror = () => reject(new Error("Cannot decode paint reference SVG."));
                  image.src = url;
                });
                context.drawImage(image, 0, 0);
                const data = context.getImageData(0, 0, width, height).data;
                let comparisons = 0;
                let coloredComparisons = 0;
                for (let row = 0; row < Math.floor(height / 10); row++) {
                  for (let column = 0; column < Math.floor(width / 5); column++) {
                    const x = Math.floor((column + .5) * 5);
                    const y = Math.floor((row + .5) * 10);
                    const offset = (y * width + x) * 4;
                    const reference = [...data.slice(offset, offset + 4)];
                    if (fixture.name.startsWith("image-svg-") || fixture.name.startsWith("marker-")) {
                      // Native vector/image cells do not recreate SVG raster
                      // resampling and edge antialiasing under affine transforms;
                      // compare stable interiors, as for clips.
                      const stable = [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dy]) => {
                        const neighbor = ((y + dy!) * width + x + dx!) * 4;
                        return reference.every((value, channel) => Math.abs(value - data[neighbor + channel]!) <= 5);
                      });
                      if (!stable) continue;
                    }
                    const color = frame.cells[row]![column]!.background;
                    require(!!color, `Missing native paint at ${x},${y}.`);
                    let native = colors.get(color!);
                    if (!native) {
                      colorContext.clearRect(0, 0, 1, 1);
                      colorContext.fillStyle = color!;
                      colorContext.fillRect(0, 0, 1, 1);
                      native = [...colorContext.getImageData(0, 0, 1, 1).data];
                      colors.set(color!, native);
                    }
                    require(
                      native.every((value, index) => Math.abs(value - reference[index]!) <= 5),
                      `Native paint differs at ${x},${y}: ${color}, SVG ${reference}, group ${
                        JSON.stringify(scene.composites)
                      }.`,
                    );
                    comparisons++;
                    if (reference.some((value, channel) => channel < 3 && value < 240)) coloredComparisons++;
                  }
                }
                require(comparisons > 1000, "Insufficient SVG paint comparisons.");
                if (fixture.name.startsWith("marker-")) {
                  require(paths.length > 10, "Marker vertices were not expanded into native shapes.");
                  require(coloredComparisons >= 100, "Marker paint oracle compared too few colored interiors.");
                }
                paintComparisons = comparisons;
                if (fixture.name === "image-svg-affine-fit-and-compositing") {
                  require(scene.images!.length < 14, "Repeated SVG image placements did not share captured variants.");
                  require(
                    scene.items.filter((item) => item.kind === "image").length === 14,
                    "Missing measured image item.",
                  );
                  require(
                    frame.cells.some((row) => row.some((cell) => cell.href === "https://example.test/image-detail")),
                    "Reused image lost its clickable link.",
                  );
                }
              } finally {
                URL.revokeObjectURL(url);
              }
            } else if (fixture.name === "image-html-object-fit") {
              const images = scene.items.filter((item) => item.kind === "image");
              require(
                scene.images?.length === 2 && images.length === 6,
                "Mixed HTML/SVG image capture/extraction is incomplete.",
              );
              const expected = [[10, 30, 80, 40], [70, 10, 120, 60], [210, 10, 80, 60], [310, 10, 32, 16], [
                434,
                32,
                32,
                16,
              ], [10, 110, 80, 60]];
              for (const [index, image] of images.entries()) {
                require(
                  [image.x, image.y, image.width, image.height].every((value, part) =>
                    Math.abs(value - expected[index]![part]!) < .01
                  ),
                  `HTML object-fit mismatch: ${JSON.stringify(image)}.`,
                );
              }
              require(
                frame.cells[3]![2]!.background === "rgb(255, 0, 0)",
                "HTML contain image did not paint into native cells.",
              );
              require(
                !!scene.images![images[5]!.image!]!.viewport,
                "SVG image reused the HTML natural-size raster instead of its viewport capture.",
              );
            } else if (fixture.name === "use-links-text-and-invalid-references") {
              expectedDiagnostics = [
                "Cyclic SVG use references cannot be expanded.",
                "External/unresolved SVG use references need host-controlled scene expansion.",
                "Active SVG use content needs a host-controlled adapter.",
              ];
              require(paths.length === 2 && labels.length === 1, "Use definitions leaked or visible content was lost.");
              require(
                !(globalThis as typeof globalThis & { __exotuiUseScript?: boolean }).__exotuiUseScript,
                "Use reference executed a script.",
              );
              require(
                labels[0]!.text === "Reused" && labels[0]!.href === "https://example.test/outer",
                "Reused label lost its link.",
              );
              require(paths[1]!.href === "https://example.test/inner", "The referenced subtree's link was overridden.");
              require(
                frame.cells.some((row) => row.some((cell) => cell.href === "https://example.test/outer")),
                "Reused links are absent from native cells.",
              );
            } else if (fixture.name === "svg-clip-coordinate-spaces-and-intersections") {
              const original = container.querySelector("svg")!;
              const canvas = document.createElement("canvas");
              canvas.width = 360;
              canvas.height = 240;
              const context = canvas.getContext("2d")!;
              const image = new Image();
              const url = URL.createObjectURL(
                new Blob([new XMLSerializer().serializeToString(original)], { type: "image/svg+xml" }),
              );
              try {
                await new Promise<void>((resolve, reject) => {
                  image.onload = () => resolve();
                  image.onerror = () => reject(new Error("Cannot decode the independent clip reference SVG."));
                  image.src = url;
                });
                context.drawImage(image, 0, 0);
                const data = context.getImageData(0, 0, 360, 240).data;
                const alpha = (x: number, y: number) => data[(Math.floor(y) * 360 + Math.floor(x)) * 4 + 3]!;
                let comparisons = 0;
                for (let row = 0; row < 23; row++) {
                  for (let column = 0; column < 71; column++) {
                    const x = (column + 0.5) * 5;
                    const y = (row + 0.5) * 10;
                    const samples = [[0, 0], [-1, -1], [1, 1], [-1, 1], [1, -1]].map(([dx, dy]) =>
                      alpha(x + dx!, y + dy!)
                    );
                    if (!samples.every((value) => value === 0) && !samples.every((value) => value === 255)) continue;
                    const painted = frame.cells[row]![column]!.background !== undefined;
                    require(
                      painted === (samples[0]! > 0),
                      `Native clip differs from Chromium SVG paint at ${x},${y}: ${painted}.`,
                    );
                    comparisons++;
                  }
                }
                require(comparisons > 1000, "Too few independent clip comparisons.");
                require(paths.every((path) => !!path.clip), "A clip constraint was lost during extraction.");
                clipComparisons = comparisons;
              } finally {
                URL.revokeObjectURL(url);
              }
            } else if (fixture.name === "svg-dash-distance-and-calibration") {
              const original = [...container.querySelectorAll("path")];
              let comparisons = 0;
              for (const element of original) {
                const inverse = element.getScreenCTM()!.inverse();
                const root = container.querySelector("svg")!.getScreenCTM()!;
                const matrix = inverse.multiply(root);
                const y =
                  element.getPointAtLength(0).matrixTransform(element.getScreenCTM()!).matrixTransform(root.inverse())
                    .y;
                for (let x = 15; x < 190; x += 5) {
                  // Exclude dash boundaries across the full cell, with a small
                  // guard for CSS layout's subpixel quantization. A gap at the
                  // centre alone does not mean a cell contains no painted tip.
                  const samples = [-2.6, 0, 2.6].map((delta) =>
                    element.isPointInStroke(new DOMPoint(x + delta, y).matrixTransform(matrix))
                  );
                  if (!samples.every((value) => value === samples[1])) continue;
                  const char = frame.cells[Math.round(y / 10)]![Math.round(x / 5)]!.char;
                  if (samples[1]) require(char !== " ", `SVG painted dash missing at ${x},${y}.`);
                  else {
                    const paint = paths[original.indexOf(element)]!.paint;
                    require(
                      char === " ",
                      `Native stroke painted SVG gap at ${x},${y}: ${char} ${JSON.stringify(paint)}.`,
                    );
                  }
                  comparisons++;
                }
              }
              require(comparisons > 100, "Too few independent browser stroke comparisons.");
              strokeComparisons = comparisons;
              require(
                frame.cells[1]!.filter((cell) => cell.char === "─").length >= 25,
                "Arrow gap made the whole solid line dotted.",
              );
              require(
                paths[2]!.points.at(-1)!.distance === 100 && paths[2]!.points.at(-1)!.x === 210,
                "Transform lost original local distance.",
              );
              require(
                paths[2]!.paint.dash.join(",") === "20,20" && paths[2]!.paint.dashOffset === -10,
                "Author pathLength calibration was lost.",
              );
              require(
                paths[7]!.paint.dash.every(Number.isFinite) && paths[7]!.paint.dash[1] === 10 &&
                  paths[7]!.paint.dash[2] === 7 && paths[7]!.paint.dashOffset! < -3,
                "Computed CSS dash lengths/offset were not resolved by the DOM.",
              );
            } else if (fixture.name === "solid-zero-dash-patterns") {
              require(
                paths[0]?.paint.dash.length === 0 && paths[1]?.paint.dash.length === 0,
                "SVG zero patterns aren't solid.",
              );
              require(paths[2]?.paint.dash.join(",") === "0,3", "Zero-length dots with a positive gap were removed.");
              require(
                frame.cells[1]!.some((cell) => cell.char === "─") && !frame.cells[1]!.some((cell) => cell.char === "┄"),
                "Native solid stroke became dotted.",
              );
              require(frame.cells[5]!.some((cell) => cell.char === "┄"), "Native dotted stroke became solid.");
            } else if (fixture.name === "disconnected-relative-contours") {
              const contours = paths[0]?.subpaths;
              require(contours?.length === 2, "Disconnected contours were flattened.");
              require(
                contours![1]!.points[0]!.x === 80 && contours![1]!.points.at(-1)!.x === 110,
                "Relative moveto/implicit lineto lost.",
              );
              require(
                frame.cells.every((row) => row.slice(9, 15).every((cell) => !cell.foreground)),
                "Native strokes joined disconnected contours.",
              );
            } else if (fixture.name === "compound-fill-rules") {
              require(!frame.cells[5]![10]!.background, "Evenodd hole was filled.");
              require(!!frame.cells[5]![30]!.background, "Nonzero same-direction contour became a hole.");
              require(!frame.cells[5]![50]!.background, "Nonzero opposite-direction hole was filled.");
            } else if (fixture.name === "endpoint-marker-coordinates-and-context") {
              require(paths.length === 2, "Endpoint marker geometry is missing.");
              const arrow = paths[1]!;
              const xs = arrow.points.map((point) => point.x);
              const ys = arrow.points.map((point) => point.y);
              const close = (actual: number, expected: number) => Math.abs(actual - expected) < 1.5;
              require(
                close(Math.min(...xs), 130) && close(Math.max(...xs), 150) && close(Math.min(...ys), 40) &&
                  close(Math.max(...ys), 60),
                `Marker lost its source transform or reference point: ${
                  JSON.stringify([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)])
                }`,
              );
              require(arrow.paint.fill === "rgb(10, 20, 30)", "Marker lost context-stroke paint.");
              require(
                frame.cells.some((row) => row.slice(26, 31).some((cell) => cell.background === "rgb(10, 20, 30)")),
                "Endpoint marker absent from native cells.",
              );
            } else if (fixture.name === "wrapped-html-and-hidden-ancestors") {
              require(labels.length >= 2, "Wrapped label wasn't extracted per line.");
              require(new Set(labels.map((label) => label.y)).size >= 2, "Wrapped lines lost vertical positions.");
              require(labels.every((label) => label.height <= 20), "A text run still spans multiple lines.");
              require(
                labels.map((label) => label.text).join(" ").replace(/\s+/g, " ").trim() === "Alpha beta gamma delta",
                "Visible text was lost or hidden text leaked.",
              );
            }
            require(
              scene.diagnostics.length === expectedDiagnostics.length &&
                expectedDiagnostics.every((message) => scene.diagnostics.includes(message)),
              `Unexpected fidelity diagnostics: ${scene.diagnostics.join(", ")}`,
            );
            return {
              items: scene.items.length,
              nativeSize: [frame.columns, frame.rows],
              strokeComparisons,
              clipComparisons,
              paintComparisons,
            };
          } finally {
            container.remove();
          }
        }, fixture);
        console.log(`ok scene:${fixture.name} ${JSON.stringify(result)}`);
      } catch (error) {
        failures.push(`scene:${fixture.name}`);
        console.log(`FAIL scene:${fixture.name}: ${(error as Error).message}`);
      }
    }
    for (const fixture of MERMAID_STANDARD_FIXTURES) {
      try {
        const result = await page.evaluate(async (fixture) => {
          const module = await import("/mod.mermaid.js") as typeof import("../mod.mermaid.ts");
          const renderer = await module.createMermaidStandardRenderer();
          const portals = document.querySelectorAll("#headlessui-portal-root, .zenuml").length;
          const diagramType = await renderer.parse(fixture.source);
          const diagram = await renderer.compile(fixture.source);
          if (!diagram.svg.startsWith("<svg")) throw new Error("No authoritative SVG.");
          if (!diagram.scene?.items.length) throw new Error("No measured visible scene items.");
          if (
            diagram.scene.items.some((item) =>
              item.kind === "path"
                ? item.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
                : !Number.isFinite(item.x) || !Number.isFinite(item.y)
            )
          ) throw new Error("Scene contains non-finite geometry.");
          if (document.querySelectorAll("[id^=exotui-mermaid-standard-]").length) {
            throw new Error("Compiler left a mounted SVG behind.");
          }
          if (document.querySelectorAll("#headlessui-portal-root, .zenuml").length !== portals) {
            throw new Error("ZenUML validation constructed a viewer or leaked portal DOM.");
          }
          const frame = module.renderMermaidNativeFrame(diagram.scene);
          if (!frame.cells.length || !module.mermaidNativeLines(frame).some((line) => line.trim())) {
            throw new Error("No native diagram cells.");
          }
          const documents = await import("/mod.document.js") as typeof import("../mod.document.ts");
          const source = `# Diagram\n\n\`\`\`mermaid\n${fixture.source}\n\`\`\`\n\nAfter diagram.`;
          const prepared = await module.prepareMermaidMarkdown(source, { compile: () => Promise.resolve(diagram) });
          const lines = documents.renderMarkdown(prepared.document, { ...prepared.render, width: 80 });
          if (lines.some((line) => line.text.includes("```mermaid"))) {
            throw new Error("Full native Markdown reverted to source.");
          }
          if (
            ["flowchart-features", "sequenceDiagram", "gantt", "classDiagram", "flowchart-markdown"].includes(
              fixture.name,
            )
          ) {
            const { padNativeRow } = await import("/tests/fixtures/mermaid_standard/lifecycle.js");
            const surface = new documents.MarkdownSurface({ source, render: prepared.render });
            try {
              await surface.ready;
              for (const [width, height, offset] of [[80, 12, 0], [80, 7, 3], [40, 9, 4], [80, 12, 0]] as const) {
                surface.component.controller.scrollTo(offset, width, height);
                // Compare visible cells, intentionally removing terminal SGR controls.
                // deno-lint-ignore no-control-regex
                const actual = surface.render(width, height).map((row) => row.replace(/\x1b\[[0-9;]*m/g, ""));
                const expected = surface.component.controller.visible(width, height).map((row) =>
                  padNativeRow(row.text, width)
                );
                while (expected.length < height) expected.push(" ".repeat(width));
                if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                  throw new Error(`Native mounted rows differ at ${width}x${height}, offset ${offset}.`);
                }
                await Promise.resolve();
                await Promise.resolve();
              }
            } finally {
              surface.dispose();
            }
          }
          return {
            diagramType,
            renderedType: diagram.diagramType,
            items: diagram.scene.items.length,
            texts: diagram.scene.items.filter((item) => item.kind === "text").length,
            diagnostics: diagram.scene.diagnostics,
            nativeSize: [frame.columns, frame.rows],
            nativeDiagnostics: frame.diagnostics,
            documentDiagnostics: prepared.diagnostics,
          };
        }, fixture);
        covered.add(result.diagramType);
        console.log(`ok ${fixture.name} ${JSON.stringify(result)}`);
      } catch (error) {
        failures.push(fixture.name);
        console.log(`FAIL ${fixture.name}: ${(error as Error).stack ?? error}`);
      }
    }
    const uncovered = catalogue.filter((id: string) => !covered.has(id));
    for (const id of uncovered) console.log(`UNCOVERED upstream diagram: ${id}`);
    console.log(JSON.stringify({ fixtures: MERMAID_STANDARD_FIXTURES.length, failures, catalogue, uncovered }));
    // Unsupported extraction/rendering is never silently counted as coverage.
    if (failures.length || uncovered.length) runtimeHost.exitCode = 1;
  }
} finally {
  try {
    await browser?.close();
  } finally {
    await server.shutdown();
  }
}
