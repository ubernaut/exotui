// Copyright 2023 Im-Beast. MIT license.

// Plan 042 slice C. Picking a colour in a terminal, on perceptual axes.
//
// The axes are OKLCH first and RGB second on purpose. Dragging lightness in
// OKLCH keeps the hue where you put it, so "the same colour, but readable"
// is one slider move; doing the same in RGB drifts the hue and you end up
// picking again. RGB is still there because sometimes you know the number.
//
// The controller is pure and holds the whole picker: the colour, which axis is
// selected, the half-typed hex draft, and the swatches offered for reuse.
// Nothing here renders, so the same picker drives the component below, a
// painter-based app that draws its own rows, and a test.

import { Component, type ComponentOptions } from "../component.ts";
import { Box } from "./box.ts";
import { Computed, Signal } from "../signals/mod.ts";
import type { Rgb } from "../theme_expressions.ts";
import { type Oklch, oklchToRgb, rgbToOklch } from "../theme_oklch.ts";
import { contrastRatio } from "../theme_contrast.ts";
import { formatHexColor, parseHexColor } from "../theme_editor_model.ts";

/** The axes a colour can be moved along. */
export const COLOR_PICKER_AXIS_IDS = ["lightness", "chroma", "hue", "red", "green", "blue"] as const;

/** Public type alias for a colour picker axis id. */
export type ColorPickerAxisId = (typeof COLOR_PICKER_AXIS_IDS)[number];

/** One axis as the UI shows it. */
export interface ColorPickerAxis {
  readonly id: ColorPickerAxisId;
  readonly label: string;
  /** Current position, in the axis's own units. */
  readonly value: number;
  readonly min: number;
  readonly max: number;
  /** One arrow-key press. */
  readonly step: number;
  /** Position from 0 to 1, for drawing a track. */
  readonly fraction: number;
  /** The value formatted for display. */
  readonly text: string;
}

/** A colour offered for reuse, with what it is used for. */
export interface ColorPickerSwatch {
  readonly color: Rgb;
  readonly hex: string;
  readonly label?: string;
}

/** Everything the picker shows. */
export interface ColorPickerInspection {
  readonly color: Rgb;
  readonly hex: string;
  /** What is in the hex field, which may not be a colour yet while typing. */
  readonly draft: string;
  readonly draftValid: boolean;
  readonly axis: ColorPickerAxisId;
  readonly axes: readonly ColorPickerAxis[];
  readonly swatches: readonly ColorPickerSwatch[];
  /** Index of the swatch matching the current colour, or -1. */
  readonly swatchIndex: number;
}

/** Options for a colour picker. */
export interface ColorPickerControllerOptions {
  readonly color?: Rgb;
  readonly swatches?: readonly ColorPickerSwatch[];
  /** Called whenever the colour changes, for live preview. */
  readonly onChange?: (color: Rgb) => void;
}

const AXIS_LABELS: Readonly<Record<ColorPickerAxisId, string>> = Object.freeze({
  lightness: "Lightness",
  chroma: "Chroma",
  hue: "Hue",
  red: "Red",
  green: "Green",
  blue: "Blue",
});

// Chroma above 0.37 is outside sRGB for every hue, so the axis stops there
// rather than pretending to have range it cannot show.
const MAX_CHROMA = 0.37;

/**
 * The picker's whole state. Every mutator is total: an out-of-range value is
 * clamped, an unparseable hex leaves the colour alone, and a colour outside
 * sRGB is gamut-mapped by `oklchToRgb` rather than rejected.
 */
export class ColorPickerController {
  readonly color: Signal<Rgb>;
  readonly axis: Signal<ColorPickerAxisId>;
  readonly draft: Signal<string>;
  readonly swatches: Signal<readonly ColorPickerSwatch[]>;
  readonly #onChange?: (color: Rgb) => void;

  constructor(options: ColorPickerControllerOptions = {}) {
    const initial = options.color ?? [0, 0, 0];
    this.color = new Signal<Rgb>(normalize(initial));
    this.axis = new Signal<ColorPickerAxisId>("lightness");
    this.draft = new Signal(formatHexColor(initial));
    this.swatches = new Signal<readonly ColorPickerSwatch[]>(options.swatches ?? []);
    this.#onChange = options.onChange;
  }

  /** Replaces the colour, syncing the hex field with it. */
  setColor(color: Rgb): void {
    const next = normalize(color);
    const current = this.color.peek();
    if (current[0] === next[0] && current[1] === next[1] && current[2] === next[2]) return;
    this.color.value = next;
    this.draft.value = formatHexColor(next);
    this.#onChange?.(next);
  }

  /** Moves the selected axis by `steps` of its own step size. */
  nudge(steps: number): void {
    this.adjust(this.axis.peek(), steps);
  }

  /** Moves one axis by `steps` of its step size, clamped to the axis range. */
  adjust(id: ColorPickerAxisId, steps: number): void {
    if (!Number.isFinite(steps) || steps === 0) return;
    const axis = this.axes().find((candidate) => candidate.id === id);
    if (!axis) return;
    this.setAxis(id, axis.value + axis.step * steps);
  }

  /** Sets one axis to an absolute value in its own units. */
  setAxis(id: ColorPickerAxisId, value: number): void {
    if (!Number.isFinite(value)) return;
    const color = this.color.peek();
    if (id === "red" || id === "green" || id === "blue") {
      const index = id === "red" ? 0 : id === "green" ? 1 : 2;
      const channels: [number, number, number] = [color[0], color[1], color[2]];
      channels[index] = clamp(value, 0, 255);
      this.setColor(channels);
      return;
    }
    const oklch = rgbToOklch(color);
    const next: Oklch = id === "lightness"
      ? { ...oklch, l: clamp(value, 0, 1) }
      : id === "chroma"
      ? { ...oklch, c: clamp(value, 0, MAX_CHROMA) }
      : { ...oklch, h: wrapHue(value) };
    this.setColor(oklchToRgb(next));
  }

  /** Moves the axis selection, wrapping at both ends. */
  selectAxis(id: ColorPickerAxisId): void {
    this.axis.value = id;
  }

  /** Steps the axis selection by `delta`, wrapping. */
  cycleAxis(delta: number): void {
    const index = COLOR_PICKER_AXIS_IDS.indexOf(this.axis.peek());
    const count = COLOR_PICKER_AXIS_IDS.length;
    const next = ((index + Math.trunc(delta)) % count + count) % count;
    this.axis.value = COLOR_PICKER_AXIS_IDS[next]!;
  }

  /**
   * Takes what is in the hex field. Typing is allowed to be invalid — you have
   * to pass through "#f7" to reach "#f765b8" — so the draft is kept and the
   * colour only moves once the draft parses.
   */
  setDraft(text: string): boolean {
    this.draft.value = text;
    const parsed = parseHexColor(text);
    if (!parsed) return false;
    const next = normalize(parsed);
    const current = this.color.peek();
    if (current[0] !== next[0] || current[1] !== next[1] || current[2] !== next[2]) {
      this.color.value = next;
      this.#onChange?.(next);
    }
    return true;
  }

  /** Restores the hex field to the current colour, discarding a bad draft. */
  resetDraft(): void {
    this.draft.value = formatHexColor(this.color.peek());
  }

  /** Picks one of the offered swatches; out-of-range indices are ignored. */
  selectSwatch(index: number): boolean {
    const swatch = this.swatches.peek()[index];
    if (!swatch) return false;
    this.setColor(swatch.color);
    return true;
  }

  /** Replaces the reusable colours. */
  setSwatches(swatches: readonly ColorPickerSwatch[]): void {
    this.swatches.value = swatches;
  }

  /** The six axes at their current positions. */
  axes(): readonly ColorPickerAxis[] {
    const color = this.color.peek();
    const oklch = rgbToOklch(color);
    return [
      axis("lightness", oklch.l, 0, 1, 0.01, `${(oklch.l * 100).toFixed(0)}%`),
      axis("chroma", oklch.c, 0, MAX_CHROMA, 0.005, oklch.c.toFixed(3)),
      axis("hue", oklch.h, 0, 360, 2, `${oklch.h.toFixed(0)}°`),
      axis("red", color[0], 0, 255, 1, String(color[0])),
      axis("green", color[1], 0, 255, 1, String(color[1])),
      axis("blue", color[2], 0, 255, 1, String(color[2])),
    ];
  }

  /** How readable this colour is against another — the picker's live check. */
  contrastAgainst(background: Rgb): number {
    return contrastRatio(this.color.peek(), background);
  }

  /** Everything the UI needs, in one snapshot. */
  inspect(): ColorPickerInspection {
    const color = this.color.peek();
    const hex = formatHexColor(color);
    const draft = this.draft.peek();
    const swatches = this.swatches.peek();
    return {
      color,
      hex,
      draft,
      draftValid: parseHexColor(draft) !== undefined,
      axis: this.axis.peek(),
      axes: this.axes(),
      swatches,
      swatchIndex: swatches.findIndex((swatch) => swatch.hex === hex),
    };
  }

  dispose(): void {
    this.color.dispose();
    this.axis.dispose();
    this.draft.dispose();
    this.swatches.dispose();
  }
}

/** Options for the colour picker component. */
export interface ColorPickerOptions extends ComponentOptions {
  readonly controller: ColorPickerController;
}

/**
 * A minimal component wrapper: the swatch of the current colour. Apps that
 * draw their own chrome use the controller directly and paint the axes
 * however they like; this exists so a plain exotui app can drop a live
 * preview into a layout without writing one.
 */
export class ColorPicker extends Component {
  constructor(private readonly options: ColorPickerOptions) {
    super(options);
  }

  override draw(): void {
    super.draw();
    const controller = this.options.controller;
    const box = new Box({
      parent: this,
      theme: {
        ...this.theme,
        base: new Computed(() => {
          const [red, green, blue] = controller.color.value;
          return (text: string) => `\x1b[48;2;${red};${green};${blue}m${text}\x1b[49m`;
        }).value,
      },
      rectangle: this.rectangle,
      zIndex: this.zIndex,
      visible: this.visible,
    });
    box.subComponentOf = this;
    this.subComponents.box = box;
  }
}

function axis(
  id: ColorPickerAxisId,
  value: number,
  min: number,
  max: number,
  step: number,
  text: string,
): ColorPickerAxis {
  const span = max - min;
  return {
    id,
    label: AXIS_LABELS[id],
    value,
    min,
    max,
    step,
    fraction: span === 0 ? 0 : clamp((value - min) / span, 0, 1),
    text,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapHue(value: number): number {
  return ((value % 360) + 360) % 360;
}

function normalize(color: Rgb): Rgb {
  return [channel(color[0]), channel(color[1]), channel(color[2])];
}

function channel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}
