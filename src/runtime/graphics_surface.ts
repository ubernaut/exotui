import { runtimeHost } from "./host.ts";
// Copyright 2023 Im-Beast. MIT license.
import {
  createKittyGraphicsDeleteCommand,
  createKittyGraphicsTransmitCommands,
  detectKittyGraphicsCapability,
  encodeKittyGraphicsCommand,
  type KittyGraphicsCapability,
  type KittyGraphicsDetectionOptions,
  type KittyGraphicsFormat,
  type KittyGraphicsMode,
  type KittyGraphicsTransmitOptions,
  wrapKittyGraphicsForTmux,
} from "./kitty_graphics.ts";
import type { DiagnosticsCollector } from "./diagnostics.ts";

/** Terminal or browser graphics surface kind. */
export type GraphicsSurfaceKind = "browser-canvas" | "iterm2" | "kitty" | "none" | "sixel";

/** Encoding used for an image payload passed to a graphics surface. */
export type GraphicsImageEncoding = "base64" | "bytes" | "utf8";

/** Delete scope for a graphics handle. */
export type GraphicsDeleteMode = "all" | "image" | "placement";

/** Scope for clearing a graphics surface. */
export type GraphicsClearScope = "all" | "visible";

/** Image payload passed to a graphics surface. */
export interface GraphicsImage {
  data: Uint8Array | string;
  encoding?: GraphicsImageEncoding;
  format?: KittyGraphicsFormat;
  pixelWidth?: number;
  pixelHeight?: number;
}

/** Placement of an image in terminal cells. */
export interface GraphicsPlacement {
  column: number;
  row: number;
  width: number;
  height: number;
  zIndex?: number;
}

/** Handle returned after an image has been placed. */
export interface GraphicsHandle {
  id: string;
  kind: GraphicsSurfaceKind;
  imageId: number;
  placementId: number;
  placement: GraphicsPlacement;
}

/** Serializable snapshot for a graphics surface. */
export interface GraphicsSurfaceInspection {
  kind: GraphicsSurfaceKind;
  available: boolean;
  handles: GraphicsHandle[];
  commandCount: number;
  mode?: string;
  reason?: string;
}

/** Minimal async writer used by command-based graphics surfaces. */
export interface GraphicsSurfaceWriter {
  write(data: string): void | Promise<void>;
}

/** Renderer-neutral graphics surface API for raster-capable terminals and browser renderers. */
export interface GraphicsSurface {
  readonly kind: GraphicsSurfaceKind;
  putImage(image: GraphicsImage, placement: GraphicsPlacement): Promise<GraphicsHandle>;
  moveImage(handle: GraphicsHandle, placement: GraphicsPlacement): Promise<void>;
  deleteImage(handle: GraphicsHandle, mode?: GraphicsDeleteMode): Promise<void>;
  clear(scope?: GraphicsClearScope): Promise<void>;
  inspect(): GraphicsSurfaceInspection;
}

/** Options for configuring a Kitty graphics command surface. */
export interface KittyGraphicsSurfaceOptions {
  writer: GraphicsSurfaceWriter;
  capability?: KittyGraphicsCapability;
  detection?: KittyGraphicsDetectionOptions;
  diagnostics?: DiagnosticsCollector;
  mode?: KittyGraphicsMode;
  quiet?: KittyGraphicsTransmitOptions["quiet"];
  maxChunkBytes?: number;
  imageIdStart?: number;
  placementIdStart?: number;
  force?: boolean;
}

/** Result from probing tmux allow-passthrough support for Kitty graphics. */
export interface TmuxPassthroughProbeResult {
  success: boolean;
  stdout: Uint8Array;
}

/** Options for detecting whether tmux allows Kitty graphics passthrough. */
export interface DetectTmuxPassthroughOptions {
  tmux?: string | null;
  command?: () => Promise<TmuxPassthroughProbeResult>;
  decoder?: TextDecoder;
}

/** Options for constructing paired Workbench Kitty graphics surfaces. */
export interface WorkbenchKittyGraphicsControllerOptions {
  writer: GraphicsSurfaceWriter;
  diagnostics?: DiagnosticsCollector;
  capability?: KittyGraphicsCapability;
  tmux?: string | null;
  tmuxPassthroughAllowed: boolean;
}

/** Options for async Workbench Kitty graphics controller creation. */
export interface CreateWorkbenchKittyGraphicsControllerOptions
  extends Omit<WorkbenchKittyGraphicsControllerOptions, "tmuxPassthroughAllowed"> {
  command?: DetectTmuxPassthroughOptions["command"];
}

/** User-facing Kitty graphics selection state. */
export interface WorkbenchKittyGraphicsSelection {
  kittyGraphics?: boolean;
}

/** Inputs for rendering Workbench Kitty graphics availability status text. */
export interface WorkbenchKittyGraphicsStatusOptions {
  selected: WorkbenchKittyGraphicsSelection;
  tmux?: string | null;
  tmuxPassthroughAllowed: boolean;
  surface: GraphicsSurfaceInspection;
}

/** No-op graphics surface used when raster terminal graphics are unavailable. */
export class NoopGraphicsSurface implements GraphicsSurface {
  readonly kind = "none" as const;
  readonly #handles = new Map<string, GraphicsHandle>();
  #nextImageId = 1;
  #nextPlacementId = 1;
  #commandCount = 0;

  putImage(_image: GraphicsImage, placement: GraphicsPlacement): Promise<GraphicsHandle> {
    const handle = createGraphicsHandle(this.kind, this.#nextImageId++, this.#nextPlacementId++, placement);
    this.#handles.set(handle.id, handle);
    return Promise.resolve(handle);
  }

  moveImage(handle: GraphicsHandle, placement: GraphicsPlacement): Promise<void> {
    const current = this.#handles.get(handle.id);
    if (!current) return Promise.resolve();
    this.#handles.set(handle.id, { ...current, placement: normalizePlacement(placement) });
    return Promise.resolve();
  }

  deleteImage(handle: GraphicsHandle): Promise<void> {
    this.#handles.delete(handle.id);
    this.#commandCount += 1;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    if (this.#handles.size > 0) this.#commandCount += 1;
    this.#handles.clear();
    return Promise.resolve();
  }

  inspect(): GraphicsSurfaceInspection {
    return {
      kind: this.kind,
      available: false,
      handles: [...this.#handles.values()],
      commandCount: this.#commandCount,
      mode: "disabled",
      reason: "Raster graphics surface is unavailable.",
    };
  }
}

/** Kitty graphics command surface backed by an injectable writer. */
export class KittyGraphicsSurface implements GraphicsSurface {
  readonly kind = "kitty" as const;
  readonly capability: KittyGraphicsCapability;
  readonly #writer: GraphicsSurfaceWriter;
  readonly #quiet: KittyGraphicsTransmitOptions["quiet"];
  readonly #maxChunkBytes?: number;
  readonly #handles = new Map<string, GraphicsHandle>();
  #nextImageId: number;
  #nextPlacementId: number;
  #commandCount = 0;

  constructor(options: KittyGraphicsSurfaceOptions) {
    this.#writer = options.writer;
    this.capability = options.capability ??
      detectKittyGraphicsCapability({
        ...options.detection,
        force: options.force ?? options.detection?.force,
      });
    this.#quiet = options.quiet;
    this.#maxChunkBytes = options.maxChunkBytes;
    this.#nextImageId = options.imageIdStart ?? 1;
    this.#nextPlacementId = options.placementIdStart ?? 1;
  }

  async putImage(image: GraphicsImage, placement: GraphicsPlacement): Promise<GraphicsHandle> {
    const handle = createGraphicsHandle(this.kind, this.#nextImageId++, this.#nextPlacementId++, placement);
    const commands = createKittyGraphicsTransmitCommands({
      data: image.data,
      payloadEncoding: image.encoding,
      display: true,
      format: image.format,
      medium: "d",
      imageId: handle.imageId,
      placementId: handle.placementId,
      columns: handle.placement.width,
      rows: handle.placement.height,
      pixelWidth: image.pixelWidth,
      pixelHeight: image.pixelHeight,
      zIndex: handle.placement.zIndex,
      quiet: this.#quiet,
      maxChunkBytes: this.#maxChunkBytes,
    });
    await this.#writeAt(handle.placement, commands);
    this.#handles.set(handle.id, handle);
    return handle;
  }

  async moveImage(handle: GraphicsHandle, placement: GraphicsPlacement): Promise<void> {
    const current = this.#handles.get(handle.id);
    if (!current) return;
    const next = { ...current, placement: normalizePlacement(placement) };
    await this.deleteImage(current, "placement");
    const put = encodeKittyGraphicsCommand({
      control: {
        a: "p",
        i: next.imageId,
        p: next.placementId,
        c: next.placement.width,
        r: next.placement.height,
        z: next.placement.zIndex,
        q: this.#quiet,
      },
    });
    await this.#writeAt(next.placement, [put]);
    this.#handles.set(next.id, next);
  }

  async deleteImage(handle: GraphicsHandle, mode: GraphicsDeleteMode = "placement"): Promise<void> {
    const deleteMode = mode === "all" ? "a" : mode === "image" ? "I" : "i";
    await this.#write(createKittyGraphicsDeleteCommand({
      mode: deleteMode,
      imageId: mode === "all" ? undefined : handle.imageId,
      placementId: mode === "placement" ? handle.placementId : undefined,
      quiet: this.#quiet,
    }));
    if (mode === "all" || mode === "image" || mode === "placement") {
      this.#handles.delete(handle.id);
    }
  }

  async clear(scope: GraphicsClearScope = "visible"): Promise<void> {
    await this.#write(createKittyGraphicsDeleteCommand({ mode: scope === "all" ? "A" : "a", quiet: this.#quiet }));
    this.#handles.clear();
  }

  inspect(): GraphicsSurfaceInspection {
    return {
      kind: this.kind,
      available: this.capability.supported,
      handles: [...this.#handles.values()],
      commandCount: this.#commandCount,
      mode: this.capability.mode,
      reason: this.capability.reason,
    };
  }

  async #writeAt(placement: GraphicsPlacement, commands: readonly string[]): Promise<void> {
    for (const command of commands) {
      await this.#write(`${cursorMove(placement.row, placement.column)}${command}`);
    }
  }

  async #write(sequence: string): Promise<void> {
    const output = this.capability.mode === "tmux-passthrough" ? wrapKittyGraphicsForTmux(sequence) : sequence;
    this.#commandCount += 1;
    await this.#writer.write(output);
  }
}

/** Creates a no-op graphics surface. */
export function createNoopGraphicsSurface(): NoopGraphicsSurface {
  return new NoopGraphicsSurface();
}

/** Creates a Kitty graphics surface when supported, otherwise a no-op surface. */
export function createKittyGraphicsSurface(options: KittyGraphicsSurfaceOptions): GraphicsSurface {
  const surface = new KittyGraphicsSurface(options);
  if (surface.capability.supported) return surface;
  options.diagnostics?.report({
    source: "graphics",
    code: "kitty-unavailable",
    severity: "warning",
    message: "Kitty graphics unavailable; using no-op raster surface.",
    detail: surface.capability.reason,
    context: {
      mode: surface.capability.mode,
      term: surface.capability.term,
      termProgram: surface.capability.termProgram,
      multiplexer: surface.capability.multiplexer,
      remote: surface.capability.remote,
    },
  });
  return new NoopGraphicsSurface();
}

/** Detects whether the current tmux session permits Kitty graphics passthrough. */
export async function detectTmuxPassthroughAllowed(options: DetectTmuxPassthroughOptions = {}): Promise<boolean> {
  const tmux = options.tmux ?? runtimeHost.env.get("TMUX");
  if (!tmux) return true;

  try {
    const output = await (options.command ?? defaultTmuxPassthroughCommand)();
    if (!output.success) return false;
    const value = (options.decoder ?? new TextDecoder()).decode(output.stdout).trim().toLowerCase();
    return value === "on" || value === "all" || value === "1" || value === "yes";
  } catch {
    return false;
  }
}

/** Owns paired auto and forced Kitty graphics surfaces for interactive workbench renderers. */
export class WorkbenchKittyGraphicsController {
  readonly tmux: string | null;
  readonly tmuxPassthroughAllowed: boolean;
  readonly autoSurface: GraphicsSurface;
  readonly forcedSurface: GraphicsSurface;

  static async create(
    options: CreateWorkbenchKittyGraphicsControllerOptions,
  ): Promise<WorkbenchKittyGraphicsController> {
    const tmux = options.tmux ?? runtimeHost.env.get("TMUX") ?? null;
    const tmuxPassthroughAllowed = await detectTmuxPassthroughAllowed({ tmux, command: options.command });
    return new WorkbenchKittyGraphicsController({ ...options, tmux, tmuxPassthroughAllowed });
  }

  constructor(options: WorkbenchKittyGraphicsControllerOptions) {
    this.tmux = options.tmux ?? null;
    this.tmuxPassthroughAllowed = options.tmuxPassthroughAllowed;
    this.autoSurface = this.createSurface(options, false);
    this.forcedSurface = this.createSurface(options, true);
  }

  surfaceFor(options: WorkbenchKittyGraphicsSelection): GraphicsSurface {
    return options.kittyGraphics ? this.forcedSurface : this.autoSurface;
  }

  async clear(scope: GraphicsClearScope = "visible"): Promise<void> {
    await Promise.all([
      this.autoSurface.clear(scope),
      this.forcedSurface.clear(scope),
    ]);
  }

  private createSurface(options: WorkbenchKittyGraphicsControllerOptions, force: boolean): GraphicsSurface {
    const canForce = force && (!this.tmux || this.tmuxPassthroughAllowed);
    return createKittyGraphicsSurface({
      writer: options.writer,
      capability: options.capability,
      detection: canForce && this.tmux ? { tmuxPassthrough: true } : undefined,
      force: canForce,
      quiet: 2,
      maxChunkBytes: 16384,
      diagnostics: options.diagnostics,
    });
  }
}

/** Formats the status suffix shown beside the Kitty graphics checkbox. */
export function formatWorkbenchKittyGraphicsStatus(options: WorkbenchKittyGraphicsStatusOptions): string {
  if (options.selected.kittyGraphics && options.tmux && !options.tmuxPassthroughAllowed) {
    return "[unavailable: tmux allow-passthrough off]";
  }
  if (options.surface.available) return `[${options.surface.mode ?? "available"}]`;
  return `[unavailable: ${options.surface.reason ?? "not detected"}]`;
}

function createGraphicsHandle(
  kind: GraphicsSurfaceKind,
  imageId: number,
  placementId: number,
  placement: GraphicsPlacement,
): GraphicsHandle {
  return {
    id: `${kind}:${imageId}:${placementId}`,
    kind,
    imageId,
    placementId,
    placement: normalizePlacement(placement),
  };
}

function normalizePlacement(placement: GraphicsPlacement): GraphicsPlacement {
  const normalized: GraphicsPlacement = {
    column: Math.max(0, Math.floor(placement.column)),
    row: Math.max(0, Math.floor(placement.row)),
    width: Math.max(1, Math.floor(placement.width)),
    height: Math.max(1, Math.floor(placement.height)),
  };
  if (placement.zIndex !== undefined) normalized.zIndex = placement.zIndex;
  return normalized;
}

function cursorMove(row: number, column: number): string {
  return `\x1b[${Math.max(1, Math.floor(row) + 1)};${Math.max(1, Math.floor(column) + 1)}H`;
}

async function defaultTmuxPassthroughCommand(): Promise<TmuxPassthroughProbeResult> {
  return await new runtimeHost.Command("tmux", {
    args: ["show-options", "-gqv", "allow-passthrough"],
  }).output();
}
