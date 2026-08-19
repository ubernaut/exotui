// Copyright 2023 Im-Beast. MIT license.

import type { Rectangle } from "@ubernaut/exotui";
import {
  type ExomuxAnimatedBackground,
  type ExomuxBackgroundAdvanceOptions,
  type ExomuxBackgroundCell,
  type ExomuxBackgroundPoint,
  mixExomuxRgb,
} from "./background.ts";
import type { ExomuxRgb, ExomuxThemeSpec } from "./model.ts";
import { exomuxGpuDevice } from "./gpu_device.ts";

// ── constants ───────────────────────────────────────────────────────────────

const FRAME_BASELINE_MS = 16.7;
const MAX_FRAME_DELTA_MS = 48;
const POINTER_LIFETIME_MS = 1_500;

/** BGK relaxation parameter. Higher → lower viscosity → more turbulence. */
const OMEGA = 1.85;
/** Lattice velocity of the top inflow (downward). */
const INFLOW_VELOCITY = 0.055;
/** Amplitude of the sinusoidal perturbation on the inflow. */
const INFLOW_PERTURBATION = 0.012;
/** LBM sub-steps per animation frame for faster visual flow. */
const LBM_STEPS_PER_FRAME = 4;
/** Velocity injected at the pointer location. */
const POINTER_FORCE = 0.08;
/**
 * Per-step velocity damping. Dissipates kinetic energy so the flow doesn't
 * build up indefinitely. 0.995^4 ≈ 0.980 per frame → vorticity from the
 * inflow fades to ~16% by the time it exits the bottom of the screen.
 */
const VELOCITY_DAMPING = 0.995;

// ── D2Q9 lattice ────────────────────────────────────────────────────────────

//  6 2 5
//   \|/
//  3-0-1
//   /|\
//  7 4 8

const Q = 9;
const EX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
const EY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const WT = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];

// ── rendering ───────────────────────────────────────────────────────────────

/** Intensity characters indexed by vorticity magnitude bucket. */
const VORT_CHARS: readonly string[] = [" ", ".", ",", ";", ":", "~", "=", "#"];
/** Directional characters for visible flow. Index by octant. */
const DIR_CHARS: readonly string[] = ["-", "/", "|", "\\", "-", "/", "|", "\\"];

// ── WGSL shader ─────────────────────────────────────────────────────────────

const WGSL_LBM = `
struct Params {
  width: u32,
  height: u32,
  omega: f32,
  inflow_vy: f32,
  perturbation: f32,
  frame: u32,
  damping: f32,
  _pad: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> fIn: array<f32>;
@group(0) @binding(2) var<storage, read_write> fOut: array<f32>;
@group(0) @binding(3) var<storage, read> obs: array<u32>;
@group(0) @binding(4) var<storage, read_write> macro_out: array<f32>;

const ex = array<i32, 9>(0, 1, 0, -1, 0, 1, -1, -1, 1);
const ey = array<i32, 9>(0, 0, 1, 0, -1, 1, 1, -1, -1);
const wt = array<f32, 9>(0.44444444, 0.11111111, 0.11111111, 0.11111111, 0.11111111,
                          0.02777778, 0.02777778, 0.02777778, 0.02777778);
const opp = array<u32, 9>(0u, 3u, 4u, 1u, 2u, 7u, 8u, 5u, 6u);

fn feq(rho: f32, ux: f32, uy: f32, i: u32) -> f32 {
  let eu = f32(ex[i]) * ux + f32(ey[i]) * uy;
  let usq = ux * ux + uy * uy;
  return wt[i] * rho * (1.0 + 3.0 * eu + 4.5 * eu * eu - 1.5 * usq);
}

fn hash(seed: u32) -> f32 {
  var h = seed;
  h = h ^ (h >> 16u);
  h = h * 0x45d9f3bu;
  h = h ^ (h >> 16u);
  return f32(h & 0xFFFFu) / 65536.0 - 0.5;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  if (x >= params.width || y >= params.height) { return; }
  let W = params.width;
  let idx = y * W + x;
  let base = idx * 9u;

  // Pull streaming: gather distributions from source cells.
  var f: array<f32, 9>;
  for (var i = 0u; i < 9u; i = i + 1u) {
    let sx = i32(x) - ex[i];
    let sy = i32(y) - ey[i];
    if (sx >= 0 && sx < i32(W) && sy >= 0 && sy < i32(params.height)) {
      f[i] = fIn[u32(sy) * W * 9u + u32(sx) * 9u + i];
    } else if (sy < 0) {
      // Top boundary: inflow with perturbation.
      let pert = params.perturbation * hash(x + params.frame * 131u);
      f[i] = feq(1.0, pert, params.inflow_vy, i);
    } else {
      f[i] = fIn[base + i];
    }
  }

  // Obstacle bounce-back.
  if (obs[idx] != 0u) {
    for (var i = 0u; i < 9u; i = i + 1u) {
      fOut[base + opp[i]] = f[i];
    }
    macro_out[idx * 3u] = 1.0;
    macro_out[idx * 3u + 1u] = 0.0;
    macro_out[idx * 3u + 2u] = 0.0;
    return;
  }

  // Macroscopic density and velocity.
  var rho: f32 = 0.0;
  var ux: f32 = 0.0;
  var uy: f32 = 0.0;
  for (var i = 0u; i < 9u; i = i + 1u) {
    rho = rho + f[i];
    ux = ux + f32(ex[i]) * f[i];
    uy = uy + f32(ey[i]) * f[i];
  }
  if (rho > 0.001) { ux = ux / rho; uy = uy / rho; }

  // Stability clamp. Use negated form so NaN fails the check too.
  if (!(rho >= 0.5 && rho <= 1.5 && abs(ux) < 1.0 && abs(uy) < 1.0)) {
    rho = 1.0;
    ux = 0.0;
    uy = params.inflow_vy;
    // Hard reset to equilibrium when the cell is invalid.
    for (var j = 0u; j < 9u; j = j + 1u) {
      fOut[base + j] = feq(rho, ux, uy, j);
    }
    macro_out[idx * 3u] = rho;
    macro_out[idx * 3u + 1u] = ux;
    macro_out[idx * 3u + 2u] = uy;
    return;
  }

  // Drag: dampen velocity so energy dissipates over time.
  ux = ux * params.damping;
  uy = uy * params.damping;

  // BGK collision.
  for (var i = 0u; i < 9u; i = i + 1u) {
    fOut[base + i] = f[i] + params.omega * (feq(rho, ux, uy, i) - f[i]);
  }

  macro_out[idx * 3u] = rho;
  macro_out[idx * 3u + 1u] = ux;
  macro_out[idx * 3u + 2u] = uy;
}
`;

// ── CPU LBM simulation ─────────────────────────────────────────────────────

function lbmEquilibrium(rho: number, ux: number, uy: number, i: number): number {
  const eu = EX[i]! * ux + EY[i]! * uy;
  const usq = ux * ux + uy * uy;
  return WT[i]! * rho * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * usq);
}

class TurbulenceCpuSim {
  readonly width: number;
  readonly height: number;
  /** Distribution functions: AoS layout, stride Q per cell. */
  fA: Float32Array;
  fB: Float32Array;
  obstacles: Uint8Array;
  /** Macroscopic output: rho, ux, uy per cell (stride 3). */
  macro: Float32Array;
  ping = false;
  frame = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const N = width * height;
    this.fA = new Float32Array(N * Q);
    this.fB = new Float32Array(N * Q);
    this.obstacles = new Uint8Array(N);
    this.macro = new Float32Array(N * 3);
    this.#initEquilibrium();
  }

  #initEquilibrium(): void {
    const { width, height, fA } = this;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const base = (y * width + x) * Q;
        for (let i = 0; i < Q; i += 1) {
          fA[base + i] = lbmEquilibrium(1.0, 0, INFLOW_VELOCITY, i);
        }
      }
    }
  }

  setObstacles(rects: readonly Rectangle[], bounds: Rectangle): void {
    const { width, height, obstacles } = this;
    const prev = new Uint8Array(obstacles);
    obstacles.fill(0);
    for (const rect of rects) {
      const c0 = Math.max(0, Math.floor(rect.column - bounds.column));
      const r0 = Math.max(0, Math.floor(rect.row - bounds.row));
      const c1 = Math.min(width, Math.floor(rect.column - bounds.column + rect.width));
      const r1 = Math.min(height, Math.floor(rect.row - bounds.row + rect.height));
      for (let r = r0; r < r1; r += 1) {
        for (let c = c0; c < c1; c += 1) {
          obstacles[r * width + c] = 1;
        }
      }
    }
    // Reset cells that transitioned from obstacle → fluid to equilibrium.
    // Their bounce-back distributions are not valid fluid states.
    const buf = this.ping ? this.fB : this.fA;
    for (let idx = 0; idx < width * height; idx += 1) {
      if (prev[idx] && !obstacles[idx]) {
        const base = idx * Q;
        for (let i = 0; i < Q; i += 1) {
          buf[base + i] = lbmEquilibrium(1.0, 0, INFLOW_VELOCITY, i);
        }
      }
    }
  }

  step(): void {
    const { width: W, height: H, obstacles, macro } = this;
    const src = this.ping ? this.fB : this.fA;
    const dst = this.ping ? this.fA : this.fB;
    this.frame += 1;

    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const idx = y * W + x;
        const base = idx * Q;

        // Pull streaming.
        const f = new Float64Array(Q);
        for (let i = 0; i < Q; i += 1) {
          const sx = x - EX[i]!;
          const sy = y - EY[i]!;
          if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
            f[i] = src[(sy * W + sx) * Q + i]!;
          } else if (sy < 0) {
            // Inflow.
            const seed = (x + this.frame * 131) >>> 0;
            const h = ((Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) ^ (seed >>> 16)) & 0xFFFF) / 65536 - 0.5;
            f[i] = lbmEquilibrium(1.0, INFLOW_PERTURBATION * h, INFLOW_VELOCITY, i);
          } else {
            f[i] = src[base + i]!;
          }
        }

        // Bounce-back.
        if (obstacles[idx]) {
          for (let i = 0; i < Q; i += 1) dst[base + OPP[i]!] = f[i]!;
          macro[idx * 3] = 1;
          macro[idx * 3 + 1] = 0;
          macro[idx * 3 + 2] = 0;
          continue;
        }

        // Macroscopic.
        let rho = 0, ux = 0, uy = 0;
        for (let i = 0; i < Q; i += 1) {
          rho += f[i]!;
          ux += EX[i]! * f[i]!;
          uy += EY[i]! * f[i]!;
        }
        if (rho > 0.001) {
          ux /= rho;
          uy /= rho;
        }
        // NaN propagates through comparisons as false, so check explicitly.
        if (!(rho >= 0.5 && rho <= 1.5) || !Number.isFinite(ux) || !Number.isFinite(uy)) {
          rho = 1;
          ux = 0;
          uy = INFLOW_VELOCITY;
        }

        // Drag: dampen velocity so energy dissipates over time.
        ux *= VELOCITY_DAMPING;
        uy *= VELOCITY_DAMPING;

        // BGK collision.
        for (let i = 0; i < Q; i += 1) {
          const fi = f[i]!;
          const result = fi + OMEGA * (lbmEquilibrium(rho, ux, uy, i) - fi);
          dst[base + i] = Number.isFinite(result) ? result : lbmEquilibrium(1.0, 0, INFLOW_VELOCITY, i);
        }

        macro[idx * 3] = rho;
        macro[idx * 3 + 1] = ux;
        macro[idx * 3 + 2] = uy;
      }
    }
    this.ping = !this.ping;
  }

  injectVelocity(cx: number, cy: number, fx: number, fy: number): void {
    const { width: W, height: H } = this;
    const r = 2;
    const src = this.ping ? this.fB : this.fA;
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        if (this.obstacles[y * W + x]) continue;
        const base = (y * W + x) * Q;
        let rho = 0;
        for (let i = 0; i < Q; i += 1) rho += src[base + i]!;
        if (rho < 0.001) continue;
        const ux = fx, uy = fy;
        for (let i = 0; i < Q; i += 1) {
          src[base + i] = lbmEquilibrium(rho, ux, uy, i);
        }
      }
    }
  }
}

// ── GPU LBM simulation ─────────────────────────────────────────────────────

interface TurbulenceGpuContext {
  device: GPUDevice;
  pipeline: GPUComputePipeline;
  paramsBuffer: GPUBuffer;
  fBufferA: GPUBuffer;
  fBufferB: GPUBuffer;
  obsBuffer: GPUBuffer;
  macroBuffer: GPUBuffer;
  stagingBuffer: GPUBuffer;
  bindGroupA: GPUBindGroup;
  bindGroupB: GPUBindGroup;
  width: number;
  height: number;
  ping: boolean;
  frame: number;
  readbackPending: boolean;
  readbackData: Float32Array | null;
}

async function createTurbulenceGpu(width: number, height: number): Promise<TurbulenceGpuContext | null> {
  try {
    // Shared rather than requested here: Deno allows one device per process,
    // and the butterchurn background needs one as well. Taking a private device
    // left whichever field initialised second permanently without a GPU.
    const device = await exomuxGpuDevice();
    if (!device) return null;

    const N = width * height;
    const fSize = N * Q * 4;
    const macroSize = N * 3 * 4;
    const obsSize = N * 4;

    const module = device.createShaderModule({ code: WGSL_LBM });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ],
    });
    const pipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      compute: { module, entryPoint: "main" },
    });

    const paramsBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const fBufferA = device.createBuffer({ size: fSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const fBufferB = device.createBuffer({ size: fSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const obsBuffer = device.createBuffer({ size: obsSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const macroBuffer = device.createBuffer({
      size: macroSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const stagingBuffer = device.createBuffer({
      size: macroSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const makeBindGroup = (read: GPUBuffer, write: GPUBuffer): GPUBindGroup =>
      device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: paramsBuffer } },
          { binding: 1, resource: { buffer: read } },
          { binding: 2, resource: { buffer: write } },
          { binding: 3, resource: { buffer: obsBuffer } },
          { binding: 4, resource: { buffer: macroBuffer } },
        ],
      });

    // Initialize fA to equilibrium.
    const initData = new Float32Array(N * Q);
    for (let i = 0; i < N; i += 1) {
      for (let q = 0; q < Q; q += 1) {
        initData[i * Q + q] = lbmEquilibrium(1.0, 0, INFLOW_VELOCITY, q);
      }
    }
    device.queue.writeBuffer(fBufferA, 0, initData);

    return {
      device,
      pipeline,
      paramsBuffer,
      fBufferA,
      fBufferB,
      obsBuffer,
      macroBuffer,
      stagingBuffer,
      bindGroupA: makeBindGroup(fBufferA, fBufferB),
      bindGroupB: makeBindGroup(fBufferB, fBufferA),
      width,
      height,
      ping: false,
      frame: 0,
      readbackPending: false,
      readbackData: null,
    };
  } catch {
    return null;
  }
}

function gpuStep(ctx: TurbulenceGpuContext, steps: number): void {
  const { device, pipeline, paramsBuffer, macroBuffer, stagingBuffer } = ctx;
  const wgX = Math.ceil(ctx.width / 8);
  const wgY = Math.ceil(ctx.height / 8);

  const paramsData = new Float32Array(8);
  paramsData[2] = OMEGA;
  paramsData[3] = INFLOW_VELOCITY;
  paramsData[4] = INFLOW_PERTURBATION;
  paramsData[6] = VELOCITY_DAMPING;
  // u32 fields written via a typed view over the same buffer.
  const paramsU32 = new Uint32Array(paramsData.buffer);
  paramsU32[0] = ctx.width;
  paramsU32[1] = ctx.height;
  paramsU32[5] = ctx.frame;
  paramsU32[7] = 0; // _pad

  device.queue.writeBuffer(paramsBuffer, 0, paramsData);

  const encoder = device.createCommandEncoder();
  for (let s = 0; s < steps; s += 1) {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, ctx.ping ? ctx.bindGroupB : ctx.bindGroupA);
    pass.dispatchWorkgroups(wgX, wgY);
    pass.end();
    ctx.ping = !ctx.ping;
    ctx.frame += 1;
  }
  encoder.copyBufferToBuffer(macroBuffer, 0, stagingBuffer, 0, macroBuffer.size);
  device.queue.submit([encoder.finish()]);
}

function gpuRequestReadback(ctx: TurbulenceGpuContext): void {
  if (ctx.readbackPending) return;
  ctx.readbackPending = true;
  ctx.stagingBuffer.mapAsync(1 /* GPUMapMode.READ */).then(() => {
    const mapped = ctx.stagingBuffer.getMappedRange();
    ctx.readbackData = new Float32Array(new Float32Array(mapped).slice(0));
    ctx.stagingBuffer.unmap();
    ctx.readbackPending = false;
  }).catch(() => {
    ctx.readbackPending = false;
  });
}

// ── main background ─────────────────────────────────────────────────────────

interface TurbulencePointer extends ExomuxBackgroundPoint {
  readonly updatedAt: number;
}

/** Construction options. */
export interface ExomuxTurbulenceFieldOptions {
  readonly seed?: number;
}

/**
 * 2-D Lattice Boltzmann (D2Q9) fluid background. Windows act as solid
 * obstacles, producing von Kármán vortex streets and turbulent wakes.
 * Uses WebGPU compute shaders when available, with a CPU fallback.
 */
export class ExomuxTurbulenceField implements ExomuxAnimatedBackground {
  #bounds?: Rectangle;
  #pointer?: TurbulencePointer;
  #lastFrameAt?: number;
  #cpu: TurbulenceCpuSim | null = null;
  #gpu: TurbulenceGpuContext | null = null;
  #gpuState: "uninit" | "initializing" | "ready" | "failed" = "uninit";
  #obstacleKey?: string;
  #cells: (ExomuxBackgroundCell | undefined)[][] = [];
  #vorticity: Float32Array = new Float32Array(0);

  constructor(_options: ExomuxTurbulenceFieldOptions = {}) {}

  setPointer(point: ExomuxBackgroundPoint, now = performance.now()): void {
    if (!Number.isFinite(point.column) || !Number.isFinite(point.row)) return;
    this.#pointer = { column: point.column, row: point.row, updatedAt: finite(now, performance.now()) };
  }

  clearPointer(): void {
    this.#pointer = undefined;
  }

  advance(options: ExomuxBackgroundAdvanceOptions): boolean {
    const bounds = normalizeBounds(options.bounds);
    if (!bounds) return false;
    const now = finite(options.now, performance.now());
    const elapsed = this.#lastFrameAt === undefined
      ? FRAME_BASELINE_MS
      : Math.min(MAX_FRAME_DELTA_MS, Math.max(0, now - this.#lastFrameAt));
    this.#lastFrameAt = now;
    if (elapsed <= 0) return false;

    this.#ensureSim(bounds);
    this.#syncObstacles(options.obstacles ?? [], bounds);

    // Pointer interaction.
    const ptr = this.#pointer && now - this.#pointer.updatedAt <= POINTER_LIFETIME_MS ? this.#pointer : undefined;
    if (ptr && this.#cpu) {
      const px = Math.floor(ptr.column - bounds.column);
      const py = Math.floor(ptr.row - bounds.row);
      this.#cpu.injectVelocity(px, py, POINTER_FORCE * 0.5, POINTER_FORCE);
    }

    // Try GPU path.
    if (this.#gpuState === "uninit") {
      this.#gpuState = "initializing";
      createTurbulenceGpu(bounds.width, bounds.height).then((ctx) => {
        if (ctx) {
          this.#gpu = ctx;
          this.#gpuState = "ready";
          // Upload obstacles.
          if (this.#cpu) {
            ctx.device.queue.writeBuffer(ctx.obsBuffer, 0, new Uint32Array(this.#cpu.obstacles));
          }
        } else {
          this.#gpuState = "failed";
        }
      }).catch(() => {
        this.#gpuState = "failed";
      });
    }

    if (this.#gpuState === "ready" && this.#gpu) {
      // Consume any ready readback.
      if (this.#gpu.readbackData && this.#cpu) {
        this.#cpu.macro.set(this.#gpu.readbackData);
        this.#gpu.readbackData = null;
      }
      gpuStep(this.#gpu, LBM_STEPS_PER_FRAME);
      gpuRequestReadback(this.#gpu);
    }

    // Always run CPU (it's fast enough and keeps data fresh when GPU lags).
    if (this.#cpu) {
      for (let s = 0; s < LBM_STEPS_PER_FRAME; s += 1) this.#cpu.step();
      this.#computeVorticity();
    }

    return true;
  }

  rasterizeCells(
    bounds: Rectangle,
    theme: ExomuxThemeSpec,
  ): ReadonlyArray<ReadonlyArray<ExomuxBackgroundCell | undefined>> {
    const normalized = normalizeBounds(bounds);
    if (!normalized) {
      this.#cells = [];
      return this.#cells;
    }
    const { width, height } = normalized;
    this.#ensureCellBuffer(width, height);

    const cpu = this.#cpu;
    if (!cpu) return this.#cells;

    const { macro, obstacles } = cpu;
    const vort = this.#vorticity;
    const cwColor: ExomuxRgb = mixExomuxRgb(theme.accent, theme.text, 0.3);
    const ccwColor: ExomuxRgb = mixExomuxRgb(theme.muted, theme.text, 0.3);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (obstacles[idx]) continue;

        const ux = macro[idx * 3 + 1]!;
        const uy = macro[idx * 3 + 2]!;
        if (!Number.isFinite(ux) || !Number.isFinite(uy)) continue;
        const speed = Math.sqrt(ux * ux + uy * uy);
        const omega = vort[idx] ?? 0;
        const absOmega = Math.abs(omega);

        // Skip very calm cells.
        if (speed < 0.003 && absOmega < 0.0005) continue;

        // Character selection: vorticity-dominated or flow-dominated.
        let char: string;
        if (absOmega > 0.002) {
          const ci = Math.min(VORT_CHARS.length - 1, Math.floor(absOmega * 2500));
          char = VORT_CHARS[ci] ?? VORT_CHARS[0]!;
        } else if (speed > 0.005) {
          const angle = Math.atan2(uy, ux);
          const octant = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
          char = DIR_CHARS[octant] ?? "-";
        } else {
          char = ".";
        }

        if (char === " ") continue;

        // Color: vorticity sign → hue, magnitude → brightness.
        const intensity = Math.min(1, speed * 8 + absOmega * 800);
        const hue = omega > 0 ? cwColor : ccwColor;
        const foreground = mixExomuxRgb(theme.background, hue, intensity);
        this.#cells[y]![x] = { char, foreground, bold: absOmega > 0.005 };
      }
    }

    return this.#cells;
  }

  // ── private ─────────────────────────────────────────────────────────────

  #ensureSim(bounds: Rectangle): void {
    if (this.#bounds?.width === bounds.width && this.#bounds.height === bounds.height) {
      this.#bounds = { ...bounds };
      return;
    }
    this.#bounds = { ...bounds };
    this.#cpu = new TurbulenceCpuSim(bounds.width, bounds.height);
    this.#vorticity = new Float32Array(bounds.width * bounds.height);
    // GPU needs re-init on resize.
    if (this.#gpu) {
      this.#gpu = null;
      this.#gpuState = "uninit";
    }
    this.#obstacleKey = undefined;
  }

  #syncObstacles(obstacles: readonly Rectangle[], bounds: Rectangle): void {
    const key = obstacles.map((r) => `${r.column},${r.row},${r.width},${r.height}`).join("|");
    if (key === this.#obstacleKey) return;
    this.#obstacleKey = key;
    this.#cpu?.setObstacles(obstacles, bounds);
    if (this.#gpu && this.#cpu) {
      // Upload obstacle mask as u32 array.
      const obs32 = new Uint32Array(this.#cpu.obstacles);
      this.#gpu.device.queue.writeBuffer(this.#gpu.obsBuffer, 0, obs32);
    }
  }

  #computeVorticity(): void {
    const cpu = this.#cpu;
    if (!cpu) return;
    const { width: W, height: H, macro } = cpu;
    const vort = this.#vorticity;
    for (let y = 1; y < H - 1; y += 1) {
      for (let x = 1; x < W - 1; x += 1) {
        const idx = y * W + x;
        // duy/dx - dux/dy (central differences).
        const duy_dx = (macro[(y * W + x + 1) * 3 + 2]! - macro[(y * W + x - 1) * 3 + 2]!) * 0.5;
        const dux_dy = (macro[((y + 1) * W + x) * 3 + 1]! - macro[((y - 1) * W + x) * 3 + 1]!) * 0.5;
        vort[idx] = duy_dx - dux_dy;
      }
    }
  }

  #ensureCellBuffer(width: number, height: number): void {
    if (this.#cells.length === height && (this.#cells[0]?.length ?? -1) === width) {
      for (const row of this.#cells) row.fill(undefined);
      return;
    }
    this.#cells = Array.from(
      { length: height },
      () => new Array<ExomuxBackgroundCell | undefined>(width).fill(undefined),
    );
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function normalizeBounds(value: Rectangle): Rectangle | undefined {
  if (
    !Number.isFinite(value.column) || !Number.isFinite(value.row) ||
    !Number.isFinite(value.width) || !Number.isFinite(value.height)
  ) return undefined;
  const width = Math.floor(value.width);
  const height = Math.floor(value.height);
  if (width <= 0 || height <= 0) return undefined;
  return { column: Math.floor(value.column), row: Math.floor(value.row), width, height };
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
