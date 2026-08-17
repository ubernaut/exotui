// Copyright 2023 Im-Beast. MIT license.

// Renderer-neutral GlyphForge controller: the shared showcase kernel owns
// lifecycle and persistence; this controller owns the document, tools,
// atomic stroke history (GLYPH-009 slice: one undo unit per gesture),
// palette/layer/frame selection, and gesture previews.

import { type AsyncStore, DiagnosticsCollector, Signal } from "../../../mod.ts";
import { defineShowcaseManifest, ShowcaseKernel, type ShowcaseProvider } from "../shared/mod.ts";
import {
  applyGlyphEdits,
  compositeGlyphFrame,
  type GlyphCell,
  type GlyphEdit,
  glyphFloodFillEdits,
  GLYPHFORGE_PROJECT_SCHEMA_VERSION,
  glyphForgeFixtureProject,
  glyphFrameToAnsi,
  glyphLinePoints,
  type GlyphProject,
  glyphRectPoints,
  type GlyphTool,
  normalizeGlyphProject,
} from "./model.ts";
import { createGlyphForgeFixtureProvider } from "./fixture_provider.ts";
import { GLYPH_TEXT_FONTS, type GlyphTextFont, renderGlyphText } from "./text_font.ts";

/** Persisted GlyphForge app state (JSON-safe). */
export interface GlyphForgeState {
  readonly schemaVersion: typeof GLYPHFORGE_PROJECT_SCHEMA_VERSION;
  readonly project: GlyphProject;
  readonly frameIndex: number;
  readonly layerIndex: number;
  readonly tool: GlyphTool;
  readonly foreground: number;
  readonly background: number;
  readonly brushChar: string;
  readonly fontId: string;
}

/** Construction options. */
export interface GlyphForgeControllerOptions {
  readonly store?: AsyncStore<unknown>;
  readonly diagnostics?: DiagnosticsCollector;
  readonly provider?: ShowcaseProvider & { readonly project: GlyphProject };
  readonly persistenceDebounceMs?: number;
  readonly historyLimit?: number;
  /** Extra fonts (a loaded font pack) offered after the bundled ones. */
  readonly fonts?: readonly GlyphTextFont[];
}

/** The versioned GlyphForge manifest. */
export const GLYPHFORGE_MANIFEST = defineShowcaseManifest({
  id: "glyph-forge",
  title: "GlyphForge",
  appVersion: "0.1.0",
  routes: [{ id: "studio", title: "Studio" }],
  initialRouteId: "studio",
  requiredCapabilities: ["glyph-project"],
  hosts: { terminal: true, browser: false },
});

const GLYPH_TOOLS: readonly GlyphTool[] = ["pencil", "eraser", "fill", "line", "rect", "eyedropper", "text"];

function defaultGlyphForgeState(project: GlyphProject): GlyphForgeState {
  return {
    schemaVersion: GLYPHFORGE_PROJECT_SCHEMA_VERSION,
    project,
    frameIndex: 0,
    layerIndex: Math.max(0, (project.frames[0]?.layers.length ?? 1) - 1),
    tool: "pencil",
    foreground: Math.min(15, project.palette.length - 1),
    background: 0,
    brushChar: "█",
    fontId: "standard",
  };
}

/** Strict app-state normalization for restored sessions. */
export function normalizeGlyphForgeState(value: unknown): GlyphForgeState {
  const fallbackProject = glyphForgeFixtureProject;
  const defaults = defaultGlyphForgeState(fallbackProject());
  if (!value || typeof value !== "object") return defaults;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== GLYPHFORGE_PROJECT_SCHEMA_VERSION) return defaults;
  const project = normalizeGlyphProject(record.project, fallbackProject);
  const frameIndex = clampIndex(record.frameIndex, project.frames.length);
  const frame = project.frames[frameIndex]!;
  const layerIndex = clampIndex(record.layerIndex, frame.layers.length);
  const tool = GLYPH_TOOLS.includes(record.tool as GlyphTool) ? record.tool as GlyphTool : "pencil";
  const foreground = clampIndex(record.foreground, project.palette.length);
  const background = clampIndex(record.background, project.palette.length);
  const brushChar = typeof record.brushChar === "string" && record.brushChar.length === 1 ? record.brushChar : "█";
  const fontId = typeof record.fontId === "string" && /^[a-z0-9-]{1,64}$/.test(record.fontId)
    ? record.fontId
    : "standard";
  return {
    schemaVersion: GLYPHFORGE_PROJECT_SCHEMA_VERSION,
    project,
    frameIndex,
    layerIndex,
    tool,
    foreground,
    background,
    brushChar,
    fontId,
  };
}

function clampIndex(value: unknown, length: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return 0;
  return Math.max(0, Math.min(Math.max(0, length - 1), value));
}

/** An in-flight ASCII-art text entry, previewed but not yet committed. */
export interface GlyphTextEntry {
  readonly column: number;
  readonly row: number;
  readonly text: string;
}

/** An in-flight line/rect gesture, previewed but not yet committed. */
export interface GlyphGesturePreview {
  readonly tool: "line" | "rect";
  readonly startColumn: number;
  readonly startRow: number;
  readonly endColumn: number;
  readonly endRow: number;
}

/** The GlyphForge controller. */
export class GlyphForgeController {
  readonly kernel: ShowcaseKernel<GlyphForgeState, ShowcaseProvider>;
  /** Bumped on every visible change (drives repaints). */
  readonly revision = new Signal(0);
  /** One-line status note ("layer locked", "stroke undone"). */
  readonly note = new Signal("");

  #state: GlyphForgeState;
  #undo: string[] = [];
  #redo: string[] = [];
  readonly #historyLimit: number;
  #gesture?: GlyphGesturePreview;
  #textEntry?: GlyphTextEntry;
  #strokeSnapshot?: string;
  readonly #fonts: readonly GlyphTextFont[];

  constructor(options: GlyphForgeControllerOptions = {}) {
    const provider = options.provider ?? createGlyphForgeFixtureProvider();
    this.#historyLimit = Math.max(1, options.historyLimit ?? 100);
    this.#fonts = [...GLYPH_TEXT_FONTS, ...(options.fonts ?? [])];
    this.kernel = new ShowcaseKernel({
      manifest: GLYPHFORGE_MANIFEST,
      provider,
      initialState: defaultGlyphForgeState(provider.project),
      normalizeState: normalizeGlyphForgeState,
      store: options.store,
      diagnostics: options.diagnostics,
      persistenceDebounceMs: options.persistenceDebounceMs ?? 0,
    });
    this.#state = this.kernel.appState.peek();
    this.kernel.ready.then(() => {
      this.#state = this.kernel.appState.peek();
      this.#bump();
    }).catch(() => {});
  }

  state(): GlyphForgeState {
    return this.#state;
  }

  project(): GlyphProject {
    return this.#state.project;
  }

  gesturePreview(): GlyphGesturePreview | undefined {
    return this.#gesture;
  }

  /** The composited active frame plus any live gesture preview. */
  compositeWithPreview(): (GlyphCell | null)[][] {
    const composite = compositeGlyphFrame(this.#state.project, this.#state.frameIndex);
    const gesture = this.#gesture;
    if (gesture) {
      const points = gesture.tool === "line"
        ? glyphLinePoints(gesture.startColumn, gesture.startRow, gesture.endColumn, gesture.endRow)
        : glyphRectPoints(gesture.startColumn, gesture.startRow, gesture.endColumn, gesture.endRow);
      const cell = this.#brushCell();
      for (const point of points) {
        if (
          point.column >= 0 && point.column < this.#state.project.columns &&
          point.row >= 0 && point.row < this.#state.project.rows
        ) {
          composite[point.row]![point.column] = cell;
        }
      }
    }
    const entry = this.#textEntry;
    if (entry) {
      for (const edit of this.#textEntryEdits(entry)) {
        if (
          edit.column >= 0 && edit.column < this.#state.project.columns &&
          edit.row >= 0 && edit.row < this.#state.project.rows && edit.cell
        ) {
          composite[edit.row]![edit.column] = edit.cell;
        }
      }
    }
    return composite;
  }

  // ── tools and colors ──────────────────────────────────────────────

  setTool(tool: GlyphTool): void {
    this.#cancelGesture();
    this.textEntryCancel();
    this.#update({ tool });
    this.note.value = `tool: ${tool}`;
  }

  tool(): GlyphTool {
    return this.#state.tool;
  }

  setForeground(index: number): void {
    this.#update({ foreground: clampIndex(index, this.#state.project.palette.length) });
  }

  setBackground(index: number): void {
    this.#update({ background: clampIndex(index, this.#state.project.palette.length) });
  }

  cycleForeground(direction: 1 | -1): number {
    const size = this.#state.project.palette.length;
    const next = (this.#state.foreground + direction + size) % size;
    this.setForeground(next);
    return next;
  }

  cycleBackground(direction: 1 | -1): number {
    const size = this.#state.project.palette.length;
    const next = (this.#state.background + direction + size) % size;
    this.setBackground(next);
    return next;
  }

  setBrushChar(char: string): void {
    if (char.length !== 1) return;
    this.#update({ brushChar: char });
  }

  // ── pointer gestures ──────────────────────────────────────────────

  /** Starts a gesture at canvas cell coordinates. */
  pointerDown(column: number, row: number): void {
    const tool = this.#state.tool;
    if (tool === "eyedropper") {
      const cell = compositeGlyphFrame(this.#state.project, this.#state.frameIndex)[row]?.[column];
      if (cell) {
        this.#update({ foreground: cell.fg, background: cell.bg, brushChar: cell.char });
        this.note.value = "picked cell style";
      }
      return;
    }
    if (this.#activeLayerLocked()) {
      this.note.value = "layer is locked";
      return;
    }
    if (tool === "text") {
      // A second click while typing commits the pending stamp first.
      if (this.#textEntry) this.textEntryCommit();
      if (this.#activeLayerLocked()) {
        this.note.value = "layer is locked";
        return;
      }
      this.#textEntry = { column, row, text: "" };
      this.note.value = "type text · enter stamps · esc cancels";
      this.#bump();
      return;
    }
    if (tool === "fill") {
      this.#beginStroke();
      const layer = this.#activeLayer();
      const edits = glyphFloodFillEdits(
        layer,
        column,
        row,
        this.#brushCell(),
        this.#state.project.columns,
        this.#state.project.rows,
      );
      this.#applyToActiveLayer(edits);
      this.#commitStroke(`filled ${edits.length} cells`);
      return;
    }
    if (tool === "line" || tool === "rect") {
      this.#gesture = { tool, startColumn: column, startRow: row, endColumn: column, endRow: row };
      this.#bump();
      return;
    }
    // Pencil and eraser paint immediately and keep painting through drag.
    this.#beginStroke();
    this.#applyToActiveLayer([{
      column,
      row,
      cell: tool === "eraser" ? null : this.#brushCell(),
    }]);
  }

  /** Continues a gesture (mouse drag) at canvas cell coordinates. */
  pointerDrag(column: number, row: number): void {
    const tool = this.#state.tool;
    if (this.#gesture) {
      this.#gesture = { ...this.#gesture, endColumn: column, endRow: row };
      this.#bump();
      return;
    }
    if (this.#strokeSnapshot === undefined) return;
    if (tool === "pencil" || tool === "eraser") {
      this.#applyToActiveLayer([{
        column,
        row,
        cell: tool === "eraser" ? null : this.#brushCell(),
      }]);
    }
  }

  /** Ends a gesture; line/rect commit here as one atomic edit. */
  pointerUp(): void {
    const gesture = this.#gesture;
    if (gesture) {
      this.#gesture = undefined;
      if (!this.#activeLayerLocked()) {
        this.#beginStroke();
        const points = gesture.tool === "line"
          ? glyphLinePoints(gesture.startColumn, gesture.startRow, gesture.endColumn, gesture.endRow)
          : glyphRectPoints(gesture.startColumn, gesture.startRow, gesture.endColumn, gesture.endRow);
        const cell = this.#brushCell();
        this.#applyToActiveLayer(points.map((point) => ({ ...point, cell })));
        this.#commitStroke(`${gesture.tool} committed`);
      }
      this.#bump();
      return;
    }
    if (this.#strokeSnapshot !== undefined) {
      this.#commitStroke("stroke committed");
    }
  }

  // ── ASCII-art text entry ──────────────────────────────────────────

  textEntry(): GlyphTextEntry | undefined {
    return this.#textEntry;
  }

  fontId(): string {
    return this.#state.fontId;
  }

  /** The active font (falling back to the first when a pack is absent). */
  font(): GlyphTextFont {
    return this.#fonts.find((font) => font.id === this.#state.fontId) ?? this.#fonts[0]!;
  }

  fonts(): readonly GlyphTextFont[] {
    return this.#fonts;
  }

  /** 1-based position of the active font, for "12/428" readouts. */
  fontPosition(): { index: number; total: number } {
    const index = this.#fonts.findIndex((font) => font.id === this.font().id);
    return { index: index + 1, total: this.#fonts.length };
  }

  cycleFont(direction: 1 | -1 = 1): string {
    const current = this.#fonts.findIndex((font) => font.id === this.font().id);
    const next = this.#fonts[(current + direction + this.#fonts.length) % this.#fonts.length]!;
    this.#update({ fontId: next.id });
    this.note.value = `font: ${next.label}`;
    return next.id;
  }

  textEntryAppend(char: string): void {
    const entry = this.#textEntry;
    if (!entry || char.length !== 1) return;
    if (entry.text.length >= 64) return;
    this.#textEntry = { ...entry, text: entry.text + char };
    this.#bump();
  }

  textEntryBackspace(): void {
    const entry = this.#textEntry;
    if (!entry || entry.text.length === 0) return;
    this.#textEntry = { ...entry, text: entry.text.slice(0, -1) };
    this.#bump();
  }

  /** Stamps the pending text as one atomic history unit. */
  textEntryCommit(): void {
    const entry = this.#textEntry;
    if (!entry) return;
    this.#textEntry = undefined;
    const edits = this.#textEntryEdits(entry);
    if (edits.length === 0 || this.#activeLayerLocked()) {
      this.#bump();
      return;
    }
    this.#beginStroke();
    this.#applyToActiveLayer(edits);
    this.#commitStroke(`stamped "${entry.text}"`);
    this.#bump();
  }

  textEntryCancel(): void {
    if (!this.#textEntry) return;
    this.#textEntry = undefined;
    this.#bump();
  }

  #textEntryEdits(entry: GlyphTextEntry): GlyphEdit[] {
    if (entry.text.length === 0) return [];
    const rows = renderGlyphText(this.font(), entry.text, "kern");
    const edits: GlyphEdit[] = [];
    for (let row = 0; row < rows.length; row += 1) {
      const line = rows[row]!;
      for (let column = 0; column < line.length; column += 1) {
        const char = line[column]!;
        if (char === " ") continue;
        edits.push({
          column: entry.column + column,
          row: entry.row + row,
          cell: { char, fg: this.#state.foreground, bg: this.#state.background },
        });
      }
    }
    return edits;
  }

  // ── history ───────────────────────────────────────────────────────

  undo(): boolean {
    const snapshot = this.#undo.pop();
    if (snapshot === undefined) {
      this.note.value = "nothing to undo";
      return false;
    }
    this.#redo.push(JSON.stringify(this.#state.project));
    this.#update({ project: JSON.parse(snapshot) as GlyphProject });
    this.note.value = "undone";
    return true;
  }

  redo(): boolean {
    const snapshot = this.#redo.pop();
    if (snapshot === undefined) {
      this.note.value = "nothing to redo";
      return false;
    }
    this.#undo.push(JSON.stringify(this.#state.project));
    this.#update({ project: JSON.parse(snapshot) as GlyphProject });
    this.note.value = "redone";
    return true;
  }

  historyDepth(): { undo: number; redo: number } {
    return { undo: this.#undo.length, redo: this.#redo.length };
  }

  // ── layers and frames ─────────────────────────────────────────────

  selectLayer(index: number): void {
    const frame = this.#activeFrame();
    this.#update({ layerIndex: clampIndex(index, frame.layers.length) });
  }

  cycleLayer(direction: 1 | -1): number {
    const frame = this.#activeFrame();
    const next = (this.#state.layerIndex + direction + frame.layers.length) % frame.layers.length;
    this.selectLayer(next);
    return next;
  }

  toggleLayerVisible(): void {
    this.#mutateActiveLayer((layer) => ({ ...layer, visible: !layer.visible }), "layer visibility");
  }

  toggleLayerLocked(): void {
    this.#mutateActiveLayer((layer) => ({ ...layer, locked: !layer.locked }), "layer lock");
  }

  selectFrame(index: number): void {
    this.#cancelGesture();
    const clamped = clampIndex(index, this.#state.project.frames.length);
    const frame = this.#state.project.frames[clamped]!;
    this.#update({
      frameIndex: clamped,
      layerIndex: clampIndex(this.#state.layerIndex, frame.layers.length),
    });
  }

  cycleFrame(direction: 1 | -1): number {
    const size = this.#state.project.frames.length;
    const next = (this.#state.frameIndex + direction + size) % size;
    this.selectFrame(next);
    return next;
  }

  /** Duplicates the active frame after itself (an atomic history unit). */
  duplicateFrame(): void {
    this.#beginStroke();
    const project = this.#state.project;
    const frame = project.frames[this.#state.frameIndex]!;
    const copy = JSON.parse(JSON.stringify(frame)) as typeof frame;
    const duplicated = {
      ...copy,
      id: `${frame.id}-copy-${project.frames.length + 1}`,
    };
    const frames = [...project.frames];
    frames.splice(this.#state.frameIndex + 1, 0, duplicated);
    this.#update({ project: { ...project, frames } });
    this.#commitStroke("frame duplicated");
    this.selectFrame(this.#state.frameIndex + 1);
  }

  /** Exports the active frame as pasteable truecolor ANSI. */
  exportAnsi(): string {
    return glyphFrameToAnsi(this.#state.project, this.#state.frameIndex);
  }

  persist(): void {
    this.kernel.setState(this.#state);
  }

  async dispose(): Promise<void> {
    this.persist();
    await this.kernel.dispose();
    this.revision.dispose();
    this.note.dispose();
  }

  // ── internals ─────────────────────────────────────────────────────

  #activeFrame() {
    return this.#state.project.frames[this.#state.frameIndex]!;
  }

  #activeLayer() {
    return this.#activeFrame().layers[this.#state.layerIndex]!;
  }

  #activeLayerLocked(): boolean {
    return this.#activeLayer().locked;
  }

  #brushCell(): GlyphCell {
    return { char: this.#state.brushChar, fg: this.#state.foreground, bg: this.#state.background };
  }

  #beginStroke(): void {
    this.#strokeSnapshot ??= JSON.stringify(this.#state.project);
  }

  #commitStroke(noteText: string): void {
    if (this.#strokeSnapshot === undefined) return;
    // Only a stroke that actually changed the project earns a history entry.
    if (this.#strokeSnapshot !== JSON.stringify(this.#state.project)) {
      this.#undo.push(this.#strokeSnapshot);
      if (this.#undo.length > this.#historyLimit) this.#undo.shift();
      this.#redo = [];
      this.note.value = noteText;
    }
    this.#strokeSnapshot = undefined;
  }

  #applyToActiveLayer(edits: readonly GlyphEdit[]): void {
    if (edits.length === 0) return;
    const project = this.#state.project;
    const frame = this.#activeFrame();
    const layer = this.#activeLayer();
    const nextLayer = applyGlyphEdits(layer, edits, project.columns, project.rows);
    const layers = frame.layers.map((entry, index) => index === this.#state.layerIndex ? nextLayer : entry);
    const frames = project.frames.map((entry, index) =>
      index === this.#state.frameIndex ? { ...frame, layers } : entry
    );
    this.#update({ project: { ...project, frames } });
  }

  #mutateActiveLayer(
    mutate: (layer: GlyphForgeState["project"]["frames"][number]["layers"][number]) => typeof layer,
    noteText: string,
  ): void {
    this.#beginStroke();
    const project = this.#state.project;
    const frame = this.#activeFrame();
    const layers = frame.layers.map((entry, index) => index === this.#state.layerIndex ? mutate(entry) : entry);
    const frames = project.frames.map((entry, index) =>
      index === this.#state.frameIndex ? { ...frame, layers } : entry
    );
    this.#update({ project: { ...project, frames } });
    this.#commitStroke(noteText);
  }

  #cancelGesture(): void {
    if (this.#gesture) {
      this.#gesture = undefined;
      this.#bump();
    }
  }

  #update(patch: Partial<GlyphForgeState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#bump();
  }

  #bump(): void {
    this.revision.value = this.revision.peek() + 1;
  }
}

/** Creates the GlyphForge controller. */
export function createGlyphForgeController(options: GlyphForgeControllerOptions = {}): GlyphForgeController {
  return new GlyphForgeController(options);
}
