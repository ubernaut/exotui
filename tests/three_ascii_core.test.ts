// Copyright 2023 Im-Beast. MIT license.
import { Color, PerspectiveCamera, Scene } from "three";

import { assertEquals, assertRejects, assertStrictEquals, assertStringIncludes, assertThrows } from "./deps.ts";
import { AcerolaAsciiNode, type AcerolaAsciiRenderProfile } from "../src/three_ascii/AcerolaAsciiNode.ts";
import { buildThreeAsciiAnsiGrid, type ThreeAsciiAnsiGridInput } from "../src/three_ascii/ansi_grid.ts";
import {
  colorToBytes,
  colorValue,
  createLinearByteCache,
  linearUnitToByte,
  rgbToAnsiBackground,
  rgbToAnsiForeground,
  ThreeAsciiAnsiBackgroundState,
  ThreeAsciiAnsiColorKeyCache,
} from "../src/three_ascii/colors.ts";
import {
  applyThreeAsciiComputeResourcePlanState,
  createThreeAsciiComputeBindGroups,
  createThreeAsciiComputeDispatchPlan,
  createThreeAsciiComputePipeline,
  createThreeAsciiComputeResourcePlan,
  destroyThreeAsciiGpuBufferSlot,
  encodeThreeAsciiComputeDispatchCommands,
  ensureThreeAsciiGpuBufferSlot,
  THREE_ASCII_UNIFORM_FLOAT_COUNT,
  ThreeAsciiComputeDispatchPlanCache,
  type ThreeAsciiGpuBuffer,
  type ThreeAsciiGpuBufferDevice,
  writeThreeAsciiUniformValues,
} from "../src/three_ascii/compute_resources.ts";
import {
  defaultThreeAsciiEffectState,
  patchThreeAsciiEffectOptions,
  resolveThreeAsciiComputeMode,
  shouldIncludeThreeAsciiTerminalEdges,
  threeAsciiEffectOptionsAffectComputeUniforms,
  threeAsciiEffectStateFromSource,
  type ThreeAsciiEffectStateSource,
} from "../src/three_ascii/effect_state.ts";
import {
  emptyThreeAsciiRenderFrame,
  resolveThreeAsciiRenderFrameSelection,
  resolveThreeAsciiRenderFrameSelectionInto,
  THREE_ASCII_ANSI_FRAME_OPTIONS,
  THREE_ASCII_IMAGE_FRAME_OPTIONS,
} from "../src/three_ascii/frame_options.ts";
import { compactMappedRgbaRows } from "../src/three_ascii/headless_canvas.ts";
import {
  createThreeAsciiRendererPerformance,
  createThreeAsciiRendererSaturatedPerformance,
} from "../src/three_ascii/performance.ts";
import {
  resolveThreeAsciiRenderProfile,
  resolveThreeAsciiRenderProfileInto,
} from "../src/three_ascii/render_profile.ts";
import {
  DEFAULT_THREE_ASCII_DEFERRED_READBACK_MAX_STALE_FRAMES,
  DEFAULT_THREE_ASCII_DEFERRED_READBACK_SLOTS,
  DEFAULT_THREE_ASCII_PIXEL_ASPECT_RATIO,
  DEFAULT_THREE_ASCII_TERMINAL_EDGE_BIAS,
  normalizeThreeAsciiRendererOptions,
  normalizeThreeAsciiRenderSize,
  normalizeThreeAsciiTerminalEdgeBias,
} from "../src/three_ascii/renderer_options.ts";
import {
  resolveThreeAsciiDeferredPreSceneFrame,
  resolveThreeAsciiDeferredReadbackStaleness,
  ThreeAsciiDeferredReadbackQueue,
} from "../src/three_ascii/deferred_readback.ts";
import {
  assembleThreeAsciiReadbackGrid,
  assembleThreeAsciiReadbackGridWithContext,
  createThreeAsciiReadbackCopyPlan,
  createThreeAsciiReadbackLayout,
  createThreeAsciiReadbackViews,
  executeThreeAsciiReadbackCopyPlan,
  ThreeAsciiReadbackCopyPlanCache,
  type ThreeAsciiReadbackCopySource,
  type ThreeAsciiReadbackCopySources,
  type ThreeAsciiReadbackCopySourceSlots,
  type ThreeAsciiReadbackLayout,
  ThreeAsciiReadbackLayoutCache,
  type ThreeAsciiReadbackLayoutOptions,
  ThreeAsciiReadbackViewCache,
  type ThreeAsciiReadbackViews,
  writeThreeAsciiReadbackCopySourceDescriptors,
  writeThreeAsciiReadbackCopySources,
  writeThreeAsciiReadbackCopySourceSlots,
  writeThreeAsciiReadbackLayoutOptions,
} from "../src/three_ascii/readback.ts";
import {
  computeThreeAsciiCameraAspect,
  handleThreeAsciiDeferredReadbackFailure,
  readThreeAsciiImageFrame,
  resolveThreeAsciiDeferredReadbackSubmission,
  shouldUpdateThreeAsciiCameraAspect,
  THREE_ASCII_CAMERA_ASPECT_EPSILON,
  ThreeAsciiReadbackError,
  ThreeAsciiRenderer,
  withThreeAsciiMappedReadback,
} from "../src/three_ascii/renderer.ts";
import {
  THREE_ASCII_COLOR_SHADER,
  THREE_ASCII_EDGE_SHADER,
  THREE_ASCII_FILL_SHADER,
  THREE_ASCII_FLAT_COLOR_SHADER,
  THREE_ASCII_TERMINAL_EDGE_THRESHOLD_SCALE,
  THREE_ASCII_TILE_SIZE,
  THREE_ASCII_WORKGROUP_SIZE,
} from "../src/three_ascii/shaders.ts";
import { getCompatibleWebGPUDevice, resetCompatibleWebGPUDeviceCache } from "../src/three_ascii/webgpu_compat.ts";

function visibleAnsiCell(cell: string): string {
  let text = "";
  for (let index = 0; index < cell.length;) {
    if (cell.charCodeAt(index) === 27 && cell[index + 1] === "[") {
      index += 2;
      while (index < cell.length && cell[index] !== "m") index += 1;
      if (cell[index] === "m") index += 1;
      continue;
    }
    text += cell[index];
    index += 1;
  }
  return text;
}

function renderSingleThreeAsciiCell(
  input:
    & Pick<ThreeAsciiAnsiGridInput, "terminalGlyphStyle">
    & Partial<Pick<ThreeAsciiAnsiGridInput, "edgeGlyphs" | "fillGlyphs">>,
): string {
  const grid = buildThreeAsciiAnsiGrid({
    columns: 1,
    rows: 1,
    fillGlyphs: input.fillGlyphs ?? [14],
    colors: [255, 255, 255, 1],
    edgeGlyphs: input.edgeGlyphs,
    terminalGlyphStyle: input.terminalGlyphStyle,
  });
  return visibleAnsiCell(grid[0]?.[0] ?? "");
}

Deno.test("three ascii shader constants preserve renderer dimensions", () => {
  assertEquals(THREE_ASCII_TILE_SIZE, 8);
  assertEquals(THREE_ASCII_WORKGROUP_SIZE, 8);
  assertEquals(THREE_ASCII_TERMINAL_EDGE_THRESHOLD_SCALE, 2);
});

Deno.test("three ascii WGSL shaders include expected bindings and workgroup size", () => {
  assertStringIncludes(THREE_ASCII_FILL_SHADER, "@binding(2) var<storage, read_write> glyphs: array<f32>;");
  assertStringIncludes(
    THREE_ASCII_EDGE_SHADER,
    `@workgroup_size(${THREE_ASCII_WORKGROUP_SIZE}, ${THREE_ASCII_WORKGROUP_SIZE}, 1)`,
  );
  assertStringIncludes(THREE_ASCII_EDGE_SHADER, `for (var row = 0; row < ${THREE_ASCII_TILE_SIZE}; row += 1)`);
  assertStringIncludes(THREE_ASCII_COLOR_SHADER, "@binding(3) var<storage, read_write> colors: array<vec4<f32>>;");
  assertStringIncludes(THREE_ASCII_FLAT_COLOR_SHADER, "@binding(2) var<storage, read_write> colors: array<vec4<f32>>;");
  assertEquals(THREE_ASCII_FLAT_COLOR_SHADER.includes("normalsTex"), false);
});

Deno.test("three ascii color helpers preserve Color inputs and resolve fallbacks", () => {
  const color = new Color("#112233");

  assertStrictEquals(colorValue(color, 0), color);
  assertEquals(colorValue(undefined, 0xff0000).getHex(), 0xff0000);
  assertEquals(colorValue("#00ff00", 0).getHex(), 0x00ff00);
});

Deno.test("three ascii color helpers convert linear channels to srgb bytes", () => {
  assertEquals(linearUnitToByte(-1), 0);
  assertEquals(linearUnitToByte(0), 0);
  assertEquals(linearUnitToByte(1), 255);
  assertEquals(colorToBytes(new Color(0.25, 0.5, 1)), [137, 188, 255]);
});

Deno.test("three ascii color helpers format terminal truecolor sequences", () => {
  assertEquals(rgbToAnsiForeground(1, 2, 3), "\x1b[38;2;1;2;3m");
  assertEquals(rgbToAnsiBackground(4, 5, 6), "\x1b[48;2;4;5;6m");
});

Deno.test("three ascii linear byte cache preserves conversion through clear and prune", () => {
  const cache = createLinearByteCache();
  const expected = linearUnitToByte(0.5);

  assertEquals(cache(0.5), expected);
  assertEquals(cache(0.5), expected);
  cache.clear();
  assertEquals(cache(0.5), expected);
  cache.prune();
  assertEquals(cache(0.5), expected);
});

Deno.test("ThreeAsciiAnsiColorKeyCache converts and preserves linear RGB byte keys", () => {
  const cache = new ThreeAsciiAnsiColorKeyCache();
  cache.prepare(2);

  assertEquals(cache.keyForIndex(0, 1, 0, 0), 0xff0000);
  assertEquals(cache.keyForIndex(1, 0, 1, 0), 0x00ff00);
  const first = cache.keyForIndex(0, 0.25, 0.5, 1);
  assertEquals(cache.keyForIndex(0, 0.25, 0.5, 1), first);

  cache.clear();
  cache.prepare(1);
  assertEquals(cache.keyForIndex(0, 0.25, 0.5, 1), first);
});

Deno.test("ThreeAsciiAnsiColorKeyCache resizes indexed frame cache", () => {
  const cache = new ThreeAsciiAnsiColorKeyCache();
  cache.prepare(2);
  cache.keyForIndex(1, 0, 1, 0);

  cache.prepare(1);
  assertEquals(cache.keyForIndex(0, 1, 0, 0), 0xff0000);
});

Deno.test("ThreeAsciiAnsiBackgroundState reports only effective background changes", () => {
  const state = new ThreeAsciiAnsiBackgroundState();

  assertEquals(state.set(0x010203), true);
  assertEquals(state.key, 0x010203);
  assertEquals(state.ansi, "\x1b[48;2;1;2;3m");
  assertEquals(state.blankAnsi, "\x1b[48;2;1;2;3m \x1b[0m");
  assertEquals(state.set(0x010203), false);
  assertEquals(state.set("#010203"), false);
  assertEquals(state.set(0x030201), true);
  assertEquals(state.key, 0x030201);
});

Deno.test("ThreeAsciiAnsiBackgroundState tracks mutable Color inputs and clear", () => {
  const state = new ThreeAsciiAnsiBackgroundState();
  const color = new Color(0x010203);

  assertEquals(state.set(color), true);
  assertEquals(state.set(color), false);
  color.set(0x030201);
  assertEquals(state.set(color), true);
  assertEquals(state.key, 0x030201);

  state.clear();
  assertEquals(state.key, -1);
  assertEquals(state.ansi, "");
  assertEquals(state.blankAnsi, "");
  assertEquals(state.set(0x030201), true);
});

Deno.test("three ascii grid maps block mode to full-cell block fills", () => {
  assertEquals(renderSingleThreeAsciiCell({ terminalGlyphStyle: "blocks", fillGlyphs: [0] }), " ");
  assertEquals(renderSingleThreeAsciiCell({ terminalGlyphStyle: "blocks", fillGlyphs: [14] }), "█");
});

Deno.test("three ascii grid glyph and mixed modes keep distinct fill glyph tables", () => {
  const glyphCell = renderSingleThreeAsciiCell({ terminalGlyphStyle: "glyphs", fillGlyphs: [12] });
  const mixedCell = renderSingleThreeAsciiCell({ terminalGlyphStyle: "mixed", fillGlyphs: [12] });

  assertEquals(glyphCell, "#");
  assertEquals(mixedCell, "▇");
});

Deno.test("three ascii grid glyph mode preserves the complete semantic fill ramp", () => {
  const renderedRamp = Array.from(
    { length: 10 },
    (_, bucket) => renderSingleThreeAsciiCell({ terminalGlyphStyle: "glyphs", fillGlyphs: [bucket + 5] }),
  ).join("");

  assertEquals(renderedRamp, " .:-=+*#%@");
});

Deno.test("three ascii grid promotes strong edges in edge-capable modes", () => {
  assertEquals(renderSingleThreeAsciiCell({ terminalGlyphStyle: "glyphs", edgeGlyphs: [1, 64, 64, 0] }), "|");
  assertEquals(renderSingleThreeAsciiCell({ terminalGlyphStyle: "glyphs", edgeGlyphs: [1, 1, 64, 0] }), "@");
});

Deno.test("three ascii camera aspect accounts for terminal cell geometry", () => {
  assertEquals(computeThreeAsciiCameraAspect({ columns: 80, rows: 40, pixelAspectRatio: 0.5 }), 1);
  assertEquals(computeThreeAsciiCameraAspect({ columns: 120, rows: 40, pixelAspectRatio: 0.5 }), 1.5);
  assertEquals(computeThreeAsciiCameraAspect({ columns: 10, rows: 0, pixelAspectRatio: 0.5 }), 5);
  assertEquals(computeThreeAsciiCameraAspect({ columns: 10, rows: -2, pixelAspectRatio: 0.5 }), 5);
});

Deno.test("three ascii camera aspect update threshold ignores epsilon-sized differences", () => {
  assertEquals(
    shouldUpdateThreeAsciiCameraAspect(1, 1 + THREE_ASCII_CAMERA_ASPECT_EPSILON),
    false,
  );
  assertEquals(
    shouldUpdateThreeAsciiCameraAspect(1, 1 + THREE_ASCII_CAMERA_ASPECT_EPSILON * 2),
    true,
  );
});

Deno.test("three ascii compute mode matches terminal glyph style requirements", () => {
  assertEquals(resolveThreeAsciiComputeMode({ edges: true, depthFalloff: 0 }, "blocks"), {
    includeFill: false,
    includeEdges: false,
    includeDepthColor: false,
    includeFillReadback: false,
  });
  assertEquals(resolveThreeAsciiComputeMode({ edges: true, depthFalloff: 0 }, "glyphs").includeEdges, true);
  assertEquals(resolveThreeAsciiComputeMode({ edges: true, depthFalloff: 0 }, "mixed").includeFillReadback, true);
  assertEquals(resolveThreeAsciiComputeMode({ edges: false, depthFalloff: 0 }, "glyphs"), {
    includeFill: true,
    includeEdges: false,
    includeDepthColor: false,
    includeFillReadback: true,
  });
  assertEquals(resolveThreeAsciiComputeMode({ edges: false, depthFalloff: 0.1 }, "blocks"), {
    includeFill: false,
    includeEdges: false,
    includeDepthColor: true,
    includeFillReadback: false,
  });
});

Deno.test("three ascii effect option patches report changed values and uniform dirtiness", () => {
  const target = { normalThreshold: 0.1, edgeThreshold: 8 };

  const noOp = patchThreeAsciiEffectOptions(target, { normalThreshold: 0.1 });
  assertEquals(noOp.changed, false);
  assertEquals(noOp.patch, {});
  assertEquals(noOp.uniformDirty, false);
  assertEquals(target.normalThreshold, 0.1);

  const changed = patchThreeAsciiEffectOptions(target, { normalThreshold: 0.2, edgeThreshold: 6 });
  assertEquals(changed.changed, true);
  assertEquals(changed.patch, { normalThreshold: 0.2, edgeThreshold: 6 });
  assertEquals(changed.uniformDirty, true);
  assertEquals(target.normalThreshold, 0.2);
  assertEquals(target.edgeThreshold, 6);
  assertEquals(threeAsciiEffectOptionsAffectComputeUniforms({ edgeThreshold: 4 }), true);
  assertEquals(threeAsciiEffectOptionsAffectComputeUniforms({ exposure: 1.2 }), true);
  assertEquals(threeAsciiEffectOptionsAffectComputeUniforms({ normalThreshold: 0.2 }), false);
  assertEquals(threeAsciiEffectOptionsAffectComputeUniforms({ offset: { x: 1, y: 1 } }), false);
});

Deno.test("three ascii effect option patches normalize colors and compare offsets by value", () => {
  const colors = {
    asciiColor: new Color(0xffffff),
    backgroundColor: 0x000000,
  };

  const noColorOp = patchThreeAsciiEffectOptions(colors, {
    asciiColor: "#ffffff",
    backgroundColor: new Color(0x000000),
  });
  assertEquals(noColorOp.changed, false);
  assertEquals(noColorOp.uniformDirty, false);

  const colorChange = patchThreeAsciiEffectOptions(colors, { backgroundColor: "#010203" });
  assertEquals(colorChange.changed, true);
  assertEquals(colorChange.uniformDirty, true);
  assertEquals((colorChange.patch.backgroundColor as Color).getHex(), 0x010203);
  assertEquals((colors.backgroundColor as Color).getHex(), 0x010203);

  const offset = { offset: { x: 1, y: 2 } };
  assertEquals(patchThreeAsciiEffectOptions(offset, { offset: { x: 1, y: 2 } }).changed, false);
  const offsetChange = patchThreeAsciiEffectOptions(offset, { offset: { x: 2, y: 2 } });
  assertEquals(offsetChange.changed, true);
  assertEquals(offsetChange.patch.offset, { x: 2, y: 2 });
  assertEquals(offsetChange.uniformDirty, false);
});

Deno.test("three ascii effect state applies defaults and projects Acerola node state", () => {
  const defaults = defaultThreeAsciiEffectState({
    asciiColor: 0x123456,
    backgroundColor: "#010203",
  });

  assertEquals(defaults.edges, true);
  assertEquals(defaults.fill, true);
  assertEquals(defaults.invertLuminance, false);
  assertEquals(defaults.exposure, 1);
  assertEquals(defaults.attenuation, 1);
  assertEquals(defaults.blendWithBase, 0);
  assertEquals(defaults.depthFalloff, 0);
  assertEquals(defaults.depthOffset, 0);
  assertEquals(defaults.edgeThreshold, 8);
  assertEquals(defaults.asciiColor.getHex(), 0x123456);
  assertEquals(defaults.backgroundColor.getHex(), 0x010203);

  const configured = defaultThreeAsciiEffectState({
    edges: false,
    fill: false,
    invertLuminance: true,
    exposure: 1.4,
    attenuation: 0.8,
    blendWithBase: 0.5,
    depthFalloff: 0.18,
    depthOffset: 110,
    edgeThreshold: 12,
  });
  assertEquals(configured.edges, false);
  assertEquals(configured.fill, false);
  assertEquals(configured.invertLuminance, true);
  assertEquals(configured.exposure, 1.4);
  assertEquals(configured.attenuation, 0.8);
  assertEquals(configured.blendWithBase, 0.5);
  assertEquals(configured.depthFalloff, 0.18);
  assertEquals(configured.depthOffset, 110);
  assertEquals(configured.edgeThreshold, 12);

  const asciiColor = new Color(0xff3300);
  const backgroundColor = new Color(0x001122);
  const source: ThreeAsciiEffectStateSource = {
    edges: { value: 0 },
    fill: { value: 1 },
    invertLuminance: { value: "yes" },
    exposure: { value: "1.5" },
    attenuation: { value: 0.75 },
    blendWithBase: { value: "0.25" },
    depthFalloff: { value: "2" },
    depthOffset: { value: 3 },
    edgeThreshold: { value: "9" },
    asciiColor: { value: asciiColor },
    backgroundColor: { value: backgroundColor },
  };
  const projected = threeAsciiEffectStateFromSource(source);
  assertEquals(projected.edges, false);
  assertEquals(projected.fill, true);
  assertEquals(projected.invertLuminance, true);
  assertEquals(projected.exposure, 1.5);
  assertEquals(projected.attenuation, 0.75);
  assertEquals(projected.blendWithBase, 0.25);
  assertEquals(projected.depthFalloff, 2);
  assertEquals(projected.depthOffset, 3);
  assertEquals(projected.edgeThreshold, 9);
  assertEquals(projected.asciiColor, asciiColor);
  assertEquals(projected.backgroundColor, backgroundColor);
});

Deno.test("three ascii terminal edge overlay is disabled for block rendering", () => {
  assertEquals(shouldIncludeThreeAsciiTerminalEdges({ edges: true }, "glyphs"), true);
  assertEquals(shouldIncludeThreeAsciiTerminalEdges({ edges: true }, "mixed"), true);
  assertEquals(shouldIncludeThreeAsciiTerminalEdges({ edges: true }, "blocks"), false);
  assertEquals(shouldIncludeThreeAsciiTerminalEdges({ edges: false }, "glyphs"), false);
});

Deno.test("three ascii frame selection resolves ANSI and image outputs", () => {
  assertEquals(resolveThreeAsciiRenderFrameSelection(), { renderAnsi: true, renderImage: false });
  assertEquals(resolveThreeAsciiRenderFrameSelection({}), { renderAnsi: true, renderImage: false });
  assertEquals(resolveThreeAsciiRenderFrameSelection(THREE_ASCII_ANSI_FRAME_OPTIONS), {
    renderAnsi: true,
    renderImage: false,
  });
  assertEquals(resolveThreeAsciiRenderFrameSelection({ ansi: false, image: true }), {
    renderAnsi: false,
    renderImage: true,
  });
  assertEquals(resolveThreeAsciiRenderFrameSelection(THREE_ASCII_IMAGE_FRAME_OPTIONS), {
    renderAnsi: false,
    renderImage: true,
  });
  assertEquals(resolveThreeAsciiRenderFrameSelection({ ansi: true, image: true }), {
    renderAnsi: true,
    renderImage: true,
  });
});

Deno.test("three ascii frame selection reuses caller-owned records", () => {
  const target = { renderAnsi: false, renderImage: true };

  assertEquals(resolveThreeAsciiRenderFrameSelectionInto(target, THREE_ASCII_ANSI_FRAME_OPTIONS), target);
  assertEquals(target, { renderAnsi: true, renderImage: false });
  resolveThreeAsciiRenderFrameSelectionInto(target, { ansi: true, image: true });
  assertEquals(target, { renderAnsi: true, renderImage: true });
  resolveThreeAsciiRenderFrameSelectionInto(target, { ansi: false });
  assertEquals(target, { renderAnsi: false, renderImage: false });
  assertEquals(emptyThreeAsciiRenderFrame({ renderAnsi: true, renderImage: false }), { grid: [] });
  assertEquals(emptyThreeAsciiRenderFrame({ renderAnsi: false, renderImage: true }), { grid: undefined });
});

Deno.test("three ascii image frames read sync and async RGBA data", async () => {
  const syncData = new Uint8Array([1, 2, 3, 4]);
  let reads = 0;

  const syncFrame = await readThreeAsciiImageFrame({
    width: 2,
    height: 1,
    context: {
      readRGBA: () => {
        reads += 1;
        return syncData;
      },
    },
  });

  assertEquals(reads, 1);
  assertStrictEquals(syncFrame.data, syncData);
  assertEquals(syncFrame.encoding, "bytes");
  assertEquals(syncFrame.format, 32);
  assertEquals(syncFrame.pixelWidth, 2);
  assertEquals(syncFrame.pixelHeight, 1);

  const asyncData = new Uint8Array([5, 6, 7, 8]);
  const asyncFrame = await readThreeAsciiImageFrame({
    width: 1,
    height: 1,
    context: {
      readRGBA: () => Promise.resolve(asyncData),
    },
  });

  assertStrictEquals(asyncFrame.data, asyncData);
  assertEquals(asyncFrame.pixelWidth, 1);
  assertEquals(asyncFrame.pixelHeight, 1);
});

Deno.test("three ascii render profile follows output and glyph requirements", () => {
  assertEquals(
    resolveThreeAsciiRenderProfile({
      selection: { renderAnsi: false, renderImage: true },
      terminalGlyphStyle: "blocks",
    }),
    { image: true, terminalEdges: true, terminalDepthColor: true },
  );
  assertEquals(
    resolveThreeAsciiRenderProfile({
      selection: { renderAnsi: true, renderImage: false },
      effectState: { edges: true, depthFalloff: 0 },
      terminalGlyphStyle: "blocks",
    }),
    { image: false, terminalEdges: false, terminalDepthColor: false },
  );
  assertEquals(
    resolveThreeAsciiRenderProfile({
      selection: { renderAnsi: true, renderImage: false },
      effectState: { edges: true, depthFalloff: 0.25 },
      terminalGlyphStyle: "glyphs",
    }),
    { image: false, terminalEdges: true, terminalDepthColor: true },
  );
  assertEquals(
    resolveThreeAsciiRenderProfile({
      selection: { renderAnsi: false, renderImage: false },
      terminalGlyphStyle: "glyphs",
    }),
    { image: false, terminalEdges: false, terminalDepthColor: false },
  );
});

Deno.test("three ascii render profile reuses caller-owned profile objects", () => {
  const target = { image: true, terminalEdges: true, terminalDepthColor: true };
  const resolved = resolveThreeAsciiRenderProfileInto(
    {
      selection: { renderAnsi: true, renderImage: false },
      effectState: { edges: true, depthFalloff: 0 },
      terminalGlyphStyle: "blocks",
    },
    target,
  );

  assertEquals(resolved, target);
  assertEquals(target, { image: false, terminalEdges: false, terminalDepthColor: false });

  resolveThreeAsciiRenderProfileInto(
    {
      selection: { renderAnsi: true, renderImage: false },
      effectState: { edges: true, depthFalloff: 0.2 },
      terminalGlyphStyle: "glyphs",
    },
    target,
  );

  assertEquals(target, { image: false, terminalEdges: true, terminalDepthColor: true });
});

Deno.test("three ascii renderer options normalize size, edge bias, and defaults", () => {
  assertEquals(normalizeThreeAsciiRenderSize(12.9, 4.2), { columns: 12, rows: 4 });
  assertEquals(normalizeThreeAsciiRenderSize(0, -10), { columns: 1, rows: 1 });
  assertEquals(normalizeThreeAsciiTerminalEdgeBias(), DEFAULT_THREE_ASCII_TERMINAL_EDGE_BIAS);
  assertEquals(normalizeThreeAsciiTerminalEdgeBias(0.25), 0.5);
  assertEquals(normalizeThreeAsciiTerminalEdgeBias(2.25), 2.25);

  assertEquals(normalizeThreeAsciiRendererOptions({ columns: 3, rows: 2 }), {
    columns: 3,
    rows: 2,
    pixelAspectRatio: DEFAULT_THREE_ASCII_PIXEL_ASPECT_RATIO,
    terminalEdgeBias: DEFAULT_THREE_ASCII_TERMINAL_EDGE_BIAS,
    terminalGlyphStyle: "blocks",
    readbackStrategy: "blocking",
    deferredReadbackSlots: DEFAULT_THREE_ASCII_DEFERRED_READBACK_SLOTS,
    deferredReadbackMaxStaleFrames: DEFAULT_THREE_ASCII_DEFERRED_READBACK_MAX_STALE_FRAMES,
  });
});

Deno.test("three ascii renderer options preserve explicit choices and clamp stale frames", () => {
  assertEquals(
    normalizeThreeAsciiRendererOptions({
      columns: 5.8,
      rows: 6.2,
      pixelAspectRatio: 0.75,
      terminalEdgeBias: 1.5,
      terminalGlyphStyle: "mixed",
      readbackStrategy: "deferred",
      deferredReadbackSlots: 3,
      deferredReadbackMaxStaleFrames: 2.9,
    }),
    {
      columns: 5,
      rows: 6,
      pixelAspectRatio: 0.75,
      terminalEdgeBias: 1.5,
      terminalGlyphStyle: "mixed",
      readbackStrategy: "deferred",
      deferredReadbackSlots: 3,
      deferredReadbackMaxStaleFrames: 2,
    },
  );
  assertEquals(
    normalizeThreeAsciiRendererOptions({
      columns: 5,
      rows: 6,
      deferredReadbackMaxStaleFrames: -2,
    }).deferredReadbackMaxStaleFrames,
    0,
  );
});

Deno.test("ThreeAsciiRenderer skips unchanged uniform buffer uploads", () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 8,
    rows: 4,
  });
  let writes = 0;
  const internals = renderer as unknown as {
    device: { queue: { writeBuffer: () => void } };
    paramsBuffer: object;
    writeUniforms(effectState: unknown): void;
  };
  internals.device = { queue: { writeBuffer: () => writes += 1 } };
  internals.paramsBuffer = {};
  const effectState = {
    edges: true,
    fill: true,
    invertLuminance: false,
    exposure: 1,
    attenuation: 1,
    blendWithBase: 0,
    depthFalloff: 0,
    depthOffset: 0,
    edgeThreshold: 8,
    asciiColor: { r: 1, g: 1, b: 1 },
    backgroundColor: { r: 0, g: 0, b: 0 },
  };

  internals.writeUniforms(effectState);
  internals.writeUniforms(effectState);
  assertEquals(writes, 1);

  renderer.setTerminalEdgeBias(renderer.getTerminalEdgeBias());
  internals.writeUniforms(effectState);
  assertEquals(writes, 1);

  renderer.setTerminalEdgeBias(1.5);
  internals.writeUniforms(effectState);
  assertEquals(writes, 2);

  renderer.setSize(8, 4);
  internals.writeUniforms(effectState);
  assertEquals(writes, 2);

  renderer.setSize(9, 4);
  internals.writeUniforms(effectState);
  assertEquals(writes, 3);
});

Deno.test("ThreeAsciiRenderer resizes Acerola targets with the backend renderer", () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 8,
    rows: 4,
  });
  const rendererSizes: Array<[number, number]> = [];
  const asciiNodeSizes: Array<[number, number]> = [];
  const internals = renderer as unknown as {
    renderer: { setSize: (width: number, height: number) => void };
    asciiNode: { setSize: (width: number, height: number) => void };
    applySize(): void;
  };

  internals.renderer = {
    setSize: (width, height) => rendererSizes.push([width, height]),
  };
  internals.asciiNode = {
    setSize: (width, height) => asciiNodeSizes.push([width, height]),
  };

  renderer.setSize(12, 6);
  internals.applySize();

  assertEquals(rendererSizes, [[12 * THREE_ASCII_TILE_SIZE, 6 * THREE_ASCII_TILE_SIZE]]);
  assertEquals(asciiNodeSizes, [[12 * THREE_ASCII_TILE_SIZE, 6 * THREE_ASCII_TILE_SIZE]]);
});

Deno.test("AcerolaAsciiNode skips redundant render target sizing", () => {
  const sizes: Array<[string, number, number]> = [];
  const target = (name: string) => ({
    setSize: (width: number, height: number) => sizes.push([name, width, height]),
  });
  const uniformVector = () => ({
    value: { set: (width: number, height: number) => sizes.push(["uniform", width, height]) },
  });
  const node = Object.create(AcerolaAsciiNode.prototype) as AcerolaAsciiNode;
  Object.assign(node as unknown as Record<string, unknown>, {
    resolutionScale: 1,
    renderSize: uniformVector(),
    inverseRenderSize: uniformVector(),
    downscaleSize: uniformVector(),
    luminanceTarget: target("luminance"),
    blurTarget: target("blur"),
    dogTarget: target("dog"),
    normalsTarget: target("normals"),
    edgesTarget: target("edges"),
    sobelXTarget: target("sobelX"),
    sobelTarget: target("sobel"),
    asciiTarget: target("ascii"),
    downscaleTarget: target("downscale"),
  });

  node.setSize(16, 8);
  assertEquals(sizes.length, 12);

  node.setSize(16, 8);
  assertEquals(sizes.length, 12);

  node.setSize(24, 8);
  assertEquals(sizes.length, 24);
  assertEquals(sizes.at(-1), ["downscale", 3, 1]);
});

Deno.test("ThreeAsciiRenderer updates camera aspect before scene frame callbacks after resize", async () => {
  const camera = new PerspectiveCamera(42, 1, 0.1, 100);
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera,
    columns: 8,
    rows: 8,
    pixelAspectRatio: 1,
  });
  const observedAspects: number[] = [];
  const internals = renderer as unknown as {
    initPromise: Promise<void>;
    renderer: { setSize: (_width: number, _height: number) => void };
    asciiNode: {
      setSize: (_width: number, _height: number) => void;
      setRenderProfile: (_profile: AcerolaAsciiRenderProfile) => void;
    };
    renderPipeline: { render: () => void };
    renderScene: (
      deltaTime: number,
      onFrame?: (deltaTime: number) => void | Promise<void>,
      selection?: { renderAnsi: boolean; renderImage: boolean },
    ) => Promise<unknown>;
  };

  internals.initPromise = Promise.resolve();
  internals.renderer = { setSize: () => {} };
  internals.asciiNode = {
    setSize: () => {},
    setRenderProfile: () => {},
  };
  internals.renderPipeline = { render: () => {} };

  renderer.setSize(16, 8);
  await internals.renderScene(0, () => {
    observedAspects.push(camera.aspect);
  }, { renderAnsi: true, renderImage: false });

  assertEquals(observedAspects, [2]);
});

Deno.test("ThreeAsciiRenderer marks compute resources dirty when terminal glyph style changes", () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 8,
    rows: 4,
    terminalGlyphStyle: "blocks",
  });
  const internals = renderer as unknown as {
    computeDirty: boolean;
  };

  internals.computeDirty = false;
  renderer.setTerminalGlyphStyle("blocks");
  assertEquals(internals.computeDirty, false);

  renderer.setTerminalGlyphStyle("glyphs");
  assertEquals(internals.computeDirty, true);
});

Deno.test("ThreeAsciiRenderer configures deferred readback queue depth", () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 8,
    rows: 4,
    readbackStrategy: "deferred",
    deferredReadbackSlots: 5,
  });
  const internals = renderer as unknown as {
    deferredReadbacks: { slotCount: number };
  };

  assertEquals(internals.deferredReadbacks.slotCount, 5);
});

Deno.test("ThreeAsciiRenderer avoids compute resource rebuilds for effect option updates", () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 8,
    rows: 4,
  });
  const internals = renderer as unknown as {
    asciiNode: { applyOptions: (options: unknown) => void };
    computeDirty: boolean;
    uniformDirty: boolean;
  };
  const patches: unknown[] = [];
  internals.asciiNode = {
    applyOptions: (options) => patches.push(options),
  };

  internals.computeDirty = false;
  internals.uniformDirty = false;
  renderer.setEffectOptions({ normalThreshold: 0.2 });
  assertEquals(internals.computeDirty, false);
  assertEquals(internals.uniformDirty, false);
  assertEquals(patches, [{ normalThreshold: 0.2 }]);

  renderer.setEffectOptions({ normalThreshold: 0.2 });
  assertEquals(patches, [{ normalThreshold: 0.2 }]);

  renderer.setEffectOptions({ edgeThreshold: 6 });
  assertEquals(internals.computeDirty, false);
  assertEquals(internals.uniformDirty, true);
  assertEquals(patches, [{ normalThreshold: 0.2 }, { edgeThreshold: 6 }]);

  internals.uniformDirty = false;
  renderer.setEffectOptions({ edgeThreshold: 6, backgroundColor: 0x000000 });
  assertEquals(internals.uniformDirty, false);
  assertEquals(patches, [{ normalThreshold: 0.2 }, { edgeThreshold: 6 }]);
});

Deno.test("ThreeAsciiRenderer wraps failed GPU readback mapping with a stable error", async () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 1,
    rows: 1,
  });
  const cause = new Error("validation error occurred");
  let unmapped = false;
  const internals = renderer as unknown as {
    outputReadback: unknown;
    fillOutput: unknown;
    colorOutput: unknown;
    buildAnsiGridFromReadback(layout: unknown, backgroundColor: unknown): Promise<string[][]>;
  };
  internals.outputReadback = {
    byteLength: 8,
    gpu: {
      mapAsync: () => Promise.reject(cause),
      getMappedRange: () => new ArrayBuffer(8),
      unmap: () => {
        unmapped = true;
      },
    },
  };
  internals.fillOutput = { byteLength: 4, gpu: {} };
  internals.colorOutput = { byteLength: 4, gpu: {} };

  const error = await assertRejects(
    () =>
      internals.buildAnsiGridFromReadback(
        { byteLength: 8, fillOffset: 0, colorOffset: 4 },
        { r: 0, g: 0, b: 0 },
      ),
    ThreeAsciiReadbackError,
    "GPU readback unavailable",
  );

  assertEquals(error.code, "three-ascii-readback-unavailable");
  assertEquals(error.cause, cause);
  assertEquals(unmapped, false);
});

Deno.test("withThreeAsciiMappedReadback measures map time and unmaps after reading", async () => {
  const source = new ArrayBuffer(8);
  const buffer = new FakeMappedReadbackBuffer(source);
  const times = [10, 16];
  const result = await withThreeAsciiMappedReadback(buffer, {
    mapModeRead: 1,
    now: () => times.shift() ?? 16,
    mapError: (error) => new Error(`mapped ${String(error)}`),
    read: (mapped, readbackMs) => ({ mapped, readbackMs }),
  });

  assertEquals(result, { value: { mapped: source, readbackMs: 6 }, readbackMs: 6 });
  assertEquals(buffer.mapModes, [1]);
  assertEquals(buffer.unmapped, 1);
});

Deno.test("withThreeAsciiMappedReadback wraps map errors without unmapping", async () => {
  const cause = new Error("denied");
  const buffer = new FakeMappedReadbackBuffer(new ArrayBuffer(4), cause);
  const error = await assertRejects(
    () =>
      withThreeAsciiMappedReadback(buffer, {
        mapModeRead: 2,
        now: () => 0,
        mapError: (mapped) => new TypeError("mapped failure", { cause: mapped }),
        read: () => "unreachable",
      }),
    TypeError,
    "mapped failure",
  );

  assertEquals(error.cause, cause);
  assertEquals(buffer.mapModes, [2]);
  assertEquals(buffer.unmapped, 0);
});

Deno.test("withThreeAsciiMappedReadback unmaps when reader throws", async () => {
  const buffer = new FakeMappedReadbackBuffer(new ArrayBuffer(4));
  await assertRejects(
    () =>
      withThreeAsciiMappedReadback(buffer, {
        mapModeRead: 3,
        now: () => 0,
        mapError: (error) => new Error(String(error)),
        read: () => {
          throw new RangeError("reader failed");
        },
      }),
    RangeError,
    "reader failed",
  );

  assertEquals(buffer.unmapped, 1);
});

Deno.test("ThreeAsciiRenderer skips scene submission when deferred readbacks are saturated", async () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 1,
    rows: 1,
    readbackStrategy: "deferred",
  });
  const cachedGrid = [["cached"]];
  let sceneSubmissions = 0;
  let inspectCalls = 0;
  const internals = renderer as unknown as {
    deferredReadbacks: {
      consumeCompleted: () => { grid?: string[][]; readbackMs?: number };
      isSaturated: () => boolean;
      inspect: () => {
        slotCount: number;
        pending: number;
        unresolved: number;
        resolved: number;
        saturated: boolean;
        generation: number;
      };
      lastCompletedGrid: () => string[][];
    };
    renderScene: () => Promise<void>;
  };
  internals.deferredReadbacks = {
    consumeCompleted: () => ({}),
    isSaturated: () => true,
    inspect: () => {
      inspectCalls += 1;
      return {
        slotCount: 6,
        pending: 6,
        unresolved: 6,
        resolved: 0,
        saturated: true,
        generation: 0,
      };
    },
    lastCompletedGrid: () => cachedGrid,
  };
  internals.renderScene = () => {
    sceneSubmissions += 1;
    return Promise.resolve();
  };

  const frame = await renderer.renderFrame(0, undefined, { ansi: true });

  assertEquals(frame.grid, cachedGrid);
  assertEquals(sceneSubmissions, 0);
  assertEquals(inspectCalls, 1);
  assertEquals(renderer.inspectPerformance()?.deferredReadbackSaturated, true);
  assertEquals(renderer.inspectPerformance()?.deferredReadbackUnresolved, 6);
});

Deno.test("ThreeAsciiRenderer forces blocking recovery after saturated stale deferred frames", async () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 1,
    rows: 1,
    readbackStrategy: "deferred",
    deferredReadbackMaxStaleFrames: 2,
  });
  const cachedGrid = [["cached"]];
  const forcedFlags: boolean[] = [];
  let sceneSubmissions = 0;
  const internals = renderer as unknown as {
    deferredReadbacks: {
      consumeCompleted: () => { grid?: string[][]; readbackMs?: number };
      inspect: () => {
        slotCount: number;
        pending: number;
        unresolved: number;
        resolved: number;
        saturated: boolean;
        generation: number;
      };
      lastCompletedGrid: () => string[][];
      replaceLastCompletedGrid: (grid: string[][]) => void;
    };
    renderScene: () => Promise<void>;
    computeAnsiGrid: (
      effectState: unknown,
      completed?: { grid?: string[][]; readbackMs?: number },
      forceBlockingDeferredReadback?: boolean,
    ) => Promise<string[][]>;
  };
  internals.deferredReadbacks = {
    consumeCompleted: () => ({}),
    inspect: () => ({
      slotCount: 2,
      pending: 2,
      unresolved: 2,
      resolved: 0,
      saturated: true,
      generation: 0,
    }),
    lastCompletedGrid: () => cachedGrid,
    replaceLastCompletedGrid: () => {},
  };
  internals.renderScene = () => {
    sceneSubmissions += 1;
    return Promise.resolve();
  };
  internals.computeAnsiGrid = (_effectState, _completed, forceBlockingDeferredReadback = false) => {
    forcedFlags.push(forceBlockingDeferredReadback);
    return Promise.resolve(forceBlockingDeferredReadback ? [["fresh"]] : cachedGrid);
  };

  const first = await renderer.renderFrame(0, undefined, { ansi: true });
  const second = await renderer.renderFrame(0, undefined, { ansi: true });

  assertEquals(first.grid, cachedGrid);
  assertEquals(second.grid, [["fresh"]]);
  assertEquals(sceneSubmissions, 1);
  assertEquals(forcedFlags, [true]);
});

Deno.test("ThreeAsciiRenderer avoids blocking stale fallback while deferred readbacks are pending", async () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 1,
    rows: 1,
    readbackStrategy: "deferred",
    deferredReadbackMaxStaleFrames: 2,
  });
  const cachedGrid = [["cached"]];
  const forcedFlags: boolean[] = [];
  const internals = renderer as unknown as {
    deferredReadbacks: {
      consumeCompleted: () => { grid?: string[][]; readbackMs?: number };
      isSaturated: () => boolean;
      inspect: () => {
        slotCount: number;
        pending: number;
        unresolved: number;
        resolved: number;
        saturated: boolean;
        generation: number;
      };
      lastCompletedGrid: () => string[][];
    };
    renderScene: () => Promise<void>;
    computeAnsiGrid: (
      effectState: unknown,
      completed?: { grid?: string[][]; readbackMs?: number },
      forceBlockingDeferredReadback?: boolean,
    ) => Promise<string[][]>;
  };
  internals.deferredReadbacks = {
    consumeCompleted: () => ({}),
    isSaturated: () => false,
    inspect: () => ({
      slotCount: 6,
      pending: 1,
      unresolved: 1,
      resolved: 0,
      saturated: false,
      generation: 0,
    }),
    lastCompletedGrid: () => cachedGrid,
  };
  internals.renderScene = () => Promise.resolve();
  internals.computeAnsiGrid = (_effectState, _completed, forceBlockingDeferredReadback = false) => {
    forcedFlags.push(forceBlockingDeferredReadback);
    return Promise.resolve(forceBlockingDeferredReadback ? [["fresh"]] : cachedGrid);
  };

  const first = await renderer.renderFrame(0, undefined, { ansi: true });
  const second = await renderer.renderFrame(0, undefined, { ansi: true });

  assertEquals(first.grid, cachedGrid);
  assertEquals(second.grid, cachedGrid);
  assertEquals(forcedFlags, [false, false]);
});

Deno.test("ThreeAsciiRenderer reuses last completed grid while resolving deferred submission", async () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 1,
    rows: 1,
    readbackStrategy: "deferred",
  });
  let lastCompletedGridCalls = 0;
  const internals = renderer as unknown as {
    deferredReadbacks: {
      inspect: () => {
        slotCount: number;
        pending: number;
        unresolved: number;
        resolved: number;
        saturated: boolean;
        generation: number;
      };
      lastCompletedGrid: () => string[][];
      nextBuffer: () => undefined;
    };
    deferAnsiGridReadback(
      commandEncoder: unknown,
      readbackLayout: { byteLength: number },
      readbackCopyPlan: unknown,
      backgroundColor: unknown,
      deferredCompleted: { grid?: string[][]; readbackUnavailable?: boolean },
    ): Promise<string[][]>;
  };
  const cachedGrid: string[][] = [];
  internals.deferredReadbacks = {
    inspect: () => ({
      slotCount: 1,
      pending: 0,
      unresolved: 0,
      resolved: 0,
      saturated: false,
      generation: 0,
    }),
    lastCompletedGrid: () => {
      lastCompletedGridCalls += 1;
      return cachedGrid;
    },
    nextBuffer: () => undefined,
  };

  const grid = await internals.deferAnsiGridReadback(
    {},
    { byteLength: 4 },
    {},
    {},
    {},
  );

  assertEquals(grid, cachedGrid);
  assertEquals(lastCompletedGridCalls, 1);
});

Deno.test("ThreeAsciiRenderer cold deferred submission returns without blocking for bootstrap", async () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 1,
    rows: 1,
    readbackStrategy: "deferred",
  });
  const cachedGrid: string[][] = [];
  let queued = 0;
  let submitted = 0;
  let copied = 0;
  const internals = renderer as unknown as {
    device: { queue: { submit: (_commands: unknown[]) => void } };
    deferredReadbacks: {
      lastCompletedGrid: () => string[][];
      nextBuffer: (_byteLength: number, _ensure: unknown) => string;
      queue: (_slot: string, _options: unknown) => { mapPromise: Promise<void> };
    };
    copyReadbackCommands: (_commandEncoder: unknown, _readbackCopyPlan: unknown, _readback: string) => void;
    deferAnsiGridReadback(
      commandEncoder: { finish: () => unknown },
      readbackLayout: { byteLength: number },
      readbackCopyPlan: unknown,
      backgroundColor: Color,
      deferredCompleted: { grid?: string[][]; readbackUnavailable?: boolean },
    ): Promise<string[][]>;
  };
  internals.device = {
    queue: {
      submit: () => {
        submitted += 1;
      },
    },
  };
  internals.deferredReadbacks = {
    lastCompletedGrid: () => cachedGrid,
    nextBuffer: () => "slot",
    queue: () => {
      queued += 1;
      return { mapPromise: new Promise(() => {}) };
    },
  };
  internals.copyReadbackCommands = () => {
    copied += 1;
  };

  const grid = await internals.deferAnsiGridReadback(
    { finish: () => ({}) },
    { byteLength: 4 },
    {},
    new Color("#000000"),
    {},
  );

  assertEquals(grid, cachedGrid);
  assertEquals(copied, 1);
  assertEquals(submitted, 1);
  assertEquals(queued, 1);
});

Deno.test("ThreeAsciiRenderer forces a blocking deferred readback after stale cached frames with no pending readback", async () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 1,
    rows: 1,
    readbackStrategy: "deferred",
    deferredReadbackMaxStaleFrames: 2,
  });
  const cachedGrid = [["cached"]];
  const forcedFlags: boolean[] = [];
  const internals = renderer as unknown as {
    deferredReadbacks: {
      consumeCompleted: () => { grid?: string[][]; readbackMs?: number };
      inspect: () => {
        slotCount: number;
        pending: number;
        unresolved: number;
        resolved: number;
        saturated: boolean;
        generation: number;
      };
      lastCompletedGrid: () => string[][];
    };
    renderScene: () => Promise<void>;
    computeAnsiGrid: (
      effectState: unknown,
      completed?: { grid?: string[][]; readbackMs?: number },
      forceBlockingDeferredReadback?: boolean,
    ) => Promise<string[][]>;
  };
  internals.deferredReadbacks = {
    consumeCompleted: () => ({}),
    inspect: () => ({
      slotCount: 6,
      pending: 0,
      unresolved: 0,
      resolved: 0,
      saturated: false,
      generation: 0,
    }),
    lastCompletedGrid: () => cachedGrid,
  };
  internals.renderScene = () => Promise.resolve();
  internals.computeAnsiGrid = (_effectState, _completed, forceBlockingDeferredReadback = false) => {
    forcedFlags.push(forceBlockingDeferredReadback);
    return Promise.resolve(forceBlockingDeferredReadback ? [["fresh"]] : cachedGrid);
  };

  const first = await renderer.renderFrame(0, undefined, { ansi: true });
  const second = await renderer.renderFrame(0, undefined, { ansi: true });

  assertEquals(first.grid, cachedGrid);
  assertEquals(second.grid, [["fresh"]]);
  assertEquals(forcedFlags, [false, true]);
});

Deno.test("ThreeAsciiRenderer isolates deferred readback failures without demoting", () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 1,
    rows: 1,
    readbackStrategy: "deferred",
  });
  let destroyed = 0;
  const internals = renderer as unknown as {
    readbackStrategy: string;
    deferredReadbacks: {
      consumeCompleted: () => never;
      destroy: () => void;
      lastCompletedGrid: () => string[][];
    };
    consumeDeferredAnsiGrid(): { grid?: string[][]; readbackUnavailable?: boolean };
  };
  const cachedGrid = [["cached"]];
  internals.deferredReadbacks = {
    consumeCompleted: () => {
      throw new ThreeAsciiReadbackError(new Error("deferred map rejected"));
    },
    destroy: () => {
      destroyed += 1;
    },
    lastCompletedGrid: () => cachedGrid,
  };

  assertEquals(internals.consumeDeferredAnsiGrid(), {
    grid: cachedGrid,
    readbackUnavailable: true,
  });
  assertEquals(internals.readbackStrategy, "deferred");
  assertEquals(destroyed, 1);
});

Deno.test("ThreeAsciiRenderer skips immediate blocking fallback after deferred readback failure", async () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 1,
    rows: 1,
    readbackStrategy: "deferred",
  });
  const cachedGrid = [["cached"]];
  let sceneSubmissions = 0;
  const internals = renderer as unknown as {
    deferredReadbacks: {
      consumeCompleted: () => never;
      destroy: () => void;
      lastCompletedGrid: () => string[][];
    };
    renderScene: () => Promise<void>;
  };
  internals.deferredReadbacks = {
    consumeCompleted: () => {
      throw new ThreeAsciiReadbackError(new Error("deferred map rejected"));
    },
    destroy: () => {},
    lastCompletedGrid: () => cachedGrid,
  };
  internals.renderScene = () => {
    sceneSubmissions += 1;
    return Promise.resolve();
  };

  const frame = await renderer.renderFrame(0, undefined, { ansi: true });

  assertEquals(frame.grid, cachedGrid);
  assertEquals(sceneSubmissions, 0);
});

Deno.test("ThreeAsciiRenderer skips post-compute blocking fallback after deferred readback failure", async () => {
  const renderer = new ThreeAsciiRenderer({
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    columns: 1,
    rows: 1,
    readbackStrategy: "deferred",
  });
  const cachedGrid = [["cached"]];
  const internals = renderer as unknown as {
    readbackStrategy: string;
    deferAnsiGridReadback(
      commandEncoder: unknown,
      readbackLayout: unknown,
      readbackCopyPlan: unknown,
      backgroundColor: unknown,
      deferredCompleted: { grid?: string[][]; readbackUnavailable?: boolean },
    ): Promise<string[][]>;
  };
  internals.readbackStrategy = "blocking";

  const grid = await internals.deferAnsiGridReadback(
    {},
    {},
    {},
    {},
    { grid: cachedGrid, readbackUnavailable: true },
  );

  assertEquals(grid, cachedGrid);
});

Deno.test("three ascii GPU buffer slots reuse same-sized buffers", () => {
  const device = new FakeGpuBufferDevice();
  const first = ensureThreeAsciiGpuBufferSlot(device, undefined, {
    label: "first",
    byteLength: 64,
    usage: 3,
  });
  const second = ensureThreeAsciiGpuBufferSlot(device, first, {
    label: "second",
    byteLength: 64,
    usage: 7,
  });

  assertStrictEquals(second, first);
  assertEquals(device.buffers.length, 1);
  assertEquals(first.gpu.destroyed, false);
  assertEquals(first.gpu.label, "first");
  assertEquals(first.gpu.usage, 3);
});

Deno.test("three ascii GPU buffer slots replace resized buffers and destroy optional slots", () => {
  const device = new FakeGpuBufferDevice();
  const first = ensureThreeAsciiGpuBufferSlot(device, undefined, {
    label: "small",
    byteLength: 16,
    usage: 1,
  });
  const second = ensureThreeAsciiGpuBufferSlot(device, first, {
    label: "large",
    byteLength: 32,
    usage: 5,
  });

  assertEquals(first.gpu.destroyed, true);
  assertEquals(second === first, false);
  assertEquals(second.byteLength, 32);
  assertEquals(second.gpu.label, "large");
  assertEquals(second.gpu.usage, 5);
  assertEquals(device.buffers.length, 2);
  assertEquals(destroyThreeAsciiGpuBufferSlot(second), undefined);
  assertEquals(second.gpu.destroyed, true);
  assertEquals(destroyThreeAsciiGpuBufferSlot(undefined), undefined);
});

Deno.test("three ascii uniforms pack dimensions flags effects and colors", () => {
  const target = new Float32Array(THREE_ASCII_UNIFORM_FLOAT_COUNT);
  const result = writeThreeAsciiUniformValues(target, {
    columns: 12,
    rows: 5,
    tileSize: 8,
    terminalEdgeBias: 1.5,
    terminalEdgeThresholdScale: 2,
    effectState: {
      edges: true,
      fill: false,
      invertLuminance: true,
      exposure: 1.25,
      attenuation: 0.75,
      blendWithBase: 0.5,
      depthFalloff: 3,
      depthOffset: 4,
      edgeThreshold: 6,
      asciiColor: { r: 0.1, g: 0.2, b: 0.3 },
      backgroundColor: { r: 0.4, g: 0.5, b: 0.6 },
    },
  });

  assertEquals(result, target);
  assertEquals(Array.from(target), [
    12,
    5,
    96,
    40,
    1,
    0,
    1,
    18,
    1.25,
    0.75,
    0.5,
    3,
    4,
    0,
    0,
    0,
    0.10000000149011612,
    0.20000000298023224,
    0.30000001192092896,
    1,
    0.4000000059604645,
    0.5,
    0.6000000238418579,
    1,
  ]);
});

Deno.test("three ascii uniforms reject short target buffers", () => {
  assertThrows(
    () =>
      writeThreeAsciiUniformValues(new Float32Array(4), {
        columns: 1,
        rows: 1,
        tileSize: 8,
        terminalEdgeBias: 1,
        terminalEdgeThresholdScale: 2,
        effectState: {
          edges: true,
          fill: true,
          invertLuminance: false,
          exposure: 1,
          attenuation: 1,
          blendWithBase: 0,
          depthFalloff: 0,
          depthOffset: 0,
          edgeThreshold: 8,
          asciiColor: { r: 1, g: 1, b: 1 },
          backgroundColor: { r: 0, g: 0, b: 0 },
        },
      }),
    RangeError,
    "requires 24 floats",
  );
});

Deno.test("three ascii renderer performance projects frame and queue timings", () => {
  assertEquals(
    createThreeAsciiRendererPerformance({
      columns: 12,
      rows: 8,
      terminalGlyphStyle: "blocks",
      frameMs: 16,
      initMs: 5,
      sceneMs: 9,
      ansiMs: 7,
      readbackMs: 4,
      assemblyMs: 2,
      queue: {
        slotCount: 6,
        pending: 1,
        unresolved: 2,
        resolved: 3,
        saturated: false,
      },
    }),
    {
      columns: 12,
      rows: 8,
      cells: 96,
      terminalGlyphStyle: "blocks",
      totalMs: 16,
      initMs: 5,
      sceneMs: 9,
      sceneUpdateMs: undefined,
      sceneRenderMs: undefined,
      ansiMs: 7,
      readbackMs: 4,
      assemblyMs: 2,
      deferredReadbackSlots: 6,
      deferredReadbackPending: 1,
      deferredReadbackUnresolved: 2,
      deferredReadbackResolved: 3,
      deferredReadbackSaturated: false,
    },
  );
});

Deno.test("three ascii saturated performance preserves previous frame timing", () => {
  assertEquals(
    createThreeAsciiRendererSaturatedPerformance({
      columns: 10,
      rows: 5,
      terminalGlyphStyle: "mixed",
      frameMs: 3,
      previousFrameMs: 22,
      readbackMs: 6,
      queue: {
        slotCount: 4,
        pending: 4,
        unresolved: 4,
        resolved: 0,
      },
    }),
    {
      columns: 10,
      rows: 5,
      cells: 50,
      terminalGlyphStyle: "mixed",
      totalMs: 22,
      initMs: 0,
      sceneMs: 0,
      sceneUpdateMs: 0,
      sceneRenderMs: 0,
      ansiMs: 0,
      readbackMs: 6,
      assemblyMs: 0,
      deferredReadbackSlots: 4,
      deferredReadbackPending: 4,
      deferredReadbackUnresolved: 4,
      deferredReadbackResolved: 0,
      deferredReadbackSaturated: true,
    },
  );
});

Deno.test("three ascii performance projection reuses retained snapshots and clears stale fields", () => {
  const input = {
    columns: 12,
    rows: 8,
    terminalGlyphStyle: "blocks" as const,
    frameMs: 16,
    sceneMs: 9,
    ansiMs: 7,
    readbackMs: 4,
    assemblyMs: 2,
  };
  const target = createThreeAsciiRendererPerformance(input);
  target.deferredReadbackSlots = 4;
  target.deferredReadbackSaturated = true;

  assertStrictEquals(createThreeAsciiRendererPerformance(input, target), target);
  assertEquals(
    [target.totalMs, target.sceneMs, target.cells, target.deferredReadbackSlots, target.deferredReadbackSaturated],
    [16, 9, 96, undefined, undefined],
  );
});

Deno.test("three ascii headless canvas compacts tightly packed and padded mapped rows", () => {
  const tightSource = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const tightTarget = new Uint8Array(8);
  const tightResult = compactMappedRgbaRows(tightSource, 1, 2, 4, tightTarget);

  assertEquals(tightResult === tightTarget, true);
  assertEquals(Array.from(tightResult), [1, 2, 3, 4, 5, 6, 7, 8]);

  const padded = new Uint8Array([
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    99,
    99,
    99,
    99,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    88,
    88,
    88,
    88,
  ]);
  assertEquals(Array.from(compactMappedRgbaRows(padded, 2, 2, 12)), [
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
  ]);
});

Deno.test("three ascii headless canvas handles empty dimensions without touching target", () => {
  const target = new Uint8Array([7, 8]);
  const result = compactMappedRgbaRows(new Uint8Array([1, 2, 3, 4]), 0, 2, 4, target);

  assertEquals(result === target, true);
  assertEquals(Array.from(result), [7, 8]);
});

Deno.test("three ascii deferred readback staleness resets and gates blocking recovery", () => {
  assertEquals(
    resolveThreeAsciiDeferredReadbackStaleness({
      staleFrames: 3,
      maxStaleFrames: 2,
      completedGrid: true,
      hasCachedGrid: true,
    }),
    { staleFrames: 0, forceBlockingReadback: false },
  );
  assertEquals(
    resolveThreeAsciiDeferredReadbackStaleness({
      staleFrames: 1,
      maxStaleFrames: 0,
      completedGrid: false,
      hasCachedGrid: true,
    }),
    { staleFrames: 1, forceBlockingReadback: false },
  );
  assertEquals(
    resolveThreeAsciiDeferredReadbackStaleness({
      staleFrames: 1,
      maxStaleFrames: 2,
      completedGrid: false,
      hasCachedGrid: false,
    }),
    { staleFrames: 2, forceBlockingReadback: true },
  );
  assertEquals(
    resolveThreeAsciiDeferredReadbackStaleness({
      staleFrames: 1,
      maxStaleFrames: 3,
      completedGrid: false,
      hasCachedGrid: true,
    }),
    { staleFrames: 2, forceBlockingReadback: false },
  );
  assertEquals(
    resolveThreeAsciiDeferredReadbackStaleness({
      staleFrames: 2,
      maxStaleFrames: 3,
      completedGrid: false,
      hasCachedGrid: true,
    }),
    { staleFrames: 3, forceBlockingReadback: true },
  );
});

Deno.test("resolveThreeAsciiDeferredPreSceneFrame is inactive outside ANSI-only deferred mode", () => {
  const base = {
    completed: {},
    staleFrames: 2,
    maxStaleFrames: 3,
    hasCachedGrid: true,
    saturated: true,
  };

  assertEquals(
    resolveThreeAsciiDeferredPreSceneFrame({
      ...base,
      renderAnsi: false,
      renderImage: true,
      readbackStrategy: "deferred",
    }),
    { kind: "inactive", staleFrames: 2, forceBlockingReadback: false },
  );
  assertEquals(
    resolveThreeAsciiDeferredPreSceneFrame({
      ...base,
      renderAnsi: true,
      renderImage: false,
      readbackStrategy: "blocking",
    }),
    { kind: "inactive", staleFrames: 2, forceBlockingReadback: false },
  );
});

Deno.test("resolveThreeAsciiDeferredPreSceneFrame preserves cached grids after unavailable readback", () => {
  assertEquals(
    resolveThreeAsciiDeferredPreSceneFrame({
      renderAnsi: true,
      renderImage: false,
      readbackStrategy: "deferred",
      completed: { grid: [["cached"]], readbackUnavailable: true },
      staleFrames: 2,
      maxStaleFrames: 3,
      hasCachedGrid: true,
      saturated: true,
    }),
    { kind: "readbackUnavailable", staleFrames: 2, forceBlockingReadback: false },
  );
});

Deno.test("resolveThreeAsciiDeferredPreSceneFrame reports saturated queues before scene submission", () => {
  assertEquals(
    resolveThreeAsciiDeferredPreSceneFrame({
      renderAnsi: true,
      renderImage: false,
      readbackStrategy: "deferred",
      completed: {},
      staleFrames: 0,
      maxStaleFrames: 3,
      hasCachedGrid: true,
      saturated: true,
    }),
    { kind: "saturated", staleFrames: 1, forceBlockingReadback: false },
  );
});

Deno.test("resolveThreeAsciiDeferredPreSceneFrame forces blocking after saturated stale cached frames", () => {
  assertEquals(
    resolveThreeAsciiDeferredPreSceneFrame({
      renderAnsi: true,
      renderImage: false,
      readbackStrategy: "deferred",
      completed: {},
      staleFrames: 1,
      maxStaleFrames: 2,
      hasCachedGrid: true,
      pendingReadbacks: 2,
      saturated: true,
    }),
    { kind: "saturated", staleFrames: 2, forceBlockingReadback: true },
  );
});

Deno.test("resolveThreeAsciiDeferredPreSceneFrame forces blocking after saturated uncached startup frames", () => {
  assertEquals(
    resolveThreeAsciiDeferredPreSceneFrame({
      renderAnsi: true,
      renderImage: false,
      readbackStrategy: "deferred",
      completed: {},
      staleFrames: 2,
      maxStaleFrames: 3,
      hasCachedGrid: false,
      pendingReadbacks: 2,
      saturated: true,
    }),
    { kind: "saturated", staleFrames: 3, forceBlockingReadback: true },
  );
});

Deno.test("resolveThreeAsciiDeferredPreSceneFrame forces blocking after stale cached frames", () => {
  assertEquals(
    resolveThreeAsciiDeferredPreSceneFrame({
      renderAnsi: true,
      renderImage: false,
      readbackStrategy: "deferred",
      completed: {},
      staleFrames: 1,
      maxStaleFrames: 2,
      hasCachedGrid: true,
      saturated: false,
    }),
    { kind: "continue", staleFrames: 2, forceBlockingReadback: true },
  );
  assertEquals(
    resolveThreeAsciiDeferredPreSceneFrame({
      renderAnsi: true,
      renderImage: false,
      readbackStrategy: "deferred",
      completed: {},
      staleFrames: 1,
      maxStaleFrames: 2,
      hasCachedGrid: true,
      pendingReadbacks: 1,
      saturated: false,
    }),
    { kind: "continue", staleFrames: 2, forceBlockingReadback: false },
  );
  assertEquals(
    resolveThreeAsciiDeferredPreSceneFrame({
      renderAnsi: true,
      renderImage: false,
      readbackStrategy: "deferred",
      completed: { grid: [["fresh"]] },
      staleFrames: 2,
      maxStaleFrames: 2,
      hasCachedGrid: true,
      saturated: false,
    }),
    { kind: "continue", staleFrames: 0, forceBlockingReadback: false },
  );
});

Deno.test("three ascii deferred readback submission uses cached grids while queuing available slots", () => {
  const cached = [["cached"]];
  const completed = [["completed"]];
  const readback = { id: 1 };

  assertEquals(
    resolveThreeAsciiDeferredReadbackSubmission({ grid: cached, readbackUnavailable: true }, "slot", [["last"]]),
    { grid: cached, submit: false, queue: false },
  );
  assertEquals(
    resolveThreeAsciiDeferredReadbackSubmission({ readbackUnavailable: true }, "slot", [["last"]]),
    { grid: [], submit: false, queue: false },
  );
  assertEquals(
    resolveThreeAsciiDeferredReadbackSubmission({ grid: completed }, undefined, [["last"]]),
    { grid: completed, submit: false, queue: false },
  );
  assertEquals(
    resolveThreeAsciiDeferredReadbackSubmission({}, undefined, [["last"]]),
    { grid: [["last"]], submit: false, queue: false },
  );
  assertEquals(
    resolveThreeAsciiDeferredReadbackSubmission({}, readback, [["last"]]),
    { readback, grid: [["last"]], submit: true, queue: true },
  );
  assertEquals(
    resolveThreeAsciiDeferredReadbackSubmission({ grid: completed }, readback, [["last"]]),
    { readback, grid: completed, submit: true, queue: true },
  );
});

Deno.test("three ascii deferred readback failure preserves cached grids and surfaces cleanup errors", () => {
  const cachedGrid = [["cached"]];
  let destroyed = 0;
  const handled = handleThreeAsciiDeferredReadbackFailure(
    new ThreeAsciiReadbackError(new Error("map rejected")),
    ThreeAsciiReadbackError,
    {
      lastCompletedGrid: () => cachedGrid,
      destroy: () => {
        destroyed += 1;
      },
    },
  );

  assertEquals(handled, {
    handled: true,
    result: { grid: cachedGrid, readbackUnavailable: true },
  });
  assertEquals(destroyed, 1);
  assertEquals(
    handleThreeAsciiDeferredReadbackFailure(new Error("boom"), ThreeAsciiReadbackError, {
      lastCompletedGrid: () => {
        throw new Error("should not read cached grid");
      },
      destroy: () => {
        throw new Error("should not destroy queue");
      },
    }),
    { handled: false },
  );
  assertThrows(
    () =>
      handleThreeAsciiDeferredReadbackFailure(
        new ThreeAsciiReadbackError(new Error("map rejected")),
        ThreeAsciiReadbackError,
        {
          lastCompletedGrid: () => [["cached"]],
          destroy: () => {
            throw new Error("destroy failed");
          },
        },
      ),
    Error,
    "destroy failed",
  );
});

Deno.test("deferred readback queue reuses free slots and applies backpressure", () => {
  let nextId = 0;
  const queue = new ThreeAsciiDeferredReadbackQueue<FakeDeferredReadbackBuffer>({ mapModeRead: 1 });
  const first = queue.nextBuffer(
    20,
    (_current, byteLength) => deferredReadbackSlot(new FakeDeferredReadbackBuffer(nextId++), byteLength),
  );
  const second = queue.nextBuffer(
    20,
    (_current, byteLength) => deferredReadbackSlot(new FakeDeferredReadbackBuffer(nextId++), byteLength),
  );

  assertEquals(first?.gpu.id, 0);
  assertEquals(second?.gpu.id, 1);

  queue.queue(first!, deferredReadbackFrameOptions());
  queue.queue(second!, deferredReadbackFrameOptions());
  assertEquals(queue.inspect(), {
    slotCount: 2,
    pending: 2,
    unresolved: 2,
    resolved: 0,
    saturated: true,
    generation: 0,
  });
  assertEquals(
    queue.nextBuffer(
      20,
      (_current, byteLength) => deferredReadbackSlot(new FakeDeferredReadbackBuffer(nextId++), byteLength),
    ),
    undefined,
  );
});

Deno.test("deferred readback queue consumes resolved frames and reports timing", async () => {
  let now = 10;
  const queue = new ThreeAsciiDeferredReadbackQueue<FakeDeferredReadbackBuffer>({
    mapModeRead: 1,
    now: () => now,
  });
  const buffer = new FakeDeferredReadbackBuffer(1, [14, 1, 0.2, 0.1, 1]);
  const readback = deferredReadbackSlot(buffer, buffer.source.byteLength);

  queue.queue(readback, deferredReadbackFrameOptions());
  now = 17;
  buffer.resolveMap();
  await Promise.resolve();
  const result = queue.consumeCompleted((pending) => {
    const source = new Float32Array(pending.slot.gpu.getMappedRange());
    return [[`\x1b[38;2;${source[1]};${source[2]};${source[3]}m█`]];
  }, (error) => new Error(String(error)));

  assertEquals(result.readbackMs, 7);
  assertEquals(result.grid, [["\x1b[38;2;1;0.20000000298023224;0.10000000149011612m█"]]);
  assertEquals(queue.lastCompletedGrid(), result.grid);
  assertEquals(buffer.getMappedRangeCalls, 1);
  assertEquals(buffer.unmapCalls, 1);
  assertEquals(queue.pending.length, 0);
  assertEquals(queue.inspect(), {
    slotCount: 2,
    pending: 0,
    unresolved: 0,
    resolved: 0,
    saturated: false,
    generation: 0,
  });
});

Deno.test("deferred readback queue snapshots background color into the readback slot", async () => {
  const queue = new ThreeAsciiDeferredReadbackQueue<FakeDeferredReadbackBuffer>({ mapModeRead: 1 });
  const buffer = new FakeDeferredReadbackBuffer(1, [14, 1, 0.2, 0.1, 1]);
  const readback = deferredReadbackSlot(buffer, buffer.source.byteLength);
  const backgroundColor = new Color(0x102030);

  queue.queue(readback, { ...deferredReadbackFrameOptions(), backgroundColor });
  backgroundColor.set(0xaabbcc);
  buffer.resolveMap();
  await Promise.resolve();

  let capturedHex = 0;
  queue.consumeCompleted((pending) => {
    capturedHex = pending.backgroundColor.getHex();
    return [["frame"]];
  }, (error) => new Error(String(error)));

  assertEquals(capturedHex, 0x102030);
});

Deno.test("deferred readback queue consumes multiple same-generation frames without self-invalidating", async () => {
  const queue = new ThreeAsciiDeferredReadbackQueue<FakeDeferredReadbackBuffer>({ mapModeRead: 1 });
  const first = new FakeDeferredReadbackBuffer(1, [14, 10, 0, 0, 1]);
  const second = new FakeDeferredReadbackBuffer(2, [14, 20, 0, 0, 1]);

  queue.queue(deferredReadbackSlot(first, first.source.byteLength), deferredReadbackFrameOptions());
  queue.queue(deferredReadbackSlot(second, second.source.byteLength), deferredReadbackFrameOptions());
  first.resolveMap();
  second.resolveMap();
  await Promise.resolve();

  const assembled: number[] = [];
  const result = queue.consumeCompleted((pending) => {
    const source = new Float32Array(pending.slot.gpu.getMappedRange());
    assembled.push(pending.slot.gpu.id);
    return [[`frame ${pending.slot.gpu.id} ${source[1]}`]];
  }, (error) => new Error(String(error)));

  assertEquals(assembled, [1, 2]);
  assertEquals(result.grid, [["frame 2 20"]]);
  assertEquals(queue.lastCompletedGrid(), result.grid);
  assertEquals(first.unmapCalls, 1);
  assertEquals(second.unmapCalls, 1);
  assertEquals(queue.pending.length, 0);
  assertEquals(queue.inspect().generation, 0);
});

Deno.test("deferred readback queue exposes an awaitable map promise", async () => {
  const queue = new ThreeAsciiDeferredReadbackQueue<FakeDeferredReadbackBuffer>({ mapModeRead: 1 });
  const buffer = new FakeDeferredReadbackBuffer(1, [14, 1, 1, 1, 1]);
  const pending = queue.queue(deferredReadbackSlot(buffer, buffer.source.byteLength), deferredReadbackFrameOptions());
  let settled = false;
  pending.mapPromise.then(() => {
    settled = true;
  });

  await Promise.resolve();
  assertEquals(settled, false);
  buffer.resolveMap();
  await pending.mapPromise;

  assertEquals(settled, true);
  assertEquals(pending.resolved, true);
});

Deno.test("deferred readback queue skips stale resolved frames after invalidation", async () => {
  const queue = new ThreeAsciiDeferredReadbackQueue<FakeDeferredReadbackBuffer>({ mapModeRead: 1 });
  const buffer = new FakeDeferredReadbackBuffer(1, [14, 1, 1, 1, 1]);
  queue.queue(deferredReadbackSlot(buffer, buffer.source.byteLength), deferredReadbackFrameOptions());
  queue.invalidate();
  buffer.resolveMap();
  await Promise.resolve();

  const result = queue.consumeCompleted(() => [["stale"]], (error) => new Error(String(error)));

  assertEquals(result.grid, undefined);
  assertEquals(buffer.getMappedRangeCalls, 0);
  assertEquals(buffer.unmapCalls, 1);
  assertEquals(queue.pending.length, 0);
  assertEquals(queue.lastCompletedGrid(), []);
});

Deno.test("deferred readback queue can replace cached grid and invalidate pending frames", async () => {
  const queue = new ThreeAsciiDeferredReadbackQueue<FakeDeferredReadbackBuffer>({ mapModeRead: 1 });
  const buffer = new FakeDeferredReadbackBuffer(1, [14, 1, 1, 1, 1]);
  queue.queue(deferredReadbackSlot(buffer, buffer.source.byteLength), deferredReadbackFrameOptions());
  const replacement = [["fresh"]];

  queue.replaceLastCompletedGrid(replacement);
  buffer.resolveMap();
  await Promise.resolve();
  const result = queue.consumeCompleted(() => [["stale"]], (error) => new Error(String(error)));

  assertEquals(result.grid, undefined);
  assertEquals(queue.lastCompletedGrid(), replacement);
  assertEquals(buffer.getMappedRangeCalls, 0);
  assertEquals(buffer.unmapCalls, 1);
});

Deno.test("deferred readback queue reports saturation only for unresolved full slots", async () => {
  const queue = new ThreeAsciiDeferredReadbackQueue<FakeDeferredReadbackBuffer>({ mapModeRead: 1 });
  const first = new FakeDeferredReadbackBuffer(1);
  const second = new FakeDeferredReadbackBuffer(2);
  queue.queue(deferredReadbackSlot(first, 20), deferredReadbackFrameOptions());
  assertEquals(queue.isSaturated(), false);

  queue.queue(deferredReadbackSlot(second, 20), deferredReadbackFrameOptions());
  assertEquals(queue.isSaturated(), true);

  first.resolveMap();
  await Promise.resolve();
  assertEquals(queue.isSaturated(), false);
});

Deno.test("deferred readback queue maps errors and destroys slots", async () => {
  const queue = new ThreeAsciiDeferredReadbackQueue<FakeDeferredReadbackBuffer>({ mapModeRead: 1 });
  const buffer = new FakeDeferredReadbackBuffer(1);
  const readback = deferredReadbackSlot(buffer, 20);
  queue.queue(readback, deferredReadbackFrameOptions());
  buffer.rejectMap("map failed");
  await Promise.resolve();

  assertThrows(
    () => queue.consumeCompleted(() => [["unused"]], (error) => new RangeError(String(error))),
    RangeError,
    "map failed",
  );
  assertEquals(buffer.unmapCalls, 0);

  const next = queue.nextBuffer(
    20,
    (current, byteLength) => current ?? deferredReadbackSlot(new FakeDeferredReadbackBuffer(2), byteLength),
  );
  queue.destroy();
  assertEquals(next?.gpu.destroyed, true);
  assertEquals(queue.pending.length, 0);
  assertEquals(queue.lastCompletedGrid(), []);
});

Deno.test("three ascii compute pipeline creates shader module and auto-layout pipeline", () => {
  const device = new FakeComputePipelineDevice();
  const pipeline = createThreeAsciiComputePipeline({
    device,
    label: "deno_tui.three_ascii.fill",
    code: "fn main() {}",
  });

  assertEquals(pipeline, "pipeline:deno_tui.three_ascii.fill" as unknown as GPUComputePipeline);
  assertEquals(device.shaderModules, [
    { label: "deno_tui.three_ascii.fill.wgsl", code: "fn main() {}" },
  ]);
  assertEquals(device.computePipelines, [
    {
      label: "deno_tui.three_ascii.fill",
      layout: "auto",
      module: "shader:deno_tui.three_ascii.fill.wgsl",
      entryPoint: "main",
    },
  ]);
});

Deno.test("three ascii compute pipeline accepts custom entrypoints", () => {
  const device = new FakeComputePipelineDevice();
  createThreeAsciiComputePipeline({
    device,
    label: "custom",
    code: "fn alternate() {}",
    entryPoint: "alternate",
  });

  assertEquals(device.computePipelines[0]?.entryPoint, "alternate");
});

Deno.test("three ascii compute pipeline reuses pipelines by device shader and entrypoint", () => {
  const device = new FakeComputePipelineDevice();
  const first = createThreeAsciiComputePipeline({
    device,
    label: "first",
    code: "fn main() {}",
  });
  const second = createThreeAsciiComputePipeline({
    device,
    label: "second",
    code: "fn main() {}",
  });
  const alternate = createThreeAsciiComputePipeline({
    device,
    label: "alternate",
    code: "fn alternate() {}",
    entryPoint: "alternate",
  });

  assertEquals(second, first);
  assertEquals(device.shaderModules.length, 2);
  assertEquals(device.computePipelines.length, 2);
  assertEquals(alternate, "pipeline:alternate" as unknown as GPUComputePipeline);
});

Deno.test("createThreeAsciiComputeDispatchPlan omits edge pass for block/fill-only modes", () => {
  assertEquals(
    createThreeAsciiComputeDispatchPlan({
      columns: 40,
      rows: 24,
      workgroupSize: 8,
      includeEdges: false,
    }),
    {
      workgroupsX: 5,
      workgroupsY: 3,
      passes: [
        { kind: "fill", label: "deno_tui.three_ascii.fill" },
        { kind: "color", label: "deno_tui.three_ascii.color" },
      ],
    },
  );
});

Deno.test("createThreeAsciiComputeDispatchPlan can emit color-only block passes", () => {
  assertEquals(
    createThreeAsciiComputeDispatchPlan({
      columns: 40,
      rows: 24,
      workgroupSize: 8,
      includeFill: false,
      includeEdges: false,
    }),
    {
      workgroupsX: 5,
      workgroupsY: 3,
      passes: [
        { kind: "color", label: "deno_tui.three_ascii.color" },
      ],
    },
  );
});

Deno.test("createThreeAsciiComputeDispatchPlan includes edge pass between fill and color", () => {
  assertEquals(
    createThreeAsciiComputeDispatchPlan({
      columns: 41,
      rows: 25,
      workgroupSize: 8,
      includeEdges: true,
    }),
    {
      workgroupsX: 6,
      workgroupsY: 4,
      passes: [
        { kind: "fill", label: "deno_tui.three_ascii.fill" },
        { kind: "edge", label: "deno_tui.three_ascii.edge" },
        { kind: "color", label: "deno_tui.three_ascii.color" },
      ],
    },
  );
});

Deno.test("createThreeAsciiComputeDispatchPlan clamps invalid dimensions", () => {
  assertEquals(
    createThreeAsciiComputeDispatchPlan({
      columns: 0,
      rows: -4,
      workgroupSize: 0,
      includeEdges: false,
    }).workgroupsX,
    1,
  );
});

Deno.test("ThreeAsciiComputeDispatchPlanCache reuses stable dispatch plans", () => {
  const cache = new ThreeAsciiComputeDispatchPlanCache();
  const first = cache.resolve({ columns: 40, rows: 24, workgroupSize: 8, includeEdges: false });
  const second = cache.resolve({ columns: 40.9, rows: 24.1, workgroupSize: 8.8, includeEdges: false });
  assertEquals(second === first, true);

  const edge = cache.resolve({ columns: 40, rows: 24, workgroupSize: 8, includeEdges: true });
  assertEquals(edge === first, false);
  assertEquals(edge.passes.map((pass) => pass.kind), ["fill", "edge", "color"]);

  const colorOnly = cache.resolve({ columns: 40, rows: 24, workgroupSize: 8, includeFill: false, includeEdges: false });
  assertEquals(colorOnly === edge, false);
  assertEquals(colorOnly.passes.map((pass) => pass.kind), ["color"]);

  cache.clear();
  const afterClear = cache.resolve({ columns: 40, rows: 24, workgroupSize: 8, includeEdges: true });
  assertEquals(afterClear === edge, false);
  assertEquals(afterClear, edge);
});

Deno.test("createThreeAsciiComputeResourcePlan sizes fill color and edge buffers", () => {
  assertEquals(
    createThreeAsciiComputeResourcePlan({
      columns: 12,
      rows: 8,
      includeFill: true,
      includeEdges: true,
      includeDepthColor: true,
      currentCellCount: 0,
      hasFillOutput: false,
      hasFillBindGroup: false,
      hasEdgeOutput: false,
      hasEdgeBindGroup: false,
      hasDepthColorBindGroup: false,
    }),
    {
      cellCount: 96,
      fillByteLength: 384,
      colorByteLength: 1536,
      edgeByteLength: 1536,
      resizeOutputs: true,
      ensureFillOutput: true,
      releaseFillOutput: false,
      ensureEdgeOutput: true,
      releaseEdgeOutput: false,
      dirty: true,
    },
  );
});

Deno.test("createThreeAsciiComputeResourcePlan keeps stable no-edge resources clean", () => {
  assertEquals(
    createThreeAsciiComputeResourcePlan({
      columns: 10,
      rows: 5,
      includeFill: true,
      includeEdges: false,
      includeDepthColor: false,
      currentCellCount: 50,
      hasFillOutput: true,
      hasFillBindGroup: true,
      hasEdgeOutput: false,
      hasEdgeBindGroup: false,
      hasDepthColorBindGroup: false,
    }).dirty,
    false,
  );
});

Deno.test("createThreeAsciiComputeResourcePlan marks edge release dirty", () => {
  const plan = createThreeAsciiComputeResourcePlan({
    columns: 10,
    rows: 5,
    includeFill: true,
    includeEdges: false,
    includeDepthColor: false,
    currentCellCount: 50,
    hasFillOutput: true,
    hasFillBindGroup: true,
    hasEdgeOutput: true,
    hasEdgeBindGroup: true,
    hasDepthColorBindGroup: false,
  });

  assertEquals(plan.releaseEdgeOutput, true);
  assertEquals(plan.dirty, true);
});

Deno.test("createThreeAsciiComputeResourcePlan marks fill release dirty", () => {
  const plan = createThreeAsciiComputeResourcePlan({
    columns: 10,
    rows: 5,
    includeFill: false,
    includeEdges: false,
    includeDepthColor: false,
    currentCellCount: 50,
    hasFillOutput: true,
    hasFillBindGroup: true,
    hasEdgeOutput: false,
    hasEdgeBindGroup: false,
    hasDepthColorBindGroup: false,
  });

  assertEquals(plan.fillByteLength, 0);
  assertEquals(plan.ensureFillOutput, false);
  assertEquals(plan.releaseFillOutput, true);
  assertEquals(plan.dirty, true);
});

Deno.test("createThreeAsciiComputeResourcePlan marks missing edge bind group dirty", () => {
  const plan = createThreeAsciiComputeResourcePlan({
    columns: 10,
    rows: 5,
    includeFill: true,
    includeEdges: true,
    includeDepthColor: false,
    currentCellCount: 50,
    hasFillOutput: true,
    hasFillBindGroup: true,
    hasEdgeOutput: true,
    hasEdgeBindGroup: false,
    hasDepthColorBindGroup: false,
  });

  assertEquals(plan.resizeOutputs, false);
  assertEquals(plan.ensureEdgeOutput, true);
  assertEquals(plan.dirty, true);
});

Deno.test("createThreeAsciiComputeResourcePlan marks depth color mode switches dirty", () => {
  assertEquals(
    createThreeAsciiComputeResourcePlan({
      columns: 10,
      rows: 5,
      includeFill: true,
      includeEdges: false,
      includeDepthColor: true,
      currentCellCount: 50,
      hasFillOutput: true,
      hasFillBindGroup: true,
      hasEdgeOutput: false,
      hasEdgeBindGroup: false,
      hasDepthColorBindGroup: false,
    }).dirty,
    true,
  );
});

Deno.test("applyThreeAsciiComputeResourcePlanState preserves stable clean resources", () => {
  const plan = createThreeAsciiComputeResourcePlan({
    columns: 10,
    rows: 5,
    includeFill: true,
    includeEdges: false,
    includeDepthColor: false,
    currentCellCount: 50,
    hasFillOutput: true,
    hasFillBindGroup: true,
    hasEdgeOutput: false,
    hasEdgeBindGroup: false,
    hasDepthColorBindGroup: false,
  });

  assertEquals(
    applyThreeAsciiComputeResourcePlanState({ currentCellCount: 50, computeDirty: false }, plan),
    { outputCellCount: 50, computeDirty: false, clearFillBindGroup: false, clearEdgeBindGroup: false },
  );
});

Deno.test("applyThreeAsciiComputeResourcePlanState marks resized outputs dirty", () => {
  const plan = createThreeAsciiComputeResourcePlan({
    columns: 12,
    rows: 8,
    includeFill: true,
    includeEdges: false,
    includeDepthColor: false,
    currentCellCount: 50,
    hasFillOutput: true,
    hasFillBindGroup: true,
    hasEdgeOutput: false,
    hasEdgeBindGroup: false,
    hasDepthColorBindGroup: false,
  });

  assertEquals(
    applyThreeAsciiComputeResourcePlanState({ currentCellCount: 50, computeDirty: false }, plan),
    { outputCellCount: 96, computeDirty: true, clearFillBindGroup: false, clearEdgeBindGroup: false },
  );
});

Deno.test("applyThreeAsciiComputeResourcePlanState clears stale edge bind groups", () => {
  const plan = createThreeAsciiComputeResourcePlan({
    columns: 10,
    rows: 5,
    includeFill: true,
    includeEdges: false,
    includeDepthColor: false,
    currentCellCount: 50,
    hasFillOutput: true,
    hasFillBindGroup: true,
    hasEdgeOutput: true,
    hasEdgeBindGroup: true,
    hasDepthColorBindGroup: false,
  });

  assertEquals(
    applyThreeAsciiComputeResourcePlanState({ currentCellCount: 50, computeDirty: false }, plan),
    { outputCellCount: 50, computeDirty: true, clearFillBindGroup: false, clearEdgeBindGroup: true },
  );
});

Deno.test("encodeThreeAsciiComputeDispatchCommands encodes fill and color passes", () => {
  const encoder = new FakeCommandEncoder();
  const resources = new FakeDispatchResources();
  encodeThreeAsciiComputeDispatchCommands(
    encoder,
    createThreeAsciiComputeDispatchPlan({ columns: 17, rows: 9, workgroupSize: 8, includeEdges: false }),
    resources,
  );

  assertEquals(encoder.records, [
    {
      label: "deno_tui.three_ascii.fill",
      pipeline: "pipeline:fill",
      bindGroup: "bind-group:fill",
      workgroups: [3, 2, 1],
      ended: true,
    },
    {
      label: "deno_tui.three_ascii.color",
      pipeline: "pipeline:color",
      bindGroup: "bind-group:color",
      workgroups: [3, 2, 1],
      ended: true,
    },
  ]);
  assertEquals(resources.pipelineLookups, ["fill", "color"]);
  assertEquals(resources.bindGroupLookups, ["fill", "color"]);
});

Deno.test("encodeThreeAsciiComputeDispatchCommands encodes color-only passes", () => {
  const encoder = new FakeCommandEncoder();
  const resources = new FakeDispatchResources();
  encodeThreeAsciiComputeDispatchCommands(
    encoder,
    createThreeAsciiComputeDispatchPlan({
      columns: 17,
      rows: 9,
      workgroupSize: 8,
      includeFill: false,
      includeEdges: false,
    }),
    resources,
  );

  assertEquals(encoder.records, [
    {
      label: "deno_tui.three_ascii.color",
      pipeline: "pipeline:color",
      bindGroup: "bind-group:color",
      workgroups: [3, 2, 1],
      ended: true,
    },
  ]);
  assertEquals(resources.pipelineLookups, ["color"]);
  assertEquals(resources.bindGroupLookups, ["color"]);
});

Deno.test("encodeThreeAsciiComputeDispatchCommands includes edge pass when planned", () => {
  const encoder = new FakeCommandEncoder();
  const resources = new FakeDispatchResources();
  encodeThreeAsciiComputeDispatchCommands(
    encoder,
    createThreeAsciiComputeDispatchPlan({ columns: 8, rows: 8, workgroupSize: 8, includeEdges: true }),
    resources,
  );

  assertEquals(encoder.records.map((record) => record.label), [
    "deno_tui.three_ascii.fill",
    "deno_tui.three_ascii.edge",
    "deno_tui.three_ascii.color",
  ]);
  assertEquals(encoder.records.map((record) => record.workgroups), [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ]);
});

Deno.test("createThreeAsciiComputeBindGroups creates fill and color bindings without edges", () => {
  const device = new FakeBindGroupDevice();
  const groups = createThreeAsciiComputeBindGroups({
    device,
    paramsBuffer: fakeBuffer("params"),
    fillPipeline: fakePipeline("fill-layout"),
    colorPipeline: fakePipeline("color-layout"),
    fillOutput: fakeBuffer("fill"),
    colorOutput: fakeBuffer("color"),
    downscaleTexture: fakeTexture("downscale"),
    includeEdges: false,
    colorUsesDepthTexture: false,
  });

  assertEquals(groups.fillBindGroup, "deno_tui.three_ascii.fill.bindings" as unknown as GPUBindGroup);
  assertEquals(groups.edgeBindGroup, undefined);
  assertEquals(groups.colorBindGroup, "deno_tui.three_ascii.color.bindings" as unknown as GPUBindGroup);
  assertEquals(device.labels(), [
    "deno_tui.three_ascii.fill.bindings",
    "deno_tui.three_ascii.color.bindings",
  ]);
  assertEquals(device.created[0]?.entries.map((entry) => entry.binding), [0, 1, 2]);
  assertEquals(device.created[1]?.entries.map((entry) => entry.binding), [0, 1, 2]);
});

Deno.test("createThreeAsciiComputeBindGroups can create color-only bindings", () => {
  const device = new FakeBindGroupDevice();
  const groups = createThreeAsciiComputeBindGroups({
    device,
    paramsBuffer: fakeBuffer("params"),
    colorPipeline: fakePipeline("color-layout"),
    colorOutput: fakeBuffer("color"),
    downscaleTexture: fakeTexture("downscale"),
    includeFill: false,
    includeEdges: false,
    colorUsesDepthTexture: false,
  });

  assertEquals(groups.fillBindGroup, undefined);
  assertEquals(groups.edgeBindGroup, undefined);
  assertEquals(groups.colorBindGroup, "deno_tui.three_ascii.color.bindings" as unknown as GPUBindGroup);
  assertEquals(device.labels(), ["deno_tui.three_ascii.color.bindings"]);
  assertEquals(device.created[0]?.entries.map((entry) => entry.binding), [0, 1, 2]);
});

Deno.test("createThreeAsciiComputeBindGroups rejects missing requested fill resources", () => {
  assertThrows(
    () =>
      createThreeAsciiComputeBindGroups({
        device: new FakeBindGroupDevice(),
        paramsBuffer: fakeBuffer("params"),
        colorPipeline: fakePipeline("color-layout"),
        colorOutput: fakeBuffer("color"),
        downscaleTexture: fakeTexture("downscale"),
        includeFill: true,
        includeEdges: false,
        colorUsesDepthTexture: false,
      }),
    Error,
    "fill compute resources",
  );
});

Deno.test("createThreeAsciiComputeBindGroups creates edge bindings when requested", () => {
  const device = new FakeBindGroupDevice();
  const groups = createThreeAsciiComputeBindGroups({
    device,
    paramsBuffer: fakeBuffer("params"),
    fillPipeline: fakePipeline("fill-layout"),
    edgePipeline: fakePipeline("edge-layout"),
    colorPipeline: fakePipeline("color-layout"),
    fillOutput: fakeBuffer("fill"),
    edgeOutput: fakeBuffer("edge"),
    colorOutput: fakeBuffer("color"),
    downscaleTexture: fakeTexture("downscale"),
    sobelTexture: fakeTexture("sobel"),
    includeEdges: true,
    colorUsesDepthTexture: false,
  });

  assertEquals(groups.edgeBindGroup, "deno_tui.three_ascii.edge.bindings" as unknown as GPUBindGroup);
  assertEquals(device.labels(), [
    "deno_tui.three_ascii.fill.bindings",
    "deno_tui.three_ascii.edge.bindings",
    "deno_tui.three_ascii.color.bindings",
  ]);
});

Deno.test("createThreeAsciiComputeBindGroups rejects incomplete edge resources", () => {
  assertThrows(
    () =>
      createThreeAsciiComputeBindGroups({
        device: new FakeBindGroupDevice(),
        paramsBuffer: fakeBuffer("params"),
        fillPipeline: fakePipeline("fill-layout"),
        colorPipeline: fakePipeline("color-layout"),
        fillOutput: fakeBuffer("fill"),
        colorOutput: fakeBuffer("color"),
        downscaleTexture: fakeTexture("downscale"),
        includeEdges: true,
        colorUsesDepthTexture: false,
      }),
    Error,
    "edge compute resources",
  );
});

Deno.test("createThreeAsciiComputeBindGroups binds normals only for depth color", () => {
  const device = new FakeBindGroupDevice();
  createThreeAsciiComputeBindGroups({
    device,
    paramsBuffer: fakeBuffer("params"),
    fillPipeline: fakePipeline("fill-layout"),
    colorPipeline: fakePipeline("color-layout"),
    fillOutput: fakeBuffer("fill"),
    colorOutput: fakeBuffer("color"),
    downscaleTexture: fakeTexture("downscale"),
    normalsTexture: fakeTexture("normals"),
    includeEdges: false,
    colorUsesDepthTexture: true,
  });

  assertEquals(device.created[1]?.entries.map((entry) => entry.binding), [0, 1, 2, 3]);
});

Deno.test("createThreeAsciiComputeBindGroups rejects missing depth color resources", () => {
  assertThrows(
    () =>
      createThreeAsciiComputeBindGroups({
        device: new FakeBindGroupDevice(),
        paramsBuffer: fakeBuffer("params"),
        fillPipeline: fakePipeline("fill-layout"),
        colorPipeline: fakePipeline("color-layout"),
        fillOutput: fakeBuffer("fill"),
        colorOutput: fakeBuffer("color"),
        downscaleTexture: fakeTexture("downscale"),
        includeEdges: false,
        colorUsesDepthTexture: true,
      }),
    Error,
    "depth color resources",
  );
});

Deno.test("getCompatibleWebGPUDevice clears cached failures so later probes can retry", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const firstError = new Error("transient gpu allocation failure");
  const device = fakeCompatibleWebGpuDevice();
  const adapter = {
    calls: 0,
    requestDevice() {
      this.calls += 1;
      if (this.calls === 1) throw firstError;
      return Promise.resolve(device as GPUDevice);
    },
  };
  installCompatibleNavigatorGpu({
    requestAdapter: () => Promise.resolve(adapter),
  });
  resetCompatibleWebGPUDeviceCache();

  try {
    await assertRejects(() => getCompatibleWebGPUDevice(), Error, "transient gpu allocation failure");
    assertEquals(await getCompatibleWebGPUDevice(), device);
    assertEquals(adapter.calls, 2);
  } finally {
    resetCompatibleWebGPUDeviceCache();
    restoreCompatibleNavigator(originalNavigator);
  }
});

Deno.test("getCompatibleWebGPUDevice refreshes after a native device lost signal", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const firstLost = deferredCompatibleGpuValue<GPUDeviceLostInfo>();
  const first = fakeCompatibleWebGpuDevice({ lost: firstLost.promise });
  const second = fakeCompatibleWebGpuDevice({ lost: new Promise<GPUDeviceLostInfo>(() => {}) });
  const devices = [first, second];
  const adapter = {
    calls: 0,
    requestDevice() {
      return Promise.resolve(devices[this.calls++] as GPUDevice);
    },
  };
  installCompatibleNavigatorGpu({
    requestAdapter: () => Promise.resolve(adapter),
  });
  resetCompatibleWebGPUDeviceCache();

  try {
    assertEquals(await getCompatibleWebGPUDevice(), first);
    assertEquals(await getCompatibleWebGPUDevice(), first);
    firstLost.resolve({ reason: "destroyed", message: "lost for test" } as GPUDeviceLostInfo);
    await Promise.resolve();
    assertEquals(await getCompatibleWebGPUDevice(), second);
    assertEquals(adapter.calls, 2);
  } finally {
    resetCompatibleWebGPUDeviceCache();
    restoreCompatibleNavigator(originalNavigator);
  }
});

Deno.test("getCompatibleWebGPUDevice falls back when the primary adapter cannot map readback buffers", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const primary = fakeCompatibleWebGpuDevice({ mapError: new Error("primary map failed") });
  const fallback = fakeCompatibleWebGpuDevice();
  const requestedFallback: boolean[] = [];
  installCompatibleNavigatorGpu({
    requestAdapter: (options) => {
      const forceFallback = options?.forceFallbackAdapter ?? false;
      requestedFallback.push(forceFallback);
      return Promise.resolve({
        requestDevice: () => Promise.resolve((forceFallback ? fallback : primary) as GPUDevice),
      });
    },
  });
  resetCompatibleWebGPUDeviceCache();

  try {
    assertEquals(await getCompatibleWebGPUDevice(), fallback);
    assertEquals(requestedFallback, [false, true]);
  } finally {
    resetCompatibleWebGPUDeviceCache();
    restoreCompatibleNavigator(originalNavigator);
  }
});

Deno.test("patched mappedAtCreation buffers upload a typed-array view on unmap, not a raw ArrayBuffer", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  // Some fallback/compat adapters reject a raw ArrayBuffer in writeBuffer with
  // "data must be an ArrayBuffer or an ArrayBufferView" — which surfaced as the
  // ASCII renderer going offline the moment its scene resized (a control focus
  // or window maximize) and new mappedAtCreation buffers were made.
  const writes: unknown[] = [];
  const device = {
    queue: {
      writeBuffer: (_buffer: unknown, _offset: number, data: unknown) => {
        writes.push(data);
      },
    } as unknown as GPUQueue,
    popErrorScope: () => Promise.resolve(null),
    createShaderModule: (descriptor: unknown) => descriptor as GPUShaderModule,
    createBuffer: (descriptor: GPUBufferDescriptor) =>
      ({
        descriptor,
        mapAsync: () => Promise.resolve(),
        getMappedRange: () => new ArrayBuffer(Number(descriptor.size) || 0),
        unmap() {},
        destroy() {},
      }) as unknown as GPUBuffer,
    destroy() {},
  } as unknown as GPUDevice;
  installCompatibleNavigatorGpu({
    requestAdapter: () => Promise.resolve({ requestDevice: () => Promise.resolve(device) }),
  });
  resetCompatibleWebGPUDeviceCache();

  try {
    const patched = await getCompatibleWebGPUDevice();
    const buffer = patched.createBuffer({
      size: 16,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(buffer.getMappedRange()).set([1, 2, 3, 4]);
    buffer.unmap();
    const uploaded = writes.at(-1);
    assertEquals(ArrayBuffer.isView(uploaded), true, "unmap must upload a typed-array view, never a bare ArrayBuffer");
    assertEquals((uploaded as Uint8Array).byteLength, 16);
  } finally {
    resetCompatibleWebGPUDeviceCache();
    restoreCompatibleNavigator(originalNavigator);
  }
});

const deferredReadbackLayout: ThreeAsciiReadbackLayout = {
  byteLength: 20,
  fillOffset: 0,
  colorOffset: 4,
  includeFill: true,
  fillFloatLength: 1,
  edgeFloatLength: 0,
  colorFloatLength: 4,
};

function deferredReadbackFrameOptions() {
  return {
    layout: deferredReadbackLayout,
    columns: 1,
    rows: 1,
    terminalGlyphStyle: "blocks" as const,
    terminalEdgeBias: 1,
    backgroundColor: new Color(0x000000),
  };
}

function deferredReadbackSlot(gpu: FakeDeferredReadbackBuffer, byteLength: number) {
  return { gpu, byteLength };
}

class FakeDeferredReadbackBuffer {
  readonly source: ArrayBuffer;
  destroyed = false;
  getMappedRangeCalls = 0;
  unmapCalls = 0;
  private resolve?: () => void;
  private reject?: (error: unknown) => void;

  constructor(readonly id: number, values: number[] = []) {
    this.source = new Float32Array(values).buffer;
  }

  mapAsync(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  resolveMap(): void {
    this.resolve?.();
  }

  rejectMap(error: unknown): void {
    this.reject?.(error);
  }

  getMappedRange(): ArrayBuffer {
    this.getMappedRangeCalls += 1;
    return this.source;
  }

  unmap(): void {
    this.unmapCalls += 1;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

class FakeMappedReadbackBuffer {
  readonly mapModes: number[] = [];
  unmapped = 0;

  constructor(private readonly source: ArrayBuffer, private readonly mapError?: unknown) {}

  mapAsync(mode: number): Promise<void> {
    this.mapModes.push(mode);
    return this.mapError ? Promise.reject(this.mapError) : Promise.resolve();
  }

  getMappedRange(): ArrayBuffer {
    return this.source;
  }

  unmap(): void {
    this.unmapped += 1;
  }
}

class FakeGpuBuffer implements ThreeAsciiGpuBuffer {
  destroyed = false;

  constructor(readonly label: string, readonly size: number, readonly usage: number) {}

  destroy(): void {
    this.destroyed = true;
  }
}

class FakeGpuBufferDevice implements ThreeAsciiGpuBufferDevice<FakeGpuBuffer> {
  readonly buffers: FakeGpuBuffer[] = [];

  createBuffer(options: { label: string; size: number; usage: number }): FakeGpuBuffer {
    const buffer = new FakeGpuBuffer(options.label, options.size, options.usage);
    this.buffers.push(buffer);
    return buffer;
  }
}

interface FakeShaderModuleDescriptor {
  label?: string;
  code: string;
}

interface FakeComputePipelineDescriptor {
  label?: string;
  layout: string;
  module: string;
  entryPoint?: string;
}

class FakeComputePipelineDevice {
  readonly shaderModules: FakeShaderModuleDescriptor[] = [];
  readonly computePipelines: FakeComputePipelineDescriptor[] = [];

  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule {
    this.shaderModules.push({ label: String(descriptor.label), code: descriptor.code });
    return `shader:${String(descriptor.label)}` as unknown as GPUShaderModule;
  }

  createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline {
    this.computePipelines.push({
      label: String(descriptor.label),
      layout: descriptor.layout as string,
      module: descriptor.compute.module as unknown as string,
      entryPoint: descriptor.compute.entryPoint,
    });
    return `pipeline:${String(descriptor.label)}` as unknown as GPUComputePipeline;
  }
}

interface ComputePassRecord {
  label: string;
  pipeline?: string;
  bindGroup?: string;
  workgroups?: [number, number, number];
  ended: boolean;
}

class FakeCommandEncoder {
  readonly records: ComputePassRecord[] = [];

  beginComputePass(descriptor: GPUComputePassDescriptor): GPUComputePassEncoder {
    const record: ComputePassRecord = { label: String(descriptor.label), ended: false };
    this.records.push(record);
    return {
      setPipeline: (pipeline: GPUComputePipeline) => {
        record.pipeline = String(pipeline);
      },
      setBindGroup: (_index: number, bindGroup: GPUBindGroup) => {
        record.bindGroup = String(bindGroup);
      },
      dispatchWorkgroups: (x: number, y: number, z: number) => {
        record.workgroups = [x, y, z];
      },
      end: () => {
        record.ended = true;
      },
    } as unknown as GPUComputePassEncoder;
  }
}

class FakeDispatchResources {
  readonly pipelineLookups: string[] = [];
  readonly bindGroupLookups: string[] = [];

  pipelineForPass(kind: "fill" | "edge" | "color"): GPUComputePipeline {
    this.pipelineLookups.push(kind);
    return `pipeline:${kind}` as unknown as GPUComputePipeline;
  }

  bindGroupForPass(kind: "fill" | "edge" | "color"): GPUBindGroup {
    this.bindGroupLookups.push(kind);
    return `bind-group:${kind}` as unknown as GPUBindGroup;
  }
}

class FakeBindGroupDevice {
  readonly created: GPUBindGroupDescriptor[] = [];

  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup {
    this.created.push(descriptor);
    return descriptor.label as unknown as GPUBindGroup;
  }

  labels(): string[] {
    return this.created.map((descriptor) => String(descriptor.label));
  }
}

function fakePipeline(layout: string): Pick<GPUComputePipeline, "getBindGroupLayout"> {
  return {
    getBindGroupLayout: () => layout as unknown as GPUBindGroupLayout,
  };
}

function fakeTexture(label: string): Pick<GPUTexture, "createView"> {
  return {
    createView: () => `${label}-view` as unknown as GPUTextureView,
  };
}

function fakeBuffer(label: string): GPUBuffer {
  return label as unknown as GPUBuffer;
}

function installCompatibleNavigatorGpu(
  gpu: { requestAdapter: (options?: GPURequestAdapterOptions) => Promise<unknown> },
): void {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { gpu },
  });
}

function restoreCompatibleNavigator(descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(globalThis, "navigator", descriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, "navigator");
}

function fakeCompatibleWebGpuDevice(
  options: { lost?: Promise<GPUDeviceLostInfo>; mapError?: unknown } = {},
): Partial<GPUDevice> {
  return {
    lost: options.lost,
    queue: {
      writeBuffer() {},
    } as unknown as GPUQueue,
    popErrorScope: () => Promise.resolve(null),
    createShaderModule: (descriptor) => descriptor as unknown as GPUShaderModule,
    createBuffer: (descriptor) =>
      ({
        descriptor,
        mapAsync: () => options.mapError === undefined ? Promise.resolve() : Promise.reject(options.mapError),
        getMappedRange: () => new ArrayBuffer(Number(descriptor.size) || 0),
        unmap() {},
        destroy() {},
      }) as unknown as GPUBuffer,
    destroy() {},
  };
}

function deferredCompatibleGpuValue<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

Deno.test("three ascii readback layout packs fill edge and color buffers", () => {
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 32,
    colorByteLength: 32,
    includeEdges: true,
  });

  assertEquals(layout.fillOffset, 0);
  assertEquals(layout.edgeOffset, 8);
  assertEquals(layout.colorOffset, 40);
  assertEquals(layout.byteLength, 72);
  assertEquals(layout.fillFloatLength, 2);
  assertEquals(layout.edgeFloatLength, 8);
  assertEquals(layout.colorFloatLength, 8);
});

Deno.test("three ascii readback layout omits edge payload when edges are disabled", () => {
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 32,
    colorByteLength: 32,
    includeEdges: false,
  });

  assertEquals(layout.edgeOffset, undefined);
  assertEquals(layout.colorOffset, 8);
  assertEquals(layout.byteLength, 40);
});

Deno.test("three ascii readback layout can omit fill payload for block visibility alpha", () => {
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeFill: false,
    includeEdges: false,
  });

  assertEquals(layout.includeFill, false);
  assertEquals(layout.fillOffset, 0);
  assertEquals(layout.fillFloatLength, 0);
  assertEquals(layout.edgeOffset, undefined);
  assertEquals(layout.colorOffset, 0);
  assertEquals(layout.byteLength, 32);
});

Deno.test("three ascii readback views point at packed source ranges", () => {
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 16,
    includeEdges: true,
  });
  const floats = new Float32Array(layout.byteLength / Float32Array.BYTES_PER_ELEMENT);
  for (let index = 0; index < floats.length; index += 1) {
    floats[index] = index + 1;
  }

  const views = createThreeAsciiReadbackViews(floats.buffer, layout);

  assertEquals(Array.from(views.fillGlyphs), [1, 2]);
  assertEquals(Array.from(views.edgeGlyphs ?? []), [3, 4, 5, 6]);
  assertEquals(Array.from(views.colors), [7, 8, 9, 10]);
});

Deno.test("three ascii readback copy plan follows packed layout offsets", () => {
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeEdges: true,
  });

  const plan = createThreeAsciiReadbackCopyPlan({
    fill: { label: "fill", byteLength: 8 },
    edge: { label: "edge", byteLength: 16 },
    color: { label: "color", byteLength: 32 },
    includeEdges: true,
    layout,
  });

  assertEquals(plan.layout, layout);
  assertEquals(plan.commands, [
    { label: "fill", byteLength: 8, targetOffset: 0 },
    { label: "edge", byteLength: 16, targetOffset: 8 },
    { label: "color", byteLength: 32, targetOffset: 24 },
  ]);
});

Deno.test("three ascii readback copy plan omits edge copy when edge output is unused", () => {
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeEdges: false,
  });

  const plan = createThreeAsciiReadbackCopyPlan({
    fill: { label: "fill", byteLength: 8 },
    color: { label: "color", byteLength: 32 },
    includeEdges: false,
    layout,
  });

  assertEquals(plan.commands, [
    { label: "fill", byteLength: 8, targetOffset: 0 },
    { label: "color", byteLength: 32, targetOffset: 8 },
  ]);
});

Deno.test("three ascii readback copy plan can omit fill copy for compact block frames", () => {
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeFill: false,
    includeEdges: false,
  });

  const plan = createThreeAsciiReadbackCopyPlan({
    fill: { label: "fill", byteLength: 8 },
    color: { label: "color", byteLength: 32 },
    includeFill: false,
    includeEdges: false,
    layout,
  });

  assertEquals(plan.commands, [
    { label: "color", byteLength: 32, targetOffset: 0 },
  ]);
});

Deno.test("three ascii readback copy plan omits zero-byte GPU copy commands", () => {
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 0,
    edgeByteLength: 0,
    colorByteLength: 32,
    includeEdges: true,
  });

  const plan = createThreeAsciiReadbackCopyPlan({
    fill: { label: "fill", byteLength: 0 },
    edge: { label: "edge", byteLength: 0 },
    color: { label: "color", byteLength: 32 },
    includeEdges: true,
    layout,
  });

  assertEquals(plan.commands, [
    { label: "color", byteLength: 32, targetOffset: 0 },
  ]);
});

Deno.test("three ascii readback copy plan can omit all zero-byte copies", () => {
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 0,
    edgeByteLength: 0,
    colorByteLength: 0,
    includeEdges: false,
  });

  const plan = createThreeAsciiReadbackCopyPlan({
    fill: { label: "fill", byteLength: 0 },
    color: { label: "color", byteLength: 0 },
    includeEdges: false,
    layout,
  });

  assertEquals(plan.commands, []);
});

Deno.test("three ascii readback copy plan rejects missing requested edge output", () => {
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeEdges: true,
  });

  assertThrows(
    () =>
      createThreeAsciiReadbackCopyPlan({
        fill: { label: "fill", byteLength: 8 },
        color: { label: "color", byteLength: 32 },
        includeEdges: true,
        layout,
      }),
    Error,
    "without an edge output",
  );
});

Deno.test("executeThreeAsciiReadbackCopyPlan emits packed GPU copy commands", () => {
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeEdges: true,
  });
  const plan = createThreeAsciiReadbackCopyPlan({
    fill: { label: "fill", byteLength: 8 },
    edge: { label: "edge", byteLength: 16 },
    color: { label: "color", byteLength: 32 },
    includeEdges: true,
    layout,
  });
  const copies: unknown[][] = [];

  executeThreeAsciiReadbackCopyPlan(
    {
      copyBufferToBuffer(source, sourceOffset, target, targetOffset, byteLength) {
        copies.push([source, sourceOffset, target, targetOffset, byteLength]);
      },
    },
    plan,
    { fill: "fill-buffer", edge: "edge-buffer", color: "color-buffer" },
    { gpu: "target-buffer" },
  );

  assertEquals(copies, [
    ["fill-buffer", 0, "target-buffer", 0, 8],
    ["edge-buffer", 0, "target-buffer", 8, 16],
    ["color-buffer", 0, "target-buffer", 24, 32],
  ]);
});

Deno.test("executeThreeAsciiReadbackCopyPlan rejects missing target buffer", () => {
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 0,
    colorByteLength: 32,
    includeEdges: false,
  });
  const plan = createThreeAsciiReadbackCopyPlan({
    fill: { label: "fill", byteLength: 8 },
    color: { label: "color", byteLength: 32 },
    includeEdges: false,
    layout,
  });

  assertThrows(
    () =>
      executeThreeAsciiReadbackCopyPlan(
        { copyBufferToBuffer() {} },
        plan,
        { fill: "fill-buffer", color: "color-buffer" },
        undefined,
      ),
    Error,
    "readback buffer has not been initialized",
  );
});

Deno.test("executeThreeAsciiReadbackCopyPlan rejects missing requested source buffer", () => {
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeEdges: true,
  });
  const plan = createThreeAsciiReadbackCopyPlan({
    fill: { label: "fill", byteLength: 8 },
    edge: { label: "edge", byteLength: 16 },
    color: { label: "color", byteLength: 32 },
    includeEdges: true,
    layout,
  });

  assertThrows(
    () =>
      executeThreeAsciiReadbackCopyPlan(
        { copyBufferToBuffer() {} },
        plan,
        { fill: "fill-buffer", color: "color-buffer" },
        { gpu: "target-buffer" },
      ),
    Error,
    "missing edge output buffer",
  );
});

Deno.test("writeThreeAsciiReadbackCopySources reuses source maps and clears stale optional buffers", () => {
  const target: ThreeAsciiReadbackCopySources<string> = {
    fill: "old-fill",
    edge: "old-edge",
    color: "old-color",
  };

  assertEquals(
    writeThreeAsciiReadbackCopySources(target, {
      fill: { gpu: "fill-buffer" },
      edge: { gpu: "edge-buffer" },
      color: { gpu: "color-buffer" },
    }),
    target,
  );
  assertEquals(target, {
    fill: "fill-buffer",
    edge: "edge-buffer",
    color: "color-buffer",
  });

  writeThreeAsciiReadbackCopySources(target, {
    color: { gpu: "compact-color-buffer" },
  });
  assertEquals(target, {
    color: "compact-color-buffer",
  });
});

Deno.test("writeThreeAsciiReadbackCopySourceSlots reuses slot records and clears stale optional buffers", () => {
  const target: ThreeAsciiReadbackCopySourceSlots<string> = {
    fill: { gpu: "old-fill" },
    edge: { gpu: "old-edge" },
    color: { gpu: "old-color" },
  };
  const fill = { gpu: "fill-buffer" };
  const edge = { gpu: "edge-buffer" };
  const color = { gpu: "color-buffer" };

  assertEquals(writeThreeAsciiReadbackCopySourceSlots(target, fill, edge, color), target);
  assertEquals(target, { fill, edge, color });

  const compactColor = { gpu: "compact-color-buffer" };
  writeThreeAsciiReadbackCopySourceSlots(target, undefined, undefined, compactColor);
  assertEquals(target, {
    color: compactColor,
  });
});

Deno.test("writeThreeAsciiReadbackLayoutOptions reuses layout option records", () => {
  const target: ThreeAsciiReadbackLayoutOptions = {
    fillByteLength: 99,
    edgeByteLength: 88,
    colorByteLength: 77,
    includeFill: true,
    includeEdges: true,
  };

  assertEquals(
    writeThreeAsciiReadbackLayoutOptions(
      target,
      {
        fillByteLength: 8,
        edgeByteLength: 16,
        colorByteLength: 32,
      },
      {
        includeFill: false,
        includeEdges: false,
      },
    ),
    target,
  );
  assertEquals(target, {
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeFill: false,
    includeEdges: false,
  });
});

Deno.test("writeThreeAsciiReadbackCopySourceDescriptors reuses descriptor records", () => {
  const fill: ThreeAsciiReadbackCopySource = { label: "fill", byteLength: 99 };
  const edge: ThreeAsciiReadbackCopySource = { label: "edge", byteLength: 88 };
  const color: ThreeAsciiReadbackCopySource = { label: "color", byteLength: 77 };
  const target = { fill, edge, color };

  assertEquals(
    writeThreeAsciiReadbackCopySourceDescriptors(target, {
      fillByteLength: 8,
      edgeByteLength: 16,
      colorByteLength: 32,
    }),
    target,
  );
  assertEquals(fill, { label: "fill", byteLength: 8 });
  assertEquals(edge, { label: "edge", byteLength: 16 });
  assertEquals(color, { label: "color", byteLength: 32 });
});

Deno.test("three ascii readback copy plan cache reuses unchanged command arrays", () => {
  const cache = new ThreeAsciiReadbackCopyPlanCache();
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeEdges: true,
  });

  const first = cache.resolve({
    fill: { label: "fill", byteLength: 8 },
    edge: { label: "edge", byteLength: 16 },
    color: { label: "color", byteLength: 32 },
    includeEdges: true,
    layout,
  });
  const second = cache.resolve({
    fill: { label: "fill", byteLength: 8 },
    edge: { label: "edge", byteLength: 16 },
    color: { label: "color", byteLength: 32 },
    includeEdges: true,
    layout,
  });

  assertEquals(second, first);
  assertEquals(second.commands, first.commands);

  cache.clear();
  const afterClear = cache.resolve({
    fill: { label: "fill", byteLength: 8 },
    edge: { label: "edge", byteLength: 16 },
    color: { label: "color", byteLength: 32 },
    includeEdges: true,
    layout,
  });
  assertEquals(afterClear === first, false);
});

Deno.test("three ascii readback copy plan cache invalidates on edge mode changes", () => {
  const cache = new ThreeAsciiReadbackCopyPlanCache();
  const withEdges = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeEdges: true,
  });
  const withoutEdges = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeEdges: false,
  });

  const first = cache.resolve({
    fill: { label: "fill", byteLength: 8 },
    edge: { label: "edge", byteLength: 16 },
    color: { label: "color", byteLength: 32 },
    includeEdges: true,
    layout: withEdges,
  });
  const second = cache.resolve({
    fill: { label: "fill", byteLength: 8 },
    color: { label: "color", byteLength: 32 },
    includeEdges: false,
    layout: withoutEdges,
  });

  assertEquals(second === first, false);
  assertEquals(second.commands, [
    { label: "fill", byteLength: 8, targetOffset: 0 },
    { label: "color", byteLength: 32, targetOffset: 8 },
  ]);
});

Deno.test("three ascii readback layout rejects unaligned byte lengths", () => {
  assertThrows(
    () =>
      createThreeAsciiReadbackLayout({
        fillByteLength: 6,
        edgeByteLength: 16,
        colorByteLength: 16,
        includeEdges: true,
      }),
    RangeError,
    "Float32-aligned",
  );
});

Deno.test("three ascii readback layout cache reuses unchanged layouts", () => {
  const cache = new ThreeAsciiReadbackLayoutCache();
  const first = cache.resolve({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeEdges: true,
  });
  const second = cache.resolve({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeEdges: true,
  });

  assertEquals(second === first, true);
});

Deno.test("three ascii readback layout cache invalidates on shape changes and clear", () => {
  const cache = new ThreeAsciiReadbackLayoutCache();
  const first = cache.resolve({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeEdges: true,
  });
  const withoutEdges = cache.resolve({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeEdges: false,
  });
  cache.clear();
  const afterClear = cache.resolve({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeEdges: false,
  });

  assertEquals(withoutEdges === first, false);
  assertEquals(withoutEdges.edgeOffset, undefined);
  assertEquals(afterClear === withoutEdges, false);
});

Deno.test("three ascii readback layout cache ignores unused edge bytes when edges are disabled", () => {
  const cache = new ThreeAsciiReadbackLayoutCache();
  const first = cache.resolve({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 32,
    includeEdges: false,
  });
  const second = cache.resolve({
    fillByteLength: 8,
    edgeByteLength: 64,
    colorByteLength: 32,
    includeEdges: false,
  });

  assertEquals(second === first, true);
  assertEquals(second.edgeOffset, undefined);
});

Deno.test("three ascii readback view cache reuses views by source and equivalent layout", () => {
  const cache = new ThreeAsciiReadbackViewCache();
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 16,
    includeEdges: true,
  });
  const source = new ArrayBuffer(layout.byteLength);

  const first = cache.resolve(source, layout);
  const second = cache.resolve(source, layout);
  const equivalentLayout = createThreeAsciiReadbackLayout({
    fillByteLength: 8,
    edgeByteLength: 16,
    colorByteLength: 16,
    includeEdges: true,
  });
  const differentLayout = cache.resolve(source, equivalentLayout);

  assertEquals(second === first, true);
  assertEquals(differentLayout === first, true);

  cache.clear();
  assertEquals(cache.resolve(source, equivalentLayout) === differentLayout, false);
});

Deno.test("assembleThreeAsciiReadbackGrid resolves views and delegates assembler input", () => {
  const source = new ArrayBuffer(64);
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 4,
    edgeByteLength: 16,
    colorByteLength: 16,
    includeEdges: true,
  });
  const views: ThreeAsciiReadbackViews = {
    fillGlyphs: new Float32Array([14]),
    edgeGlyphs: new Float32Array([0, 0, 0, 0]),
    colors: new Float32Array([1, 0.5, 0.25, 1]),
  };
  const backgroundColor = new Color("#102030");
  const grid = [["\x1b[38;2;255;128;64m█\x1b[0m"]];
  const calls: string[] = [];
  let resolvedSource: ArrayBuffer | undefined;
  let resolvedLayout: ReturnType<typeof createThreeAsciiReadbackLayout> | undefined;
  let assemblerInput: ThreeAsciiAnsiGridInput | undefined;
  const times = [20, 27];

  const result = assembleThreeAsciiReadbackGrid({
    source,
    layout,
    viewCache: {
      resolve(actualSource, actualLayout) {
        calls.push("resolve");
        resolvedSource = actualSource;
        resolvedLayout = actualLayout;
        return views;
      },
    },
    assembler: {
      build(input) {
        calls.push("build");
        assemblerInput = input;
        return grid;
      },
    },
    columns: 1,
    rows: 1,
    terminalGlyphStyle: "blocks",
    terminalEdgeBias: 2,
    backgroundColor,
    now: () => times.shift() ?? 27,
  });

  assertEquals(calls, ["resolve", "build"]);
  assertEquals(resolvedSource, source);
  assertEquals(resolvedLayout, layout);
  assertEquals(assemblerInput, {
    columns: 1,
    rows: 1,
    fillGlyphs: views.fillGlyphs,
    edgeGlyphs: views.edgeGlyphs,
    colors: views.colors,
    terminalGlyphStyle: "blocks",
    terminalEdgeBias: 2,
    backgroundColor,
    blockVisibilityFromColorAlpha: false,
  });
  assertEquals(result, {
    grid,
    assemblyMs: 7,
  });
});

Deno.test("assembleThreeAsciiReadbackGridWithContext reuses retained assembly dependencies", () => {
  const source = new ArrayBuffer(64);
  const layout = createThreeAsciiReadbackLayout({
    fillByteLength: 4,
    edgeByteLength: 16,
    colorByteLength: 16,
    includeEdges: true,
  });
  const views: ThreeAsciiReadbackViews = {
    fillGlyphs: new Float32Array([1]),
    edgeGlyphs: new Float32Array([2, 3, 4, 5]),
    colors: new Float32Array([0, 0, 0, 1]),
  };
  const backgroundColor = new Color("#000000");
  const grid = [[" "]];
  const calls: string[] = [];
  const times = [100, 104.5];

  const context = {
    viewCache: {
      resolve(actualSource: ArrayBuffer, actualLayout: ReturnType<typeof createThreeAsciiReadbackLayout>) {
        calls.push(actualSource === source && actualLayout === layout ? "resolve" : "bad-resolve");
        return views;
      },
    },
    assembler: {
      build(input: ThreeAsciiAnsiGridInput) {
        calls.push(input.terminalGlyphStyle === "glyphs" ? "build" : "bad-build");
        return grid;
      },
    },
    now: () => times.shift() ?? 104.5,
  };

  const result = assembleThreeAsciiReadbackGridWithContext(context, {
    source,
    layout,
    columns: 1,
    rows: 1,
    terminalGlyphStyle: "glyphs",
    terminalEdgeBias: 0.5,
    backgroundColor,
  });

  assertEquals(calls, ["resolve", "build"]);
  assertEquals(result, {
    grid,
    assemblyMs: 4.5,
  });
});
