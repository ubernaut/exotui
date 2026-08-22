// Copyright 2023 Im-Beast. MIT license.

// The presenter seam: one interface between a cell-composed application and
// whatever shows the cells. An application written against this — and only
// this — runs in a terminal and in a browser with zero additional code paths;
// the presenters differ, the application does not (plan 045).
//
// The seam deliberately owns very little: a live grid size, the input event
// stream both hosts already emit (`KeyPressEvent`, `PointerInputEvent`), a
// frame scheduler, a store factory, and a capability record resolved by
// probing. Anything one host cannot supply is absent from the record, and an
// honest application renders "waiting", never a fake.

import type { KeyPressEvent, MouseScrollEvent } from "../input_reader/types.ts";
import type { PointerInputEvent } from "../pointer_input.ts";
import type { AsyncStore } from "../runtime/storage.ts";
import type { ShellRgb, ShellStyle } from "./workbench_shell.ts";

/** One composed cell: a glyph and its resolved style. */
export interface ShellPresentedCell {
  readonly char: string;
  readonly foreground?: ShellRgb;
  readonly background?: ShellRgb;
  readonly bold?: boolean;
}

/** A full frame, row-major; every row is exactly the grid width. */
export type ShellPresentedFrame = ReadonlyArray<ReadonlyArray<ShellPresentedCell>>;

/** The live grid size, in cells. */
export interface ShellPresenterSize {
  readonly columns: number;
  readonly rows: number;
}

/**
 * What this host can actually do, resolved by probing at construction.
 * `extras` carries host-provided services beyond booleans — an audio monitor
 * factory, an overlay loader, an external-link opener — keyed by name; an
 * application treats a missing extra exactly like a false boolean.
 */
export interface ShellCapabilities {
  readonly gpu: boolean;
  readonly audioInput: boolean;
  readonly extras?: Readonly<Record<string, unknown>>;
}

/** The seam. Two implementations exist: the console and the browser. */
export interface ShellPresenter {
  readonly capabilities: ShellCapabilities;
  size(): ShellPresenterSize;
  onResize(listener: (size: ShellPresenterSize) => void): () => void;
  onKey(listener: (event: KeyPressEvent) => void): () => void;
  onPointer(listener: (event: PointerInputEvent) => void): () => void;
  /** Wheel/scroll events, in the same shape both hosts already emit. */
  onWheel(listener: (event: MouseScrollEvent) => void): () => void;
  /** Shows one composed frame; the presenter owns diffing and output. */
  present(frame: ShellPresentedFrame): void;
  /** Schedules one callback for the next frame; the loop re-arms itself. */
  requestFrame(callback: (now: number) => void): void;
  /** A named durable store — IndexedDB in a browser, a file on Deno. */
  store<T>(name: string): AsyncStore<T>;
  now(): number;
  dispose(): void;
}

/** An application, written once: compose frames, take events. */
export interface ShellApp {
  /** Runs before the first frame; load persisted state here. */
  init?(presenter: ShellPresenter): void | Promise<void>;
  frame(now: number, size: ShellPresenterSize): ShellPresentedFrame;
  key?(event: KeyPressEvent): void;
  pointer?(event: PointerInputEvent): void;
  wheel?(event: MouseScrollEvent): void;
  resize?(size: ShellPresenterSize): void;
}

/** A running application; stopping releases the presenter's resources. */
export interface ShellAppHandle {
  stop(): void;
}

/**
 * The one loop both hosts share: subscribe events, compose, present, re-arm.
 * This is the whole of "running an exotui app" once a presenter exists.
 */
export function runShellApp(presenter: ShellPresenter, app: ShellApp): ShellAppHandle {
  let running = true;
  const unsubscribes: Array<() => void> = [];
  if (app.key) unsubscribes.push(presenter.onKey((event) => app.key!(event)));
  if (app.pointer) unsubscribes.push(presenter.onPointer((event) => app.pointer!(event)));
  if (app.wheel) unsubscribes.push(presenter.onWheel((event) => app.wheel!(event)));
  if (app.resize) unsubscribes.push(presenter.onResize((size) => app.resize!(size)));
  const tick = (now: number): void => {
    if (!running) return;
    presenter.present(app.frame(now, presenter.size()));
    presenter.requestFrame(tick);
  };
  Promise.resolve(app.init?.(presenter)).then(() => {
    if (running) presenter.requestFrame(tick);
  });
  return {
    stop() {
      if (!running) return;
      running = false;
      for (const unsubscribe of unsubscribes) unsubscribe();
      presenter.dispose();
    },
  };
}

/**
 * One row of presented cells as an ANSI string, styles emitted only when they
 * change — the encoding both presenters feed their sinks.
 */
export function shellCellsToAnsiRow(cells: ReadonlyArray<ShellPresentedCell>): string {
  let line = "";
  let current = "";
  for (const cell of cells) {
    const style = `${cell.foreground?.join(",") ?? ""}|${cell.background?.join(",") ?? ""}|${cell.bold ? "b" : ""}`;
    if (style !== current) {
      current = style;
      line += "\x1b[0m";
      if (cell.bold) line += "\x1b[1m";
      if (cell.foreground) line += `\x1b[38;2;${cell.foreground.join(";")}m`;
      if (cell.background) line += `\x1b[48;2;${cell.background.join(";")}m`;
    }
    line += cell.char;
  }
  return `${line}\x1b[0m`;
}

/** A presented cell from a shell style plus glyph, for painters that have one. */
export function shellPresentedCell(char: string, style: ShellStyle): ShellPresentedCell {
  return { char, foreground: style.foreground, background: style.background, bold: style.bold };
}
