// Copyright 2023 Im-Beast. MIT license.
import { Component, type ComponentOptions } from "../component.ts";
import { Computed, Signal } from "../signals/mod.ts";
import { signalify } from "../utils/signals.ts";
import { drawTextRows } from "./text_children.ts";

/**
 * A compact value picker: one value flanked by `<` / `>` affordances that step
 * through a fixed set of options. The left half of the control steps to the
 * previous value, the right half to the next; the wheel and left/right (or
 * up/down) arrows do the same. Unlike `Stepper` (a multi-step wizard indicator)
 * this shows a single current value, the way a settings row cycles one choice.
 */

/** Options for configuring cycler. */
export interface CyclerOptions extends ComponentOptions, CyclerControllerOptions {
  controller?: CyclerController;
}

/** Options for configuring cycler Controller. */
export interface CyclerControllerOptions {
  options: string[] | Signal<string[]>;
  activeIndex?: number | Signal<number>;
  /** Wrap past the ends instead of clamping (default true — settings cycle). */
  wrap?: boolean | Signal<boolean>;
  onChange?: (value: string, index: number) => void | Promise<void>;
}

/** Serializable inspection snapshot for cycler. */
export interface CyclerInspection {
  options: string[];
  optionCount: number;
  activeIndex: number;
  active?: string;
  empty: boolean;
}

function clampCyclerIndex(length: number, index: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(index), length - 1));
}

/** Composes the `< value >` row, centering the value and clipping to width. */
export function renderCycler(value: string, width: number): string {
  const safeWidth = Math.max(0, Math.floor(width));
  if (safeWidth === 0) return "";
  if (safeWidth <= 2) return "<>".slice(0, safeWidth);
  const inner = safeWidth - 4;
  if (inner < 1) return `<${" ".repeat(safeWidth - 2)}>`;
  const glyphs = Array.from(value);
  const shown = glyphs.length > inner
    ? Array.from({ length: inner }, (_, i) => (i === inner - 1 ? "…" : glyphs[i]!)).join("")
    : value;
  const pad = inner - Array.from(shown).length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return `< ${" ".repeat(left)}${shown}${" ".repeat(right)} >`;
}

/** State controller for cycler behavior. */
export class CyclerController {
  readonly options: Signal<string[]>;
  readonly activeIndex: Signal<number>;
  readonly wrap: Signal<boolean>;
  readonly #ownsOptions: boolean;
  readonly #ownsActiveIndex: boolean;
  readonly #ownsWrap: boolean;
  readonly #onChange?: (value: string, index: number) => void | Promise<void>;
  readonly #syncSelection = () => {
    this.activeIndex.value = clampCyclerIndex(this.options.peek().length, this.activeIndex.peek());
  };

  constructor(options: CyclerControllerOptions) {
    this.#ownsOptions = !(options.options instanceof Signal);
    this.#ownsActiveIndex = !(options.activeIndex instanceof Signal);
    this.#ownsWrap = !(options.wrap instanceof Signal);
    this.options = signalify(options.options, { deepObserve: true });
    this.activeIndex = signalify(options.activeIndex ?? 0);
    this.wrap = signalify(options.wrap ?? true);
    this.#onChange = options.onChange;
    this.options.subscribe(this.#syncSelection);
    this.#syncSelection();
  }

  active(): string | undefined {
    return this.options.peek()[clampCyclerIndex(this.options.peek().length, this.activeIndex.peek())];
  }

  setActive(index: number): string | undefined {
    const length = this.options.peek().length;
    if (length === 0) return undefined;
    const next = clampCyclerIndex(length, index);
    if (next !== this.activeIndex.peek()) {
      this.activeIndex.value = next;
      const value = this.options.peek()[next];
      if (value !== undefined) void this.#onChange?.(value, next);
    }
    return this.options.peek()[next];
  }

  move(delta: number): string | undefined {
    const length = this.options.peek().length;
    if (length === 0 || !delta) return undefined;
    const step = Math.trunc(delta);
    const current = clampCyclerIndex(length, this.activeIndex.peek());
    const next = this.wrap.peek()
      ? ((current + step) % length + length) % length
      : clampCyclerIndex(length, current + step);
    return this.setActive(next);
  }

  handleKeyPress({ key, ctrl, meta, shift }: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean }): void {
    if (ctrl || meta || shift) return;
    if (key === "left" || key === "up") this.move(-1);
    else if (key === "right" || key === "down") this.move(1);
  }

  /** Steps by which half of the control (`x` relative to its left edge) was hit. */
  handlePointer(width: number, offsetX: number): void {
    this.move(offsetX < Math.max(1, Math.floor(width / 2)) ? -1 : 1);
  }

  handleScroll(scroll: number): void {
    if (scroll) this.move(scroll > 0 ? 1 : -1);
  }

  inspect(): CyclerInspection {
    const options = [...this.options.peek()];
    const activeIndex = clampCyclerIndex(options.length, this.activeIndex.peek());
    return {
      options,
      optionCount: options.length,
      activeIndex,
      active: options[activeIndex],
      empty: options.length === 0,
    };
  }

  dispose(): void {
    this.options.unsubscribe(this.#syncSelection);
    if (this.#ownsOptions) this.options.dispose();
    if (this.#ownsActiveIndex) this.activeIndex.dispose();
    if (this.#ownsWrap) this.wrap.dispose();
  }
}

/** Public class implementing a cycler. */
export class Cycler extends Component {
  options: Signal<string[]>;
  activeIndex: Signal<number>;
  readonly controller: CyclerController;
  readonly #rows: Computed<string[]>;

  constructor(options: CyclerOptions) {
    super(options);
    const ownsController = !options.controller;
    this.controller = options.controller ??
      new CyclerController({
        options: options.options,
        activeIndex: options.activeIndex,
        wrap: options.wrap,
        onChange: options.onChange,
      });
    this.options = this.controller.options;
    this.activeIndex = this.controller.activeIndex;
    this.#rows = new Computed(() => [renderCycler(this.controller.active() ?? "", this.rectangle.value.width)]);

    this.on("keyPress", (event) => this.controller.handleKeyPress(event));
    this.on("mousePress", ({ x, drag, ctrl, meta, shift }) => {
      if (drag || ctrl || meta || shift) return;
      const rectangle = this.rectangle.peek();
      this.controller.handlePointer(rectangle.width, x - rectangle.column);
    });
    this.on("mouseScroll", ({ scroll }) => this.controller.handleScroll(scroll));
    this.on("destroy", () => this.#rows.dispose());
    if (ownsController) this.on("destroy", () => this.controller.dispose());
  }

  active(): string | undefined {
    return this.controller.active();
  }

  move(delta: number): void {
    this.controller.move(delta);
  }

  /** A Cycler is an interactable focus target like Slider and Button. */
  override interact(method: "keyboard" | "mouse"): void {
    super.interact(method);
    this.state.value = this.nextInteractionState(method);
  }

  override draw(): void {
    super.draw();
    drawTextRows(this, this.#rows);
  }
}
