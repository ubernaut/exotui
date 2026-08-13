// Copyright 2023 Im-Beast. MIT license.

// Microphone-reactive MilkDrop desktop background.
//
// This is the ASCII port of butterchurnxr's `asciichurn`: the real MilkDrop
// preset catalog, resolved at terminal cell resolution and painted as shaded
// blocks. `asciichurn` proxies its pixels out to Butterchurn's WebGL2 renderer
// in headless Chromium; Exomux ships as a single compiled binary and runs over
// a tailnet, so the pipeline is reimplemented on the CPU instead.
//
// Each frame:
//
//   1. `ExomuxButterchurnPreset` evaluates the preset's own EEL equations and
//      produces MilkDrop's warp mesh — the source coordinate every mesh vertex
//      samples from — plus the waveform figure for this frame;
//   2. the previous frame is resampled through that mesh and attenuated by the
//      preset's decay, which is the feedback that makes MilkDrop look like
//      MilkDrop rather than like an equalizer;
//   3. the waveform is drawn over it in the preset's colour;
//   4. the accumulated field is quantized to the `░▒▓█` ramp.
//
// What the terminal cannot carry over is each preset's HLSL warp and composite
// shaders, its custom waves and shapes, and the blur chain. Those need a GPU
// and a shader translator. The motion of a preset is therefore faithful; its
// colour grading and fine texture are approximated.

import type { Rectangle } from "@ubernaut/deno-tui";
import type {
  ExomuxBackgroundAdvanceOptions,
  ExomuxBackgroundCell,
  ExomuxBackgroundPoint,
  ExomuxInteractiveBackground,
  ExomuxPresetBackground,
} from "./background.ts";
import {
  acquireExomuxAudio,
  type ExomuxAudioCaptureMode,
  type ExomuxAudioFrame,
  type ExomuxAudioSource,
} from "./audio.ts";
import { EXOMUX_BUTTERCHURN_CATALOG, type ExomuxButterchurnPresetSource } from "./butterchurn_catalog.ts";
import { EXOMUX_BUTTERCHURN_ROTATION } from "./butterchurn_rotation.ts";
import { type ExomuxButterchurnAudio, ExomuxButterchurnPreset } from "./butterchurn_preset.ts";
import { ExomuxButterchurnGpu, requestExomuxGpuDevice } from "./butterchurn_gpu.ts";
import type { ExomuxRgb, ExomuxThemeSpec } from "./model.ts";
import { createExomuxDebugLogger, type ExomuxDebugLogger } from "./debug_log.ts";

// ── constants ───────────────────────────────────────────────────────────────

const FRAME_BASELINE_MS = 125;
const MAX_FRAME_DELTA_MS = 400;
const POINTER_LIFETIME_MS = 1_500;

/** Seconds one preset holds before the field cycles to the next. */
const PRESET_HOLD_SECONDS = 15;
/** Seconds spent crossfading between two presets, matching asciichurn. */
const PRESET_BLEND_SECONDS = 2.7;
/**
 * Seconds before a preset's slot ends that the next one starts compiling.
 *
 * Shader compilation is the expensive part of a transition. Doing it while the
 * outgoing preset is still on screen means the incoming one is ready the
 * moment it is wanted.
 */
const PRESET_PREWARM_SECONDS = 3;

/**
 * Frames per second the catalog's decay values were authored against.
 *
 * MilkDrop runs at 30-60 fps; the desktop advances at 8. A decay applied once
 * per 125 ms instead of once per 33 ms leaves a bright ghost that never fades,
 * so every preset's per-frame decay is raised to the frame-count ratio.
 */
const AUTHORED_FPS = 30;

/** Warp mesh resolution. Vertices are one more than this in each axis. */
const MESH_WIDTH = 24;
const MESH_HEIGHT = 18;

/** Ceiling on accumulated ink, so a loud passage cannot saturate flat. */
const MAX_INK = 1.6;
/** Cells dimmer than this show the desktop theme instead of a block. */
const MIN_INK = 0.1;
/** Shade ramp, dimmest first; the block carries what the colour cannot. */
const SHADES: readonly string[] = ["░", "▒", "▓", "█"];
/** Upper ink bound of each shade in `SHADES`; the last entry is open-ended. */
const SHADE_STOPS: readonly number[] = [0.2, 0.42, 0.75];
/** Output gamma. Below 1 it lifts midtones so dim feedback trails stay visible. */
const INK_GAMMA = 1 / 1.35;
/**
 * Output colours are snapped to this per-channel grid, bounding the palette at
 * 17³ = 4913 colours.
 *
 * The desktop painter caches one ANSI style per (foreground, background, bold)
 * triple and clears the whole cache at 8192 entries. Unquantized, this field
 * mints hundreds of new colours every frame — it would flush that cache every
 * couple of seconds and then miss on nearly every cell, which is precisely the
 * repaint saturation the painter's cache exists to prevent.
 */
const COLOR_STEP = 16;
/** Strongest pull of the theme accent, applied to the faintest ink only. */
const MAX_ACCENT_TINT = 0.45;
/** Ink level at which the accent pull has faded to nothing. */
const ACCENT_TINT_LIMIT = 0.35;

/** Ink one waveform figure deposits per frame, spread over its vertices. */
const WAVE_INK = 300;
/**
 * Total ink all custom waves and shapes may deposit per frame, shared.
 *
 * Per-prim budgets let a hundred-instance shape deposit a hundred budgets and
 * saturate the desktop; MilkDrop relies on alpha blending, which the additive
 * ink buffer does not have. One shared budget keeps the software path bounded
 * however much geometry a preset draws.
 */
const PRIM_INK = 500;
/**
 * Floor under a preset's `wave_a`, and the only deliberate deviation from the
 * catalog's own numbers.
 *
 * Two thirds of the catalog sets `wave_a` near zero — the median is 0.001 —
 * because those presets draw with custom waves, custom shapes and their
 * composite shader, and the basic waveform is only a seed. None of that runs
 * here, so honouring `wave_a` literally leaves 202 of 293 presets rendering an
 * empty screen. The warp mesh is the faithful, strongly preset-specific part of
 * this port; it needs ink to act on, and this is where the ink comes from.
 */
const MIN_WAVE_ALPHA = 0.5;
/**
 * Ceiling on a preset's decay.
 *
 * MilkDrop presets may set `decay` to 1 and rely on their composite shader,
 * `darken`, or the blur chain to pull brightness back down. With none of those
 * present a lossless feedback loop only ever accumulates, so the field is
 * forced to forget a little each frame.
 */
const MAX_DECAY = 0.99;
/**
 * Frames without a resolved GPU frame before the field gives up on the device.
 *
 * Readback is asynchronous and skips a frame whenever the previous map is still
 * in flight, so a couple of still frames is normal. Several seconds of them is
 * not, and the alternative to noticing is a background frozen on whatever it
 * last managed to draw.
 */
const GPU_STALL_FRAMES = 12;
/**
 * Frames a preset may render almost nothing before the field moves on.
 *
 * The rotation is selected against the GPU renderer, so on the software
 * fallback a good number of its presets resolve to nothing at all — and a
 * preset that draws nothing for its fifteen-second slot is indistinguishable
 * from a frozen desktop. Skipping ahead keeps something on screen whichever
 * renderer is running, and costs nothing when the preset is fine.
 *
 * One second rather than two: a run of consecutive dark presets multiplies
 * this, and the desktop going black for several seconds is exactly the
 * complaint it exists to prevent.
 */
const DEAD_PRESET_FRAMES = 8;
/** Presets kept behind the cursor, so `Ctrl-N [` can retrace a session. */
const PRESET_HISTORY = 64;
/** Share of the desktop a preset must reach to count as rendering at all. */
const DEAD_PRESET_COVERAGE = 0.01;
/**
 * A preset covering more than this share of the desktop with less than
 * `FLAT_PRESET_VARIANCE` of ink variation is a solid colour, not a picture.
 *
 * The runaway ones settle into flat white, which every coverage test passes
 * with full marks. Variance is what tells a rendered frame from a wash.
 */
const FLAT_PRESET_COVERAGE = 0.9;
/**
 * Measured, not guessed: across the twenty presets that settle into a solid
 * colour, this leaves sixteen of them, against five without the rule at all.
 * Tenfold looser catches one more and costs one more good preset, so the
 * conservative end is taken — a preset wrongly skipped comes round again, and
 * this is a threshold on other people's art.
 */
const FLAT_PRESET_VARIANCE = 0.002;
/**
 * Mean ink the software path steers the field toward.
 *
 * MilkDrop keeps a feedback loop bounded through its composite shader, its
 * `darken` flag and the blur chain. The software path runs none of those, and
 * ten catalog presets consequently accumulate without limit until the desktop
 * is a flat white field — unreadable, and unrecoverable because the loop is
 * self-feeding. This governor pulls decay down for exactly those frames where
 * the field has run too bright, and leaves well-behaved presets untouched.
 */
const TARGET_MEAN_INK = 0.45;
/**
 * Share of full ink the wave still deposits at zero level.
 *
 * MilkDrop draws its waveform at full brightness on silence, as a flat trace.
 * A desktop background should not: a quiet room is the common case, and a
 * static figure smeared across the screen is worse than nothing.
 */
const SILENT_INK = 0.12;
/** Extra ink deposited on the frame a beat is detected. */
const BEAT_INK = 0.45;
/** Ink deposited under the pointer. */
const POINTER_INK = 0.9;

/**
 * Smoothing for the running band averages that normalize audio.
 *
 * MilkDrop's `bass`/`mid`/`treb` are relative: roughly 1.0 at a track's typical
 * level, above on a hit. Presets are written against that — `zoom = 1.01 +
 * 0.02*treb_att` barely moves if fed a raw 0..1 energy. Dividing by a slow
 * running average reproduces the scale the catalog expects.
 */
const LEVEL_AVERAGE_RATE = 0.02;
/** Attack-follower rate for the `*_att` variables. */
const ATTACK_RATE = 0.25;
/** Floor on a running average, so silence cannot divide by ~0. */
const MIN_AVERAGE = 0.02;

// ── field ───────────────────────────────────────────────────────────────────

/**
 * The presets this background cycles through: the vendored MilkDrop catalog
 * narrowed to the ones that resolve to a moving image at cell resolution.
 *
 * See `scripts/audit_butterchurn_catalog.ts` for how the rotation is chosen and
 * why the rest are excluded. The full catalog remains available as
 * `EXOMUX_BUTTERCHURN_CATALOG`.
 */
/**
 * The presets the GPU field cycles: all of them.
 *
 * The GPU renderer runs each preset's own shaders, so it resolves nearly the
 * whole catalog to an image. The software-only field cycles the curated subset
 * below instead, since the CPU path draws far fewer.
 */
export const EXOMUX_BUTTERCHURN_PRESETS: readonly ExomuxButterchurnPresetSource[] = Object.freeze(
  [...EXOMUX_BUTTERCHURN_CATALOG],
);

/**
 * The presets the software-only field cycles: those that resolve to a moving
 * image on the CPU renderer, per `scripts/audit_butterchurn_catalog.ts`
 * (`butterchurn_rotation.ts`). The rest draw with custom waves/shapes and a
 * composite shader the CPU path does not run, so they would auto-skip on sight.
 * Every preset is still reachable by index through the full catalog.
 */
export const EXOMUX_BUTTERCHURN_SOFTWARE_PRESETS: readonly ExomuxButterchurnPresetSource[] = Object.freeze(
  (() => {
    const keep = new Set(EXOMUX_BUTTERCHURN_ROTATION);
    const software = EXOMUX_BUTTERCHURN_CATALOG.filter((preset) => keep.has(preset.name));
    // A stale rotation (or a machine with no CPU-drawable presets) must not
    // leave the background with nothing to cycle.
    return software.length > 0 ? software : [...EXOMUX_BUTTERCHURN_CATALOG];
  })(),
);

/**
 * Whether a rendered field is worth staying on, from three statistics of its
 * ink: the share of lit cells, the mean level, and the mean square.
 *
 * Two ways to fail. Empty is the obvious one. Flat is the other — twenty of the
 * catalog settle into a single solid colour, usually blown-out white where the
 * feedback loop has run away — and a solid field covers the whole desktop, so
 * it scores perfectly on coverage alone. Variance is what tells a rendered
 * frame from a wash.
 *
 * Separated from the field so the thresholds can be exercised directly; they
 * were fitted against the catalog and are easy to regress by eye.
 */
export function exomuxPresetLooksBlank(coverage: number, mean: number, meanSquare: number): boolean {
  if (coverage < DEAD_PRESET_COVERAGE) return true;
  const variance = Math.max(0, meanSquare - mean * mean);
  return coverage > FLAT_PRESET_COVERAGE && variance < FLAT_PRESET_VARIANCE;
}

export interface ExomuxButterchurnFieldOptions {
  /**
   * Audio to visualize. Omit to share the process-wide microphone capture,
   * which is opened on the first advance and released by `dispose`.
   */
  readonly audio?: ExomuxAudioSource;
  /** Preset the field opens on, as an index into the catalog. */
  readonly presetIndex?: number;
  /** Cycle presets on a timer; off leaves the opening preset in place. */
  readonly autoCycle?: boolean;
  /** Catalog override, for tests. */
  readonly catalog?: readonly ExomuxButterchurnPresetSource[];
  /** Seed for the deterministic `rand` presets see. */
  readonly seed?: number;
  /**
   * Run preset shaders on the GPU when one is available. Off forces the CPU
   * renderer, which is what tests use so frames stay reproducible.
   */
  readonly gpu?: boolean;
  /**
   * Show a centered "no GPU" message instead of falling back to the software
   * renderer when no working WebGPU device is found. This is what makes the GPU
   * background distinct from the dedicated software one: it does not pretend to
   * run on the CPU (where most of its catalog resolves to nothing), it says so.
   */
  readonly errorWithoutGpu?: boolean;
  /** Seconds each preset holds before cycling; 0 holds the current one. */
  readonly cycleSeconds?: number;
  /** Frames per second the field advances at; timing scales around it. */
  readonly updateHz?: number;
  /** What the shared analyser listens to when this field owns the capture. */
  readonly audioMode?: ExomuxAudioCaptureMode;
  /**
   * Draw a CPU/WebGPU + preset-name readout in the lower-left, and log GPU and
   * JS messages to `logs/` for diagnosis. Off everywhere except when the
   * background's "Debug overlay" setting is turned on.
   */
  readonly debug?: boolean;
  /**
   * Debug logger to use when `debug` is on. Defaults to a file logger under
   * `logs/`; pass one (e.g. a capturing sink) to divert the output — tests use
   * this to avoid writing files. The caller owns any logger it passes in.
   */
  readonly debugLogger?: ExomuxDebugLogger;
}

interface ButterchurnPointer {
  readonly column: number;
  readonly row: number;
  readonly updatedAt: number;
}

/**
 * The centered notice a GPU-required butterchurn field shows when no working
 * WebGPU device is found — it points at the software background rather than
 * limping along on the CPU renderer. Pure so the content is testable.
 */
export function exomuxButterchurnGpuErrorLines(): readonly string[] {
  return ["no working WebGPU device", "this background needs a GPU", 'try the "butterchurn cpu" background'];
}

/**
 * The two debug-overlay lines: renderer + position, then the preset name.
 * Pure so the content is testable without a field or any I/O.
 */
export function exomuxButterchurnDebugLines(
  mode: string,
  position: number,
  count: number,
  presetName: string,
): readonly [string, string] {
  return [` butterchurn · ${mode} · ${position}/${count}`, ` ▸ ${presetName}`];
}

/**
 * Audio-reactive MilkDrop background. Simulation state is a pair of RGB
 * accumulation buffers at cell resolution plus the active preset's variable
 * pool, so the field is deterministic for a given audio source and timeline.
 */
export class ExomuxButterchurnField implements ExomuxPresetBackground, ExomuxInteractiveBackground {
  #width = 0;
  #height = 0;
  /** Accumulated RGB ink, three floats per cell. */
  #ink = new Float32Array(0);
  /** Warp destination, swapped with `#ink` each frame. */
  #inkNext = new Float32Array(0);

  #audio: ExomuxAudioSource | undefined;
  readonly #ownsAudio: boolean;
  #audioLabel = "starting";

  readonly #catalog: readonly ExomuxButterchurnPresetSource[];
  readonly #seed: number;
  /**
   * Play order: presets already shown, then the ones queued up.
   *
   * Shuffled rather than sequential. Walking a 289-preset catalog in catalog
   * order means the same handful every session, in the same order, and the
   * catalog is alphabetical so those neighbours tend to be variations on one
   * another. A permutation is appended whenever the queue runs short, so every
   * preset is seen once before any repeats — which random picking would not
   * give.
   *
   * Keeping the history in the same array is what lets `Ctrl-N [` go back to
   * what was actually on screen rather than to a catalog neighbour.
   */
  #order: number[] = [];
  #cursor = 0;
  /** State for the order shuffle, so a seeded field is reproducible. */
  #shuffleState: number;
  #presetIndex: number;
  #preset: ExomuxButterchurnPreset;
  /** Outgoing preset during a crossfade; both are evaluated and drawn. */
  #previous: ExomuxButterchurnPreset | undefined;
  #blend = 1;
  readonly #autoCycle: boolean;
  /** Seconds each preset holds; 0 disables the timer like `autoCycle: false`. */
  readonly #cycleSeconds: number;
  /** Milliseconds between authored frames, from the configured update rate. */
  readonly #frameMs: number;
  readonly #audioMode: ExomuxAudioCaptureMode;
  #heldSeconds = 0;

  /** Debug overlay + logging, off unless the "Debug overlay" setting is on. */
  readonly #debug: boolean;
  #logger: ExomuxDebugLogger | undefined;
  /** Whether this field created (and so must dispose) its own logger. */
  #ownsLogger = false;
  /** Last renderer/preset the overlay logged, so transitions log once. */
  #loggedRenderer = "";
  #loggedPreset = "";

  // GPU path. Presets keep rendering on the CPU until a device and the
  // preset's own shaders are both ready, so a missing adapter or a shader that
  // will not compile degrades to the software renderer rather than to nothing.
  readonly #wantsGpu: boolean;
  /** Show a "no GPU" notice instead of the software renderer when none is found. */
  readonly #errorWithoutGpu: boolean;
  #gpu: ExomuxButterchurnGpu | undefined;
  #gpuState: "idle" | "starting" | "ready" | "unavailable" = "idle";
  #gpuPresets = new Map<string, boolean>();
  /** Readback count last seen, and how many frames it has sat still. */
  #gpuReadbacks = -1;
  #gpuStall = 0;
  /** Consecutive frames the active preset has rendered essentially nothing. */
  #deadFrames = 0;
  /** Set once a GPU frame has actually been read back and shown. */
  #gpuEverDrew = false;
  /** The next preset, compiled ahead of its slot so a transition is cheap. */
  #prewarmed: { readonly index: number; readonly preset: ExomuxButterchurnPreset } | undefined;
  readonly #q = new Float32Array(32);

  #time = 0;
  #frame = 0;
  #lastFrameAt: number | undefined;
  #pointer: ButterchurnPointer | undefined;
  /** Window rects from the last advance, so clicks on chrome are not claimed. */
  #windows: readonly Rectangle[] = [];
  #cells: (ExomuxBackgroundCell | undefined)[][] = [];

  /** Mean ink of the previous frame, feeding the brightness governor. */
  #meanInk = 0;

  // Running averages that turn raw band energy into MilkDrop's relative scale.
  #bassAverage = 0.2;
  #midAverage = 0.2;
  #trebleAverage = 0.2;
  #bassAttack = 1;
  #midAttack = 1;
  #trebleAttack = 1;
  readonly #audioInput: {
    bass: number;
    mid: number;
    treb: number;
    bassAttack: number;
    midAttack: number;
    trebleAttack: number;
    waveform: Float32Array;
    bands?: Float32Array;
  } = {
    bass: 1,
    mid: 1,
    treb: 1,
    bassAttack: 1,
    midAttack: 1,
    trebleAttack: 1,
    waveform: new Float32Array(0),
  };

  constructor(options: ExomuxButterchurnFieldOptions = {}) {
    this.#audio = options.audio;
    this.#ownsAudio = options.audio === undefined;
    this.#catalog = options.catalog ?? EXOMUX_BUTTERCHURN_PRESETS;
    if (this.#catalog.length === 0) throw new RangeError("The butterchurn catalog is empty.");
    this.#seed = Math.trunc(options.seed ?? 1);
    const requested = Math.trunc(options.presetIndex ?? 0);
    this.#presetIndex = Number.isFinite(requested)
      ? ((requested % this.#catalog.length) + this.#catalog.length) % this.#catalog.length
      : 0;
    this.#autoCycle = options.autoCycle ?? true;
    const cycle = finite(options.cycleSeconds, PRESET_HOLD_SECONDS);
    this.#cycleSeconds = cycle > 0 ? clamp(cycle, 3, 3600) : 0;
    // Exomux passes its 60 Hz settings default explicitly; bare construction
    // keeps the deterministic baseline cadence the field tests are pinned to.
    this.#frameMs = 1000 / clamp(finite(options.updateHz, 1000 / FRAME_BASELINE_MS), 1, 240);
    this.#audioMode = options.audioMode ?? "mic";
    this.#wantsGpu = options.gpu ?? true;
    this.#errorWithoutGpu = options.errorWithoutGpu === true;
    this.#shuffleState = (this.#seed * 2_246_822_519 + 374_761_393) >>> 0;
    this.#preset = this.#load(this.#presetIndex);
    this.#order = [this.#presetIndex];
    this.#debug = options.debug === true;
    if (this.#debug) {
      this.#ownsLogger = options.debugLogger === undefined;
      this.#logger = options.debugLogger ?? createExomuxDebugLogger();
      this.#logDebug(
        "field",
        `debug on · wantsGpu=${this.#wantsGpu} preset="${this.#preset.name}" (${this.#presetIndex}/${this.#catalog.length})`,
      );
    }
  }

  /** Records a line to the debug log when debug mode is on; a no-op otherwise. */
  #logDebug(category: string, message: string): void {
    this.#logger?.log(category, message);
  }

  /** Preset currently in front; during a blend this is the incoming one. */
  get preset(): ExomuxButterchurnPreset {
    return this.#preset;
  }

  get presetIndex(): number {
    return this.#presetIndex;
  }

  get presetName(): string {
    return this.#preset.name;
  }

  /** Number of presets in the catalog this field is cycling. */
  get presetCount(): number {
    return this.#catalog.length;
  }

  /** Status label for the audio source, e.g. `mic:parec`, `synth`. */
  get audioLabel(): string {
    return this.#audioLabel;
  }

  /** Advances to the next preset in the shuffled order, starting a crossfade. */
  nextPreset(): void {
    this.stepPreset(1);
  }

  /**
   * Moves through the play order: forwards into the shuffle, backwards through
   * what has already been shown.
   */
  stepPreset(delta: number): void {
    const step = Math.trunc(delta);
    if (!Number.isFinite(step) || step === 0) return;
    this.#extendOrder();
    const at = Math.min(this.#order.length - 1, Math.max(0, this.#cursor + step));
    if (at === this.#cursor) return;
    this.#cursor = at;
    this.#activate(this.#order[at]!);
    this.#trimHistory();
  }

  /**
   * Selects a preset by catalog index, wrapping, and starts a crossfade.
   *
   * An explicit choice becomes the new head of the play order: whatever was
   * queued behind it is dropped, so stepping forward afterwards shuffles on
   * from here rather than resuming an order the choice interrupted.
   */
  selectPreset(index: number): void {
    const count = this.#catalog.length;
    const next = ((Math.trunc(index) % count) + count) % count;
    this.#order.length = this.#cursor + 1;
    this.#order.push(next);
    this.#cursor += 1;
    this.#activate(next);
    this.#trimHistory();
  }

  /** Puts a preset on screen, prewarmed if it is the one that was expected. */
  #activate(next: number): void {
    this.#previous = this.#preset;
    this.#presetIndex = next;
    // Built during the outgoing preset's slot when possible: compiling a
    // preset's equations costs tens of milliseconds, which lands as a visible
    // stutter if it happens on the frame the switch is made.
    this.#preset = this.#prewarmed?.index === next ? this.#prewarmed.preset : this.#load(next);
    this.#prewarmed = undefined;
    if (this.#width > 0) this.#preset.setSize(this.#width, this.#height);
    this.#blend = 0;
    this.#heldSeconds = 0;
    this.#deadFrames = 0;
  }

  /** The preset `nextPreset` would move to, so it can be prepared early. */
  #peekNext(): number {
    this.#extendOrder();
    return this.#order[Math.min(this.#order.length - 1, this.#cursor + 1)]!;
  }

  /** Queues another permutation whenever fewer than two presets remain ahead. */
  #extendOrder(): void {
    if (this.#order.length - this.#cursor > 1) return;
    const count = this.#catalog.length;
    const shuffled = Array.from({ length: count }, (_, index) => index);
    for (let index = count - 1; index > 0; index -= 1) {
      const swap = Math.floor(this.#shuffle() * (index + 1));
      [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
    }
    // Without this the seam between two permutations can show the same preset
    // twice running, which is the one repeat the shuffle exists to avoid.
    if (count > 1 && shuffled[0] === this.#order[this.#order.length - 1]) {
      [shuffled[0], shuffled[1]] = [shuffled[1]!, shuffled[0]!];
    }
    this.#order.push(...shuffled);
  }

  /** Keeps the history long enough to step back through, and no longer. */
  #trimHistory(): void {
    if (this.#cursor <= PRESET_HISTORY) return;
    const drop = this.#cursor - PRESET_HISTORY;
    this.#order.splice(0, drop);
    this.#cursor -= drop;
  }

  /** Mulberry32, so a seeded field shuffles the same way twice. */
  #shuffle(): number {
    this.#shuffleState = (this.#shuffleState + 0x6d2b79f5) >>> 0;
    let value = this.#shuffleState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  /**
   * Skips to the next preset when the bare desktop is clicked.
   *
   * The catalog is 289 presets deep and each holds the screen for fifteen
   * seconds, so the fastest way past one you do not want is a click where
   * there is nothing else to hit.
   *
   * Window rects are checked here rather than left to the desktop. The desktop
   * only withholds a click that landed on a window's *client area*, so a field
   * that claimed everything else would swallow title bars, borders and their
   * buttons — taking window dragging, resizing and closing with them.
   */
  pick(column: number, row: number, _now = performance.now()): boolean {
    for (const rect of this.#windows) {
      if (
        column >= rect.column && column < rect.column + rect.width &&
        row >= rect.row && row < rect.row + rect.height
      ) {
        return false;
      }
    }
    this.nextPreset();
    return true;
  }

  setPointer(point: ExomuxBackgroundPoint, now = performance.now()): void {
    if (!Number.isFinite(point.column) || !Number.isFinite(point.row)) return;
    this.#pointer = { column: point.column, row: point.row, updatedAt: finite(now, performance.now()) };
  }

  clearPointer(): void {
    this.#pointer = undefined;
  }

  /** True when the active preset is being rendered by its own shaders. */
  get gpuActive(): boolean {
    return this.#gpuState === "ready" && this.#gpuPresets.get(this.#preset.name) === true;
  }

  /**
   * Which renderer is drawing right now.
   *
   * Worth surfacing because the two are not equivalent: the software path runs
   * preset equations but not preset shaders, so it resolves far fewer of the
   * rotation to an image and drops each preset's colour grading. "starting" is
   * the brief window before the GPU device has been answered for.
   */
  get renderer(): "gpu" | "software" | "starting" {
    if (this.gpuActive) return "gpu";
    // A field told not to use the GPU is on the software path from the outset;
    // only one still waiting on a device request is undecided.
    if (!this.#wantsGpu) return "software";
    return this.#gpuState === "idle" || this.#gpuState === "starting" ? "starting" : "software";
  }

  /** Releases the shared microphone capture and any GPU resources. */
  dispose(): void {
    if (this.#ownsAudio) this.#audio?.close();
    this.#audio = undefined;
    this.#gpu?.destroy();
    this.#gpu = undefined;
    this.#gpuState = "unavailable";
    this.#logDebug("field", "disposed");
    if (this.#ownsLogger) this.#logger?.dispose();
    this.#logger = undefined;
  }

  advance(options: ExomuxBackgroundAdvanceOptions): boolean {
    const bounds = normalizeBounds(options.bounds);
    if (!bounds) return false;
    const now = finite(options.now, performance.now());
    const elapsedMs = this.#lastFrameAt === undefined
      ? this.#frameMs
      : Math.min(MAX_FRAME_DELTA_MS, Math.max(0, now - this.#lastFrameAt));
    this.#lastFrameAt = now;
    if (elapsedMs <= 0) return false;
    const dt = elapsedMs / 1000;

    this.#resize(bounds.width, bounds.height);
    if (this.#width === 0 || this.#height === 0) return false;
    this.#windows = options.solidObstacles ?? options.obstacles ?? [];

    if (!this.#audio && this.#ownsAudio) this.#audio = acquireExomuxAudio(this.#audioMode);
    const audio = this.#audio?.frame(now) ?? SILENCE;
    this.#audioLabel = this.#audio?.label() ?? "silent";

    this.#time += dt;
    this.#frame += 1;
    this.#advancePreset(dt);

    const input = this.#prepareAudio(audio, dt);
    const fps = 1000 / this.#frameMs;
    this.#preset.advance(input, this.#time, this.#frame, fps);
    this.#previous?.advance(input, this.#time, this.#frame, fps);

    // Frames are 125 ms apart; scaling by the real delta keeps motion
    // rate-independent when the desktop stalls or the terminal resizes.
    const frames = elapsedMs / this.#frameMs;
    if (!this.#renderOnGpu(input, audio, frames)) {
      // A GPU-required field with no device shows a notice instead of running
      // the software renderer, so it does not churn through presets the CPU
      // path cannot draw. rasterizeCells paints the message.
      if (this.#showGpuError()) return true;
      this.#warpPass(frames);
      this.#drawWaves(audio, frames);
      this.#drawPointer(bounds, now, frames);
    }
    this.#skipDeadPreset();
    return true;
  }

  /** GPU was required but no working device was found: show a notice, not the CPU. */
  #showGpuError(): boolean {
    return this.#errorWithoutGpu && this.#gpuState === "unavailable";
  }

  rasterizeCells(
    bounds: Rectangle,
    theme: ExomuxThemeSpec,
  ): ReadonlyArray<ReadonlyArray<ExomuxBackgroundCell | undefined>> {
    const normalized = normalizeBounds(bounds);
    if (!normalized || normalized.width !== this.#width || normalized.height !== this.#height) {
      this.#cells = [];
      return this.#cells;
    }
    const { width, height } = normalized;
    this.#ensureCellBuffer(width, height);

    if (this.#showGpuError()) {
      this.#paintGpuError(width, height, theme);
      return this.#cells;
    }

    const ink = this.#ink;
    const accent = theme.accent;
    for (let row = 0; row < height; row += 1) {
      const cells = this.#cells[row]!;
      for (let column = 0; column < width; column += 1) {
        const offset = (row * width + column) * 3;
        const red = ink[offset]!;
        const green = ink[offset + 1]!;
        const blue = ink[offset + 2]!;
        const peak = red > green ? (red > blue ? red : blue) : (green > blue ? green : blue);
        if (!(peak > MIN_INK)) {
          cells[column] = undefined;
          continue;
        }
        // Presets own their palette, the way MilkDrop presets do, but the
        // faintest trailing ink is pulled toward the desktop accent so a
        // dissolving frame settles into the theme instead of onto grey.
        const tint = Math.max(0, MAX_ACCENT_TINT * (1 - peak / ACCENT_TINT_LIMIT));
        const foreground: ExomuxRgb = [
          channel(red, accent[0], tint),
          channel(green, accent[1], tint),
          channel(blue, accent[2], tint),
        ];
        cells[column] = { char: shadeFor(peak), foreground, bold: peak > 0.9 };
      }
    }
    if (this.#debug) this.#paintDebugOverlay(width, height, theme);
    return this.#cells;
  }

  /** Blanks the grid and centers a "no working GPU" notice pointing at the CPU background. */
  #paintGpuError(width: number, height: number, theme: ExomuxThemeSpec): void {
    for (let row = 0; row < height; row += 1) {
      const cells = this.#cells[row]!;
      for (let column = 0; column < width; column += 1) cells[column] = undefined;
    }
    const lines = exomuxButterchurnGpuErrorLines();
    const top = Math.max(0, Math.floor((height - lines.length) / 2));
    for (let index = 0; index < lines.length; index += 1) {
      const row = top + index;
      if (row >= height) break;
      const cells = this.#cells[row]!;
      const text = lines[index]!;
      const start = Math.max(0, Math.floor((width - text.length) / 2));
      for (let offset = 0; offset < text.length && start + offset < width; offset += 1) {
        cells[start + offset] = {
          char: text[offset]!,
          foreground: index === 0 ? theme.accent : theme.text,
          bold: index === 0,
        };
      }
    }
  }

  /**
   * Stamps a two-line readout into the lower-left of the cell grid: the live
   * renderer (CPU vs WebGPU) and the current preset. It lives in the background
   * grid, which is painted before any window, so windows occlude it naturally
   * instead of it floating over their content. Renderer/preset changes are
   * logged as they happen for the debug file.
   */
  #paintDebugOverlay(width: number, height: number, theme: ExomuxThemeSpec): void {
    if (height < 2 || width < 4) return;
    const renderer = this.renderer;
    const mode = renderer === "gpu" ? "WebGPU" : renderer === "starting" ? "GPU…" : "CPU";
    if (renderer !== this.#loggedRenderer) {
      this.#loggedRenderer = renderer;
      this.#logDebug("renderer", `now ${renderer} (${mode})`);
    }
    if (this.#preset.name !== this.#loggedPreset) {
      this.#loggedPreset = this.#preset.name;
      this.#logDebug("preset", `${this.#preset.name} (${this.#presetIndex}/${this.#catalog.length})`);
    }
    const [top, bottom] = exomuxButterchurnDebugLines(
      mode,
      this.#presetIndex + 1,
      this.#catalog.length,
      this.#preset.name,
    );
    this.#writeOverlayLine(height - 2, width, top, theme.accent, true);
    this.#writeOverlayLine(height - 1, width, bottom, theme.text, false);
  }

  /** Overwrites one grid row's leading cells with `text`, clipped to `width`. */
  #writeOverlayLine(row: number, width: number, text: string, foreground: ExomuxRgb, bold: boolean): void {
    const cells = this.#cells[row];
    if (!cells) return;
    const limit = Math.min(width, text.length);
    for (let column = 0; column < limit; column += 1) {
      cells[column] = { char: text[column]!, foreground, bold };
    }
  }

  // ── simulation ────────────────────────────────────────────────────────────

  #load(index: number): ExomuxButterchurnPreset {
    const source = this.#catalog[index]!;
    // Seeded per preset so `rand` is reproducible for a given field and index,
    // which is what keeps the whole field deterministic under test.
    let state = (this.#seed * 2_654_435_761 + index * 40_503) >>> 0;
    const random = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 4_294_967_296;
    };
    return new ExomuxButterchurnPreset(source, {
      meshWidth: MESH_WIDTH,
      meshHeight: MESH_HEIGHT,
      random,
    });
  }

  #resize(width: number, height: number): void {
    if (width === this.#width && height === this.#height) return;
    this.#width = width;
    this.#height = height;
    this.#ink = new Float32Array(width * height * 3);
    this.#inkNext = new Float32Array(width * height * 3);
    this.#cells = [];
    this.#preset.setSize(width, height);
    this.#previous?.setSize(width, height);
  }

  #ensureCellBuffer(width: number, height: number): void {
    if (this.#cells.length === height && (this.#cells[0]?.length ?? -1) === width) return;
    this.#cells = Array.from(
      { length: height },
      () => new Array<ExomuxBackgroundCell | undefined>(width).fill(undefined),
    );
  }

  #advancePreset(dt: number): void {
    if (this.#blend < 1) {
      this.#blend = Math.min(1, this.#blend + dt / PRESET_BLEND_SECONDS);
      if (this.#blend >= 1) this.#previous = undefined;
      return;
    }
    if (!this.#autoCycle) return;
    this.#heldSeconds += dt;
    if (this.#cycleSeconds === 0) return;
    if (this.#heldSeconds > this.#cycleSeconds - PRESET_PREWARM_SECONDS) this.#prewarmNext();
    if (this.#heldSeconds >= this.#cycleSeconds) this.nextPreset();
  }

  /** Compiles the preset after this one, spread across the frames before it. */
  #prewarmNext(): void {
    const next = this.#peekNext();
    if (this.#prewarmed?.index === next) return;
    const preset = this.#load(next);
    if (this.#width > 0) preset.setSize(this.#width, this.#height);
    this.#prewarmed = { index: next, preset };
  }

  /** Converts one analyser frame into the relative scale presets expect. */
  #prepareAudio(audio: ExomuxAudioFrame, dt: number): ExomuxButterchurnAudio {
    const rate = Math.min(1, LEVEL_AVERAGE_RATE * dt * 60);
    this.#bassAverage += (audio.bass - this.#bassAverage) * rate;
    this.#midAverage += (audio.mid - this.#midAverage) * rate;
    this.#trebleAverage += (audio.treble - this.#trebleAverage) * rate;

    const bass = audio.bass / Math.max(MIN_AVERAGE, this.#bassAverage);
    const mid = audio.mid / Math.max(MIN_AVERAGE, this.#midAverage);
    const treble = audio.treble / Math.max(MIN_AVERAGE, this.#trebleAverage);

    const attack = Math.min(1, ATTACK_RATE * dt * 60);
    this.#bassAttack += (bass - this.#bassAttack) * attack;
    this.#midAttack += (mid - this.#midAttack) * attack;
    this.#trebleAttack += (treble - this.#trebleAttack) * attack;

    const input = this.#audioInput;
    input.bass = clampEnergy(bass);
    input.mid = clampEnergy(mid);
    input.treb = clampEnergy(treble);
    input.bassAttack = clampEnergy(this.#bassAttack);
    input.midAttack = clampEnergy(this.#midAttack);
    input.trebleAttack = clampEnergy(this.#trebleAttack);
    input.waveform = audio.waveform;
    input.bands = audio.bands;
    return input;
  }

  /**
   * Renders this frame with the preset's own shaders, returning true when it
   * did. The GPU device is requested once, lazily, and a preset whose shaders
   * will not compile is remembered so it is not retried every frame.
   */
  #renderOnGpu(input: ExomuxButterchurnAudio, audio: ExomuxAudioFrame, frames: number): boolean {
    if (!this.#wantsGpu || this.#gpuState === "unavailable") return false;
    if (this.#gpuState === "idle") {
      this.#gpuState = "starting";
      requestExomuxGpuDevice()
        .then(async (device) => {
          if (!device || this.#gpuState !== "starting") {
            this.#gpuState = "unavailable";
            return;
          }
          // `create` refuses a device that cannot allocate render targets,
          // which is the difference between the software renderer carrying the
          // desktop and a black screen that never recovers.
          const gpu = await ExomuxButterchurnGpu.create(device, { width: this.#width, height: this.#height });
          if (!gpu || this.#gpuState !== "starting") {
            gpu?.destroy();
            this.#gpuState = "unavailable";
            return;
          }
          this.#gpu = gpu;
          this.#gpuState = "ready";
        })
        .catch(() => {
          this.#gpuState = "unavailable";
        });
      return false;
    }
    const gpu = this.#gpu;
    if (this.#gpuState !== "ready" || !gpu) return false;

    const preset = this.#preset;
    const source = this.#catalog[this.#presetIndex]!;
    // Pipelines build in the background. "pending" is not cached: the preset
    // renders on the CPU for the frames it takes, then picks up the GPU.
    const state = this.#gpuPresets.get(preset.name) === false ? "failed" : gpu.prepare(source);
    if (state === "failed") {
      this.#gpuPresets.set(preset.name, false);
      return false;
    }
    if (state === "pending") return false;

    // Start the next preset compiling before it is needed, so a transition
    // does not begin with several frames of software rendering.
    if (this.#autoCycle && this.#cycleSeconds > 0 && this.#heldSeconds > this.#cycleSeconds - PRESET_PREWARM_SECONDS) {
      const next = this.#catalog[(this.#presetIndex + 1) % this.#catalog.length]!;
      if (this.#gpuPresets.get(next.name) !== false) gpu.prepare(next);
    }

    gpu.setSize(this.#width, this.#height);
    for (let index = 0; index < 32; index += 1) this.#q[index] = preset.variable(`q${index + 1}`);
    const values = preset.values;
    gpu.render(preset.name, {
      mesh: preset.mesh,
      meshWidth: preset.meshWidth,
      meshHeight: preset.meshHeight,
      wave: preset.wave,
      waveCount: preset.waveCount,
      waveColor: [
        clamp(values.waveR, 0, 1),
        clamp(values.waveG, 0, 1),
        clamp(values.waveB, 0, 1),
        Math.max(MIN_WAVE_ALPHA, clamp(values.waveAlpha, 0, 1)) * (SILENT_INK + (1 - SILENT_INK) * audio.level),
      ],
      q: this.#q,
      time: this.#time,
      frame: this.#frame,
      fps: 1000 / this.#frameMs,
      // Re-based from the 30 fps the catalog was authored against onto this
      // frame's length, exactly as the software path does. Passed raw, a decay
      // of 0.98 retains 85% of the frame after a second here instead of 54%,
      // and the presets that lean on it to stay bounded never come back down.
      decay: Math.pow(clamp(values.decay, 0, MAX_DECAY), (AUTHORED_FPS / (1000 / this.#frameMs)) * frames),
      bass: input.bass,
      mid: input.mid,
      treb: input.treb,
      bassAttack: input.bassAttack,
      midAttack: input.midAttack,
      trebleAttack: input.trebleAttack,
      aspectX: this.#width / Math.max(1, this.#height * 2),
      aspectY: 1,
      prims: preset.prims,
    });

    // The readback lands a frame late, so the ink buffer keeps the last
    // resolved image until the next one arrives. A count that stops moving
    // means no frame is ever arriving again — a lost device, a rejected map —
    // and continuing would leave a still image on the desktop indefinitely.
    // Falling back to the software renderer keeps the background alive.
    if (gpu.readbacks === this.#gpuReadbacks) {
      this.#gpuStall += 1;
      if (this.#gpuStall > Math.max(GPU_STALL_FRAMES, Math.round(1500 / this.#frameMs)) || gpu.lost) {
        this.#logDebug(
          "gpu-renderer",
          `${
            gpu.lost ? "device lost" : `readback stalled ${this.#gpuStall}f`
          } on "${this.#preset.name}" → software fallback`,
        );
        this.#gpu = undefined;
        this.#gpuState = "unavailable";
        gpu.destroy();
        return false;
      }
    } else {
      this.#gpuReadbacks = gpu.readbacks;
      this.#gpuStall = 0;
    }

    const pixels = gpu.latest;
    if (pixels) {
      this.#absorb(pixels);
      this.#gpuEverDrew = true;
      // A resolved frame is the only proof that this preset's own shaders are
      // what is on screen, which is what `renderer` reports. Without it the
      // status line claimed "software" however well the GPU was doing.
      this.#gpuPresets.set(preset.name, true);
    }
    // Until a GPU frame has actually arrived there is nothing to show, and
    // claiming the frame anyway would leave the desktop black for as long as
    // the device took to answer — or forever, if it never does and the stall
    // watchdog has not yet given up. The software renderer keeps drawing until
    // the GPU has proved it can.
    return this.#gpuEverDrew;
  }

  /**
   * Moves on from a preset that is drawing nothing.
   *
   * Measured on the ink buffer rather than the rendered cells so it costs one
   * pass over the field and reflects whichever renderer produced it.
   */
  #skipDeadPreset(): void {
    // Hold means hold: a preset the user pinned stays put even when it renders
    // nothing, because leaving it is exactly what they turned off.
    if (!this.#autoCycle || this.#cycleSeconds === 0) return;
    const ink = this.#ink;
    const cells = this.#width * this.#height;
    if (cells === 0) return;
    let lit = 0;
    let sum = 0;
    let squares = 0;
    for (let index = 0; index < cells; index += 1) {
      const offset = index * 3;
      const red = ink[offset]!;
      const green = ink[offset + 1]!;
      const blue = ink[offset + 2]!;
      if (red > MIN_INK || green > MIN_INK || blue > MIN_INK) lit += 1;
      const level = (red + green + blue) / 3;
      sum += level;
      squares += level * level;
    }
    if (!exomuxPresetLooksBlank(lit / cells, sum / cells, squares / cells)) {
      this.#deadFrames = 0;
      return;
    }
    this.#deadFrames += 1;
    if (this.#deadFrames >= Math.max(DEAD_PRESET_FRAMES, Math.round(1000 / this.#frameMs))) {
      // The usual cause of "presets cycle every ~1s instead of the configured
      // hold" — logging the coverage and the renderer at the skip tells whether
      // the GPU drew black or the software path did.
      this.#logDebug(
        "dead-skip",
        `"${this.#preset.name}" blank ${this.#deadFrames}f coverage=${
          (lit / cells).toFixed(3)
        } renderer=${this.renderer} — skipping`,
      );
      this.nextPreset();
    }
  }

  /** Copies a resolved GPU frame into the ink buffer the rasterizer reads. */
  #absorb(pixels: Uint8Array): void {
    const ink = this.#ink;
    const count = Math.min(ink.length / 3, pixels.length / 4);
    for (let index = 0; index < count; index += 1) {
      ink[index * 3] = pixels[index * 4]! / 255;
      ink[index * 3 + 1] = pixels[index * 4 + 1]! / 255;
      ink[index * 3 + 2] = pixels[index * 4 + 2]! / 255;
    }
  }

  /**
   * Resamples the previous frame through the active preset's warp mesh.
   *
   * The mesh is coarse — 25x19 vertices against up to 220x55 cells — exactly as
   * in MilkDrop, where the GPU interpolates between them. Here that
   * interpolation is done per cell in the same bilinear form.
   */
  #warpPass(frames: number): void {
    const width = this.#width;
    const height = this.#height;
    const preset = this.#preset;
    const mesh = preset.mesh;
    const gridX = preset.meshWidth;
    const gridY = preset.meshHeight;
    const rowStride = (gridX + 1) * 2;

    // A per-frame decay authored for 30 fps, re-based onto this frame's length.
    // Pulled down when the previous frame came out too bright, which is the
    // only brake the software path has without a composite shader.
    const governor = this.#meanInk > TARGET_MEAN_INK ? TARGET_MEAN_INK / this.#meanInk : 1;
    const decay = Math.pow(
      clamp(preset.values.decay, 0, MAX_DECAY) * governor,
      (AUTHORED_FPS / (1000 / this.#frameMs)) * frames,
    );

    const source = this.#ink;
    const target = this.#inkNext;
    const scaleX = width > 1 ? gridX / (width - 1) : 0;
    const scaleY = height > 1 ? gridY / (height - 1) : 0;
    let total = 0;

    for (let row = 0; row < height; row += 1) {
      const my = row * scaleY;
      const my0 = Math.min(gridY, Math.floor(my));
      const my1 = Math.min(gridY, my0 + 1);
      const fy = my - my0;
      const rowBase0 = my0 * rowStride;
      const rowBase1 = my1 * rowStride;
      for (let column = 0; column < width; column += 1) {
        const mx = column * scaleX;
        const mx0 = Math.min(gridX, Math.floor(mx));
        const mx1 = Math.min(gridX, mx0 + 1);
        const fx = mx - mx0;

        const a = rowBase0 + mx0 * 2;
        const b = rowBase0 + mx1 * 2;
        const c = rowBase1 + mx0 * 2;
        const d = rowBase1 + mx1 * 2;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;

        const u = mesh[a]! * w00 + mesh[b]! * w10 + mesh[c]! * w01 + mesh[d]! * w11;
        const v = mesh[a + 1]! * w00 + mesh[b + 1]! * w10 + mesh[c + 1]! * w01 + mesh[d + 1]! * w11;

        const offset = (row * width + column) * 3;
        sampleBilinear(source, width, height, u * width - 0.5, v * height - 0.5, SAMPLE);
        const red = SAMPLE[0]! * decay;
        const green = SAMPLE[1]! * decay;
        const blue = SAMPLE[2]! * decay;
        target[offset] = red;
        target[offset + 1] = green;
        target[offset + 2] = blue;
        total += red > green ? (red > blue ? red : blue) : (green > blue ? green : blue);
      }
    }

    this.#meanInk = total / Math.max(1, width * height);
    this.#ink = target;
    this.#inkNext = source;
  }

  /** Draws the active preset's waveform, and the outgoing one mid-blend. */
  #drawWaves(audio: ExomuxAudioFrame, frames: number): void {
    const raw = this.#blend;
    // Smoothstep, so a cycle eases in and out instead of snapping.
    const mix = raw * raw * (3 - 2 * raw);
    if (this.#previous && mix < 1) {
      this.#drawWave(this.#previous, audio, frames * (1 - mix));
      this.#drawPrims(this.#previous, frames * (1 - mix));
    }
    this.#drawWave(this.#preset, audio, frames * mix);
    this.#drawPrims(this.#preset, frames * mix);
  }

  /**
   * Custom waves and shapes on the software path: line strips and dots are
   * splatted along their vertices, shape fans as a handful of interior rings.
   * Coarse next to the GPU pass, but these carry most of what many presets
   * draw, and without them those presets are a black screen here.
   */
  #drawPrims(preset: ExomuxButterchurnPreset, weight: number): void {
    if (weight <= 0) return;
    const width = this.#width;
    const height = this.#height;
    const toCell = (nx: number, ny: number): [number, number] => [
      (nx + 1) * 0.5 * width - 0.5,
      (1 - (ny + 1) * 0.5) * height - 0.5,
    ];
    let totalVertices = 0;
    for (const prim of preset.prims) totalVertices += prim.vertexCount;
    if (totalVertices === 0) return;
    for (const prim of preset.prims) {
      const vertices = prim.vertices;
      const count = prim.vertexCount;
      if (count === 0) continue;
      const gain = (PRIM_INK / totalVertices) * weight;
      if (prim.kind === "triangles") {
        // The fan is (centre, edge, edge) triples; splat centre once and walk
        // the rim, pulling a few samples inward so the fill reads as a body.
        for (let vertex = 0; vertex < count; vertex += 3) {
          const at = vertex * 8;
          const [cx, cy] = toCell(vertices[at]!, vertices[at + 1]!);
          const [ex, ey] = toCell(vertices[at + 8]!, vertices[at + 9]!);
          for (const t of [0.33, 0.66, 1]) {
            const alpha = (vertex === 0 ? vertices[at + 7]! : 0) * (1 - t) + vertices[at + 15]! * t;
            const inkGain = gain * 3 * clamp(alpha, 0, 1);
            if (inkGain <= 0) continue;
            this.#splat(
              cx + (ex - cx) * t,
              cy + (ey - cy) * t,
              vertices[at + 12]! * inkGain,
              vertices[at + 13]! * inkGain,
              vertices[at + 14]! * inkGain,
            );
          }
        }
        continue;
      }
      for (let vertex = 0; vertex < count; vertex += 1) {
        const at = vertex * 8;
        const inkGain = gain * clamp(vertices[at + 7]!, 0, 1);
        if (inkGain <= 0) continue;
        const [x, y] = toCell(vertices[at]!, vertices[at + 1]!);
        this.#splat(x, y, vertices[at + 4]! * inkGain, vertices[at + 5]! * inkGain, vertices[at + 6]! * inkGain);
      }
    }
  }

  #drawWave(preset: ExomuxButterchurnPreset, audio: ExomuxAudioFrame, weight: number): void {
    const count = preset.waveCount;
    if (weight <= 0 || count === 0) return;
    const values = preset.values;
    const width = this.#width;
    const height = this.#height;

    // Ink is a fixed budget spread over however many vertices the mode plots,
    // so a 256-point ring and a 64-point line deposit the same total energy.
    const alpha = Math.max(MIN_WAVE_ALPHA, clamp(values.waveAlpha, 0, 1));
    const level = SILENT_INK + (1 - SILENT_INK) * audio.level;
    const beat = audio.beat ? BEAT_INK : 0;
    const gain = (WAVE_INK / count) * weight * level * (alpha + beat);
    if (gain <= 0) return;

    const red = clamp(values.waveR, 0, 1) * gain;
    const green = clamp(values.waveG, 0, 1) * gain;
    const blue = clamp(values.waveB, 0, 1) * gain;
    const wave = preset.wave;
    for (let index = 0; index < count; index += 1) {
      // Wave vertices are in [-1, 1] with y up; cells run top-down.
      const x = (wave[index * 2]! + 1) * 0.5 * width - 0.5;
      const y = (1 - (wave[index * 2 + 1]! + 1) * 0.5) * height - 0.5;
      this.#splat(x, y, red, green, blue);
    }
  }

  #drawPointer(bounds: Rectangle, now: number, frames: number): void {
    const pointer = this.#pointer;
    if (!pointer || now - pointer.updatedAt > POINTER_LIFETIME_MS) return;
    const fade = 1 - (now - pointer.updatedAt) / POINTER_LIFETIME_MS;
    const ink = POINTER_INK * fade * frames;
    // The router reports the pointer in desktop coordinates; the ink buffer is
    // indexed from the bounds origin.
    this.#splat(pointer.column - bounds.column, pointer.row - bounds.row, ink, ink, ink);
  }

  /** Bilinear ink deposit, so wave figures move smoothly between cells. */
  #splat(x: number, y: number, red: number, green: number, blue: number): void {
    const width = this.#width;
    const height = this.#height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const ink = this.#ink;
    for (let dy = 0; dy < 2; dy += 1) {
      const row = y0 + dy;
      if (row < 0 || row >= height) continue;
      const wy = dy === 0 ? 1 - fy : fy;
      if (wy <= 0) continue;
      for (let dx = 0; dx < 2; dx += 1) {
        const column = x0 + dx;
        if (column < 0 || column >= width) continue;
        const weight = wy * (dx === 0 ? 1 - fx : fx);
        if (weight <= 0) continue;
        const offset = (row * width + column) * 3;
        ink[offset] = Math.min(MAX_INK, ink[offset]! + red * weight);
        ink[offset + 1] = Math.min(MAX_INK, ink[offset + 1]! + green * weight);
        ink[offset + 2] = Math.min(MAX_INK, ink[offset + 2]! + blue * weight);
      }
    }
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Scratch RGB triple for `sampleBilinear`; the warp pass runs per cell. */
const SAMPLE = new Float32Array(3);

const SILENT_BANDS = new Float32Array(24);
const SILENT_WAVE = new Float32Array(256);
const SILENCE: ExomuxAudioFrame = Object.freeze({
  level: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  bands: SILENT_BANDS,
  waveform: SILENT_WAVE,
  beat: false,
  source: "starting",
});

/** Keeps a normalized band energy inside the range presets were written for. */
function clampEnergy(value: number): number {
  return Number.isFinite(value) ? Math.min(6, Math.max(0, value)) : 0;
}

function clamp(value: number, low: number, high: number): number {
  return Number.isFinite(value) ? (value < low ? low : value > high ? high : value) : low;
}

/** Clamp-to-edge bilinear read of a three-channel field, written into `out`. */
function sampleBilinear(
  field: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  out: Float32Array,
): void {
  const clampedX = x < 0 ? 0 : x > width - 1 ? width - 1 : x;
  const clampedY = y < 0 ? 0 : y > height - 1 ? height - 1 : y;
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = x0 + 1 < width ? x0 + 1 : x0;
  const y1 = y0 + 1 < height ? y0 + 1 : y0;
  const fx = clampedX - x0;
  const fy = clampedY - y0;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  const o00 = (y0 * width + x0) * 3;
  const o10 = (y0 * width + x1) * 3;
  const o01 = (y1 * width + x0) * 3;
  const o11 = (y1 * width + x1) * 3;
  for (let channel = 0; channel < 3; channel += 1) {
    out[channel] = field[o00 + channel]! * w00 + field[o10 + channel]! * w10 +
      field[o01 + channel]! * w01 + field[o11 + channel]! * w11;
  }
}

/** Block glyph for an ink level; brighter ink fills more of the cell. */
function shadeFor(peak: number): string {
  for (let index = 0; index < SHADE_STOPS.length; index += 1) {
    if (peak < SHADE_STOPS[index]!) return SHADES[index]!;
  }
  return SHADES[SHADES.length - 1]!;
}

/**
 * One output channel, gamma-lifted so faded feedback trails keep their hue,
 * blended `tint` of the way toward the theme's accent channel, then snapped to
 * the quantization grid.
 */
function channel(value: number, accent: number, tint: number): number {
  const lifted = Math.pow(Math.min(1, Math.max(0, value)), INK_GAMMA) * 255;
  const blended = lifted + (accent - lifted) * tint;
  return Math.min(255, Math.round(blended / COLOR_STEP) * COLOR_STEP);
}

function finite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function normalizeBounds(bounds: Rectangle | undefined): Rectangle | undefined {
  if (!bounds) return undefined;
  const width = Math.max(0, Math.floor(bounds.width));
  const height = Math.max(0, Math.floor(bounds.height));
  if (width <= 0 || height <= 0) return undefined;
  return { column: Math.floor(bounds.column), row: Math.floor(bounds.row), width, height };
}
