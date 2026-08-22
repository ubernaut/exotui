// Copyright 2023 Im-Beast. MIT license.

import type { Rectangle } from "../../types.ts";
import type { ShellThemeSpec } from "../shell_theme.ts";
import {
  mixShellRgb,
  type ShellAnimatedBackground,
  type ShellBackgroundAdvanceOptions,
  type ShellBackgroundCell,
  type ShellBackgroundPoint,
} from "./contract.ts";

const TAU = Math.PI * 2;
const FRAME_BASELINE_MS = 16.7;
const MAX_FRAME_DELTA_MS = 48;
const CELL_ROW_ASPECT = 2;
const DEFAULT_POINTER_IDLE_MS = 3_000;
const GAZE_RESPONSE_MS = 150;
const GAZE_RECENTER_MS = 300;
const BLINK_GAP_MIN_MS = 6_000;
const BLINK_GAP_SPREAD_MS = 9_000;
const BLINK_DURATION_MS = 200;
const BLINK_POINTER_HOLDOFF_MS = 100;
const BREATH_PERIOD_MS = 5_000;
const BREATH_DEPTH = 0.08;
const WAVE_CELLS_PER_SECOND = 4;
const WAVE_RADIUS_CELLS = 2;
const MACHINERY_BLANK = 255;
const MACHINERY_BLANK_RATE = 0.09;

const REGION_MACHINERY = 0;
const REGION_FILL = 1;
const REGION_OUTLINE = 2;
const REGION_SOCKET = 3;
const REGION_SOCKETRIM = 4;
const REGION_IRIS = 5;
const REGION_NASAL = 6;
const REGION_TEETH = 7;
const REGION_BROW = 8;

/**
 * Skull silhouette half-width as a fraction of the skull scale, keyed by the
 * vertical fraction (negative = crown, positive = chin). The control points
 * compose a domed cranium, pinched temporal hollows, flaring zygomatic
 * cheekbones at eye level, and a tapered jaw/chin.
 */
const SKULL_PROFILE = [
  [-0.54, 0.00],
  [-0.47, 0.25],
  [-0.36, 0.37],
  [-0.26, 0.40], // upper temple
  [-0.15, 0.34], // temporal hollow (pinch)
  [-0.05, 0.43], // zygomatic cheekbone (widest)
  [0.07, 0.39],
  [0.19, 0.33], // maxilla / nose base
  [0.31, 0.30], // jaw
  [0.45, 0.22], // lower jaw
  [0.56, 0.00], // chin
] as const;

const CONNECTOR_GLYPHS = ["◙", "▣", "⊟", "o"] as const;
const BOLT_GLYPHS = ["╪", "╧", "◙", "▣", "⊟"] as const;
const CLUSTER_GLYPHS = ["▓", "▒", "▣", "▤"] as const;
const PIT_GLYPHS = ["∙", "˚", "·"] as const;
const CRACK_GLYPHS = ["╱", "╲", "⟋"] as const;
/** Index order east, south, west, north; even indices are horizontal. */
const TUBE_DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;

/** Construction options for the biomech skull background. */
export interface ShellSkullFieldOptions {
  readonly seed?: number;
  /** Pointer-idle time before the pupils ease back to center. */
  readonly pointerIdleMs?: number;
}

/** One deep-set eye socket, exposed for diagnostics and layout tests. */
export interface ShellSkullEyeInspection {
  /** Socket/iris center column relative to the bounds origin. */
  readonly column: number;
  /** Socket/iris center row relative to the bounds origin. */
  readonly row: number;
  /** Socket half-width in cell columns. */
  readonly socketRadius: number;
  /** Iris half-width in cell columns. */
  readonly irisRadius: number;
}

/** Terse deterministic state snapshot for tests and diagnostics. */
export interface ShellSkullInspection {
  readonly bounds?: Rectangle;
  readonly pointer?: ShellBackgroundPoint & { readonly updatedAt: number };
  /** Shared pupil displacement from each iris center, in cell units. */
  readonly pupilOffset: { readonly x: number; readonly y: number };
  readonly blinkActive: boolean;
  readonly breathPhase: number;
  readonly tubeCount: number;
  /** Deep-set eye sockets in layout-local cell coordinates. */
  readonly eyes: readonly ShellSkullEyeInspection[];
}

interface SkullPointer extends ShellBackgroundPoint {
  readonly updatedAt: number;
}

interface SkullTube {
  readonly length: number;
  readonly speed: number;
  readonly waves: readonly number[];
}

interface SkullEye {
  readonly cx: number;
  readonly cy: number;
  readonly socketRadius: number;
  readonly irisRadius: number;
}

interface SkullLayout {
  readonly width: number;
  readonly height: number;
  readonly mask: Uint8Array;
  /** Region-specific level byte: bone depth, tooth brightness, or machinery texture depth (255 = blank). */
  readonly level: Uint8Array;
  readonly overlayChar: (string | undefined)[];
  /** Tube index + 1 for hose cells, 0 for clusters, bolts, bone pits and empty cells. */
  readonly overlayTube: Int32Array;
  readonly overlayPos: Uint16Array;
  readonly overlayDepth: Uint8Array;
  readonly tubes: readonly SkullTube[];
  readonly eyes: readonly SkullEye[];
  readonly gazeReach: number;
  readonly maxPupilX: number;
}

/**
 * Grim biomech skull: an anatomically composed cranium — domed crown, pinched
 * temples, flaring cheekbones and a tapered jaw — stares out of a wall of dark
 * armored cabling bolted into its bone. A heavy brow ridge sinks the deep
 * angular sockets into shadow, where a small amber iris burns. Pupils ease
 * toward the pointer, eyelids blink on a seeded 6-15 s cadence, brightness
 * waves crawl along every braided hose, and a slow breath modulates the
 * machinery and the skull's edge shading. Owns deterministic simulation state
 * only; palette selection stays inside `rasterizeCells`.
 */
export class ShellSkullField implements ShellAnimatedBackground {
  readonly #seed: number;
  readonly #pointerIdleMs: number;
  #randomState: number;
  #bounds?: Rectangle;
  #layout?: SkullLayout;
  #pointer?: SkullPointer;
  #lastFrameAt?: number;
  #timeMs = 0;
  #pupilX = 0;
  #pupilY = 0;
  #blinkUntil?: number;
  #nextBlinkAt?: number;
  #cells: (ShellBackgroundCell | undefined)[][] = [];

  constructor(options: ShellSkullFieldOptions = {}) {
    this.#seed = (options.seed ?? 0x53_4b_55_4c) >>> 0;
    this.#pointerIdleMs = Math.max(0, finite(options.pointerIdleMs, DEFAULT_POINTER_IDLE_MS));
    this.#randomState = this.#seed;
  }

  /** Records the gaze target the pupils ease toward. */
  setPointer(point: ShellBackgroundPoint, now: number = performance.now()): void {
    if (!Number.isFinite(point.column) || !Number.isFinite(point.row)) return;
    this.#pointer = { column: point.column, row: point.row, updatedAt: finite(now, performance.now()) };
  }

  clearPointer(): void {
    this.#pointer = undefined;
  }

  /** Advances gaze easing, the blink scheduler, and pulse clocks once. */
  advance(options: ShellBackgroundAdvanceOptions): boolean {
    const bounds = normalizeBounds(options.bounds);
    if (!bounds) return false;
    this.#ensureBounds(bounds);
    const now = finite(options.now, performance.now());
    const elapsed = this.#lastFrameAt === undefined
      ? FRAME_BASELINE_MS
      : Math.min(MAX_FRAME_DELTA_MS, Math.max(0, now - this.#lastFrameAt));
    this.#lastFrameAt = now;
    if (elapsed <= 0) return false;
    this.#timeMs += elapsed;
    this.#advanceGaze(bounds, now, elapsed);
    this.#advanceBlink(now);
    return true;
  }

  /** Paints skull mask regions, dynamic pupils, and pulsing machinery into a reused grid. */
  rasterizeCells(
    bounds: Rectangle,
    theme: ShellThemeSpec,
  ): ReadonlyArray<ReadonlyArray<ShellBackgroundCell | undefined>> {
    const normalized = normalizeBounds(bounds);
    if (!normalized) {
      this.#cells = [];
      return this.#cells;
    }
    this.#ensureBounds(normalized);
    const layout = this.#layout;
    this.#prepareCellBuffer(normalized);
    if (!layout) return this.#cells;
    const seconds = this.#timeMs / 1_000;
    const breathWave = Math.sin((TAU * this.#timeMs) / BREATH_PERIOD_MS);
    const breath = 1 + BREATH_DEPTH * breathWave;
    const blinking = this.#blinkUntil !== undefined;

    const boneCore = mixShellRgb(theme.text, theme.accent, 0.1);
    const boneMid = mixShellRgb(theme.muted, theme.border, 0.35);
    const boneEdge = mixShellRgb(theme.border, theme.background, 0.45);
    const outline: ShellBackgroundCell = {
      char: "█",
      foreground: mixShellRgb(theme.background, theme.border, 0.22),
    };
    const socket: ShellBackgroundCell = {
      char: "█",
      foreground: mixShellRgb(theme.background, theme.muted, 0.05),
    };
    const socketRim: ShellBackgroundCell = {
      char: "█",
      foreground: mixShellRgb(theme.background, theme.border, 0.11),
    };
    const iris: ShellBackgroundCell = {
      char: "█",
      foreground: mixShellRgb(theme.warning, theme.text, 0.2),
      bold: true,
    };
    const nasal: ShellBackgroundCell = {
      char: "▓",
      foreground: mixShellRgb(theme.background, theme.muted, 0.08),
    };
    const eyelid: ShellBackgroundCell = {
      char: "▓",
      foreground: mixShellRgb(boneEdge, theme.background, 0.25),
    };
    const toothLit = mixShellRgb(theme.text, theme.muted, 0.28);
    const toothGap = mixShellRgb(theme.background, theme.muted, 0.22);
    const browShade = 0.06 + 0.05 * (0.5 + 0.5 * breathWave);

    for (let y = 0; y < layout.height; y += 1) {
      const row = this.#cells[y]!;
      for (let x = 0; x < layout.width; x += 1) {
        const index = y * layout.width + x;
        switch (layout.mask[index]) {
          case REGION_FILL: {
            const depth = layout.level[index]! / 250;
            const base = depth < 0.5
              ? mixShellRgb(boneEdge, boneMid, depth / 0.5)
              : mixShellRgb(boneMid, boneCore, (depth - 0.5) / 0.5);
            const edgeShade = Math.max(0, 0.5 - depth) * (0.32 + 0.14 * breathWave);
            const color = edgeShade > 0 ? mixShellRgb(base, theme.background, edgeShade) : base;
            const detail = layout.overlayChar[index];
            row[x] = detail !== undefined
              ? { char: detail, foreground: mixShellRgb(color, theme.background, 0.5) }
              : { char: boneRampChar(depth), foreground: color };
            break;
          }
          case REGION_OUTLINE:
            row[x] = outline;
            break;
          case REGION_SOCKET:
            row[x] = blinking ? eyelid : socket;
            break;
          case REGION_SOCKETRIM:
            row[x] = blinking ? eyelid : socketRim;
            break;
          case REGION_IRIS:
            row[x] = blinking ? eyelid : iris;
            break;
          case REGION_NASAL:
            row[x] = nasal;
            break;
          case REGION_BROW:
            row[x] = { char: "▓", foreground: mixShellRgb(theme.background, theme.muted, browShade) };
            break;
          case REGION_TEETH: {
            const d = layout.level[index]! / 250;
            row[x] = { char: d > 0.5 ? "█" : d > 0.24 ? "▓" : "▒", foreground: mixShellRgb(toothGap, toothLit, d) };
            break;
          }
          default:
            row[x] = this.#machineryCell(layout, index, theme, breath, seconds);
        }
      }
    }
    if (!blinking) this.#paintPupils(layout, theme);
    return this.#cells;
  }

  inspect(): ShellSkullInspection {
    return {
      ...(this.#bounds ? { bounds: { ...this.#bounds } } : {}),
      ...(this.#pointer ? { pointer: { ...this.#pointer } } : {}),
      pupilOffset: { x: this.#pupilX, y: this.#pupilY },
      blinkActive: this.#blinkUntil !== undefined,
      breathPhase: (this.#timeMs % BREATH_PERIOD_MS) / BREATH_PERIOD_MS,
      tubeCount: this.#layout?.tubes.length ?? 0,
      eyes: (this.#layout?.eyes ?? []).map((eye) => ({
        column: eye.cx,
        row: eye.cy,
        socketRadius: eye.socketRadius,
        irisRadius: eye.irisRadius,
      })),
    };
  }

  #advanceGaze(bounds: Rectangle, now: number, elapsed: number): void {
    const layout = this.#layout;
    const pointer = this.#pointer;
    const attentive = pointer !== undefined && now - pointer.updatedAt <= this.#pointerIdleMs;
    let targetX = 0;
    let targetY = 0;
    if (attentive && layout && layout.eyes.length > 0) {
      const originX = bounds.column + (layout.width - 1) / 2;
      const originY = bounds.row + layout.eyes[0]!.cy;
      const dx = pointer.column - originX;
      const dy = (pointer.row - originY) * CELL_ROW_ASPECT;
      const distance = Math.hypot(dx, dy);
      if (distance > 0.001) {
        const magnitude = Math.min(1, distance / layout.gazeReach);
        targetX = (dx / distance) * magnitude * layout.maxPupilX;
        targetY = ((dy / distance) * magnitude * layout.maxPupilX) / CELL_ROW_ASPECT;
      }
    }
    const alpha = 1 - Math.exp(-elapsed / (attentive ? GAZE_RESPONSE_MS : GAZE_RECENTER_MS));
    this.#pupilX += (targetX - this.#pupilX) * alpha;
    this.#pupilY += (targetY - this.#pupilY) * alpha;
  }

  #advanceBlink(now: number): void {
    if (this.#blinkUntil !== undefined && this.#timeMs >= this.#blinkUntil) {
      this.#blinkUntil = undefined;
      this.#nextBlinkAt = this.#timeMs + BLINK_GAP_MIN_MS + this.#random() * BLINK_GAP_SPREAD_MS;
    }
    this.#nextBlinkAt ??= this.#timeMs + BLINK_GAP_MIN_MS + this.#random() * BLINK_GAP_SPREAD_MS;
    if (this.#blinkUntil !== undefined || this.#timeMs < this.#nextBlinkAt) return;
    const pointer = this.#pointer;
    if (pointer !== undefined && now - pointer.updatedAt < BLINK_POINTER_HOLDOFF_MS) {
      this.#nextBlinkAt = this.#timeMs + BLINK_POINTER_HOLDOFF_MS * 2;
      return;
    }
    this.#blinkUntil = this.#timeMs + BLINK_DURATION_MS;
  }

  #machineryCell(
    layout: SkullLayout,
    index: number,
    theme: ShellThemeSpec,
    breath: number,
    seconds: number,
  ): ShellBackgroundCell | undefined {
    const glyph = layout.overlayChar[index];
    if (glyph !== undefined) {
      const depth = layout.overlayDepth[index]! / 255;
      const structure = mixShellRgb(theme.border, theme.muted, depth);
      const tubeRef = layout.overlayTube[index]!;
      if (tubeRef > 0) {
        const pulse = tubePulse(layout.tubes[tubeRef - 1]!, layout.overlayPos[index]!, seconds);
        let color = mixShellRgb(theme.background, structure, Math.min(1, (0.26 + 0.4 * depth) * breath));
        if (pulse > 0) color = mixShellRgb(color, theme.accent, 0.65 * pulse);
        return pulse > 0.75 ? { char: glyph, foreground: color, bold: true } : { char: glyph, foreground: color };
      }
      let color = mixShellRgb(theme.background, structure, Math.min(1, (0.24 + 0.42 * depth) * breath));
      if (depth > 0.85) color = mixShellRgb(color, theme.accent, 0.3);
      return { char: glyph, foreground: color };
    }
    const levelByte = layout.level[index]!;
    if (levelByte === MACHINERY_BLANK) return undefined;
    const depth = levelByte / 250;
    const structure = mixShellRgb(theme.border, theme.muted, depth);
    return {
      char: depth < 0.55 ? "░" : "▒",
      foreground: mixShellRgb(theme.background, structure, Math.min(1, (0.14 + 0.38 * depth) * breath)),
    };
  }

  #paintPupils(layout: SkullLayout, theme: ShellThemeSpec): void {
    const pupil: ShellBackgroundCell = {
      char: "█",
      foreground: mixShellRgb(theme.background, theme.border, 0.06),
    };
    const glint: ShellBackgroundCell = {
      char: "█",
      foreground: mixShellRgb(theme.text, theme.warning, 0.08),
      bold: true,
    };
    for (const eye of layout.eyes) {
      const py = Math.round(eye.cy + this.#pupilY);
      const px = Math.round(eye.cx + this.#pupilX);
      this.#paintIrisCell(layout, px, py, pupil);
      if (!this.#paintIrisCell(layout, px - 1, py - 1, glint)) this.#paintIrisCell(layout, px - 1, py, glint);
    }
  }

  #paintIrisCell(layout: SkullLayout, x: number, y: number, cell: ShellBackgroundCell): boolean {
    if (x < 0 || x >= layout.width || y < 0 || y >= layout.height) return false;
    if (layout.mask[y * layout.width + x] !== REGION_IRIS) return false;
    this.#cells[y]![x] = cell;
    return true;
  }

  #prepareCellBuffer(bounds: Rectangle): void {
    if (this.#cells.length !== bounds.height || (this.#cells[0]?.length ?? -1) !== bounds.width) {
      this.#cells = Array.from(
        { length: bounds.height },
        () => new Array<ShellBackgroundCell | undefined>(bounds.width),
      );
    }
    for (const row of this.#cells) row.fill(undefined);
  }

  #ensureBounds(bounds: Rectangle): void {
    const previous = this.#bounds;
    if (
      previous?.column === bounds.column && previous.row === bounds.row &&
      previous.width === bounds.width && previous.height === bounds.height
    ) return;
    const sizeChanged = previous?.width !== bounds.width || previous.height !== bounds.height;
    this.#bounds = { ...bounds };
    if (sizeChanged || !this.#layout) this.#layout = this.#buildLayout(bounds.width, bounds.height);
  }

  /** Rebuilds skull masks, braided tubes, bolts and clusters; keyed by seed and dimensions so resizes are deterministic. */
  #buildLayout(width: number, height: number): SkullLayout {
    const hashSeed = hashPair(this.#seed, width, height);
    let state = hashSeed === 0 ? 0x9e_37_79_b9 : hashSeed;
    const random = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const size = width * height;
    const mask = new Uint8Array(size);
    const level = new Uint8Array(size);
    const overlayChar = new Array<string | undefined>(size);
    const overlayTube = new Int32Array(size);
    const overlayPos = new Uint16Array(size);
    const overlayDepth = new Uint8Array(size);

    const cx = (width - 1) / 2;
    const cy = (height - 1) / 2;
    const scale = 0.62 * Math.min(width, height * CELL_ROW_ASPECT);
    const apex = SKULL_PROFILE[0]![0] * scale;
    const chin = SKULL_PROFILE[SKULL_PROFILE.length - 1]![0] * scale;
    const eyeOffsetX = 0.205 * scale;
    const eyeCy = -0.06 * scale;
    const socketRx = Math.max(2, 0.15 * scale);
    const socketRy = Math.max(2, 0.135 * scale);
    const socketN = 2.6;
    const socketTilt = 0.2;
    const cosTilt = Math.cos(socketTilt);
    const sinTilt = Math.sin(socketTilt);
    const irisRadius = Math.max(1.3, socketRx * 0.34);
    const browTop = -0.3 * scale;
    const browBot = -0.205 * scale;
    const noseTop = 0.05 * scale;
    const noseBot = 0.24 * scale;
    const noseHalfMax = Math.max(1.2, 0.09 * scale);
    const teethTop = 0.29 * scale;
    const teethBot = 0.45 * scale;
    const mouthCy = 0.37 * scale;
    const teethHalfW = Math.max(3, 0.24 * scale);
    const toothWidth = Math.max(2.2, 0.052 * scale);
    const boneCoreDist = Math.max(3, 0.16 * scale);

    for (let y = 0; y < height; y += 1) {
      const vy = (y - cy) * CELL_ROW_ASPECT;
      const halfWidth = profileWidthFraction(vy / scale) * scale;
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const vx = x - cx;
        const edge = halfWidth - Math.abs(vx);
        if (edge <= 0) {
          mask[index] = REGION_MACHINERY;
          level[index] = hash01(hashSeed, x, y) < MACHINERY_BLANK_RATE
            ? MACHINERY_BLANK
            : Math.floor(hash01(hashSeed, x + 7_919, y + 104_729) * 251);
          continue;
        }
        const dist = Math.min(edge, vy - apex, chin - vy);
        if (dist < 1) {
          mask[index] = REGION_OUTLINE;
          continue;
        }
        const side = vx < 0 ? -1 : 1;
        const ex = vx - side * eyeOffsetX;
        const ey = vy - eyeCy;
        const rrx = ex * cosTilt - ey * (side * sinTilt);
        const rry = ex * (side * sinTilt) + ey * cosTilt;
        const socket = superellipse(rrx / socketRx, rry / socketRy, socketN);
        if (socket <= 1) {
          const irisDist = Math.hypot(vx - side * eyeOffsetX, vy - eyeCy);
          mask[index] = irisDist <= irisRadius ? REGION_IRIS : REGION_SOCKET;
          continue;
        }
        if (socket <= 1.18) {
          mask[index] = REGION_SOCKETRIM;
          continue;
        }
        if (vy >= browTop && vy <= browBot) {
          mask[index] = REGION_BROW;
          continue;
        }
        if (vy >= noseTop && vy <= noseBot) {
          const frac = (vy - noseTop) / (noseBot - noseTop);
          const half = noseHalfMax * smoothstep(frac);
          const septum = Math.abs(vx) < 0.7 && frac > 0.55;
          if (Math.abs(vx) <= half && !septum) {
            mask[index] = REGION_NASAL;
            continue;
          }
        }
        if (vy >= teethTop && vy <= teethBot && Math.abs(vx) <= teethHalfW) {
          mask[index] = REGION_TEETH;
          const taper = 1 - 0.45 * (Math.abs(vx) / teethHalfW);
          if (Math.abs(vy - mouthCy) < 0.6) {
            level[index] = 6;
          } else {
            const local = mod(vx + teethHalfW, toothWidth);
            const gapLine = local < 0.85 || local > toothWidth - 0.85;
            level[index] = Math.round(gapLine ? 28 * taper : 150 * taper + 55);
          }
          continue;
        }
        mask[index] = REGION_FILL;
        const depth = clamp01(dist / boneCoreDist);
        level[index] = Math.round(depth * 250);
        if (depth > 0.35) {
          const noise = hash01(hashSeed, x + 3_301, y + 61_003);
          if (noise < 0.045) {
            overlayChar[index] = PIT_GLYPHS[Math.floor(hash01(hashSeed, x + 811, y + 907) * PIT_GLYPHS.length)]!;
          } else if (noise < 0.062) {
            overlayChar[index] = CRACK_GLYPHS[Math.floor(hash01(hashSeed, x + 211, y + 509) * CRACK_GLYPHS.length)]!;
          }
        }
      }
    }

    const machineryFree = (px: number, py: number): boolean =>
      px >= 0 && px < width && py >= 0 && py < height && mask[py * width + px] === REGION_MACHINERY;
    const paintTube = (px: number, py: number, glyph: string, tubeIndex: number, pos: number, depth: number): void => {
      const idx = py * width + px;
      overlayChar[idx] = overlayChar[idx] !== undefined && overlayTube[idx]! > 0 ? "╬" : glyph;
      overlayTube[idx] = tubeIndex + 1;
      overlayPos[idx] = Math.min(0xffff, pos);
      overlayDepth[idx] = depth;
    };

    const tubes: SkullTube[] = [];
    const tubeTarget = clampInteger(Math.round(size / 110), 8, 64);
    for (let attempt = 0; attempt < tubeTarget; attempt += 1) {
      let x = -1;
      let y = -1;
      for (let tries = 0; tries < 24; tries += 1) {
        const sx = Math.floor(random() * width);
        const sy = Math.floor(random() * height);
        if (machineryFree(sx, sy) && overlayChar[sy * width + sx] === undefined) {
          x = sx;
          y = sy;
          break;
        }
      }
      if (x < 0) continue;
      const thick = random() < 0.55;
      const braid = thick && random() < 0.5;
      const stair = random() < 0.2;
      const stairHorizontal = random() < 0.5 ? 0 : 2;
      const stairVertical = random() < 0.5 ? 1 : 3;
      const depth = Math.floor(80 + random() * 175);
      const tubeIndex = tubes.length;
      let direction = stair ? stairHorizontal : Math.floor(random() * 4);
      const segments = stair ? 6 + Math.floor(random() * 6) : 2 + Math.floor(random() * 3);
      let pos = 0;
      let alive = true;
      const paintStep = (px: number, py: number, dir: number): void => {
        paintTube(px, py, straightGlyph(dir, thick), tubeIndex, pos, depth);
        if (!thick) return;
        const perpX = dir % 2 === 0 ? 0 : 1;
        const perpY = dir % 2 === 0 ? 1 : 0;
        const parallel = dir % 2 === 0 ? "═" : "║";
        const runs = braid ? 2 : 1;
        for (let k = 1; k <= runs; k += 1) {
          const ox = px + perpX * k;
          const oy = py + perpY * k;
          if (machineryFree(ox, oy) && overlayChar[oy * width + ox] === undefined) {
            paintTube(ox, oy, parallel, tubeIndex, pos, depth);
          }
        }
      };
      paintStep(x, y, direction);
      for (let segment = 0; segment < segments && alive; segment += 1) {
        const length = stair ? 1 + Math.floor(random() * 2) : 6 + Math.floor(random() * 20);
        for (let step = 0; step < length; step += 1) {
          const [dx, dy] = TUBE_DIRECTIONS[direction]!;
          if (!machineryFree(x + dx, y + dy)) {
            paintTube(x, y, CONNECTOR_GLYPHS[Math.floor(random() * CONNECTOR_GLYPHS.length)]!, tubeIndex, pos, depth);
            alive = false;
            break;
          }
          x += dx;
          y += dy;
          pos += 1;
          paintStep(x, y, direction);
        }
        if (!alive) break;
        if (segment < segments - 1) {
          const turn = stair
            ? (direction === stairHorizontal ? stairVertical : stairHorizontal)
            : direction % 2 === 0
            ? (random() < 0.5 ? 1 : 3)
            : (random() < 0.5 ? 0 : 2);
          paintTube(x, y, cornerGlyph(direction, turn), tubeIndex, pos, depth);
          direction = turn;
        } else {
          paintTube(x, y, CONNECTOR_GLYPHS[Math.floor(random() * CONNECTOR_GLYPHS.length)]!, tubeIndex, pos, depth);
        }
      }
      const total = pos + 1;
      const waves = random() < 0.5 ? [random() * total] : [random() * total, random() * total];
      tubes.push({ length: total, speed: (0.7 + random() * 0.6) * (random() < 0.5 ? -1 : 1), waves });
    }

    const clusterTarget = clampInteger(Math.round(size / 80), 5, 96);
    for (let cluster = 0; cluster < clusterTarget; cluster += 1) {
      const baseX = Math.floor(random() * Math.max(1, width - 3));
      const baseY = Math.floor(random() * Math.max(1, height - 2));
      const blockWidth = 2 + Math.floor(random() * 2);
      for (let by = baseY; by < baseY + 2; by += 1) {
        for (let bx = baseX; bx < baseX + blockWidth; bx += 1) {
          if (!machineryFree(bx, by)) continue;
          const idx = by * width + bx;
          if (overlayChar[idx] !== undefined) continue;
          overlayChar[idx] = CLUSTER_GLYPHS[Math.floor(random() * CLUSTER_GLYPHS.length)]!;
          overlayDepth[idx] = Math.floor(60 + random() * 195);
        }
      }
    }

    // Bolt heavy connectors into the bone: machinery cells that touch the skull outline.
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (mask[idx] !== REGION_MACHINERY || overlayChar[idx] !== undefined) continue;
        const touchesBone = isOutline(mask, width, height, x + 1, y) || isOutline(mask, width, height, x - 1, y) ||
          isOutline(mask, width, height, x, y + 1) || isOutline(mask, width, height, x, y - 1);
        if (!touchesBone) continue;
        if (hash01(hashSeed, x + 5_003, y + 2_011) < 0.34) {
          overlayChar[idx] = BOLT_GLYPHS[Math.floor(hash01(hashSeed, x + 17, y + 29) * BOLT_GLYPHS.length)]!;
          overlayDepth[idx] = 230;
        }
      }
    }

    const eyeRow = cy + eyeCy / CELL_ROW_ASPECT;
    return {
      width,
      height,
      mask,
      level,
      overlayChar,
      overlayTube,
      overlayPos,
      overlayDepth,
      tubes,
      eyes: [
        { cx: cx - eyeOffsetX, cy: eyeRow, socketRadius: socketRx, irisRadius },
        { cx: cx + eyeOffsetX, cy: eyeRow, socketRadius: socketRx, irisRadius },
      ],
      gazeReach: Math.max(4, width * 0.3),
      maxPupilX: Math.max(0.8, irisRadius - 1.4),
    };
  }

  #random(): number {
    this.#randomState = (Math.imul(this.#randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this.#randomState / 0x1_0000_0000;
  }
}

/** Peak brightness contribution of the tube's traveling waves at one path cell. */
function tubePulse(tube: SkullTube, position: number, seconds: number): number {
  if (tube.length < 2) return 0;
  const travel = seconds * WAVE_CELLS_PER_SECOND * tube.speed;
  let best = 0;
  for (const offset of tube.waves) {
    const crest = (((offset + travel) % tube.length) + tube.length) % tube.length;
    const direct = Math.abs(position - crest);
    const distance = Math.min(direct, tube.length - direct);
    if (distance <= WAVE_RADIUS_CELLS) best = Math.max(best, 1 - distance / (WAVE_RADIUS_CELLS + 0.5));
  }
  return best;
}

/** Skull half-width (fraction of skull scale) at a vertical fraction; 0 past crown/chin. */
function profileWidthFraction(tFrac: number): number {
  const profile = SKULL_PROFILE;
  if (tFrac <= profile[0]![0] || tFrac >= profile[profile.length - 1]![0]) return 0;
  for (let i = 0; i < profile.length - 1; i += 1) {
    const a = profile[i]!;
    const b = profile[i + 1]!;
    if (tFrac >= a[0] && tFrac <= b[0]) {
      return a[1] + (b[1] - a[1]) * smoothstep((tFrac - a[0]) / (b[0] - a[0]));
    }
  }
  return 0;
}

/** ` ░▒▓█` bone ramp keyed by normalized distance from the silhouette edge. */
function boneRampChar(depth: number): string {
  if (depth < 0.38) return "░";
  if (depth < 0.6) return "▒";
  if (depth < 0.82) return "▓";
  return "█";
}

function isOutline(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x] === REGION_OUTLINE;
}

function superellipse(a: number, b: number, n: number): number {
  return Math.pow(Math.pow(Math.abs(a), n) + Math.pow(Math.abs(b), n), 1 / n);
}

function smoothstep(t: number): number {
  const p = Math.min(1, Math.max(0, t));
  return p * p * (3 - 2 * p);
}

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function straightGlyph(direction: number, thick: boolean): string {
  return direction % 2 === 0 ? (thick ? "═" : "─") : (thick ? "║" : "│");
}

/** Corner joining the incoming arm (opposite of `previous`) with the outgoing `next` arm. */
function cornerGlyph(previous: number, next: number): string {
  const arms = (1 << ((previous + 2) % 4)) | (1 << next);
  switch (arms) {
    case 0b0011:
      return "╔";
    case 0b1001:
      return "╚";
    case 0b0110:
      return "╗";
    case 0b1100:
      return "╝";
    default:
      return "╬";
  }
}

function hashPair(seed: number, a: number, b: number): number {
  let value = (seed ^ Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d) >>> 0;
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39) >>> 0;
  return (value ^ (value >>> 15)) >>> 0;
}

function hash01(seed: number, a: number, b: number): number {
  return hashPair(seed, a, b) / 0x1_0000_0000;
}

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

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.floor(finite(value, minimum))));
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
