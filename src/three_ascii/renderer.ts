import {
  type Camera,
  ClampToEdgeWrapping,
  type Color,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  PerspectiveCamera,
  type Scene,
  Texture,
} from "three";
import { RenderPipeline, WebGPURenderer } from "three/webgpu";
import { pass } from "three/tsl";

import { AcerolaAsciiNode, type AcerolaAsciiNodeOptions, type AcerolaAsciiRenderProfile } from "./AcerolaAsciiNode.ts";
import {
  buildThreeAsciiAnsiGrid as buildThreeAsciiAnsiGridInternal,
  ThreeAsciiAnsiGridAssembler as InternalThreeAsciiAnsiGridAssembler,
  type ThreeAsciiAnsiGridInput as InternalThreeAsciiAnsiGridInput,
} from "./ansi_grid.ts";
import type { TerminalGlyphStyle } from "./glyphs.ts";
import { HeadlessCanvas } from "./headless_canvas.ts";
import {
  resolveThreeAsciiDeferredPreSceneFrame,
  type ThreeAsciiDeferredReadbackConsumeResult,
  type ThreeAsciiDeferredReadbackFrame,
  ThreeAsciiDeferredReadbackQueue,
} from "./deferred_readback.ts";
import {
  applyThreeAsciiComputeResourcePlanState,
  createThreeAsciiComputeBindGroups,
  createThreeAsciiComputePipeline,
  createThreeAsciiComputeResourcePlan,
  destroyThreeAsciiGpuBufferSlot,
  encodeThreeAsciiComputeDispatchCommands,
  ensureThreeAsciiGpuBufferSlot,
  THREE_ASCII_UNIFORM_FLOAT_COUNT,
  ThreeAsciiComputeDispatchPlanCache,
  type ThreeAsciiComputeDispatchPlanInput,
  type ThreeAsciiComputeDispatchResources,
  type ThreeAsciiComputeResourcePlanInput,
  type ThreeAsciiGpuBufferSlot,
  writeThreeAsciiUniformValues,
} from "./compute_resources.ts";
import {
  patchThreeAsciiEffectOptions,
  resolveThreeAsciiComputeMode,
  type ThreeAsciiEffectState,
  threeAsciiEffectStateFromSource,
} from "./effect_state.ts";
import {
  createThreeAsciiRendererPerformance,
  createThreeAsciiRendererSaturatedPerformance,
  type ThreeAsciiRendererPerformance,
} from "./performance.ts";
import {
  assembleThreeAsciiReadbackGridWithContext,
  executeThreeAsciiReadbackCopyPlan,
  ThreeAsciiReadbackCopyPlanCache,
  type ThreeAsciiReadbackCopySource,
  type ThreeAsciiReadbackCopySources,
  type ThreeAsciiReadbackCopySourceSlots,
  type ThreeAsciiReadbackGridAssemblyContext,
  type ThreeAsciiReadbackLayout,
  ThreeAsciiReadbackLayoutCache,
  type ThreeAsciiReadbackLayoutOptions,
  ThreeAsciiReadbackViewCache,
  writeThreeAsciiReadbackCopySourceDescriptors,
  writeThreeAsciiReadbackCopySources,
  writeThreeAsciiReadbackCopySourceSlots,
  writeThreeAsciiReadbackLayoutOptions,
} from "./readback.ts";
import {
  emptyThreeAsciiRenderFrame,
  resolveThreeAsciiRenderFrameSelectionInto,
  THREE_ASCII_ANSI_FRAME_OPTIONS,
  THREE_ASCII_IMAGE_FRAME_OPTIONS,
  type ThreeAsciiRenderFrameOptions,
  type ThreeAsciiRenderFrameSelection,
} from "./frame_options.ts";
import {
  normalizeThreeAsciiRendererOptions,
  normalizeThreeAsciiRenderSize,
  normalizeThreeAsciiTerminalEdgeBias,
  type ThreeAsciiReadbackStrategy,
} from "./renderer_options.ts";
import { resolveThreeAsciiRenderProfileInto } from "./render_profile.ts";
import {
  THREE_ASCII_COLOR_SHADER,
  THREE_ASCII_EDGE_SHADER,
  THREE_ASCII_FILL_SHADER,
  THREE_ASCII_FLAT_COLOR_SHADER,
  THREE_ASCII_TERMINAL_EDGE_THRESHOLD_SCALE,
  THREE_ASCII_TILE_SIZE,
  THREE_ASCII_WORKGROUP_SIZE,
} from "./shaders.ts";
import { getCompatibleWebGPUDevice } from "./webgpu_compat.ts";
import { runtimeHost } from "../runtime/host.ts";

const GPU_MAP_READ = 1;
const bitmapCache = new Map<string, Promise<ImageBitmap>>();

function imageSourceUrl(source: URL | string): URL {
  return source instanceof URL ? source : new URL(source, import.meta.url);
}

async function loadImageBytes(source: URL | string): Promise<Uint8Array> {
  const url = imageSourceUrl(source);

  if (url.protocol === "file:" && runtimeHost) {
    return await runtimeHost.readFile(url);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load image: ${url} (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function loadBitmapUncached(source: URL): Promise<ImageBitmap> {
  const bytes = await loadImageBytes(source);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const blob = new Blob([arrayBuffer], { type: "image/png" });
  return await createImageBitmap(blob);
}

async function loadBitmap(source: URL | string): Promise<ImageBitmap> {
  const url = imageSourceUrl(source);
  const key = url.href;
  let promise = bitmapCache.get(key);
  if (!promise) {
    promise = loadBitmapUncached(url);
    bitmapCache.set(key, promise);
  }
  try {
    return await promise;
  } catch (error) {
    if (bitmapCache.get(key) === promise) {
      bitmapCache.delete(key);
    }
    throw error;
  }
}

function createMaskTexture(bitmap: ImageBitmap): Texture {
  const texture = new Texture(bitmap);
  texture.name = "AcerolaAsciiMask";
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = false;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

async function loadAsciiLutTextures(
  edgesUrl: URL | string,
  fillUrl: URL | string,
) {
  if ("Bun" in globalThis) {
    // bun-webgpu has no DOM image decoder/copyExternalImageToTexture. Decode
    // the packaged PNG masks and upload their RGBA pixels through writeTexture.
    const moduleName = "pngjs";
    const { PNG } = await import(moduleName);
    const bufferModuleName = "node:buffer";
    const { Buffer } = await import(bufferModuleName);
    const decode = async (source: URL | string): Promise<Texture> => {
      const image = PNG.sync.read(Buffer.from(await loadImageBytes(source)));
      const texture = new DataTexture(new Uint8Array(image.data), image.width, image.height);
      texture.name = "AcerolaAsciiMask";
      texture.colorSpace = NoColorSpace;
      texture.generateMipmaps = false;
      texture.magFilter = LinearFilter;
      texture.minFilter = LinearFilter;
      texture.wrapS = ClampToEdgeWrapping;
      texture.wrapT = ClampToEdgeWrapping;
      texture.flipY = false;
      texture.needsUpdate = true;
      return texture;
    };
    const [edgesTexture, fillTexture] = await Promise.all([decode(edgesUrl), decode(fillUrl)]);
    return { edgesTexture, fillTexture };
  }
  const [edgesBitmap, fillBitmap] = await Promise.all([
    loadBitmap(edgesUrl),
    loadBitmap(fillUrl),
  ]);

  return {
    edgesTexture: createMaskTexture(edgesBitmap),
    fillTexture: createMaskTexture(fillBitmap),
  };
}

type ThreeBackendRenderer = WebGPURenderer & {
  _nodes?: { nodeFrame: { update(): void } };
  backend: {
    device: GPUDevice;
    get(object: unknown): { texture?: GPUTexture };
  };
};
type WebGPURendererParameters = NonNullable<ConstructorParameters<typeof WebGPURenderer>[0]>;
type WebGPURendererCanvas = NonNullable<WebGPURendererParameters["canvas"]>;
type WebGPURendererContext = NonNullable<WebGPURendererParameters["context"]>;

/** Options for configuring three Ascii Renderer. */
export interface ThreeAsciiRendererOptions {
  scene: Scene;
  camera: Camera;
  columns: number;
  rows: number;
  pixelAspectRatio?: number;
  terminalEdgeBias?: number;
  terminalGlyphStyle?: TerminalGlyphStyle;
  readbackStrategy?: "blocking" | "deferred";
  deferredReadbackSlots?: number;
  deferredReadbackMaxStaleFrames?: number;
  effect?: AcerolaAsciiNodeOptions;
}

/** Combined render output from one three Ascii renderer pass. */
export interface ThreeAsciiRenderFrame {
  grid?: string[][];
  gridRevision?: number;
  image?: ThreeAsciiImageFrame;
}

export type { ThreeAsciiRenderFrameOptions } from "./frame_options.ts";
export type { ThreeAsciiRendererPerformance } from "./performance.ts";

/** Camera aspect inputs normalized from terminal cell geometry. */
export interface ThreeAsciiCameraAspectInput {
  columns: number;
  rows: number;
  pixelAspectRatio: number;
}

/** Minimum aspect delta before the renderer updates a perspective camera. */
export const THREE_ASCII_CAMERA_ASPECT_EPSILON = 0.000001;

/** Computes a camera aspect ratio that accounts for terminal cell pixel shape. */
export function computeThreeAsciiCameraAspect(input: ThreeAsciiCameraAspectInput): number {
  return (input.columns * input.pixelAspectRatio) / Math.max(1, input.rows);
}

/** Reports whether a perspective camera aspect differs enough to update. */
export function shouldUpdateThreeAsciiCameraAspect(
  current: number,
  next: number,
  epsilon = THREE_ASCII_CAMERA_ASPECT_EPSILON,
): boolean {
  return Math.abs(current - next) > epsilon;
}

/** Raw image frame emitted by the Acerola three Ascii renderer. */
export interface ThreeAsciiImageFrame {
  data: Uint8Array;
  encoding: "bytes";
  format: 32;
  pixelWidth: number;
  pixelHeight: number;
}

/** Minimal RGBA readback source used to build renderer image frames. */
export interface ThreeAsciiImageFrameSource {
  readonly width: number;
  readonly height: number;
  readonly context: {
    readRGBA(): Uint8Array | Promise<Uint8Array>;
  };
}

/** Reads an RGBA image frame from a renderer surface. */
export async function readThreeAsciiImageFrame(
  source: ThreeAsciiImageFrameSource,
): Promise<ThreeAsciiImageFrame> {
  return {
    data: await source.context.readRGBA(),
    encoding: "bytes",
    format: 32,
    pixelWidth: source.width,
    pixelHeight: source.height,
  };
}

/** Minimal mapped GPU readback buffer contract used by the renderer. */
export interface ThreeAsciiMappedReadbackBuffer {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
}

/** Options for mapping a GPU readback buffer and decoding its contents. */
export interface ThreeAsciiMappedReadbackOptions<T> {
  mapModeRead: number;
  now?: () => number;
  mapError: (error: unknown) => Error;
  read: (source: ArrayBuffer, readbackMs: number) => T;
}

/** Maps a GPU readback buffer, measures readback latency, reads it, and always unmaps after successful mapping. */
export async function withThreeAsciiMappedReadback<T>(
  buffer: ThreeAsciiMappedReadbackBuffer,
  options: ThreeAsciiMappedReadbackOptions<T>,
): Promise<{ value: T; readbackMs: number }> {
  const now = options.now ?? (() => performance.now());
  const readbackStart = now();
  try {
    await buffer.mapAsync(options.mapModeRead);
  } catch (error) {
    throw options.mapError(error);
  }
  const readbackMs = now() - readbackStart;

  try {
    return {
      value: options.read(buffer.getMappedRange(), readbackMs),
      readbackMs,
    };
  } finally {
    buffer.unmap();
  }
}

/** Stable error raised when WebGPU output buffers cannot be mapped back to CPU-readable memory. */
export class ThreeAsciiReadbackError extends Error {
  readonly code = "three-ascii-readback-unavailable";
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super("Three ASCII GPU readback unavailable.");
    this.name = "ThreeAsciiReadbackError";
    this.cause = cause;
  }
}

/** Decision for whether a deferred readback should submit, queue, or reuse a cached grid. */
export interface ThreeAsciiDeferredReadbackSubmission<TReadback> {
  readback?: TReadback;
  grid: string[][];
  submit: boolean;
  queue: boolean;
}

/** Resolves deferred readback submission state from completed queue output and an available readback slot. */
export function resolveThreeAsciiDeferredReadbackSubmission<TReadback>(
  completed: ThreeAsciiDeferredReadbackConsumeResult,
  readback: TReadback | undefined,
  lastCompletedGrid: string[][],
): ThreeAsciiDeferredReadbackSubmission<TReadback> {
  if (completed.readbackUnavailable) {
    return {
      grid: completed.grid ?? [],
      submit: false,
      queue: false,
    };
  }

  const grid = completed.grid ?? lastCompletedGrid;
  if (!readback) {
    return {
      grid,
      submit: false,
      queue: false,
    };
  }

  return {
    readback,
    grid,
    submit: true,
    queue: true,
  };
}

/** Deferred readback queue operations needed when handling readback failure. */
export interface ThreeAsciiDeferredReadbackFailureQueue {
  lastCompletedGrid(): string[][];
  destroy(): void;
}

/** Result of classifying and handling a deferred readback failure. */
export interface ThreeAsciiDeferredReadbackFailureResult {
  handled: boolean;
  result?: ThreeAsciiDeferredReadbackConsumeResult;
}

/** Converts expected readback errors into an unavailable-readback result while preserving cached output. */
export function handleThreeAsciiDeferredReadbackFailure(
  error: unknown,
  expectedError: new (...args: unknown[]) => Error,
  queue: ThreeAsciiDeferredReadbackFailureQueue,
): ThreeAsciiDeferredReadbackFailureResult {
  if (!(error instanceof expectedError)) {
    return { handled: false };
  }

  const grid = queue.lastCompletedGrid();
  queue.destroy();
  return { handled: true, result: { grid, readbackUnavailable: true } };
}

/** Input buffers for assembling a terminal ANSI grid from three Ascii GPU readback data. */
export interface ThreeAsciiAnsiGridInput extends InternalThreeAsciiAnsiGridInput {}

/** Reusable ANSI grid assembler that keeps color and cell string caches warm across frames. */
export class ThreeAsciiAnsiGridAssembler extends InternalThreeAsciiAnsiGridAssembler {}

/** Builds the terminal ANSI cell grid for a three Ascii frame. */
export function buildThreeAsciiAnsiGrid(input: ThreeAsciiAnsiGridInput): string[][] {
  return buildThreeAsciiAnsiGridInternal(input);
}

/** Public class implementing a three Ascii Renderer. */
export class ThreeAsciiRenderer {
  readonly scene: Scene;
  readonly camera: Camera;
  readonly pixelAspectRatio: number;

  columns: number;
  rows: number;

  private readonly effectOptions: AcerolaAsciiNodeOptions;
  private readonly canvas: HeadlessCanvas;
  private terminalEdgeBias: number;
  private terminalGlyphStyle: TerminalGlyphStyle;
  private readbackStrategy: ThreeAsciiReadbackStrategy;

  private initPromise?: Promise<void>;
  private renderer?: ThreeBackendRenderer;
  private renderPipeline?: RenderPipeline;
  private asciiNode?: AcerolaAsciiNode;

  private device?: GPUDevice;
  private paramsBuffer?: GPUBuffer;
  private fillPipeline?: GPUComputePipeline;
  private edgePipeline?: GPUComputePipeline;
  private colorPipeline?: GPUComputePipeline;
  private colorDepthPipeline?: GPUComputePipeline;
  private colorFlatPipeline?: GPUComputePipeline;
  private fillBindGroup?: GPUBindGroup;
  private edgeBindGroup?: GPUBindGroup;
  private colorBindGroup?: GPUBindGroup;
  private fillOutput?: ThreeAsciiGpuBufferSlot<GPUBuffer>;
  private edgeOutput?: ThreeAsciiGpuBufferSlot<GPUBuffer>;
  private colorOutput?: ThreeAsciiGpuBufferSlot<GPUBuffer>;
  private outputReadback?: ThreeAsciiGpuBufferSlot<GPUBuffer>;
  private readonly deferredReadbacks: ThreeAsciiDeferredReadbackQueue<GPUBuffer>;
  private uniformValues = new Float32Array(THREE_ASCII_UNIFORM_FLOAT_COUNT);
  private readonly ansiGridAssembler = new ThreeAsciiAnsiGridAssembler({ reuseGrid: true });
  private readonly readbackLayoutCache = new ThreeAsciiReadbackLayoutCache();
  private readonly readbackCopyPlanCache = new ThreeAsciiReadbackCopyPlanCache();
  private readonly readbackViewCache = new ThreeAsciiReadbackViewCache();
  private readonly readbackCopyFillSource: ThreeAsciiReadbackCopySource = { label: "fill", byteLength: 0 };
  private readonly readbackCopyEdgeSource: ThreeAsciiReadbackCopySource = { label: "edge", byteLength: 0 };
  private readonly readbackCopyColorSource: ThreeAsciiReadbackCopySource = { label: "color", byteLength: 0 };
  private readonly readbackCopySourceDescriptors = {
    fill: this.readbackCopyFillSource,
    edge: this.readbackCopyEdgeSource,
    color: this.readbackCopyColorSource,
  };
  private readonly readbackCopySources: ThreeAsciiReadbackCopySources<GPUBuffer> = {} as ThreeAsciiReadbackCopySources<
    GPUBuffer
  >;
  private readonly readbackCopySourceSlots: ThreeAsciiReadbackCopySourceSlots<GPUBuffer> =
    {} as ThreeAsciiReadbackCopySourceSlots<GPUBuffer>;
  private readonly readbackLayoutOptions: ThreeAsciiReadbackLayoutOptions = {
    fillByteLength: 0,
    edgeByteLength: 0,
    colorByteLength: 0,
    includeFill: true,
    includeEdges: false,
  };
  private readonly readbackLayoutModes = {
    includeFill: true,
    includeEdges: false,
  };
  private readonly readbackCopyPlanOptions = {
    fill: this.readbackCopyFillSource,
    edge: undefined as ThreeAsciiReadbackCopySource | undefined,
    color: this.readbackCopyColorSource,
    includeFill: true,
    includeEdges: false,
    layout: undefined as unknown as ThreeAsciiReadbackLayout,
  };
  private readonly readbackByteLengths = {
    fillByteLength: 0,
    edgeByteLength: 0,
    colorByteLength: 0,
  };
  private readonly dispatchPlanCache = new ThreeAsciiComputeDispatchPlanCache();
  private readonly dispatchPlanOptions: ThreeAsciiComputeDispatchPlanInput = {
    columns: 0,
    rows: 0,
    workgroupSize: THREE_ASCII_WORKGROUP_SIZE,
    includeFill: true,
    includeEdges: false,
  };
  private readonly dispatchResources: ThreeAsciiComputeDispatchResources = {
    pipelineForPass: (kind) => this.computePipelineForPass(kind),
    bindGroupForPass: (kind) => this.computeBindGroupForPass(kind),
  };
  private readonly computeResourcePlanInput: ThreeAsciiComputeResourcePlanInput = {
    columns: 0,
    rows: 0,
    includeFill: true,
    includeEdges: false,
    includeDepthColor: false,
    currentCellCount: 0,
    hasFillOutput: false,
    hasFillBindGroup: false,
    hasEdgeOutput: false,
    hasEdgeBindGroup: false,
    hasDepthColorBindGroup: false,
  };
  private readonly readbackAssemblyContext: ThreeAsciiReadbackGridAssemblyContext = {
    viewCache: this.readbackViewCache,
    assembler: this.ansiGridAssembler,
  };
  private readonly frameSelection: ThreeAsciiRenderFrameSelection = {
    renderAnsi: true,
    renderImage: false,
  };
  private readonly renderProfileScratch: AcerolaAsciiRenderProfile = {
    image: false,
    terminalEdges: false,
    terminalDepthColor: false,
  };
  private readonly activeRenderProfile: AcerolaAsciiRenderProfile = {
    image: false,
    terminalEdges: false,
    terminalDepthColor: false,
  };
  private renderProfileApplied = false;
  private outputCellCount = 0;
  private sizeDirty = true;
  private computeDirty = true;
  private uniformDirty = true;
  private readonly lastPerformance: ThreeAsciiRendererPerformance = createThreeAsciiRendererPerformance({
    columns: 0,
    rows: 0,
    terminalGlyphStyle: "glyphs",
    frameMs: 0,
    sceneMs: 0,
    ansiMs: 0,
    readbackMs: 0,
    assemblyMs: 0,
  });
  private hasPerformance = false;
  private lastReadbackMs = 0;
  private lastAssemblyMs = 0;
  private gridRevision = 0;
  private readonly deferredReadbackMaxStaleFrames: number;
  private deferredReadbackStaleFrames = 0;
  private colorUsesDepthTexture = false;

  constructor(options: ThreeAsciiRendererOptions) {
    const normalized = normalizeThreeAsciiRendererOptions(options);
    this.scene = options.scene;
    this.camera = options.camera;
    this.columns = normalized.columns;
    this.rows = normalized.rows;
    this.pixelAspectRatio = normalized.pixelAspectRatio;
    this.effectOptions = { ...options.effect };
    this.terminalEdgeBias = normalized.terminalEdgeBias;
    this.terminalGlyphStyle = normalized.terminalGlyphStyle;
    this.readbackStrategy = normalized.readbackStrategy;
    this.deferredReadbackMaxStaleFrames = normalized.deferredReadbackMaxStaleFrames;
    this.deferredReadbacks = new ThreeAsciiDeferredReadbackQueue<GPUBuffer>({
      mapModeRead: GPU_MAP_READ,
      slotCount: normalized.deferredReadbackSlots,
    });
    this.canvas = new HeadlessCanvas(1, 1);
  }

  async init(): Promise<void> {
    this.initPromise ??= this.initInternal();
    await this.initPromise;
  }

  setSize(columns: number, rows: number): void {
    const next = normalizeThreeAsciiRenderSize(columns, rows);

    if (this.columns === next.columns && this.rows === next.rows) {
      return;
    }

    this.columns = next.columns;
    this.rows = next.rows;
    this.sizeDirty = true;
    this.computeDirty = true;
    this.uniformDirty = true;
    this.deferredReadbacks.invalidate();
  }

  setEffectOptions(options: Partial<AcerolaAsciiNodeOptions>): void {
    const result = patchThreeAsciiEffectOptions(this.effectOptions, options);
    if (!result.changed) return;
    this.asciiNode?.applyOptions(result.patch);
    if (result.uniformDirty) this.uniformDirty = true;
  }

  getTerminalEdgeBias(): number {
    return this.terminalEdgeBias;
  }

  setTerminalEdgeBias(value: number): void {
    const next = normalizeThreeAsciiTerminalEdgeBias(value);
    if (this.terminalEdgeBias === next) return;
    this.terminalEdgeBias = next;
    this.uniformDirty = true;
  }

  getTerminalGlyphStyle(): TerminalGlyphStyle {
    return this.terminalGlyphStyle;
  }

  inspectPerformance(): ThreeAsciiRendererPerformance | undefined {
    return this.hasPerformance ? { ...this.lastPerformance } : undefined;
  }

  setTerminalGlyphStyle(value: TerminalGlyphStyle): void {
    if (this.terminalGlyphStyle === value) return;
    this.terminalGlyphStyle = value;
    this.computeDirty = true;
  }

  async renderToAnsiGrid(
    deltaTime = 0,
    onFrame?: (deltaTime: number) => void | Promise<void>,
  ): Promise<string[][]> {
    const frame = await this.renderFrame(deltaTime, onFrame, THREE_ASCII_ANSI_FRAME_OPTIONS);
    return frame.grid ?? [];
  }

  async renderToImageFrame(
    deltaTime = 0,
    onFrame?: (deltaTime: number) => void | Promise<void>,
  ): Promise<ThreeAsciiImageFrame> {
    const frame = await this.renderFrame(deltaTime, onFrame, THREE_ASCII_IMAGE_FRAME_OPTIONS);
    if (!frame.image) {
      throw new Error("ThreeAsciiRenderer did not produce an image frame.");
    }
    return frame.image;
  }

  async renderFrame(
    deltaTime = 0,
    onFrame?: (deltaTime: number) => void | Promise<void>,
    options: ThreeAsciiRenderFrameOptions = THREE_ASCII_ANSI_FRAME_OPTIONS,
  ): Promise<ThreeAsciiRenderFrame> {
    const frameStart = performance.now();
    const selection = resolveThreeAsciiRenderFrameSelectionInto(this.frameSelection, options);
    const { renderAnsi, renderImage } = selection;

    if (this.columns <= 0 || this.rows <= 0) {
      return emptyThreeAsciiRenderFrame({ renderAnsi, renderImage });
    }

    let deferredAnsiGrid: ThreeAsciiDeferredReadbackConsumeResult | undefined;
    let forceBlockingDeferredReadback = false;
    if (renderAnsi && !renderImage && this.readbackStrategy === "deferred") {
      deferredAnsiGrid = this.consumeDeferredAnsiGrid();
      const deferredQueue = deferredAnsiGrid.readbackUnavailable ? undefined : this.deferredReadbacks.inspect();
      const deferredFrame = resolveThreeAsciiDeferredPreSceneFrame({
        renderAnsi,
        renderImage,
        readbackStrategy: this.readbackStrategy,
        completed: deferredAnsiGrid,
        staleFrames: this.deferredReadbackStaleFrames,
        maxStaleFrames: this.deferredReadbackMaxStaleFrames,
        hasCachedGrid: this.deferredReadbacks.lastCompletedGrid().length > 0,
        pendingReadbacks: deferredQueue?.pending,
        saturated: deferredQueue?.saturated ?? false,
      });
      this.deferredReadbackStaleFrames = deferredFrame.staleFrames;
      forceBlockingDeferredReadback = deferredFrame.forceBlockingReadback;
      if (deferredFrame.kind === "readbackUnavailable") {
        const frameEnd = performance.now();
        createThreeAsciiRendererPerformance({
          columns: this.columns,
          rows: this.rows,
          terminalGlyphStyle: this.terminalGlyphStyle,
          frameMs: frameEnd - frameStart,
          sceneMs: 0,
          ansiMs: 0,
          readbackMs: 0,
          assemblyMs: 0,
        }, this.lastPerformance);
        this.hasPerformance = true;
        return { grid: deferredAnsiGrid.grid ?? [], gridRevision: this.gridRevision };
      }
      if (deferredFrame.kind === "saturated") {
        if (!forceBlockingDeferredReadback) {
          const frameEnd = performance.now();
          const previousFrameMs = this.hasPerformance ? this.lastPerformance.totalMs : undefined;
          const queue = deferredQueue ?? this.deferredReadbacks.inspect();
          createThreeAsciiRendererSaturatedPerformance({
            columns: this.columns,
            rows: this.rows,
            terminalGlyphStyle: this.terminalGlyphStyle,
            frameMs: frameEnd - frameStart,
            previousFrameMs,
            readbackMs: this.lastReadbackMs,
            queue,
          }, this.lastPerformance);
          this.hasPerformance = true;
          return { grid: this.deferredReadbacks.lastCompletedGrid(), gridRevision: this.gridRevision };
        }
      }
    }

    const effectState = renderAnsi ? this.getEffectState() : undefined;
    const sceneTiming = await this.renderScene(deltaTime, onFrame, selection, effectState) ??
      { initMs: 0, updateMs: 0, renderMs: 0 };
    const sceneEnd = performance.now();

    const frame: ThreeAsciiRenderFrame = {};
    if (renderImage) {
      frame.image = await readThreeAsciiImageFrame(this.canvas);
    }

    if (renderAnsi) {
      frame.grid = await this.computeAnsiGrid(effectState!, deferredAnsiGrid, forceBlockingDeferredReadback);
      frame.gridRevision = this.gridRevision;
    }
    const frameEnd = performance.now();
    const queue = this.readbackStrategy === "deferred" ? this.deferredReadbacks.inspect() : undefined;
    createThreeAsciiRendererPerformance({
      columns: this.columns,
      rows: this.rows,
      terminalGlyphStyle: this.terminalGlyphStyle,
      frameMs: frameEnd - frameStart,
      initMs: sceneTiming.initMs,
      sceneMs: sceneEnd - frameStart,
      sceneUpdateMs: sceneTiming.updateMs,
      sceneRenderMs: sceneTiming.renderMs,
      ansiMs: renderAnsi ? frameEnd - sceneEnd : 0,
      readbackMs: renderAnsi ? this.lastReadbackMs : 0,
      assemblyMs: renderAnsi ? this.lastAssemblyMs : 0,
      queue,
    }, this.lastPerformance);
    this.hasPerformance = true;

    return frame;
  }

  private async renderScene(
    deltaTime: number,
    onFrame?: (deltaTime: number) => void | Promise<void>,
    selection: { renderAnsi: boolean; renderImage: boolean } = { renderAnsi: true, renderImage: false },
    effectState?: ThreeAsciiEffectState,
  ): Promise<{ initMs: number; updateMs: number; renderMs: number }> {
    const initialized = this.renderer !== undefined;
    const initStart = initialized ? 0 : performance.now();
    await this.init();
    const initMs = initialized ? 0 : performance.now() - initStart;
    this.applySize();
    this.updateCameraAspect();
    const updateStart = performance.now();
    if (onFrame) {
      await onFrame(deltaTime);
    }
    const updateMs = performance.now() - updateStart;
    const renderStart = performance.now();
    this.applyRenderProfile(selection, effectState);
    // Bun's fast native readback can return within one Three RAF tick. Advance
    // FRAME nodes for each explicit frame, including an ANSI-to-image switch,
    // instead of reading an unrendered composite. Keep Deno's cadence intact.
    if ("Bun" in globalThis) this.renderer?._nodes?.nodeFrame.update();
    this.renderPipeline!.render();
    return { initMs, updateMs, renderMs: performance.now() - renderStart };
  }

  private applyRenderProfile(
    selection: { renderAnsi: boolean; renderImage: boolean },
    effectState?: ThreeAsciiEffectState,
  ): void {
    const next = resolveThreeAsciiRenderProfileInto(
      {
        selection,
        effectState,
        terminalGlyphStyle: this.terminalGlyphStyle,
      },
      this.renderProfileScratch,
    );
    if (
      this.renderProfileApplied &&
      this.activeRenderProfile.image === next.image &&
      this.activeRenderProfile.terminalEdges === next.terminalEdges &&
      this.activeRenderProfile.terminalDepthColor === next.terminalDepthColor
    ) {
      return;
    }

    this.activeRenderProfile.image = next.image;
    this.activeRenderProfile.terminalEdges = next.terminalEdges;
    this.activeRenderProfile.terminalDepthColor = next.terminalDepthColor;
    this.renderProfileApplied = true;
    this.asciiNode!.setRenderProfile(this.activeRenderProfile);
  }

  private async computeAnsiGrid(
    effectState: ThreeAsciiEffectState,
    deferredCompleted?: ThreeAsciiDeferredReadbackConsumeResult,
    forceBlockingDeferredReadback = false,
  ): Promise<string[][]> {
    const computeMode = resolveThreeAsciiComputeMode(effectState, this.terminalGlyphStyle);
    this.ensureComputeResources(
      effectState,
      computeMode.includeFill,
      computeMode.includeEdges,
      computeMode.includeDepthColor,
    );
    this.writeUniforms(effectState);

    const commandEncoder = this.device!.createCommandEncoder({
      label: "deno_tui.three_ascii.cells",
    });
    this.dispatchPlanOptions.columns = this.columns;
    this.dispatchPlanOptions.rows = this.rows;
    this.dispatchPlanOptions.includeFill = computeMode.includeFill;
    this.dispatchPlanOptions.includeEdges = computeMode.includeEdges;
    const dispatchPlan = this.dispatchPlanCache.resolve(this.dispatchPlanOptions);
    encodeThreeAsciiComputeDispatchCommands(commandEncoder, dispatchPlan, this.dispatchResources);

    this.readbackByteLengths.fillByteLength = this.fillOutput?.byteLength ?? 0;
    this.readbackByteLengths.edgeByteLength = this.edgeOutput?.byteLength ?? 0;
    this.readbackByteLengths.colorByteLength = this.colorOutput!.byteLength;
    this.readbackLayoutModes.includeFill = computeMode.includeFillReadback;
    this.readbackLayoutModes.includeEdges = computeMode.includeEdges;
    writeThreeAsciiReadbackLayoutOptions(
      this.readbackLayoutOptions,
      this.readbackByteLengths,
      this.readbackLayoutModes,
    );
    const readbackLayout = this.readbackLayoutCache.resolve(this.readbackLayoutOptions);
    writeThreeAsciiReadbackCopySourceDescriptors(this.readbackCopySourceDescriptors, this.readbackByteLengths);
    this.readbackCopyPlanOptions.edge = this.edgeOutput ? this.readbackCopyEdgeSource : undefined;
    this.readbackCopyPlanOptions.includeFill = computeMode.includeFillReadback;
    this.readbackCopyPlanOptions.includeEdges = computeMode.includeEdges;
    this.readbackCopyPlanOptions.layout = readbackLayout;
    const readbackCopyPlan = this.readbackCopyPlanCache.resolve(this.readbackCopyPlanOptions);

    if (this.readbackStrategy === "deferred" && !forceBlockingDeferredReadback) {
      return this.deferAnsiGridReadback(
        commandEncoder,
        readbackLayout,
        readbackCopyPlan,
        effectState.backgroundColor,
        deferredCompleted,
      );
    }

    this.outputReadback = this.ensureReadbackBuffer(this.outputReadback, readbackLayout.byteLength);
    this.copyReadbackCommands(commandEncoder, readbackCopyPlan, this.outputReadback);
    this.device!.queue.submit([commandEncoder.finish()]);

    const grid = await this.buildAnsiGridFromReadback(readbackLayout, effectState.backgroundColor);
    if (forceBlockingDeferredReadback) {
      this.deferredReadbackStaleFrames = 0;
      this.deferredReadbacks.replaceLastCompletedGrid(grid);
    }
    return grid;
  }

  private async deferAnsiGridReadback(
    commandEncoder: GPUCommandEncoder,
    readbackLayout: ThreeAsciiReadbackLayout,
    readbackCopyPlan: ReturnType<ThreeAsciiReadbackCopyPlanCache["resolve"]>,
    backgroundColor: Color,
    deferredCompleted?: ThreeAsciiDeferredReadbackConsumeResult,
  ): Promise<string[][]> {
    const completed = deferredCompleted ?? this.consumeDeferredAnsiGrid();
    if (this.readbackStrategy !== "deferred") {
      if (completed.readbackUnavailable) {
        return completed.grid ?? [];
      }
      this.outputReadback = this.ensureReadbackBuffer(this.outputReadback, readbackLayout.byteLength);
      this.copyReadbackCommands(commandEncoder, readbackCopyPlan, this.outputReadback);
      this.device!.queue.submit([commandEncoder.finish()]);
      return await this.buildAnsiGridFromReadback(readbackLayout, backgroundColor);
    }

    const lastCompletedGrid = this.deferredReadbacks.lastCompletedGrid();

    const readback = this.deferredReadbacks.nextBuffer(
      readbackLayout.byteLength,
      (current, byteLength) => this.ensureReadbackBuffer(current, byteLength),
    );
    const submission = resolveThreeAsciiDeferredReadbackSubmission(
      completed,
      readback,
      lastCompletedGrid,
    );
    if (!submission.submit || !submission.readback) return submission.grid;

    this.copyReadbackCommands(commandEncoder, readbackCopyPlan, submission.readback);
    this.device!.queue.submit([commandEncoder.finish()]);
    this.deferredReadbacks.queue(submission.readback, {
      layout: readbackLayout,
      columns: this.columns,
      rows: this.rows,
      terminalGlyphStyle: this.terminalGlyphStyle,
      terminalEdgeBias: this.terminalEdgeBias,
      backgroundColor,
    });
    return submission.grid;
  }

  private consumeDeferredAnsiGrid(): ThreeAsciiDeferredReadbackConsumeResult {
    let completed: ThreeAsciiDeferredReadbackConsumeResult;
    try {
      completed = this.deferredReadbacks.consumeCompleted(
        (pending) => this.buildAnsiGridFromMappedReadback(pending),
        (error) => new ThreeAsciiReadbackError(error),
      );
    } catch (error) {
      const failure = handleThreeAsciiDeferredReadbackFailure(error, ThreeAsciiReadbackError, this.deferredReadbacks);
      if (failure.handled) {
        this.lastReadbackMs = 0;
        return failure.result!;
      }
      throw error;
    }
    if (completed.readbackMs !== undefined) {
      this.lastReadbackMs = completed.readbackMs;
    }
    return completed;
  }

  private copyReadbackCommands(
    commandEncoder: GPUCommandEncoder,
    readbackCopyPlan: ReturnType<ThreeAsciiReadbackCopyPlanCache["resolve"]>,
    readback: ThreeAsciiGpuBufferSlot<GPUBuffer> | undefined,
  ): void {
    writeThreeAsciiReadbackCopySourceSlots(
      this.readbackCopySourceSlots,
      this.fillOutput,
      this.edgeOutput,
      this.colorOutput!,
    );
    writeThreeAsciiReadbackCopySources(this.readbackCopySources, this.readbackCopySourceSlots);
    executeThreeAsciiReadbackCopyPlan(
      commandEncoder,
      readbackCopyPlan,
      this.readbackCopySources,
      readback,
    );
  }

  private computePipelineForPass(kind: "fill" | "edge" | "color"): GPUComputePipeline {
    switch (kind) {
      case "fill":
        return this.fillPipeline!;
      case "edge":
        return this.edgePipeline!;
      case "color":
        return this.colorPipeline!;
    }
  }

  private computeBindGroupForPass(kind: "fill" | "edge" | "color"): GPUBindGroup {
    switch (kind) {
      case "fill":
        return this.fillBindGroup!;
      case "edge":
        return this.edgeBindGroup!;
      case "color":
        return this.colorBindGroup!;
    }
  }

  destroy(): void {
    this.fillOutput = destroyThreeAsciiGpuBufferSlot(this.fillOutput);
    this.edgeOutput = destroyThreeAsciiGpuBufferSlot(this.edgeOutput);
    this.colorOutput = destroyThreeAsciiGpuBufferSlot(this.colorOutput);
    this.outputReadback = destroyThreeAsciiGpuBufferSlot(this.outputReadback);
    this.deferredReadbacks.destroy();
    this.paramsBuffer?.destroy();
    this.paramsBuffer = undefined;
    this.readbackLayoutCache.clear();
    this.readbackCopyPlanCache.clear();
    this.readbackViewCache.clear();
    this.dispatchPlanCache.clear();

    this.renderPipeline?.dispose();
    this.renderPipeline = undefined;

    this.asciiNode?.dispose();
    this.asciiNode = undefined;
    this.ansiGridAssembler.clear();

    this.renderer?.setAnimationLoop?.(null);
    this.renderer?.dispose();
    this.renderer = undefined;
    this.device = undefined;
    this.canvas.context.destroy();
  }

  private async initInternal(): Promise<void> {
    const lutsPromise = loadAsciiLutTextures(
      new URL("./assets/edgesASCII.png", import.meta.url),
      new URL("./assets/fillASCII.png", import.meta.url),
    );
    const device = await getCompatibleWebGPUDevice();
    const renderer = new WebGPURenderer({
      alpha: false,
      antialias: false,
      canvas: this.canvas as unknown as WebGPURendererCanvas,
      context: this.canvas.getContext("webgpu") as WebGPURendererContext,
      device,
    }) as ThreeBackendRenderer;

    renderer.setPixelRatio(1);
    renderer.setSize(THREE_ASCII_TILE_SIZE, THREE_ASCII_TILE_SIZE);
    await renderer.init();

    const scenePass = pass(this.scene, this.camera);
    const luts = await lutsPromise;

    const asciiNode = new AcerolaAsciiNode(
      scenePass.getTextureNode(),
      scenePass.getTextureNode("depth"),
      this.camera,
      luts,
      this.effectOptions,
    );

    this.device = device;
    this.renderer = renderer;
    this.asciiNode = asciiNode;
    this.renderPipeline = new RenderPipeline(renderer, asciiNode);

    this.applySize();
  }

  private applySize(): void {
    if (!this.renderer || !this.sizeDirty) {
      return;
    }

    const width = this.columns * THREE_ASCII_TILE_SIZE;
    const height = this.rows * THREE_ASCII_TILE_SIZE;
    this.renderer.setSize(width, height);
    this.asciiNode?.setSize(width, height);
    this.sizeDirty = false;
    this.computeDirty = true;
  }

  private updateCameraAspect(): void {
    if (!(this.camera instanceof PerspectiveCamera)) {
      return;
    }

    const aspect = computeThreeAsciiCameraAspect({
      columns: this.columns,
      rows: this.rows,
      pixelAspectRatio: this.pixelAspectRatio,
    });

    if (shouldUpdateThreeAsciiCameraAspect(this.camera.aspect, aspect)) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
  }

  private ensureComputeResources(
    effectState: ThreeAsciiEffectState,
    includeTerminalFill = true,
    includeTerminalEdges = effectState.edges,
    includeTerminalDepthColor = effectState.depthFalloff > 0,
  ): void {
    if (!this.device || !this.renderer || !this.asciiNode) {
      throw new Error("ThreeAsciiRenderer has not been initialized.");
    }

    if (includeTerminalFill && !this.fillPipeline) {
      this.fillPipeline = createThreeAsciiComputePipeline({
        device: this.device,
        label: "deno_tui.three_ascii.fill",
        code: THREE_ASCII_FILL_SHADER,
      });
    }

    if (!this.colorFlatPipeline) {
      this.colorFlatPipeline = createThreeAsciiComputePipeline({
        device: this.device,
        label: "deno_tui.three_ascii.color.flat",
        code: THREE_ASCII_FLAT_COLOR_SHADER,
      });
    }

    if (includeTerminalDepthColor && !this.colorDepthPipeline) {
      this.colorDepthPipeline = createThreeAsciiComputePipeline({
        device: this.device,
        label: "deno_tui.three_ascii.color.depth",
        code: THREE_ASCII_COLOR_SHADER,
      });
    }
    this.colorPipeline = includeTerminalDepthColor ? this.colorDepthPipeline! : this.colorFlatPipeline!;

    if (includeTerminalEdges && !this.edgePipeline) {
      this.edgePipeline = createThreeAsciiComputePipeline({
        device: this.device,
        label: "deno_tui.three_ascii.edge",
        code: THREE_ASCII_EDGE_SHADER,
      });
    }

    if (!this.paramsBuffer) {
      this.paramsBuffer = this.device.createBuffer({
        label: "deno_tui.three_ascii.params",
        size: this.uniformValues.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.uniformDirty = true;
    }

    this.computeResourcePlanInput.columns = this.columns;
    this.computeResourcePlanInput.rows = this.rows;
    this.computeResourcePlanInput.includeFill = includeTerminalFill;
    this.computeResourcePlanInput.includeEdges = includeTerminalEdges;
    this.computeResourcePlanInput.includeDepthColor = includeTerminalDepthColor;
    this.computeResourcePlanInput.currentCellCount = this.outputCellCount;
    this.computeResourcePlanInput.hasFillOutput = this.fillOutput !== undefined;
    this.computeResourcePlanInput.hasFillBindGroup = this.fillBindGroup !== undefined;
    this.computeResourcePlanInput.hasEdgeOutput = this.edgeOutput !== undefined;
    this.computeResourcePlanInput.hasEdgeBindGroup = this.edgeBindGroup !== undefined;
    this.computeResourcePlanInput.hasDepthColorBindGroup = this.colorUsesDepthTexture;
    const resourcePlan = createThreeAsciiComputeResourcePlan(this.computeResourcePlanInput);
    if (resourcePlan.resizeOutputs) {
      this.colorOutput = this.ensureStorageBufferSlot(
        this.colorOutput,
        resourcePlan.colorByteLength,
        "color",
      );
    }

    if (resourcePlan.ensureFillOutput) {
      this.fillOutput = this.ensureStorageBufferSlot(
        this.fillOutput,
        resourcePlan.fillByteLength,
        "fill",
      );
    } else if (resourcePlan.releaseFillOutput) {
      this.fillOutput = destroyThreeAsciiGpuBufferSlot(this.fillOutput);
    }

    if (resourcePlan.ensureEdgeOutput) {
      this.edgeOutput = this.ensureStorageBufferSlot(
        this.edgeOutput,
        resourcePlan.edgeByteLength,
        "edge",
      );
    } else if (resourcePlan.releaseEdgeOutput) {
      this.edgeOutput = destroyThreeAsciiGpuBufferSlot(this.edgeOutput);
    }

    const resourceState = applyThreeAsciiComputeResourcePlanState({
      currentCellCount: this.outputCellCount,
      computeDirty: this.computeDirty,
    }, resourcePlan);
    this.outputCellCount = resourceState.outputCellCount;
    this.computeDirty = resourceState.computeDirty;
    if (resourceState.clearFillBindGroup) {
      this.fillBindGroup = undefined;
    }
    if (resourceState.clearEdgeBindGroup) {
      this.edgeBindGroup = undefined;
    }

    if (!this.computeDirty) {
      return;
    }
    this.colorUsesDepthTexture = includeTerminalDepthColor;

    const bindGroups = createThreeAsciiComputeBindGroups({
      device: this.device,
      paramsBuffer: this.paramsBuffer,
      fillPipeline: this.fillPipeline!,
      edgePipeline: this.edgePipeline,
      colorPipeline: this.colorPipeline!,
      fillOutput: this.fillOutput?.gpu,
      edgeOutput: this.edgeOutput?.gpu,
      colorOutput: this.colorOutput!.gpu,
      downscaleTexture: this.getGpuTexture(this.asciiNode.downscaleTarget.texture),
      sobelTexture: includeTerminalEdges ? this.getGpuTexture(this.asciiNode.sobelTarget.texture) : undefined,
      normalsTexture: includeTerminalDepthColor ? this.getGpuTexture(this.asciiNode.normalsTarget.texture) : undefined,
      includeFill: includeTerminalFill,
      includeEdges: includeTerminalEdges,
      colorUsesDepthTexture: includeTerminalDepthColor,
    });
    this.fillBindGroup = bindGroups.fillBindGroup;
    this.edgeBindGroup = bindGroups.edgeBindGroup;
    this.colorBindGroup = bindGroups.colorBindGroup;

    this.computeDirty = false;
  }

  private getEffectState(): ThreeAsciiEffectState {
    return threeAsciiEffectStateFromSource(this.asciiNode, this.effectOptions);
  }

  private writeUniforms(effectState: ThreeAsciiEffectState): void {
    if (!this.uniformDirty) {
      return;
    }

    writeThreeAsciiUniformValues(this.uniformValues, {
      columns: this.columns,
      rows: this.rows,
      tileSize: THREE_ASCII_TILE_SIZE,
      terminalEdgeBias: this.terminalEdgeBias,
      terminalEdgeThresholdScale: THREE_ASCII_TERMINAL_EDGE_THRESHOLD_SCALE,
      effectState,
    });

    this.device!.queue.writeBuffer(this.paramsBuffer!, 0, this.uniformValues);
    this.uniformDirty = false;
  }

  private getGpuTexture(texture: unknown): GPUTexture {
    const textureData = this.renderer!.backend.get(texture);

    if (!textureData.texture) {
      throw new Error("Three.js did not expose a GPU texture for the requested render target.");
    }

    return textureData.texture;
  }

  private ensureStorageBufferSlot(
    current: ThreeAsciiGpuBufferSlot<GPUBuffer> | undefined,
    byteLength: number,
    label: string,
  ): ThreeAsciiGpuBufferSlot<GPUBuffer> {
    return ensureThreeAsciiGpuBufferSlot(this.device!, current, {
      label: `deno_tui.three_ascii.${label}.storage`,
      byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
  }

  private ensureReadbackBuffer(
    current: ThreeAsciiGpuBufferSlot<GPUBuffer> | undefined,
    byteLength: number,
  ): ThreeAsciiGpuBufferSlot<GPUBuffer> {
    return ensureThreeAsciiGpuBufferSlot(this.device!, current, {
      label: "deno_tui.three_ascii.output.readback",
      byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }

  private buildAnsiGridFromMappedReadback(pending: ThreeAsciiDeferredReadbackFrame<GPUBuffer>): string[][] {
    const assembly = assembleThreeAsciiReadbackGridWithContext(this.readbackAssemblyContext, {
      source: pending.slot.gpu.getMappedRange(),
      layout: pending.layout,
      columns: pending.columns,
      rows: pending.rows,
      terminalGlyphStyle: pending.terminalGlyphStyle,
      terminalEdgeBias: pending.terminalEdgeBias,
      backgroundColor: pending.backgroundColor,
    });
    this.gridRevision += 1;
    this.lastAssemblyMs = assembly.assemblyMs;
    return assembly.grid;
  }

  private async buildAnsiGridFromReadback(
    layout: ThreeAsciiReadbackLayout,
    backgroundColor: Color,
  ): Promise<string[][]> {
    const readback = this.outputReadback;
    if (
      !readback || (layout.includeFill && !this.fillOutput) || !this.colorOutput ||
      (layout.edgeOffset !== undefined && !this.edgeOutput)
    ) {
      throw new Error("ThreeAsciiRenderer readback buffers have not been initialized.");
    }

    const mapped = await withThreeAsciiMappedReadback(readback.gpu, {
      mapModeRead: GPUMapMode.READ,
      mapError: (error) => new ThreeAsciiReadbackError(error),
      read: (source) =>
        assembleThreeAsciiReadbackGridWithContext(this.readbackAssemblyContext, {
          source,
          layout,
          columns: this.columns,
          rows: this.rows,
          terminalGlyphStyle: this.terminalGlyphStyle,
          terminalEdgeBias: this.terminalEdgeBias,
          backgroundColor,
        }),
    });
    this.gridRevision += 1;
    this.lastReadbackMs = mapped.readbackMs;
    this.lastAssemblyMs = mapped.value.assemblyMs;
    return mapped.value.grid;
  }
}
