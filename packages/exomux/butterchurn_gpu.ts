// Copyright 2023 Im-Beast. MIT license.

// MilkDrop's render graph on WebGPU.
//
// This is the piece that lets preset shaders run: Butterchurn's pipeline
// rebuilt against `navigator.gpu` so the same warp and composite shaders the
// desktop version runs also run here, with the finished frame read back and
// quantized to terminal cells.
//
// Per frame:
//
//   1. warp pass — the mesh from `pixel_eqs` is drawn over the previous frame,
//      every fragment passing through the preset's own warp shader;
//   2. blur chain — three successively halved levels, separable, feeding
//      `sampler_blur1..3`, which 295 of the catalog's presets sample;
//   3. waveform pass — the basic waveform drawn as line geometry;
//   4. comp pass — a full-screen quad through the preset's composite shader,
//      which is where most presets do their colour grading;
//   5. resolve — the composed frame is downsampled to the cell grid and read
//      back asynchronously.
//
// Readback lands one frame late, the same arrangement `turbulence_background`
// uses: mapping a buffer needs an await, and `advance` is synchronous.

import { SAMPLERS } from "./glsl_wgsl.ts";
import type { ExomuxButterchurnPrim } from "./butterchurn_preset.ts";
import { exomuxNoiseSet, type ExomuxNoiseTexture } from "./butterchurn_noise.ts";
import { exomuxGpuDevice } from "./gpu_device.ts";
import { exomuxDebugLog, exomuxDebugLoggingActive } from "./debug_log.ts";

/** Internal render size. Chosen so `texsize`-relative offsets behave as authored. */
const RENDER_WIDTH = 512;
/** Chosen per size so the render aspect matches the cell grid's. */
const MIN_RENDER_HEIGHT = 128;
const MAX_RENDER_HEIGHT = 512;
/**
 * Height, in cell rows, of the ribbon the basic waveform is drawn as.
 *
 * The frame is rendered several times wider than the cell grid and box-filtered
 * back down (see the resolve pass), which averages a one-pixel line away: a
 * preset whose only content is the basic waveform then resolves to black on the
 * GPU while the CPU — which deposits ink straight into cells — shows it. Drawing
 * the waveform as a ribbon a little over a cell tall keeps it above that filter,
 * matching the cell-resolution weight the software path gives it. A horizontal
 * oscilloscope trace is what MilkDrop's basic waveform is, so thickening it
 * vertically is the faithful shape.
 */
const WAVE_RIBBON_CELLS = 1.5;
/**
 * Presets whose compiled pipelines are kept.
 *
 * Enough for the one on screen, the one being prewarmed, and a few steps back
 * through the rotation, which is as far as anyone goes with `Ctrl-N [`.
 * Evicting costs a recompile, and compiling happens off the main thread three
 * seconds ahead of the switch.
 */
const MAX_CACHED_PRESETS = 6;
/**
 * Feedback format. Real butterchurn stores every pass in 8-bit UNORM, and
 * preset dynamics depend on it: a high-pass warp (`blur1 - main`) produces
 * signed values that UNORM stores rectify to zero, pumping net energy into
 * the feedback loop every cycle. In half-float the negatives survive, the
 * oscillation cancels, and the echo-amplifier class settles at ~0.03
 * luminance instead of saturating (033 readback probe, Aug 16 2026:
 * 12-13% negative texels, mean pinned at 0.034). Clipping at 1.0 is part of
 * the same authored-against contract.
 */
const MAIN_FORMAT: GPUTextureFormat = "rgba8unorm";
/** Uniform block, as vec4 slots; see `UNIFORM_SLOTS` for the layout. */
const UNIFORM_VEC4S = 34;

/**
 * Which vec4 of the uniform block each named value lives in.
 *
 * Packed as vec4s rather than a struct of scalars deliberately: WGSL's uniform
 * alignment rules make a hand-written mixed struct easy to get subtly wrong,
 * and a wrong offset here shows up as a preset rendering plausibly but not
 * correctly, which is the hardest kind of bug to notice.
 */
const UNIFORM_SLOTS = {
  scalars0: 0, // time, fps, frame, decay
  scalars1: 1, // bass, mid, treb, vol
  scalars2: 2, // bass_att, mid_att, treb_att, vol_att
  resolution: 3, // resolution.xy, unused
  aspect: 4,
  texsize: 5,
  texsizeNoiseLq: 6,
  texsizeNoiseMq: 7,
  texsizeNoiseHq: 8,
  texsizeNoiseLqLite: 9,
  texsizeNoisevolLq: 10,
  texsizeNoisevolHq: 11,
  qa: 12,
  qb: 13,
  qc: 14,
  qd: 15,
  qe: 16,
  qf: 17,
  qg: 18,
  qh: 19,
  roamCos: 20,
  roamSin: 21,
  slowRoamCos: 22,
  slowRoamSin: 23,
  blurMin: 24, // blur1_min, blur2_min, blur3_min, unused
  blurMax: 25, // blur1_max, blur2_max, blur3_max, unused
  scales: 26, // scale1, scale2, scale3, unused
  biases: 27, // bias1, bias2, bias3, unused
  randFrame: 28,
  randPreset: 29,
  hueShader: 30,
} as const;

/** Maps a template sampler name to the texture it reads and how it filters. */
interface SamplerBinding {
  readonly texture: "main" | "blur1" | "blur2" | "blur3" | keyof ReturnType<typeof exomuxNoiseSet>;
  readonly address: "clamp" | "repeat";
  readonly filter: "linear" | "nearest";
  readonly dimension: "2d" | "3d";
}

const SAMPLER_BINDINGS: Readonly<Record<string, SamplerBinding>> = Object.freeze({
  sampler_main: { texture: "main", address: "clamp", filter: "linear", dimension: "2d" },
  sampler_fc_main: { texture: "main", address: "clamp", filter: "linear", dimension: "2d" },
  sampler_fw_main: { texture: "main", address: "repeat", filter: "linear", dimension: "2d" },
  sampler_pc_main: { texture: "main", address: "clamp", filter: "nearest", dimension: "2d" },
  sampler_pw_main: { texture: "main", address: "repeat", filter: "nearest", dimension: "2d" },
  sampler_blur1: { texture: "blur1", address: "clamp", filter: "linear", dimension: "2d" },
  sampler_blur2: { texture: "blur2", address: "clamp", filter: "linear", dimension: "2d" },
  sampler_blur3: { texture: "blur3", address: "clamp", filter: "linear", dimension: "2d" },
  sampler_noise_lq: { texture: "noise_lq", address: "repeat", filter: "linear", dimension: "2d" },
  sampler_noise_lq_lite: { texture: "noise_lq_lite", address: "repeat", filter: "linear", dimension: "2d" },
  sampler_noise_mq: { texture: "noise_mq", address: "repeat", filter: "linear", dimension: "2d" },
  sampler_noise_hq: { texture: "noise_hq", address: "repeat", filter: "linear", dimension: "2d" },
  sampler_pw_noise_lq: { texture: "noise_lq", address: "repeat", filter: "nearest", dimension: "2d" },
  sampler_noisevol_lq: { texture: "noisevol_lq", address: "repeat", filter: "linear", dimension: "3d" },
  sampler_noisevol_hq: { texture: "noisevol_hq", address: "repeat", filter: "linear", dimension: "3d" },
});

/** Prelude every translated shader body is compiled against. */
function shaderPrelude(samplers: readonly string[]): string {
  const bindings: string[] = [
    "struct Uniforms { data: array<vec4<f32>, " + UNIFORM_VEC4S + "> };",
    "@group(0) @binding(0) var<uniform> u: Uniforms;",
  ];
  samplers.forEach((name, index) => {
    const binding = SAMPLER_BINDINGS[name]!;
    const kind = binding.dimension === "3d" ? "texture_3d<f32>" : "texture_2d<f32>";
    bindings.push(`@group(0) @binding(${index * 2 + 1}) var ${name}_tex: ${kind};`);
    bindings.push(`@group(0) @binding(${index * 2 + 2}) var ${name}_smp: sampler;`);
  });
  const s = (slot: number, component: string) => `u.data[${slot}].${component}`;
  return `${bindings.join("\n")}

const PI: f32 = 3.141592653589793;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) uv_orig: vec2<f32>,
  @location(2) vColor: vec4<f32>,
};

fn shade(uv: vec2<f32>, uv_orig: vec2<f32>, vColor: vec4<f32>) -> vec3<f32> {
  let time = ${s(UNIFORM_SLOTS.scalars0, "x")};
  let fps = ${s(UNIFORM_SLOTS.scalars0, "y")};
  let frame = ${s(UNIFORM_SLOTS.scalars0, "z")};
  let decay = ${s(UNIFORM_SLOTS.scalars0, "w")};
  let bass = ${s(UNIFORM_SLOTS.scalars1, "x")};
  let mid = ${s(UNIFORM_SLOTS.scalars1, "y")};
  let treb = ${s(UNIFORM_SLOTS.scalars1, "z")};
  let vol = ${s(UNIFORM_SLOTS.scalars1, "w")};
  let bass_att = ${s(UNIFORM_SLOTS.scalars2, "x")};
  let mid_att = ${s(UNIFORM_SLOTS.scalars2, "y")};
  let treb_att = ${s(UNIFORM_SLOTS.scalars2, "z")};
  let vol_att = ${s(UNIFORM_SLOTS.scalars2, "w")};
  let resolution = ${s(UNIFORM_SLOTS.resolution, "xy")};
  let aspect = u.data[${UNIFORM_SLOTS.aspect}];
  let texsize = u.data[${UNIFORM_SLOTS.texsize}];
  let texsize_noise_lq = u.data[${UNIFORM_SLOTS.texsizeNoiseLq}];
  let texsize_noise_mq = u.data[${UNIFORM_SLOTS.texsizeNoiseMq}];
  let texsize_noise_hq = u.data[${UNIFORM_SLOTS.texsizeNoiseHq}];
  let texsize_noise_lq_lite = u.data[${UNIFORM_SLOTS.texsizeNoiseLqLite}];
  let texsize_noisevol_lq = u.data[${UNIFORM_SLOTS.texsizeNoisevolLq}];
  let texsize_noisevol_hq = u.data[${UNIFORM_SLOTS.texsizeNoisevolHq}];
  let _qa = u.data[${UNIFORM_SLOTS.qa}];
  let _qb = u.data[${UNIFORM_SLOTS.qb}];
  let _qc = u.data[${UNIFORM_SLOTS.qc}];
  let _qd = u.data[${UNIFORM_SLOTS.qd}];
  let _qe = u.data[${UNIFORM_SLOTS.qe}];
  let _qf = u.data[${UNIFORM_SLOTS.qf}];
  let _qg = u.data[${UNIFORM_SLOTS.qg}];
  let _qh = u.data[${UNIFORM_SLOTS.qh}];
  let q1 = _qa.x; let q2 = _qa.y; let q3 = _qa.z; let q4 = _qa.w;
  let q5 = _qb.x; let q6 = _qb.y; let q7 = _qb.z; let q8 = _qb.w;
  let q9 = _qc.x; let q10 = _qc.y; let q11 = _qc.z; let q12 = _qc.w;
  let q13 = _qd.x; let q14 = _qd.y; let q15 = _qd.z; let q16 = _qd.w;
  let q17 = _qe.x; let q18 = _qe.y; let q19 = _qe.z; let q20 = _qe.w;
  let q21 = _qf.x; let q22 = _qf.y; let q23 = _qf.z; let q24 = _qf.w;
  let q25 = _qg.x; let q26 = _qg.y; let q27 = _qg.z; let q28 = _qg.w;
  let q29 = _qh.x; let q30 = _qh.y; let q31 = _qh.z; let q32 = _qh.w;
  let roam_cos = u.data[${UNIFORM_SLOTS.roamCos}];
  let roam_sin = u.data[${UNIFORM_SLOTS.roamSin}];
  let slow_roam_cos = u.data[${UNIFORM_SLOTS.slowRoamCos}];
  let slow_roam_sin = u.data[${UNIFORM_SLOTS.slowRoamSin}];
  let blur1_min = ${s(UNIFORM_SLOTS.blurMin, "x")};
  let blur2_min = ${s(UNIFORM_SLOTS.blurMin, "y")};
  let blur3_min = ${s(UNIFORM_SLOTS.blurMin, "z")};
  let blur1_max = ${s(UNIFORM_SLOTS.blurMax, "x")};
  let blur2_max = ${s(UNIFORM_SLOTS.blurMax, "y")};
  let blur3_max = ${s(UNIFORM_SLOTS.blurMax, "z")};
  let scale1 = ${s(UNIFORM_SLOTS.scales, "x")};
  let scale2 = ${s(UNIFORM_SLOTS.scales, "y")};
  let scale3 = ${s(UNIFORM_SLOTS.scales, "z")};
  let bias1 = ${s(UNIFORM_SLOTS.biases, "x")};
  let bias2 = ${s(UNIFORM_SLOTS.biases, "y")};
  let bias3 = ${s(UNIFORM_SLOTS.biases, "z")};
  let rand_frame = u.data[${UNIFORM_SLOTS.randFrame}];
  let rand_preset = u.data[${UNIFORM_SLOTS.randPreset}];
  let hue_shader = u.data[${UNIFORM_SLOTS.hueShader}].xyz;
  var ret: vec3<f32> = vec3<f32>(0.0);
  let rad = length(uv_orig - 0.5);
  let ang = atan2(uv_orig.x - 0.5, uv_orig.y - 0.5);
`;
}

/** Assembles a complete fragment shader module for one translated body. */
/**
 * Neutralizes constant expressions that naga rejects at parse time.
 *
 * The vendored preset shaders are already WGSL, translated from author MilkDrop
 * HLSL that sometimes divides by a literal zero (an accidental `x/0`). A lenient
 * driver folds that to a runtime infinity and renders through it, but naga's
 * const-evaluator refuses `inf`/`nan` as a concrete f32 and fails the whole
 * module, so the preset renders black on strict drivers (Intel/Mesa). Nudge a
 * literal zero divisor to a tiny epsilon: the value becomes large-but-finite, so
 * the module compiles and the preset draws instead of dead-skipping. Matches a
 * bare `0`, `0.`, or `0.0…` divisor only — never `0.5`, `0e3`, or a hex literal.
 */
export function sanitizeShaderBody(body: string): string {
  return body.replace(/\/\s*0(?:\.0*)?(?![.0-9eExX])/g, "/ 1e-6");
}

function fragmentSource(body: string, samplers: readonly string[]): string {
  return `${shaderPrelude(samplers)}
${sanitizeShaderBody(body)}
  return ret;
}

@fragment fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let ret = shade(input.uv, input.uv_orig, input.vColor);
  return vec4<f32>(ret, 1.0) * input.vColor;
}
`;
}

/** Vertex stage for the warp mesh: positions and warped UVs come from a buffer. */
const WARP_VERTEX = `
@vertex fn vs(
  @location(0) pos: vec2<f32>,
  @location(1) warpUv: vec2<f32>,
  @location(2) color: vec4<f32>,
) -> VsOut {
  var out: VsOut;
  out.position = vec4<f32>(pos, 0.0, 1.0);
  out.uv = warpUv;
  out.uv_orig = pos * vec2<f32>(0.5, -0.5) + 0.5;
  out.vColor = color;
  return out;
}
`;

/** Vertex stage for the composite pass: one full-screen triangle. */
const COMP_VERTEX = `
@vertex fn vs(@builtin(vertex_index) index: u32) -> VsOut {
  var positions = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  let p = positions[index];
  var out: VsOut;
  out.position = vec4<f32>(p, 0.0, 1.0);
  out.uv = p * vec2<f32>(0.5, -0.5) + 0.5;
  out.uv_orig = out.uv;
  out.vColor = vec4<f32>(1.0);
  return out;
}
`;

/** Separable blur and the final downsample to the cell grid. */
const UTILITY_WGSL = `
@group(0) @binding(0) var src_tex: texture_2d<f32>;
@group(0) @binding(1) var src_smp: sampler;
// direction: xy is the step along the blurred axis, zw the output texel size.
// bounds: xy is the level's [min, max] store clamp (real butterchurn stores
// blur levels range-compressed into the authored [b*n, b*x] and clamps, so
// reconstruction is a hard clamp to those bounds); zw unused.
struct UtilityParams {
  direction: vec4<f32>,
  bounds: vec4<f32>,
}
@group(0) @binding(2) var<uniform> params: UtilityParams;

@vertex fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  return vec4<f32>(positions[index], 0.0, 1.0);
}

// Nine-tap gaussian; params.direction.xy is one texel along the blurred axis.
@fragment fn blur(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = frag.xy * params.direction.zw;
  var sum = vec4<f32>(0.0);
  let weights = array<f32, 5>(0.2270270, 0.1945946, 0.1216216, 0.0540541, 0.0162162);
  sum += textureSampleLevel(src_tex, src_smp, uv, 0.0) * weights[0];
  for (var i = 1; i < 5; i++) {
    let offset = params.direction.xy * f32(i);
    sum += textureSampleLevel(src_tex, src_smp, uv + offset, 0.0) * weights[i];
    sum += textureSampleLevel(src_tex, src_smp, uv - offset, 0.0) * weights[i];
  }
  return vec4<f32>(clamp(sum.rgb, vec3<f32>(params.bounds.x), vec3<f32>(params.bounds.y)), sum.a);
}

// Box filter over the whole source footprint. A single bilinear tap reads four
// texels of a footprint tens of texels wide, so a one-pixel waveform vanishes
// on the way down to cell resolution.
@fragment fn resolve(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
  let base = (frag.xy - 0.5) * params.direction.zw;
  let step = params.direction.xy;
  var sum = vec4<f32>(0.0);
  var taps = 0.0;
  for (var y = 0; y < 6; y++) {
    for (var x = 0; x < 6; x++) {
      let offset = vec2<f32>((f32(x) + 0.5) / 6.0, (f32(y) + 0.5) / 6.0) * step;
      sum += textureSampleLevel(src_tex, src_smp, base + offset, 0.0);
      taps += 1.0;
    }
  }
  return sum / taps;
}
`;

/** The precompiled shader bodies one preset needs, as stored in the catalog. */
export interface ExomuxButterchurnGpuShaders {
  readonly name: string;
  /** WGSL body, already translated at build time; empty for MilkDrop's default. */
  readonly warp: string;
  readonly warpSamplers: readonly string[];
  readonly comp: string;
  readonly compSamplers: readonly string[];
}

/** One preset's compiled GPU pipelines. */
interface PresetPipelines {
  readonly warp: GPURenderPipeline;
  readonly warpSamplers: readonly string[];
  readonly comp: GPURenderPipeline;
  readonly compSamplers: readonly string[];
}

export interface ExomuxButterchurnGpuOptions {
  /** Cell grid the finished frame is resolved to. */
  readonly width: number;
  readonly height: number;
  /** Deterministic source for the noise textures. */
  readonly random?: () => number;
}

/** Everything one frame needs from the CPU side of the preset. */
export interface ExomuxButterchurnGpuFrame {
  /** Warp mesh UVs, `(meshWidth + 1) * (meshHeight + 1)` pairs. */
  readonly mesh: Float32Array;
  readonly meshWidth: number;
  readonly meshHeight: number;
  /** Waveform vertices as (x, y) pairs in [-1, 1], y up. */
  readonly wave: Float32Array;
  readonly waveCount: number;
  readonly waveColor: readonly [number, number, number, number];
  /** `q1..q32` after this frame's equations. */
  readonly q: Float32Array;
  readonly time: number;
  readonly frame: number;
  readonly fps: number;
  readonly decay: number;
  readonly bass: number;
  readonly mid: number;
  readonly treb: number;
  readonly bassAttack: number;
  readonly midAttack: number;
  readonly trebleAttack: number;
  readonly aspectX: number;
  readonly aspectY: number;
  /** Custom waves and shapes for this frame; empty when the preset has none. */
  readonly prims?: readonly ExomuxButterchurnPrim[];
  /** Raw authored/animated blur ranges `b1n..b3x`; safe-fixed before upload. */
  readonly blurMin?: readonly [number, number, number];
  readonly blurMax?: readonly [number, number, number];
}

/**
 * MilkDrop's `GetSafeBlurMinMax`: each range keeps a minimum width of 0.1
 * (expanded around its midpoint), and each deeper blur level may narrow the
 * previous level's range but never widen it.
 */
export function exomuxSafeBlurRanges(
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): { min: [number, number, number]; max: [number, number, number] } {
  const lo: [number, number, number] = [min[0], min[1], min[2]];
  const hi: [number, number, number] = [max[0], max[1], max[2]];
  const MIN_DIST = 0.1;
  for (let level = 0; level < 3; level += 1) {
    if (level > 0) {
      hi[level] = Math.min(hi[level - 1]!, hi[level]!);
      lo[level] = Math.max(lo[level - 1]!, lo[level]!);
    }
    if (hi[level]! - lo[level]! < MIN_DIST) {
      const mid = (lo[level]! + hi[level]!) / 2;
      lo[level] = mid - MIN_DIST / 2;
      hi[level] = mid + MIN_DIST / 2;
    }
  }
  return { min: lo, max: hi };
}

/**
 * The MilkDrop render graph, bound to one device and one output size.
 *
 * Pipelines are compiled per preset and cached, because compiling a preset's
 * shaders costs a few milliseconds and presets are revisited as the rotation
 * cycles.
 */
export class ExomuxButterchurnGpu {
  readonly #device: GPUDevice;
  #width: number;
  #height: number;
  #renderWidth: number;
  #renderHeight: number;

  /** Ping-ponged feedback pair. `#mainIndex` selects the one holding the frame. */
  readonly #main: GPUTexture[] = [];
  #mainIndex = 0;
  readonly #blur: GPUTexture[] = [];
  readonly #blurTemp: GPUTexture[] = [];
  #resolveTexture: GPUTexture;
  #readback: GPUBuffer;
  #readbackBytesPerRow: number;

  /**
   * Texture views, cached per texture.
   *
   * Views and bind groups are GPU resources that only come back on garbage
   * collection, and the render path needs roughly twenty-five views and ten
   * bind groups a frame. Recreating them every frame accumulated faster than
   * collection freed them until the device ran out of memory and stopped
   * producing frames — which showed up as the background freezing.
   */
  readonly #views = new WeakMap<GPUTexture, Map<string, GPUTextureView>>();
  /**
   * Bind groups per preset, cached by the resources they point at. Nested by
   * preset name so a preset's groups can be dropped with its pipelines, and
   * because a preset name may itself contain the key separator.
   */
  readonly #bindGroups = new Map<string, Map<string, GPUBindGroup>>();
  /** Blur and resolve groups: a fixed handful, not tied to any preset. */
  readonly #utilityGroups = new Map<string, GPUBindGroup>();
  /** Bind group layouts, cached by the sampler list they describe. */
  readonly #presetLayouts = new Map<string, GPUBindGroupLayout>();

  readonly #noise = new Map<string, GPUTexture>();
  readonly #samplers = new Map<string, GPUSampler>();
  readonly #uniform: GPUBuffer;
  readonly #uniformData = new Float32Array(UNIFORM_VEC4S * 4);
  readonly #directionBuffers: GPUBuffer[] = [];

  readonly #utility: GPUShaderModule;
  readonly #blurPipeline: GPURenderPipeline;
  readonly #resolvePipeline: GPURenderPipeline;
  readonly #utilityLayout: GPUBindGroupLayout;

  /**
   * Compiled pipelines, most recently used last.
   *
   * Bounded, because it is not a cache of cheap things: each entry holds two
   * render pipelines and the shader modules behind them, and the rotation
   * visits 289 presets. Left unbounded, a long session accumulated every one
   * of them and eventually exhausted the driver — the whole GPU, not just this
   * process, so nothing else could get a device either.
   */
  readonly #pipelines = new Map<string, PresetPipelines>();
  /** Presets whose shaders will not compile. Cheap, so remembered for good. */
  readonly #failed = new Set<string>();
  /** Presets whose pipelines are still being built, so work is not duplicated. */
  readonly #compiling = new Set<string>();
  #meshBuffer: GPUBuffer | undefined;
  #meshVertices = 0;
  #meshData = new Float32Array(0);
  #waveBuffer: GPUBuffer | undefined;
  #waveData = new Float32Array(0);
  #primBuffer: GPUBuffer | undefined;
  #primData = new Float32Array(0);
  /** Pipelines for custom waves and shapes, keyed by topology, blend, texture. */
  readonly #primPipelines = new Map<string, GPURenderPipeline>();
  #primModule: GPUShaderModule | undefined;
  #primLayout: GPUBindGroupLayout | undefined;
  /** Bind groups for textured prims; the source ping-pongs, so two at most. */
  readonly #primBindGroups = new WeakMap<GPUTexture, GPUBindGroup>();
  readonly #directionData = new Float32Array(8);
  #blurRanges: { min: readonly number[]; max: readonly number[] } = { min: [0, 0, 0], max: [1, 1, 1] };
  /** Increments each time a resolved frame lands, so callers can spot a stall. */
  #readbacks = 0;
  /** Set when the device is lost; every later render is refused. */
  #lost = false;

  /** Latest resolved frame as RGBA bytes, or undefined until one lands. */
  #latest: Uint8Array | undefined;
  #mapping = false;

  /**
   * Builds a renderer, or nothing when the device cannot supply one.
   *
   * Preferred over the constructor: the budget probe it runs first is what
   * keeps the graph from rendering into textures that failed to allocate.
   */
  static async create(
    device: GPUDevice,
    options: ExomuxButterchurnGpuOptions,
  ): Promise<ExomuxButterchurnGpu | undefined> {
    try {
      device.pushErrorScope("out-of-memory");
    } catch {
      // No error scopes to check against; take the device at its word.
      return new ExomuxButterchurnGpu(device, options);
    }
    const gpu = new ExomuxButterchurnGpu(device, options);
    if (await allocationSucceeded(device)) return gpu;
    gpu.destroy();
    return undefined;
  }

  constructor(device: GPUDevice, options: ExomuxButterchurnGpuOptions) {
    this.#device = device;
    this.#width = Math.max(1, options.width);
    this.#height = Math.max(1, options.height);
    [this.#renderWidth, this.#renderHeight] = renderSizeFor(this.#width, this.#height);
    const random = options.random ?? Math.random;

    for (let index = 0; index < 2; index += 1) {
      this.#main.push(this.#createTarget(this.#renderWidth, this.#renderHeight));
    }
    for (let level = 0; level < 3; level += 1) {
      const width = Math.max(1, this.#renderWidth >> (level + 1));
      const height = Math.max(1, this.#renderHeight >> (level + 1));
      this.#blur.push(this.#createTarget(width, height));
      this.#blurTemp.push(this.#createTarget(width, height));
    }

    const noise = exomuxNoiseSet(random);
    for (const [name, texture] of Object.entries(noise)) {
      this.#noise.set(name, this.#uploadNoise(texture));
    }

    for (const address of ["clamp", "repeat"] as const) {
      for (const filter of ["linear", "nearest"] as const) {
        const mode: GPUAddressMode = address === "clamp" ? "clamp-to-edge" : "repeat";
        this.#samplers.set(
          `${address}:${filter}`,
          device.createSampler({
            addressModeU: mode,
            addressModeV: mode,
            addressModeW: mode,
            magFilter: filter,
            minFilter: filter,
          }),
        );
      }
    }

    this.#uniform = device.createBuffer({
      size: this.#uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.#utility = device.createShaderModule({ code: UTILITY_WGSL });
    this.#utilityLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const utilityPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.#utilityLayout] });
    this.#blurPipeline = device.createRenderPipeline({
      layout: utilityPipelineLayout,
      vertex: { module: this.#utility, entryPoint: "vs" },
      fragment: { module: this.#utility, entryPoint: "blur", targets: [{ format: MAIN_FORMAT }] },
    });
    this.#resolvePipeline = device.createRenderPipeline({
      layout: utilityPipelineLayout,
      vertex: { module: this.#utility, entryPoint: "vs" },
      fragment: { module: this.#utility, entryPoint: "resolve", targets: [{ format: "rgba8unorm" }] },
    });

    this.#resolveTexture = this.#createResolveTarget();
    this.#readbackBytesPerRow = alignBytesPerRow(this.#width * 4);
    this.#readback = this.#createReadback();
    device.lost.then((info) => {
      this.#lost = true;
      exomuxDebugLog("gpu-renderer", `device lost — falling back to CPU: ${info?.reason ?? "unknown"}`);
    }).catch(() => {
      this.#lost = true;
    });
  }

  /** Latest resolved frame, RGBA per cell, row-major. Undefined before the first. */
  get latest(): Uint8Array | undefined {
    return this.#latest;
  }

  /** Frames that have made it back from the GPU; a stalled count means trouble. */
  get readbacks(): number {
    return this.#readbacks;
  }

  /** True once the device is gone and this renderer can no longer produce frames. */
  get lost(): boolean {
    return this.#lost;
  }

  /** Presets whose compiled pipelines are currently held. Bounded; see the cache. */
  get cachedPresets(): number {
    return this.#pipelines.size;
  }

  setSize(width: number, height: number): void {
    const nextWidth = Math.max(1, width);
    const nextHeight = Math.max(1, height);
    if (nextWidth === this.#width && nextHeight === this.#height) return;
    this.#width = nextWidth;
    this.#height = nextHeight;
    const [renderWidth, renderHeight] = renderSizeFor(nextWidth, nextHeight);
    if (renderWidth !== this.#renderWidth || renderHeight !== this.#renderHeight) {
      this.#renderWidth = renderWidth;
      this.#renderHeight = renderHeight;
      for (let index = 0; index < this.#main.length; index += 1) {
        this.#main[index]!.destroy();
        this.#main[index] = this.#createTarget(renderWidth, renderHeight);
      }
      for (let level = 0; level < this.#blur.length; level += 1) {
        const width = Math.max(1, renderWidth >> (level + 1));
        const height = Math.max(1, renderHeight >> (level + 1));
        this.#blur[level]!.destroy();
        this.#blurTemp[level]!.destroy();
        this.#blur[level] = this.#createTarget(width, height);
        this.#blurTemp[level] = this.#createTarget(width, height);
      }
      this.#compositeTexture?.destroy();
      this.#compositeTexture = undefined;
    }
    this.#resolveTexture.destroy();
    this.#resolveTexture = this.#createResolveTarget();
    this.#readback.destroy();
    this.#readbackBytesPerRow = alignBytesPerRow(this.#width * 4);
    this.#readback = this.#createReadback();
    this.#bindGroups.clear();
    this.#utilityGroups.clear();
    this.#latest = undefined;
  }

  /**
   * Builds a preset's pipelines, off the main thread.
   *
   * `createRenderPipeline` is synchronous and compiles a shader, which for a
   * MilkDrop composite shader can block for long enough to stall the desktop —
   * a visible lock-up on every preset change. The async form lets the driver
   * compile in the background while the software renderer carries the frame.
   *
   * A failure is remembered so a preset that cannot compile is not retried
   * every frame; the caller renders it on the CPU instead.
   */
  prepare(shaders: ExomuxButterchurnGpuShaders): "ready" | "pending" | "failed" {
    const name = shaders.name;
    if (this.#failed.has(name)) return "failed";
    const cached = this.#pipelines.get(name);
    if (cached) {
      // Re-inserting moves it to the end, which is what makes the map an LRU.
      this.#pipelines.delete(name);
      this.#pipelines.set(name, cached);
      return "ready";
    }
    if (this.#compiling.has(name)) return "pending";
    this.#compiling.add(name);
    this.#compileAsync(shaders)
      .then((pipelines) => {
        this.#pipelines.set(name, pipelines);
        this.#evict();
        exomuxDebugLog("gpu-compile", `compiled "${name}" (${this.#pipelines.size} cached)`);
      })
      .catch((error) => {
        // Either the GLSL used something unsupported, the generated WGSL was
        // rejected, or the device is gone; all mean the CPU path for this one.
        this.#failed.add(name);
        exomuxDebugLog(
          "gpu-compile",
          `failed "${name}" → CPU: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        this.#compiling.delete(name);
      });
    return "pending";
  }

  /** Drops the least recently used presets once the cache is over its bound. */
  #evict(): void {
    while (this.#pipelines.size > MAX_CACHED_PRESETS) {
      const oldest = this.#pipelines.keys().next().value;
      if (oldest === undefined) return;
      this.#pipelines.delete(oldest);
      // The groups point at that preset's pipelines; keeping them would defeat
      // the eviction and leave them pointing at layouts nothing else uses.
      this.#bindGroups.delete(oldest);
    }
  }

  /** Renders one frame and queues the resolved result for readback. */
  render(name: string, frame: ExomuxButterchurnGpuFrame): boolean {
    if (this.#lost) return false;
    const pipelines = this.#pipelines.get(name);
    if (!pipelines) return false;
    const device = this.#device;

    this.#writeUniforms(frame);
    this.#writeMesh(frame);
    this.#writeWave(frame);

    const encoder = device.createCommandEncoder();
    const source = this.#main[this.#mainIndex]!;
    const target = this.#main[1 - this.#mainIndex]!;

    // 1. Warp: the previous frame resampled through the mesh and warp shader.
    const warpPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.#view(target),
        loadOp: "clear",
        storeOp: "store",
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    });
    warpPass.setPipeline(pipelines.warp);
    warpPass.setBindGroup(
      0,
      this.#presetBindGroup(name, `warp:${this.#mainIndex}`, pipelines.warpSamplers, source),
    );
    warpPass.setVertexBuffer(0, this.#meshBuffer!);
    warpPass.draw(this.#meshVertices);
    warpPass.end();

    // 2. Blur chain, each level fed by the one above it. MilkDrop computes the
    //    blur textures from the WARP OUTPUT, before motion vectors, shapes, and
    //    waves are drawn — so a high-pass warp (`blur1 - main`) subtracts last
    //    frame's shapes at full weight (blur1 lacks them, main has them)
    //    instead of only their high-frequency residue. Goody-class echo
    //    amplifiers depend on that full-weight injection (rectified by the
    //    UNORM store) to reach saturation; blurring after the shapes made the
    //    echo self-cancel in the loop and the picture starve.
    let blurSource = target;
    for (let level = 0; level < 3; level += 1) {
      this.#blurLevel(encoder, blurSource, level);
      blurSource = this.#blur[level]!;
    }

    // 3. Custom shapes and waves — MilkDrop draws them onto the warped frame,
    //    shapes under waves, all before the basic waveform.
    const prims = frame.prims ?? [];
    if (prims.length > 0) this.#drawPrims(encoder, target, source, prims);

    // 4. Basic waveform, drawn straight onto the warped frame.
    if (frame.waveCount > 1) {
      const wavePass = encoder.beginRenderPass({
        colorAttachments: [{ view: this.#view(target), loadOp: "load", storeOp: "store" }],
      });
      wavePass.setPipeline(this.#wavePipeline());
      // The wave shader samples nothing — it draws colored vertices straight
      // from the vertex buffer — so it has no bind group. Binding an empty group
      // 0 anyway is what an "auto" layout with no bindings does not have: strict
      // drivers (Intel/Mesa) reject "group index 0", poison the command buffer,
      // and the whole frame renders black. So bind nothing.
      wavePass.setVertexBuffer(0, this.#waveBuffer!);
      // Two vertices per waveform point make up the ribbon strip.
      wavePass.draw(frame.waveCount * 2);
      wavePass.end();
    }

    // 5. Composite through the preset's own shader.
    const compPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.#view(this.#resolveIntermediate()),
        loadOp: "clear",
        storeOp: "store",
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    });
    compPass.setPipeline(pipelines.comp);
    compPass.setBindGroup(
      0,
      this.#presetBindGroup(name, `comp:${1 - this.#mainIndex}`, pipelines.compSamplers, target),
    );
    compPass.draw(3);
    compPass.end();

    // 6. Resolve to the cell grid, and copy out when the buffer is free. A
    //    copy into a buffer that is still mapped is a validation error, so a
    //    frame is simply skipped while the previous readback is in flight.
    this.#resolveToCells(encoder, !this.#mapping);
    device.queue.submit([encoder.finish()]);

    this.#mainIndex = 1 - this.#mainIndex;
    if (!this.#mapping) this.#requestReadback();
    return true;
  }

  /**
   * Dev probe (033): reads the current feedback texture back and summarizes
   * its channel distribution — the evidence channel for the echo-amplifier
   * class, whose loop luminance cannot be inferred from resolved cells.
   * Not called by the runtime; scripts/probe_butterchurn_readback.ts drives it.
   */
  async debugMainStats(): Promise<
    { mean: number; min: number; max: number; negativeShare: number; aboveTenth: number } | undefined
  > {
    if (this.#lost) return undefined;
    return await this.#debugTextureStats(this.#main[this.#mainIndex]!);
  }

  /**
   * Dev probe (033): same channel summary for the comp shader's output —
   * distinguishes "the loop is too dim" (comp input starved) from "the comp
   * translation loses the picture" (loop healthy, output dark anyway).
   */
  async debugCompStats(): Promise<
    { mean: number; min: number; max: number; negativeShare: number; aboveTenth: number } | undefined
  > {
    if (this.#lost || !this.#compositeTexture) return undefined;
    return await this.#debugTextureStats(this.#compositeTexture);
  }

  async #debugTextureStats(texture: GPUTexture): Promise<
    { mean: number; min: number; max: number; negativeShare: number; aboveTenth: number } | undefined
  > {
    const bytesPerRow = alignBytesPerRow(this.#renderWidth * 4);
    const buffer = this.#device.createBuffer({
      size: bytesPerRow * this.#renderHeight,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    try {
      const encoder = this.#device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture },
        { buffer, bytesPerRow },
        [this.#renderWidth, this.#renderHeight],
      );
      this.#device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      const words = new Uint8Array(buffer.getMappedRange());
      let sum = 0;
      let min = Infinity;
      let max = -Infinity;
      let negatives = 0;
      let aboveTenth = 0;
      let count = 0;
      for (let row = 0; row < this.#renderHeight; row += 1) {
        const base = row * bytesPerRow;
        for (let column = 0; column < this.#renderWidth; column += 1) {
          for (let channel = 0; channel < 3; channel += 1) {
            const value = words[base + column * 4 + channel]! / 255;
            if (!Number.isFinite(value)) continue;
            sum += value;
            if (value < min) min = value;
            if (value > max) max = value;
            if (value < 0) negatives += 1;
            if (value > 0.1) aboveTenth += 1;
            count += 1;
          }
        }
      }
      buffer.unmap();
      return count === 0 ? undefined : {
        mean: sum / count,
        min,
        max,
        negativeShare: negatives / count,
        aboveTenth: aboveTenth / count,
      };
    } catch {
      return undefined;
    } finally {
      buffer.destroy();
    }
  }

  destroy(): void {
    for (const texture of [...this.#main, ...this.#blur, ...this.#blurTemp, ...this.#noise.values()]) {
      texture.destroy();
    }
    this.#resolveTexture.destroy();
    this.#compositeTexture?.destroy();
    this.#readback.destroy();
    this.#uniform.destroy();
    this.#meshBuffer?.destroy();
    this.#waveBuffer?.destroy();
    this.#primBuffer?.destroy();
    for (const buffer of this.#directionBuffers) buffer.destroy();
  }

  // ── resources ─────────────────────────────────────────────────────────────

  /** A cached view of one texture; the cache is keyed by view dimension. */
  #view(texture: GPUTexture, dimension: GPUTextureViewDimension = "2d"): GPUTextureView {
    let byDimension = this.#views.get(texture);
    if (!byDimension) {
      byDimension = new Map();
      this.#views.set(texture, byDimension);
    }
    let view = byDimension.get(dimension);
    if (!view) {
      view = texture.createView({ dimension });
      byDimension.set(dimension, view);
    }
    return view;
  }

  #createTarget(width: number, height: number): GPUTexture {
    return this.#device.createTexture({
      size: [width, height],
      format: MAIN_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });
  }

  #createResolveTarget(): GPUTexture {
    return this.#device.createTexture({
      size: [this.#width, this.#height],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  #createReadback(): GPUBuffer {
    return this.#device.createBuffer({
      size: this.#readbackBytesPerRow * this.#height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }

  #compositeTexture: GPUTexture | undefined;

  /** Full-resolution target the composite pass writes before downsampling. */
  #resolveIntermediate(): GPUTexture {
    this.#compositeTexture ??= this.#createTarget(this.#renderWidth, this.#renderHeight);
    return this.#compositeTexture;
  }

  #uploadNoise(texture: ExomuxNoiseTexture): GPUTexture {
    const is3d = texture.depth > 1;
    const gpu = this.#device.createTexture({
      dimension: is3d ? "3d" : "2d",
      size: [texture.size, texture.size, texture.depth],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.#device.queue.writeTexture(
      { texture: gpu },
      // Some Deno releases type this parameter as strictly ArrayBuffer-backed,
      // which the field's plain Uint8Array annotation cannot prove. slice()
      // re-establishes the backing in every TS lib variant, at a one-time copy
      // of a noise texture during upload.
      texture.data.slice(),
      { bytesPerRow: texture.size * 4, rowsPerImage: texture.size },
      [texture.size, texture.size, texture.depth],
    );
    return gpu;
  }

  #textureFor(name: string, main: GPUTexture): GPUTexture {
    const binding = SAMPLER_BINDINGS[name]!;
    switch (binding.texture) {
      case "main":
        return main;
      case "blur1":
        return this.#blur[0]!;
      case "blur2":
        return this.#blur[1]!;
      case "blur3":
        return this.#blur[2]!;
      default:
        return this.#noise.get(binding.texture)!;
    }
  }

  /**
   * Bind group layout for one sampler list, shared by the pipeline and the
   * groups bound to it.
   *
   * Declared rather than taken from `layout: "auto"`, which derives the layout
   * from the bindings the entry point is seen to use and prunes the rest. A
   * preset that declares a sampler it does not reach — behind a branch, or in
   * an expression the optimiser dropped — then got a layout with fewer entries
   * than the graph binds, and every draw for that preset failed validation for
   * the rest of the session, because the invalid group is cached.
   */
  #presetLayout(samplers: readonly string[]): GPUBindGroupLayout {
    const key = samplers.join(",");
    const cached = this.#presetLayouts.get(key);
    if (cached) return cached;
    const entries: GPUBindGroupLayoutEntry[] = [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
    ];
    samplers.forEach((name, index) => {
      entries.push({
        binding: index * 2 + 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float", viewDimension: SAMPLER_BINDINGS[name]!.dimension },
      });
      entries.push({
        binding: index * 2 + 2,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: "filtering" },
      });
    });
    const layout = this.#device.createBindGroupLayout({ entries });
    this.#presetLayouts.set(key, layout);
    return layout;
  }

  /**
   * Wraps createBindGroup in a validation error scope while debug logging is on,
   * so a device that rejects a group — as some hardware drivers do where a
   * software renderer accepts it — reports exactly why, instead of a bare
   * "BindGroup is invalid" surfacing later at set_bind_group. Groups are cached,
   * so each logs at most once.
   */
  #createBindGroupChecked(label: string, descriptor: GPUBindGroupDescriptor): GPUBindGroup {
    if (!exomuxDebugLoggingActive()) return this.#device.createBindGroup(descriptor);
    this.#device.pushErrorScope("validation");
    const group = this.#device.createBindGroup(descriptor);
    this.#device.popErrorScope().then((error) => {
      if (error) exomuxDebugLog("gpu-bindgroup", `${label}: ${error.message}`);
    }).catch(() => {});
    return group;
  }

  #presetBindGroup(
    preset: string,
    key: string,
    samplers: readonly string[],
    main: GPUTexture,
  ): GPUBindGroup {
    let groups = this.#bindGroups.get(preset);
    if (!groups) {
      groups = new Map();
      this.#bindGroups.set(preset, groups);
    }
    const cached = groups.get(key);
    if (cached) return cached;
    const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer: this.#uniform } }];
    samplers.forEach((name, index) => {
      const binding = SAMPLER_BINDINGS[name]!;
      entries.push({
        binding: index * 2 + 1,
        resource: this.#view(this.#textureFor(name, main), binding.dimension),
      });
      entries.push({
        binding: index * 2 + 2,
        resource: this.#samplers.get(`${binding.address}:${binding.filter}`)!,
      });
    });
    const group = this.#createBindGroupChecked(
      `preset "${preset}" ${key} [${samplers.join("+")}]`,
      { layout: this.#presetLayout(samplers), entries },
    );
    groups.set(key, group);
    return group;
  }

  // ── passes ────────────────────────────────────────────────────────────────

  #directionBuffer(index: number, values: readonly number[]): GPUBuffer {
    let buffer = this.#directionBuffers[index];
    if (!buffer) {
      buffer = this.#device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.#directionBuffers[index] = buffer;
    }
    for (let index = 0; index < 8; index += 1) this.#directionData[index] = values[index] ?? 0;
    this.#device.queue.writeBuffer(buffer, 0, this.#directionData);
    return buffer;
  }

  /** Cached bind group for the blur and resolve passes. */
  #utilityBindGroup(key: string, input: GPUTexture, sampler: GPUSampler, buffer: GPUBuffer): GPUBindGroup {
    const cached = this.#utilityGroups.get(key);
    if (cached) return cached;
    const group = this.#createBindGroupChecked(`utility ${key}`, {
      layout: this.#utilityLayout,
      entries: [
        { binding: 0, resource: this.#view(input) },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer } },
      ],
    });
    this.#utilityGroups.set(key, group);
    return group;
  }

  #blurLevel(encoder: GPUCommandEncoder, source: GPUTexture, level: number): void {
    const target = this.#blur[level]!;
    const temp = this.#blurTemp[level]!;
    const width = target.width;
    const height = target.height;
    const sampler = this.#samplers.get("clamp:linear")!;

    for (
      const [pass, output, input, direction] of [
        [0, temp, source, [1 / width, 0]],
        [1, target, temp, [0, 1 / height]],
      ] as const
    ) {
      const buffer = this.#directionBuffer(
        level * 2 + pass,
        [
          direction[0]!,
          direction[1]!,
          1 / width,
          1 / height,
          this.#blurRanges.min[level] ?? 0,
          this.#blurRanges.max[level] ?? 1,
        ],
      );
      const bindGroup = this.#utilityBindGroup(`blur:${level}:${pass}:${this.#mainIndex}`, input, sampler, buffer);
      const renderPass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.#view(output),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }],
      });
      renderPass.setPipeline(this.#blurPipeline);
      renderPass.setBindGroup(0, bindGroup);
      renderPass.draw(3);
      renderPass.end();
    }
  }

  #resolveToCells(encoder: GPUCommandEncoder, copyOut: boolean): void {
    // xy is the source footprint one output cell covers; zw the output texel.
    const buffer = this.#directionBuffer(6, [
      1 / this.#width,
      1 / this.#height,
      1 / this.#width,
      1 / this.#height,
      0,
      1,
    ]);
    const bindGroup = this.#utilityBindGroup(
      "resolve",
      this.#resolveIntermediate(),
      this.#samplers.get("clamp:linear")!,
      buffer,
    );
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.#view(this.#resolveTexture),
        loadOp: "clear",
        storeOp: "store",
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    });
    pass.setPipeline(this.#resolvePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    if (!copyOut) return;
    encoder.copyTextureToBuffer(
      { texture: this.#resolveTexture },
      { buffer: this.#readback, bytesPerRow: this.#readbackBytesPerRow, rowsPerImage: this.#height },
      [this.#width, this.#height],
    );
  }

  /** Maps the readback buffer without blocking; the frame lands next tick. */
  #requestReadback(): void {
    if (this.#mapping) return;
    this.#mapping = true;
    const width = this.#width;
    const height = this.#height;
    const stride = this.#readbackBytesPerRow;
    const buffer = this.#readback;
    buffer.mapAsync(GPUMapMode.READ)
      .then(() => {
        const view = new Uint8Array(buffer.getMappedRange());
        const out = new Uint8Array(width * height * 4);
        for (let row = 0; row < height; row += 1) {
          out.set(view.subarray(row * stride, row * stride + width * 4), row * width * 4);
        }
        buffer.unmap();
        this.#latest = out;
        this.#readbacks += 1;
      })
      .catch(() => {
        // A destroyed buffer or a lost device; the caller falls back.
      })
      .finally(() => {
        this.#mapping = false;
      });
  }

  // ── uniforms and geometry ─────────────────────────────────────────────────

  #writeUniforms(frame: ExomuxButterchurnGpuFrame): void {
    const data = this.#uniformData;
    const put = (slot: number, x: number, y = 0, z = 0, w = 0): void => {
      data[slot * 4] = x;
      data[slot * 4 + 1] = y;
      data[slot * 4 + 2] = z;
      data[slot * 4 + 3] = w;
    };
    put(UNIFORM_SLOTS.scalars0, frame.time, frame.fps, frame.frame, frame.decay);
    put(UNIFORM_SLOTS.scalars1, frame.bass, frame.mid, frame.treb, (frame.bass + frame.mid + frame.treb) / 3);
    put(
      UNIFORM_SLOTS.scalars2,
      frame.bassAttack,
      frame.midAttack,
      frame.trebleAttack,
      (frame.bassAttack + frame.midAttack + frame.trebleAttack) / 3,
    );
    put(UNIFORM_SLOTS.resolution, this.#renderWidth, this.#renderHeight);
    put(UNIFORM_SLOTS.aspect, 1 / frame.aspectX, 1 / frame.aspectY, frame.aspectX, frame.aspectY);
    put(UNIFORM_SLOTS.texsize, this.#renderWidth, this.#renderHeight, 1 / this.#renderWidth, 1 / this.#renderHeight);
    for (
      const [slot, size] of [
        [UNIFORM_SLOTS.texsizeNoiseLq, 256],
        [UNIFORM_SLOTS.texsizeNoiseMq, 256],
        [UNIFORM_SLOTS.texsizeNoiseHq, 256],
        [UNIFORM_SLOTS.texsizeNoiseLqLite, 32],
        [UNIFORM_SLOTS.texsizeNoisevolLq, 32],
        [UNIFORM_SLOTS.texsizeNoisevolHq, 32],
      ] as const
    ) {
      put(slot, size, size, 1 / size, 1 / size);
    }
    const q = frame.q;
    for (let group = 0; group < 8; group += 1) {
      put(
        UNIFORM_SLOTS.qa + group,
        q[group * 4] ?? 0,
        q[group * 4 + 1] ?? 0,
        q[group * 4 + 2] ?? 0,
        q[group * 4 + 3] ?? 0,
      );
    }
    // MilkDrop's "roam" oscillators, which presets use for slow drift.
    const t = frame.time;
    put(UNIFORM_SLOTS.roamCos, Math.cos(0.3 * t), Math.cos(0.4 * t), Math.cos(0.5 * t), Math.cos(0.6 * t));
    put(UNIFORM_SLOTS.roamSin, Math.sin(0.3 * t), Math.sin(0.4 * t), Math.sin(0.5 * t), Math.sin(0.6 * t));
    put(
      UNIFORM_SLOTS.slowRoamCos,
      Math.cos(0.005 * t),
      Math.cos(0.008 * t),
      Math.cos(0.013 * t),
      Math.cos(0.022 * t),
    );
    put(
      UNIFORM_SLOTS.slowRoamSin,
      Math.sin(0.005 * t),
      Math.sin(0.008 * t),
      Math.sin(0.013 * t),
      Math.sin(0.022 * t),
    );
    const ranges = exomuxSafeBlurRanges(frame.blurMin ?? [0, 0, 0], frame.blurMax ?? [1, 1, 1]);
    this.#blurRanges = ranges;
    put(UNIFORM_SLOTS.blurMin, ranges.min[0], ranges.min[1], ranges.min[2]);
    put(UNIFORM_SLOTS.blurMax, ranges.max[0], ranges.max[1], ranges.max[2]);
    // Real butterchurn stores blur range-compressed and reconstructs with
    // scale = max - min, bias = min. Our store is unnormalized (only clamped
    // to the authored bounds in the blur pass), so reconstruction stays the
    // identity: scale 1, bias 0.
    put(UNIFORM_SLOTS.scales, 1, 1, 1);
    put(UNIFORM_SLOTS.biases, 0, 0, 0);
    // Deterministic per-frame randomness; presets use it to jitter sampling.
    const seed = frame.frame * 0.0137;
    put(
      UNIFORM_SLOTS.randFrame,
      fractional(Math.sin(seed) * 43758.5453),
      fractional(Math.sin(seed + 1.1) * 22578.145),
      fractional(Math.sin(seed + 2.3) * 19642.317),
      fractional(Math.sin(seed + 3.7) * 31415.926),
    );
    put(UNIFORM_SLOTS.randPreset, 0.31, 0.57, 0.73, 0.19);
    put(UNIFORM_SLOTS.hueShader, 1, 1, 1);
    this.#device.queue.writeBuffer(this.#uniform, 0, data);
  }

  /**
   * Uploads the warp mesh as a triangle list.
   *
   * MilkDrop draws the mesh as a grid of quads whose corner UVs come from
   * `pixel_eqs`; the GPU interpolates between them, which is the whole reason
   * the mesh can be so much coarser than the render target.
   */
  #writeMesh(frame: ExomuxButterchurnGpuFrame): void {
    const gridX = frame.meshWidth;
    const gridY = frame.meshHeight;
    const vertices = gridX * gridY * 6;
    const stride = 8; // x, y, u, v, r, g, b, a
    if (this.#meshData.length < vertices * stride) this.#meshData = new Float32Array(vertices * stride);
    const data = this.#meshData;
    let offset = 0;
    const emit = (ix: number, iy: number): void => {
      const meshOffset = (iy * (gridX + 1) + ix) * 2;
      data[offset] = (ix / gridX) * 2 - 1;
      data[offset + 1] = 1 - (iy / gridY) * 2;
      data[offset + 2] = frame.mesh[meshOffset]!;
      data[offset + 3] = frame.mesh[meshOffset + 1]!;
      data[offset + 4] = 1;
      data[offset + 5] = 1;
      data[offset + 6] = 1;
      data[offset + 7] = 1;
      offset += stride;
    };
    for (let iy = 0; iy < gridY; iy += 1) {
      for (let ix = 0; ix < gridX; ix += 1) {
        emit(ix, iy);
        emit(ix + 1, iy);
        emit(ix, iy + 1);
        emit(ix + 1, iy);
        emit(ix + 1, iy + 1);
        emit(ix, iy + 1);
      }
    }
    const meshBytes = vertices * stride * 4;
    if (!this.#meshBuffer || this.#meshBuffer.size < meshBytes) {
      this.#meshBuffer?.destroy();
      this.#meshBuffer = this.#device.createBuffer({
        size: meshBytes,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    this.#device.queue.writeBuffer(this.#meshBuffer, 0, data, 0, vertices * stride);
    this.#meshVertices = vertices;
  }

  #writeWave(frame: ExomuxButterchurnGpuFrame): void {
    const count = Math.max(2, frame.waveCount);
    // Two vertices per waveform point — the ribbon's upper and lower edge — so
    // the trace draws as a triangle strip a little over a cell tall instead of a
    // one-pixel line the resolve filter would erase. See WAVE_RIBBON_CELLS.
    const verts = count * 2;
    if (this.#waveData.length < verts * 8) this.#waveData = new Float32Array(verts * 8);
    const data = this.#waveData;
    // Half the ribbon height, in clip space. The clip range spans the grid's
    // #height rows over two units, so one row is 2/#height; offset each edge by
    // half the target ribbon height about the point.
    const halfHeight = WAVE_RIBBON_CELLS / Math.max(1, this.#height);
    for (let index = 0; index < count; index += 1) {
      const x = frame.wave[index * 2] ?? 0;
      const y = frame.wave[index * 2 + 1] ?? 0;
      for (let edge = 0; edge < 2; edge += 1) {
        const at = (index * 2 + edge) * 8;
        data[at] = x;
        data[at + 1] = y + (edge === 0 ? halfHeight : -halfHeight);
        data[at + 2] = 0;
        data[at + 3] = 0;
        data[at + 4] = frame.waveColor[0];
        data[at + 5] = frame.waveColor[1];
        data[at + 6] = frame.waveColor[2];
        data[at + 7] = frame.waveColor[3];
      }
    }
    const waveBytes = verts * 8 * 4;
    if (!this.#waveBuffer || this.#waveBuffer.size < waveBytes) {
      this.#waveBuffer?.destroy();
      this.#waveBuffer = this.#device.createBuffer({
        size: waveBytes,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    this.#device.queue.writeBuffer(this.#waveBuffer, 0, data, 0, verts * 8);
  }

  #wavePipelineCache: GPURenderPipeline | undefined;

  #wavePipeline(): GPURenderPipeline {
    if (this.#wavePipelineCache) return this.#wavePipelineCache;
    const module = this.#device.createShaderModule({
      code: `
struct WaveOut { @builtin(position) position: vec4<f32>, @location(0) color: vec4<f32> };
@vertex fn vs(@location(0) pos: vec2<f32>, @location(1) unused: vec2<f32>, @location(2) color: vec4<f32>) -> WaveOut {
  var out: WaveOut;
  _ = unused;
  out.position = vec4<f32>(pos, 0.0, 1.0);
  out.color = color;
  return out;
}
@fragment fn fs(input: WaveOut) -> @location(0) vec4<f32> { return input.color; }
`,
    });
    this.#wavePipelineCache = this.#device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs", buffers: [MESH_LAYOUT] },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [{
          format: MAIN_FORMAT,
          // Additive, matching how MilkDrop lays the waveform over the frame.
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" },
          },
        }],
      },
      // A ribbon: consecutive edge-vertex pairs (top, bottom) form the strip.
      primitive: { topology: "triangle-strip" },
    });
    return this.#wavePipelineCache;
  }

  /** Shader for custom waves and shapes: vertex colour, optionally textured. */
  #primShader(): GPUShaderModule {
    this.#primModule ??= this.#device.createShaderModule({
      code: `
struct PrimOut { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32>, @location(1) color: vec4<f32> };
@group(0) @binding(0) var prim_tex: texture_2d<f32>;
@group(0) @binding(1) var prim_smp: sampler;
@vertex fn vs(@location(0) pos: vec2<f32>, @location(1) uv: vec2<f32>, @location(2) color: vec4<f32>) -> PrimOut {
  var out: PrimOut;
  out.position = vec4<f32>(pos, 0.0, 1.0);
  out.uv = uv;
  out.color = color;
  return out;
}
@fragment fn fs(input: PrimOut) -> @location(0) vec4<f32> { return input.color; }
@fragment fn fsTextured(input: PrimOut) -> @location(0) vec4<f32> {
  return textureSampleLevel(prim_tex, prim_smp, input.uv, 0.0) * input.color;
}
`,
    });
    return this.#primModule;
  }

  #ensurePrimLayout(): GPUBindGroupLayout {
    const existing = this.#primLayout;
    if (existing) return existing;
    const layout = this.#device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    this.#primLayout = layout;
    return layout;
  }

  #primPipeline(topology: GPUPrimitiveTopology, additive: boolean, textured: boolean): GPURenderPipeline {
    const key = `${topology}:${additive ? "add" : "mix"}:${textured ? "tex" : "flat"}`;
    const cached = this.#primPipelines.get(key);
    if (cached) return cached;
    const layout = this.#ensurePrimLayout();
    const module = this.#primShader();
    const pipeline = this.#device.createRenderPipeline({
      layout: this.#device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: { module, entryPoint: "vs", buffers: [MESH_LAYOUT] },
      fragment: {
        module,
        entryPoint: textured ? "fsTextured" : "fs",
        targets: [{
          format: MAIN_FORMAT,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: additive ? "one" : "one-minus-src-alpha",
              operation: "add",
            },
            alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" },
          },
        }],
      },
      primitive: { topology },
    });
    this.#primPipelines.set(key, pipeline);
    return pipeline;
  }

  /** Bind group for the prim passes; the texture slot ping-pongs, so two live. */
  #primBindGroup(source: GPUTexture): GPUBindGroup {
    const cached = this.#primBindGroups.get(source);
    if (cached) return cached;
    const group = this.#createBindGroupChecked("prim", {
      layout: this.#ensurePrimLayout(),
      entries: [
        { binding: 0, resource: this.#view(source) },
        { binding: 1, resource: this.#samplers.get("clamp:linear")! },
      ],
    });
    this.#primBindGroups.set(source, group);
    return group;
  }

  /** Draws this frame's custom shapes and waves onto the warped frame. */
  #drawPrims(
    encoder: GPUCommandEncoder,
    target: GPUTexture,
    source: GPUTexture,
    prims: readonly ExomuxButterchurnPrim[],
  ): void {
    let total = 0;
    for (const prim of prims) total += prim.vertexCount;
    if (total === 0) return;
    const floats = total * 8;
    if (this.#primData.length < floats) this.#primData = new Float32Array(floats);
    let cursor = 0;
    for (const prim of prims) {
      this.#primData.set(prim.vertices.subarray(0, prim.vertexCount * 8), cursor);
      cursor += prim.vertexCount * 8;
    }
    const bytes = floats * 4;
    if (!this.#primBuffer || this.#primBuffer.size < bytes) {
      this.#primBuffer?.destroy();
      this.#primBuffer = this.#device.createBuffer({
        size: Math.max(4096, bytes),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    this.#device.queue.writeBuffer(this.#primBuffer, 0, this.#primData, 0, floats);

    // Build pipelines and the bind group before the pass opens; both may
    // allocate, and a pass encoder must not be interleaved with that.
    const group = this.#primBindGroup(source);
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: this.#view(target), loadOp: "load", storeOp: "store" }],
    });
    pass.setBindGroup(0, group);
    pass.setVertexBuffer(0, this.#primBuffer);
    let first = 0;
    for (const prim of prims) {
      const topology: GPUPrimitiveTopology = prim.kind === "dots"
        ? "point-list"
        : prim.kind === "line"
        ? "line-strip"
        : "triangle-list";
      pass.setPipeline(this.#primPipeline(topology, prim.additive, prim.textured));
      pass.draw(prim.vertexCount, 1, first);
      first += prim.vertexCount;
    }
    pass.end();
  }

  // ── compilation ───────────────────────────────────────────────────────────

  async #compileAsync(shaders: ExomuxButterchurnGpuShaders): Promise<PresetPipelines> {
    const warp = await this.#compileStage(shaders.warp, shaders.warpSamplers, "warp");
    const comp = await this.#compileStage(shaders.comp, shaders.compSamplers, "comp");
    return {
      warp: warp.pipeline,
      warpSamplers: warp.samplers,
      comp: comp.pipeline,
      compSamplers: comp.samplers,
    };
  }

  async #compileStage(
    source: string,
    declared: readonly string[],
    stage: "warp" | "comp",
  ): Promise<{ pipeline: GPURenderPipeline; samplers: string[] }> {
    // A preset with no shader of its own — or one whose GLSL the build could
    // not translate — gets MilkDrop's default: the warped frame unchanged.
    // MilkDrop's default warp shader attenuates by `decay`; its default
    // composite does not. Leaving the decay off made the feedback loop of every
    // preset without a warp shader of its own lossless, so it could only ever
    // accumulate — which is what a preset blowing out to flat white looks like.
    const fallback = stage === "warp"
      ? "ret = textureSampleLevel(sampler_main_tex, sampler_main_smp, uv, 0.0).xyz * decay;"
      : "ret = textureSampleLevel(sampler_main_tex, sampler_main_smp, uv, 0.0).xyz;";
    const body = source.trim() ? source : fallback;
    const samplers = [...new Set([...(source.trim() ? declared : []), "sampler_main"])]
      .filter((name) => name in SAMPLER_BINDINGS);

    const vertex = stage === "warp" ? WARP_VERTEX : COMP_VERTEX;
    const module = this.#device.createShaderModule({ code: `${fragmentSource(body, samplers)}\n${vertex}` });
    if (exomuxDebugLoggingActive()) await this.#logShaderDiagnostics(module, stage);
    const pipeline = await this.#device.createRenderPipelineAsync({
      layout: this.#device.createPipelineLayout({ bindGroupLayouts: [this.#presetLayout(samplers)] }),
      vertex: stage === "warp" ? { module, entryPoint: "vs", buffers: [MESH_LAYOUT] } : { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format: MAIN_FORMAT }] },
      primitive: { topology: "triangle-list" },
    });
    return { pipeline, samplers };
  }

  /** Logs WGSL warnings/errors for a shader module when debug logging is on. */
  async #logShaderDiagnostics(module: GPUShaderModule, stage: "warp" | "comp"): Promise<void> {
    try {
      const info = await module.getCompilationInfo?.();
      for (const message of info?.messages ?? []) {
        if (message.type === "info") continue;
        exomuxDebugLog(
          "gpu-wgsl",
          `${stage} ${message.type} @${message.lineNum}:${message.linePos} ${message.message}`,
        );
      }
    } catch {
      // getCompilationInfo is unavailable or the module is gone — skip quietly.
    }
  }
}

/** Vertex layout shared by the warp mesh and the waveform. */
const MESH_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 32,
  attributes: [
    { shaderLocation: 0, offset: 0, format: "float32x2" },
    { shaderLocation: 1, offset: 8, format: "float32x2" },
    { shaderLocation: 2, offset: 16, format: "float32x4" },
  ],
};

/**
 * Render target size for a cell grid, keeping the render aspect the desktop's.
 * Terminal cells are about twice as tall as they are wide, so a grid of 88x22
 * covers the same shape as 88x44 pixels.
 */
function renderSizeFor(width: number, height: number): [number, number] {
  const ratio = (height * 2) / Math.max(1, width);
  const target = Math.round(RENDER_WIDTH * ratio / 8) * 8;
  return [RENDER_WIDTH, Math.min(MAX_RENDER_HEIGHT, Math.max(MIN_RENDER_HEIGHT, target))];
}

/**
 * Whether every allocation the renderer just made actually succeeded.
 *
 * WebGPU reports a refused allocation through the error scope and hands back a
 * texture object regardless; using it produces an invalid-texture error on
 * every pass, while readbacks keep completing, so the stall watchdog never
 * fires and the desktop sits black indefinitely. Asking is what turns that into
 * a clean fall back to the software renderer.
 *
 * This replaced a ladder that probed for the largest target the device would
 * give, from the largest size down. That was worse than useless: the ladder's
 * own first, deliberately oversized probe was itself an allocation failure, and
 * on an exhausted driver every subsequent request fails too — so the probe
 * reported a budget of zero on a device that could have rendered perfectly
 * well. Allocating what is actually wanted and checking once has no such
 * failure mode.
 *
 * A device without error scopes — the test stub — is taken at its word.
 */
async function allocationSucceeded(device: GPUDevice): Promise<boolean> {
  try {
    return !(await device.popErrorScope());
  } catch {
    return true;
  }
}

function fractional(value: number): number {
  return value - Math.floor(value);
}

/** WebGPU requires readback rows to be a multiple of 256 bytes. */
function alignBytesPerRow(bytes: number): number {
  return Math.ceil(bytes / 256) * 256;
}

/** All sampler names the shader template exposes. */
export const EXOMUX_BUTTERCHURN_SAMPLERS: readonly string[] = SAMPLERS;

/**
 * The device this renderer draws with.
 *
 * Shared process-wide: Deno allows one device per process, and the turbulence
 * background wants one too.
 */
export function requestExomuxGpuDevice(): Promise<GPUDevice | undefined> {
  return exomuxGpuDevice();
}
