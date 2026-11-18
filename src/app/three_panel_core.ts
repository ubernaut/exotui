import type { DiagnosticInput, DiagnosticsCollector } from "../runtime/diagnostics.ts";
import type { GraphicsHandle, GraphicsSurface, GraphicsSurfaceInspection } from "../runtime/graphics_surface.ts";
import type { TerminalGlyphStyle } from "../three_ascii/glyphs.ts";
import type { ThreeAsciiImageFrame, ThreeAsciiRendererPerformance } from "../three_ascii/renderer.ts";

export interface ThreePanelValueSignal<T> {
  peek(): T;
}

export interface ThreePanelGraphicsRect {
  column: number;
  row: number;
  width: number;
  height: number;
}

export interface ThreePanelInteractionState {
  rotationX: number;
  rotationY: number;
  zoom: number;
}

interface ThreePanelVectorLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  clone(): ThreePanelVectorLike;
  copy(value: ThreePanelVectorLike): this;
  multiplyScalar(value: number): this;
}

interface ThreePanelQuaternionLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
  clone(): ThreePanelQuaternionLike;
  copy(value: ThreePanelQuaternionLike): this;
}

interface ThreePanelEulerLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly order: string;
  clone(): ThreePanelEulerLike;
  set(x: number, y: number, z: number, order?: string): this;
}

export interface ThreePanelTransformBundle {
  camera: {
    position: ThreePanelVectorLike;
    quaternion: ThreePanelQuaternionLike;
  };
  scene: {
    rotation: ThreePanelEulerLike;
  };
}

export type ThreePanelResolvableValue<T> = T | ThreePanelValueSignal<T>;
export type ThreePanelResolvableLiveValue = boolean | ThreePanelValueSignal<boolean> | (() => boolean);

export type ThreePanelLifecycleState =
  | "idle"
  | "initializing"
  | "rendering"
  | "resizing"
  | "reconfiguring"
  | "stopping"
  | "failed"
  | "disposed";

export interface ThreePanelLifecycleStateInput {
  disposed: boolean;
  failed: boolean;
  destroyPending: boolean;
  rebuildPending: boolean;
  syncPending: boolean;
  rendering: boolean;
  hasRenderer: boolean;
  visible: boolean;
  gridRows: number;
}

export interface ThreePanelFrameOwnershipInput<TRenderer, TBundle> {
  disposed: boolean;
  currentGeneration: number;
  frameGeneration: number;
  currentRenderer: TRenderer | undefined;
  frameRenderer: TRenderer;
  currentBundle: TBundle | undefined;
  frameBundle: TBundle;
}

export interface ThreePanelCurrentFrameInput<TRenderer, TBundle>
  extends ThreePanelFrameOwnershipInput<TRenderer, TBundle> {
  running: boolean;
}

export interface ThreePanelFrameUpdate {
  rendererBacked: boolean;
  rows: number;
  columns: number;
}

export interface ThreePanelGridPublicationInput {
  grid: readonly (readonly string[] | undefined)[];
  currentGrid?: readonly (readonly string[] | undefined)[];
  forceUpdate?: boolean;
  revision?: number;
}

export interface ThreePanelGridPublishRequest {
  grid: string[][];
  currentGrid?: readonly (readonly string[] | undefined)[];
  rendererBacked?: boolean;
  revision?: number;
}

export interface ThreePanelGridPublishDecision {
  publish: boolean;
  grid: string[][];
  rendererBacked: boolean;
}

export interface ThreePanelAsciiEffectOptions {
  edgeThreshold?: number;
  normalThreshold?: number;
  depthThreshold?: number;
  exposure?: number;
  attenuation?: number;
  blendWithBase?: number;
  depthFalloff?: number;
  depthOffset?: number;
  edges?: boolean;
  fill?: boolean;
  invertLuminance?: boolean;
}

export interface ThreePanelRendererStateSnapshot {
  columns: number;
  rows: number;
  effectOptions?: ThreePanelAsciiEffectOptions;
  terminalEdgeBias?: number;
  terminalGlyphStyle?: TerminalGlyphStyle;
}

export interface ThreePanelRendererStateUpdate {
  next: ThreePanelRendererStateSnapshot;
  resize: boolean;
  effect: boolean;
  terminalEdgeBias: boolean;
  terminalGlyphStyle: boolean;
  changed: boolean;
}

export interface ThreePanelAdaptiveDiagnosticOptions {
  direction: "down" | "up" | "steady";
  maxCells: number;
  requestedMaxCells: number;
  frameMs: number;
  targetMs: number;
}

export interface ThreePanelGraphicsFallbackReasonOptions {
  inspection?: GraphicsSurfaceInspection;
  rect: Pick<{ width: number; height: number }, "width" | "height">;
  rendererSupportsImage: boolean;
}

export interface ThreePanelGraphicsFallbackDiagnosticOptions extends ThreePanelGraphicsFallbackReasonOptions {
  kittyDisableAscii: boolean;
}

export interface ThreePanelRenderQueueInspection {
  running: number;
  pending: number;
  scheduled: number;
  completed: number;
  failed: number;
}

/** Serializes expensive Three panel frame work so WebGPU readbacks do not compete across panes. */
export class ThreePanelRenderQueue {
  #tail: Promise<void> = Promise.resolve();
  #running = 0;
  #pending = 0;
  #scheduled = 0;
  #completed = 0;
  #failed = 0;

  run<T>(task: () => T | Promise<T>): Promise<T> {
    this.#pending += 1;
    this.#scheduled += 1;

    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    return previous
      .catch(() => undefined)
      .then(async () => {
        this.#pending -= 1;
        this.#running += 1;
        try {
          const value = await task();
          this.#completed += 1;
          return value;
        } catch (error) {
          this.#failed += 1;
          throw error;
        } finally {
          this.#running -= 1;
          release();
        }
      });
  }

  inspect(): ThreePanelRenderQueueInspection {
    return {
      running: this.#running,
      pending: this.#pending,
      scheduled: this.#scheduled,
      completed: this.#completed,
      failed: this.#failed,
    };
  }
}

export const defaultThreePanelRenderQueue = new ThreePanelRenderQueue();

const minThreePanelInteractionZoom = 0.35;
const maxThreePanelInteractionZoom = 3.25;
const threePanelInteractionZoomStep = 1.14;
const threePanelInteractionRotationSensitivity = 0.035;

export function defaultThreePanelInteractionState(): ThreePanelInteractionState {
  return { rotationX: 0, rotationY: 0, zoom: 1 };
}

/** Tracks user-driven Three panel rotation and zoom independently from a concrete renderer implementation. */
export class ThreePanelInteractionController {
  readonly state = defaultThreePanelInteractionState();
  private baseCameraPosition?: ThreePanelVectorLike;
  private baseCameraQuaternion?: ThreePanelQuaternionLike;
  private baseSceneRotation?: ThreePanelEulerLike;

  rotateBy(deltaColumns: number, deltaRows: number): ThreePanelInteractionState {
    if (deltaColumns === 0 && deltaRows === 0) return this.inspect();
    this.state.rotationY = normalizeThreePanelRadians(
      this.state.rotationY + deltaColumns * threePanelInteractionRotationSensitivity,
    );
    this.state.rotationX = clampThreePanelNumber(
      this.state.rotationX + deltaRows * threePanelInteractionRotationSensitivity,
      -Math.PI,
      Math.PI,
    );
    return this.inspect();
  }

  zoomBy(scrollSteps: number): ThreePanelInteractionState {
    if (scrollSteps === 0) return this.inspect();
    this.state.zoom = clampThreePanelNumber(
      this.state.zoom * Math.pow(threePanelInteractionZoomStep, -scrollSteps),
      minThreePanelInteractionZoom,
      maxThreePanelInteractionZoom,
    );
    return this.inspect();
  }

  reset(): ThreePanelInteractionState {
    Object.assign(this.state, defaultThreePanelInteractionState());
    return this.inspect();
  }

  inspect(): ThreePanelInteractionState {
    return { ...this.state };
  }

  captureBaseTransform(bundle: ThreePanelTransformBundle): void {
    this.baseCameraPosition = bundle.camera.position.clone();
    this.baseCameraQuaternion = bundle.camera.quaternion.clone();
    this.baseSceneRotation = bundle.scene.rotation.clone();
  }

  apply(bundle: ThreePanelTransformBundle | undefined): void {
    if (!bundle || !this.baseCameraPosition || !this.baseCameraQuaternion || !this.baseSceneRotation) return;
    const cameraDistanceScale = 1 / this.state.zoom;
    bundle.camera.position.copy(this.baseCameraPosition).multiplyScalar(cameraDistanceScale);
    bundle.camera.quaternion.copy(this.baseCameraQuaternion);
    bundle.scene.rotation.set(
      this.baseSceneRotation.x + this.state.rotationX,
      this.baseSceneRotation.y + this.state.rotationY,
      this.baseSceneRotation.z,
      this.baseSceneRotation.order,
    );
  }

  clearBaseTransform(): void {
    this.baseCameraPosition = undefined;
    this.baseCameraQuaternion = undefined;
    this.baseSceneRotation = undefined;
  }
}

/** Owns the active raster graphics image handle for a workbench-hosted Three panel. */
export class ThreePanelGraphicsImageController {
  private handle?: GraphicsHandle;

  constructor(
    private readonly options: {
      diagnostics?: DiagnosticsCollector;
      currentGeneration: () => number;
      disposed: () => boolean;
    },
  ) {}

  get hasHandle(): boolean {
    return this.handle !== undefined;
  }

  /** Replaces the current image and deletes stale handles if the owning panel generation changes mid-publish. */
  async put(
    surface: GraphicsSurface,
    image: ThreeAsciiImageFrame,
    rect: ThreePanelGraphicsRect,
    frameGeneration: number,
  ): Promise<void> {
    if (this.options.disposed() || rect.width <= 0 || rect.height <= 0) return;
    if (this.handle) {
      await this.delete(surface, this.handle, "replace");
      this.handle = undefined;
    }
    const handle = await surface.putImage({
      data: image.data,
      encoding: image.encoding,
      format: image.format,
      pixelWidth: image.pixelWidth,
      pixelHeight: image.pixelHeight,
    }, {
      column: rect.column,
      row: rect.row,
      width: rect.width,
      height: rect.height,
      zIndex: 1,
    });
    if (this.options.disposed() || this.options.currentGeneration() !== frameGeneration) {
      await this.delete(surface, handle, "stale-frame");
      return;
    }
    this.handle = handle;
  }

  /** Deletes the current image handle if a graphics surface is available. */
  async clear(surface: GraphicsSurface | undefined): Promise<void> {
    const handle = this.handle;
    if (!handle) return;
    this.handle = undefined;
    if (!surface) return;
    await this.delete(surface, handle, "clear");
  }

  private async delete(
    surface: GraphicsSurface,
    handle: GraphicsHandle,
    reason: "replace" | "stale-frame" | "clear",
  ): Promise<void> {
    try {
      await surface.deleteImage(handle, "image");
    } catch (error) {
      this.options.diagnostics?.report({
        source: "three-panel",
        code: "graphics-delete-failed",
        severity: "debug",
        message: "Three panel graphics image cleanup failed",
        detail: error instanceof Error ? error.message : String(error),
        context: {
          reason,
          handleId: handle.id,
          surface: surface.kind,
        },
      });
    }
  }
}

/** Tracks published Three panel grid identity so unchanged renderer frames do not trigger terminal redraws. */
export class ThreePanelGridPublicationCache {
  #fingerprint = "";
  #revision?: number;
  #columns = -1;
  #rows = -1;

  shouldPublish(input: ThreePanelGridPublicationInput): boolean {
    const { grid, currentGrid, forceUpdate = false, revision } = input;
    const rows = grid.length;
    const columns = grid[0]?.length ?? 0;
    if (revision !== undefined) {
      if (this.#revision === revision && this.#rows === rows && this.#columns === columns) return false;
      const fingerprint = fingerprintThreePanelGrid(grid);
      this.#revision = revision;
      this.#rows = rows;
      this.#columns = columns;
      if (this.#fingerprint === fingerprint) return false;
      this.#fingerprint = fingerprint;
      return true;
    }

    this.#revision = undefined;
    const fingerprint = fingerprintThreePanelGrid(grid);
    if (!forceUpdate && currentGrid === grid) return false;
    if (this.#fingerprint === fingerprint) return false;
    this.#fingerprint = fingerprint;
    this.#rows = rows;
    this.#columns = columns;
    return true;
  }

  reset(): void {
    this.#fingerprint = "";
    this.#revision = undefined;
    this.#columns = -1;
    this.#rows = -1;
  }
}

/** Owns reusable Three panel grid buffers and publication filtering. */
export class ThreePanelGridPublisher {
  readonly publication = new ThreePanelGridPublicationCache();
  #blankGridCache: string[][] = [];
  #blankGridColumns = -1;
  #blankGridRows = -1;

  blankGridFor(columns: number, rows: number): string[][] {
    if (this.#blankGridColumns === columns && this.#blankGridRows === rows) return this.#blankGridCache;
    this.#blankGridColumns = columns;
    this.#blankGridRows = rows;
    this.#blankGridCache = threePanelBlankGrid(columns, rows);
    return this.#blankGridCache;
  }

  shouldPublish(input: ThreePanelGridPublishRequest): ThreePanelGridPublishDecision {
    const rendererBacked = input.rendererBacked ?? false;
    return {
      publish: this.publication.shouldPublish({
        grid: input.grid,
        currentGrid: input.currentGrid,
        forceUpdate: rendererBacked,
        revision: input.revision,
      }),
      grid: input.grid,
      rendererBacked,
    };
  }

  reset(): void {
    this.publication.reset();
    this.#blankGridCache = [];
    this.#blankGridColumns = -1;
    this.#blankGridRows = -1;
  }
}

export function resolveThreePanelValue<T>(value: ThreePanelResolvableValue<T>): T {
  return isThreePanelValueSignal(value) ? value.peek() : value;
}

export function resolveOptionalThreePanelValue<T>(
  value: ThreePanelResolvableValue<T> | undefined,
): T | undefined {
  return value === undefined ? undefined : resolveThreePanelValue(value);
}

export function resolveThreePanelLiveValue(value: ThreePanelResolvableLiveValue | undefined): boolean {
  if (value === undefined) return true;
  if (isThreePanelValueSignal(value)) return value.peek();
  if (typeof value === "function") return value();
  return value;
}

export function resolveThreePanelLifecycleState(input: ThreePanelLifecycleStateInput): ThreePanelLifecycleState {
  if (input.disposed) return "disposed";
  if (input.failed) return "failed";
  if (input.rebuildPending) return "reconfiguring";
  if (input.syncPending) return "resizing";
  if (input.destroyPending) return "stopping";
  if (input.rendering) return "rendering";
  if (input.hasRenderer && input.visible && input.gridRows === 0) return "initializing";
  return "idle";
}

export function ownsThreePanelFrame<TRenderer, TBundle>(
  input: ThreePanelFrameOwnershipInput<TRenderer, TBundle>,
): boolean {
  return !input.disposed && input.currentGeneration === input.frameGeneration &&
    input.currentRenderer === input.frameRenderer && input.currentBundle === input.frameBundle;
}

export function isCurrentThreePanelFrame<TRenderer, TBundle>(
  input: ThreePanelCurrentFrameInput<TRenderer, TBundle>,
): boolean {
  return input.running && ownsThreePanelFrame(input);
}

/** Builds the lightweight event payload emitted when a Three panel renders or publishes a grid. */
export function threePanelFrameUpdate(
  grid: readonly (readonly string[] | undefined)[] | undefined,
  rendererBacked: boolean,
): ThreePanelFrameUpdate {
  return {
    rendererBacked,
    rows: grid?.length ?? 0,
    columns: grid?.[0]?.length ?? 0,
  };
}

export function threePanelBlankGrid(width: number, height: number): string[][] {
  const columns = Math.max(0, width);
  const rows = Math.max(0, height);
  const grid = new Array<string[]>(rows);
  for (let row = 0; row < rows; row += 1) {
    const gridRow = new Array<string>(columns);
    for (let column = 0; column < columns; column += 1) {
      gridRow[column] = " ";
    }
    grid[row] = gridRow;
  }
  return grid;
}

export function scaleThreePanelGridToSize(
  grid: readonly (readonly string[] | undefined)[],
  columns: number,
  rows: number,
): string[][] {
  return scaleThreePanelGridToSizeInto([], grid, columns, rows);
}

/** Retained buffers for repeated Three panel grid scaling at stable source and target dimensions. */
export class ThreePanelGridScaleCache {
  readonly target: string[][] = [];
  readonly sourceRowIndexes: number[] = [];
  readonly sourceColumnIndexes: number[] = [];
  #rowIndexKey = "";
  #columnIndexKey = "";

  scale(
    grid: readonly (readonly string[] | undefined)[],
    columns: number,
    rows: number,
  ): string[][] {
    return scaleThreePanelGridToSizeInto(this.target, grid, columns, rows, this);
  }

  reset(): void {
    this.target.length = 0;
    this.sourceRowIndexes.length = 0;
    this.sourceColumnIndexes.length = 0;
    this.#rowIndexKey = "";
    this.#columnIndexKey = "";
  }

  rowIndexes(targetRows: number, sourceRows: number): readonly number[] {
    const key = `${targetRows}:${sourceRows}`;
    if (this.#rowIndexKey === key && this.sourceRowIndexes.length === targetRows) return this.sourceRowIndexes;
    writeThreePanelScaleIndexesInto(this.sourceRowIndexes, targetRows, sourceRows);
    this.#rowIndexKey = key;
    return this.sourceRowIndexes;
  }

  columnIndexes(targetColumns: number, sourceColumns: number): readonly number[] {
    const key = `${targetColumns}:${sourceColumns}`;
    if (this.#columnIndexKey === key && this.sourceColumnIndexes.length === targetColumns) {
      return this.sourceColumnIndexes;
    }
    writeThreePanelScaleIndexesInto(this.sourceColumnIndexes, targetColumns, sourceColumns);
    this.#columnIndexKey = key;
    return this.sourceColumnIndexes;
  }
}

/** Scales a capped Three panel renderer grid into caller-owned storage. */
export function scaleThreePanelGridToSizeInto(
  target: string[][],
  grid: readonly (readonly string[] | undefined)[],
  columns: number,
  rows: number,
  cache?: Pick<ThreePanelGridScaleCache, "rowIndexes" | "columnIndexes">,
): string[][] {
  const targetColumns = Math.max(1, Math.floor(columns));
  const targetRows = Math.max(1, Math.floor(rows));
  const sourceRows = grid.length;
  const sourceColumns = grid[0]?.length ?? 0;
  target.length = targetRows;
  if (sourceRows === targetRows && sourceColumns === targetColumns) {
    for (let row = 0; row < targetRows; row += 1) {
      const source = grid[row] ?? [];
      const targetRow = target[row] ?? [];
      targetRow.length = targetColumns;
      for (let column = 0; column < targetColumns; column += 1) {
        targetRow[column] = source[column] ?? " ";
      }
      target[row] = targetRow;
    }
    return target;
  }
  if (sourceRows <= 0 || sourceColumns <= 0) {
    return threePanelBlankGridInto(target, targetColumns, targetRows);
  }

  if (cache) {
    return scaleThreePanelGridWithIndexesInto(
      target,
      grid,
      targetColumns,
      targetRows,
      cache.rowIndexes(targetRows, sourceRows),
      cache.columnIndexes(targetColumns, sourceColumns),
    );
  }

  let lastSourceRow = -1;
  let lastProjectedRow: string[] | undefined;
  for (let row = 0; row < targetRows; row += 1) {
    const sourceRow = Math.min(sourceRows - 1, Math.floor((row * sourceRows) / targetRows));
    if (sourceRow === lastSourceRow && lastProjectedRow) {
      const targetRow = target[row] ?? [];
      targetRow.length = targetColumns;
      copyThreePanelGridRow(targetRow, lastProjectedRow, targetColumns);
      target[row] = targetRow;
      continue;
    }
    const source = grid[sourceRow] ?? [];
    const targetRow = target[row] ?? [];
    targetRow.length = targetColumns;
    for (let column = 0; column < targetColumns; column += 1) {
      const sourceColumn = Math.min(sourceColumns - 1, Math.floor((column * sourceColumns) / targetColumns));
      targetRow[column] = source[sourceColumn] ?? " ";
    }
    target[row] = targetRow;
    lastSourceRow = sourceRow;
    lastProjectedRow = targetRow;
  }
  return target;
}

function scaleThreePanelGridWithIndexesInto(
  target: string[][],
  grid: readonly (readonly string[] | undefined)[],
  targetColumns: number,
  targetRows: number,
  sourceRowIndexes: readonly number[],
  sourceColumnIndexes: readonly number[],
): string[][] {
  let lastSourceRow = -1;
  let lastProjectedRow: string[] | undefined;
  for (let row = 0; row < targetRows; row += 1) {
    const sourceRow = sourceRowIndexes[row] ?? 0;
    if (sourceRow === lastSourceRow && lastProjectedRow) {
      const targetRow = target[row] ?? [];
      targetRow.length = targetColumns;
      copyThreePanelGridRow(targetRow, lastProjectedRow, targetColumns);
      target[row] = targetRow;
      continue;
    }
    const source = grid[sourceRow] ?? [];
    const targetRow = target[row] ?? [];
    targetRow.length = targetColumns;
    for (let column = 0; column < targetColumns; column += 1) {
      targetRow[column] = source[sourceColumnIndexes[column] ?? 0] ?? " ";
    }
    target[row] = targetRow;
    lastSourceRow = sourceRow;
    lastProjectedRow = targetRow;
  }
  return target;
}

function threePanelBlankGridInto(target: string[][], columns: number, rows: number): string[][] {
  target.length = rows;
  for (let row = 0; row < rows; row += 1) {
    const targetRow = target[row] ?? [];
    targetRow.length = columns;
    for (let column = 0; column < columns; column += 1) {
      targetRow[column] = " ";
    }
    target[row] = targetRow;
  }
  return target;
}

function copyThreePanelGridRow(target: string[], source: readonly string[], columns: number): void {
  for (let column = 0; column < columns; column += 1) {
    target[column] = source[column] ?? " ";
  }
}

function writeThreePanelScaleIndexesInto(target: number[], targetSize: number, sourceSize: number): number[] {
  target.length = targetSize;
  const lastSource = Math.max(0, sourceSize - 1);
  for (let index = 0; index < targetSize; index += 1) {
    target[index] = Math.min(lastSource, Math.floor((index * sourceSize) / targetSize));
  }
  return target;
}

export function fingerprintThreePanelGrid(grid: readonly (readonly string[] | undefined)[]): string {
  let hash = mixThreePanelGridHash(2166136261, grid.length);
  for (const row of grid) {
    const columns = row?.length ?? 0;
    hash = mixThreePanelGridHash(hash, columns);
    if (!row) continue;
    for (const cell of row) {
      hash = mixThreePanelGridHash(hash, cell.length);
      for (let index = 0; index < cell.length; index += 1) {
        hash = mixThreePanelGridHash(hash, cell.charCodeAt(index));
      }
    }
  }
  return `${grid.length}:${hash.toString(36)}`;
}

export function hasThreePanelGridCells(grid: readonly (readonly string[] | undefined)[]): boolean {
  return grid.length > 0 && (grid[0]?.length ?? 0) > 0;
}

export function emptyThreePanelRendererState(): ThreePanelRendererStateSnapshot {
  return {
    columns: 0,
    rows: 0,
  };
}

/** Compare the Three panel ASCII effect fields that require renderer effect updates. */
export function threePanelAsciiEffectOptionsEqual(
  left: ThreePanelAsciiEffectOptions | undefined,
  right: ThreePanelAsciiEffectOptions,
): boolean {
  if (!left) return false;
  return left.edgeThreshold === right.edgeThreshold &&
    left.normalThreshold === right.normalThreshold &&
    left.depthThreshold === right.depthThreshold &&
    left.exposure === right.exposure &&
    left.attenuation === right.attenuation &&
    left.blendWithBase === right.blendWithBase &&
    left.depthFalloff === right.depthFalloff &&
    left.depthOffset === right.depthOffset &&
    left.edges === right.edges &&
    left.fill === right.fill &&
    left.invertLuminance === right.invertLuminance;
}

/** Compare applied and requested renderer state without considering scene signal changes. */
export function threePanelRendererStateMatches(
  current: ThreePanelRendererStateSnapshot,
  next: ThreePanelRendererStateSnapshot,
): boolean {
  return current.columns === next.columns &&
    current.rows === next.rows &&
    next.effectOptions !== undefined &&
    threePanelAsciiEffectOptionsEqual(current.effectOptions, next.effectOptions) &&
    current.terminalEdgeBias === next.terminalEdgeBias &&
    current.terminalGlyphStyle === next.terminalGlyphStyle;
}

export function resolveThreePanelRendererStateUpdate(
  current: ThreePanelRendererStateSnapshot,
  next: ThreePanelRendererStateSnapshot,
): ThreePanelRendererStateUpdate {
  const resize = current.columns !== next.columns || current.rows !== next.rows;
  const effect = next.effectOptions !== undefined &&
    !threePanelAsciiEffectOptionsEqual(current.effectOptions, next.effectOptions);
  const terminalEdgeBias = current.terminalEdgeBias !== next.terminalEdgeBias;
  const terminalGlyphStyle = current.terminalGlyphStyle !== next.terminalGlyphStyle;
  return {
    next,
    resize,
    effect,
    terminalEdgeBias,
    terminalGlyphStyle,
    changed: resize || effect || terminalEdgeBias || terminalGlyphStyle,
  };
}

export function threePanelSlowFrameDiagnostic(performance: ThreeAsciiRendererPerformance): DiagnosticInput {
  return {
    source: "three-panel",
    code: "three-ascii-slow-frame",
    severity: "debug",
    message: `Three ASCII frame ${performance.totalMs.toFixed(1)}ms at ${performance.columns}x${performance.rows}`,
    detail: `init ${performance.initMs.toFixed(1)}ms, scene ${performance.sceneMs.toFixed(1)}ms${
      performance.sceneUpdateMs === undefined ? "" : `, update ${performance.sceneUpdateMs.toFixed(1)}ms`
    }${performance.sceneRenderMs === undefined ? "" : `, render ${performance.sceneRenderMs.toFixed(1)}ms`}, ansi ${
      performance.ansiMs.toFixed(1)
    }ms, readback ${performance.readbackMs.toFixed(1)}ms, assembly ${performance.assemblyMs.toFixed(1)}ms${
      threePanelReadbackQueueDetail(performance)
    }`,
    context: threePanelPerformanceContext(performance),
  };
}

export function threePanelAdaptiveRenderCellsDiagnostic(
  options: ThreePanelAdaptiveDiagnosticOptions,
): DiagnosticInput {
  return {
    source: "three-panel",
    code: "three-ascii-adaptive-render-cells",
    severity: "debug",
    message: `Three ASCII render budget ${
      options.direction === "down" ? "reduced" : "raised"
    } to ${options.maxCells} cells.`,
    detail: `frame ${options.frameMs.toFixed(1)}ms, target ${options.targetMs.toFixed(1)}ms`,
    context: {
      direction: options.direction,
      maxCells: options.maxCells,
      requestedMaxCells: options.requestedMaxCells,
      frameMs: roundTenth(options.frameMs),
      targetMs: roundTenth(options.targetMs),
    },
  };
}

export function threePanelGraphicsFallbackReason(options: ThreePanelGraphicsFallbackReasonOptions): string {
  const inspection = options.inspection;
  if (!inspection) return "missing-surface";
  if (!inspection.available) return inspection.reason ?? "surface-unavailable";
  if (options.rect.width <= 0 || options.rect.height <= 0) return "empty-graphics-rectangle";
  if (!options.rendererSupportsImage) return "renderer-image-frame-unsupported";
  return "inactive";
}

export function threePanelGraphicsFallbackDiagnostic(
  options: ThreePanelGraphicsFallbackDiagnosticOptions,
): DiagnosticInput {
  const reason = threePanelGraphicsFallbackReason(options);
  const inspection = options.inspection;
  return {
    source: "three-panel",
    code: "kitty-graphics-fallback",
    severity: "warning",
    message: "Kitty graphics requested but unavailable; rendering ASCII fallback.",
    detail: inspection?.reason ?? reason,
    context: {
      reason,
      surface: inspection?.kind ?? "none",
      available: inspection?.available ?? false,
      asciiFallback: true,
      kittyDisableAscii: options.kittyDisableAscii,
    },
  };
}

function isThreePanelValueSignal<T>(value: unknown): value is ThreePanelValueSignal<T> {
  return typeof value === "object" && value !== null && typeof (value as { peek?: unknown }).peek === "function";
}

function mixThreePanelGridHash(hash: number, value: number): number {
  return Math.imul((hash ^ value) >>> 0, 16777619) >>> 0;
}

function clampThreePanelNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeThreePanelRadians(value: number): number {
  const full = Math.PI * 2;
  return ((value + Math.PI) % full + full) % full - Math.PI;
}

function threePanelPerformanceContext(performance: ThreeAsciiRendererPerformance): Record<string, unknown> {
  return {
    columns: performance.columns,
    rows: performance.rows,
    cells: performance.cells,
    glyphStyle: performance.terminalGlyphStyle,
    totalMs: roundTenth(performance.totalMs),
    initMs: roundTenth(performance.initMs),
    sceneMs: roundTenth(performance.sceneMs),
    sceneUpdateMs: optionalRoundTenth(performance.sceneUpdateMs),
    sceneRenderMs: optionalRoundTenth(performance.sceneRenderMs),
    ansiMs: roundTenth(performance.ansiMs),
    readbackMs: roundTenth(performance.readbackMs),
    assemblyMs: roundTenth(performance.assemblyMs),
    deferredReadbackSlots: performance.deferredReadbackSlots,
    deferredReadbackPending: performance.deferredReadbackPending,
    deferredReadbackUnresolved: performance.deferredReadbackUnresolved,
    deferredReadbackSaturated: performance.deferredReadbackSaturated,
  };
}

function threePanelReadbackQueueDetail(performance: ThreeAsciiRendererPerformance): string {
  return performance.deferredReadbackSlots
    ? `, queue ${performance.deferredReadbackUnresolved ?? 0}/${performance.deferredReadbackSlots}`
    : "";
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function optionalRoundTenth(value: number | undefined): number | undefined {
  return value === undefined ? undefined : roundTenth(value);
}
