import { runtimeHost, type RuntimeSignal } from "./runtime/host.ts";
// Copyright 2023 Im-Beast. MIT license.
import { AnsiCanvasSink, BoxObject, Canvas } from "./canvas/mod.ts";
import type { Component } from "./component.ts";
import { type EmitterEvent, EventEmitter } from "./event_emitter.ts";
import type { InputEventRecord } from "./input_reader/mod.ts";
import { Computed, type Signal } from "./signals/mod.ts";
import type { Style } from "./theme.ts";
import type { Rectangle, Stdin, Stdout } from "./types.ts";
import {
  DISABLE_BRACKETED_PASTE,
  DISABLE_ENHANCED_KEYBOARD,
  DISABLE_FOCUS_EVENTS,
  DISABLE_GRAPHEME_CLUSTERING,
  DISABLE_MOUSE,
  ENABLE_BRACKETED_PASTE,
  ENABLE_ENHANCED_KEYBOARD,
  ENABLE_FOCUS_EVENTS,
  ENABLE_GRAPHEME_CLUSTERING,
  ENABLE_MOUSE,
  END_SYNCHRONIZED_OUTPUT,
  HIDE_CURSOR,
  SHOW_CURSOR,
  USE_PRIMARY_BUFFER,
  USE_SECONDARY_BUFFER,
} from "./utils/ansi_codes.ts";
import { RenderLoop } from "./runtime/render_loop.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
let canRunSttyCached: boolean | undefined;
const verifiedTerminalSizeHoldMs = 1_250;

interface RecentlyVerifiedTerminalSize {
  size: { columns: number; rows: number };
  readAt: number;
}

/** Options for configuring tui. */
export interface TuiOptions {
  style?: Style;
  stdin?: Stdin;
  stdout?: Stdout;
  canvas?: Canvas;
  refreshRate?: number;
  renderLoop?: RenderLoop;
  enableMouse?: boolean;
  enableBracketedPaste?: boolean;
  enableFocusEvents?: boolean;
  /**
   * Asks the host terminal to report keys through the kitty keyboard protocol
   * ("disambiguate escape codes"), so chords the legacy encoding folds together
   * — Shift+Enter and Enter, Ctrl+I and Tab, Escape and Alt — arrive as
   * themselves. The input reader decodes both forms to the same key names. A
   * terminal without the protocol ignores the request. Defaults to false.
   */
  enableEnhancedKeyboard?: boolean;
  /** Bracket canvas frame flushes in DEC synchronized output (mode 2026) to prevent mid-flush tearing. Defaults to false. */
  enableSynchronizedOutput?: boolean;
  /** Enable Unicode grapheme cluster width mode (mode 2027) on run and disable it on destroy. Defaults to false. */
  enableGraphemeClustering?: boolean;
  /** Whether this instance should read and track the host terminal size. Defaults to false for a supplied canvas. */
  manageTerminalSize?: boolean;
}

/**
 * Root element of Tui app.
 *
 * This keeps elements running and manages Components as children.
 *
 * @example
 * ```ts
 * const tui = new Tui({
 *   style: crayon.bgBlack,
 *   refreshRate: 1000 / 60,
 * });
 *
 * tui.dispatch();
 * tui.run();
 * ```
 */
export class Tui extends EventEmitter<
  {
    destroy: EmitterEvent<[]>;
  } & InputEventRecord
> {
  stdin: Stdin;
  stdout: Stdout;
  canvas: Canvas;
  rectangle: Signal<Rectangle>;
  style?: Style;
  children: Component[];
  components: Set<Component>;
  drawnObjects: { background?: BoxObject };
  refreshRate: number;
  renderLoop: RenderLoop;
  enableMouse: boolean;
  enableBracketedPaste: boolean;
  enableFocusEvents: boolean;
  enableEnhancedKeyboard: boolean;
  enableSynchronizedOutput: boolean;
  enableGraphemeClustering: boolean;
  readonly manageTerminalSize: boolean;
  private readonly updateCanvasSize: (options?: { verifyWithStty?: boolean }) => void;
  private readonly sigwinchResizeHandler?: () => void;
  private readonly resizePollTimer?: ReturnType<typeof setInterval>;
  private verifiedTerminalSize?: RecentlyVerifiedTerminalSize;
  private destroyed = false;
  private stopDispatch?: () => void;

  constructor(options: TuiOptions) {
    super();
    this.stdin = options.stdin ?? runtimeHost.stdin;
    this.stdout = options.stdout ?? runtimeHost.stdout;
    this.refreshRate = options.refreshRate ?? 1000 / 60;
    this.enableMouse = options.enableMouse ?? false;
    this.enableSynchronizedOutput = options.enableSynchronizedOutput ?? false;
    this.enableGraphemeClustering = options.enableGraphemeClustering ?? false;
    this.manageTerminalSize = options.manageTerminalSize ?? options.canvas === undefined;
    this.canvas = options.canvas ?? new Canvas({
      stdout: this.stdout,
      ...(this.enableSynchronizedOutput
        ? { sink: new AnsiCanvasSink({ stdout: this.stdout, synchronizedOutput: true }) }
        : {}),
      size: terminalSize({ verified: () => this.verifiedTerminalSize }),
    });
    this.updateCanvasSize = (updateOptions = {}) => {
      if (this.destroyed || !this.manageTerminalSize) return;
      const { canvas } = this;
      const { columns, rows } = terminalSize({
        ...updateOptions,
        onVerified: (size) => this.verifiedTerminalSize = { size, readAt: performance.now() },
        verified: () => this.verifiedTerminalSize,
      });

      const size = canvas.size.peek();

      if (size.columns !== columns || size.rows !== rows) {
        canvas.size.value = { columns, rows };
      }
    };
    this.renderLoop = options.renderLoop ?? new RenderLoop({
      intervalMs: this.refreshRate,
      tick: () => {
        this.updateCanvasSize();
        this.canvas.render();
      },
    });
    this.enableBracketedPaste = options.enableBracketedPaste ?? false;
    this.enableFocusEvents = options.enableFocusEvents ?? false;
    this.enableEnhancedKeyboard = options.enableEnhancedKeyboard ?? false;

    this.style = options.style;

    this.drawnObjects = {};
    this.components = new Set();
    this.children = [];

    const tuiRectangle = { column: 0, row: 0, width: 0, height: 0 };
    this.rectangle = new Computed(() => {
      const { columns, rows } = this.canvas.size.value;
      tuiRectangle.width = columns;
      tuiRectangle.height = rows;
      return tuiRectangle;
    });

    if (this.manageTerminalSize) this.updateCanvasSize();

    if (this.manageTerminalSize && runtimeHost.build.os === "windows") {
      this.resizePollTimer = setInterval(this.updateCanvasSize, this.refreshRate);
    } else if (this.manageTerminalSize) {
      this.sigwinchResizeHandler = () => this.updateCanvasSize({ verifyWithStty: true });
      runtimeHost.addSignalListener("SIGWINCH", this.sigwinchResizeHandler);
      this.resizePollTimer = setInterval(
        () => this.updateCanvasSize({ verifyWithStty: true }),
        Math.max(1_000, this.refreshRate * 10),
      );
    }
  }

  addChild(child: Component): void {
    this.children.push(child);
    this.components.add(child);

    if (!child.visible.peek()) return;
    child.draw();
  }

  run(): void {
    const { style, canvas, stdout, drawnObjects } = this;

    if (style) {
      const { background } = drawnObjects;

      background?.erase();

      const box = new BoxObject({
        canvas,
        rectangle: this.rectangle,
        style,
        zIndex: -1,
      });

      drawnObjects.background = box;
      box.draw();
    }

    stdout.write(textEncoder.encode(
      // After the buffer switch: the kitty keyboard stack is per screen.
      USE_SECONDARY_BUFFER + HIDE_CURSOR + (this.enableEnhancedKeyboard ? ENABLE_ENHANCED_KEYBOARD : "") +
        (this.enableGraphemeClustering ? ENABLE_GRAPHEME_CLUSTERING : "") +
        (this.enableBracketedPaste ? ENABLE_BRACKETED_PASTE : "") +
        (this.enableFocusEvents ? ENABLE_FOCUS_EVENTS : "") +
        (this.enableMouse ? ENABLE_MOUSE : ""),
    ));

    this.renderLoop.start();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopDispatch?.();
    this.stopDispatch = undefined;
    this.off();

    this.renderLoop.stop();
    if (this.resizePollTimer !== undefined) clearInterval(this.resizePollTimer);
    if (runtimeHost.build.os !== "windows" && this.sigwinchResizeHandler) {
      try {
        runtimeHost.removeSignalListener("SIGWINCH", this.sigwinchResizeHandler);
      } catch { /**/ }
    }

    try {
      this.stdin.setRaw(false);
    } catch { /**/ }

    this.stdout.write(textEncoder.encode(
      (this.enableSynchronizedOutput ? END_SYNCHRONIZED_OUTPUT : "") +
        (this.enableMouse ? DISABLE_MOUSE : "") +
        (this.enableFocusEvents ? DISABLE_FOCUS_EVENTS : "") +
        (this.enableBracketedPaste ? DISABLE_BRACKETED_PASTE : "") +
        (this.enableGraphemeClustering ? DISABLE_GRAPHEME_CLUSTERING : "") +
        (this.enableEnhancedKeyboard ? DISABLE_ENHANCED_KEYBOARD : "") +
        USE_PRIMARY_BUFFER + SHOW_CURSOR,
    ));

    for (const component of this.components) {
      component.destroy();
    }
  }

  dispatch(): void {
    if (this.stopDispatch) return;
    const destroyDispatcher = () => {
      this.emit("destroy");
    };
    const signalNames: RuntimeSignal[] = [];

    if (runtimeHost.build.os === "windows") {
      runtimeHost.addSignalListener("SIGBREAK", destroyDispatcher);
      signalNames.push("SIGBREAK");

      this.on("keyPress", ({ key, ctrl }) => {
        if (ctrl && key === "c") destroyDispatcher();
      });
    } else {
      runtimeHost.addSignalListener("SIGTERM", destroyDispatcher);
      signalNames.push("SIGTERM");
    }

    runtimeHost.addSignalListener("SIGINT", destroyDispatcher);
    signalNames.push("SIGINT");

    const stopDestroy = this.on("destroy", async () => {
      this.destroy();
      await Promise.resolve();
      runtimeHost.exit(0);
    });
    this.stopDispatch = () => {
      stopDestroy();
      for (const signal of signalNames) {
        try {
          runtimeHost.removeSignalListener(signal, destroyDispatcher);
        } catch { /**/ }
      }
    };
  }
}

function terminalSize(options: {
  verifyWithStty?: boolean;
  onVerified?: (size: { columns: number; rows: number }) => void;
  verified?: () => RecentlyVerifiedTerminalSize | undefined;
} = {}): { columns: number; rows: number } {
  try {
    const denoSize = runtimeHost.consoleSize();
    if (options.verifyWithStty) {
      const sttySize = sttyTerminalSize();
      if (sttySize) {
        options.onVerified?.(sttySize);
        return sttySize;
      }
      return denoSize;
    }
    const verified = options.verified?.();
    if (shouldUseRecentlyVerifiedTerminalSize(denoSize, verified, performance.now())) {
      return verified!.size;
    }
    return denoSize;
  } catch (error) {
    const sttySize = options.verifyWithStty ? sttyTerminalSize() : undefined;
    if (sttySize) {
      options.onVerified?.(sttySize);
      return sttySize;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Tui requires an interactive terminal. Run this command from a TTY or use a report/web task instead. (${detail})`,
    );
  }
}

/** Returns true when a fresh stty-verified terminal size should override Deno.consoleSize. */
export function shouldUseRecentlyVerifiedTerminalSize(
  denoSize: { columns: number; rows: number },
  verified: RecentlyVerifiedTerminalSize | undefined,
  now: number,
  holdMs = verifiedTerminalSizeHoldMs,
): boolean {
  if (!verified) return false;
  if (now - verified.readAt > holdMs) return false;
  return denoSize.columns !== verified.size.columns || denoSize.rows !== verified.size.rows;
}

function sttyTerminalSize(): { columns: number; rows: number } | undefined {
  if (runtimeHost.build.os === "windows") return undefined;
  try {
    if (!canRunStty()) return undefined;
    const output = new runtimeHost.Command("stty", {
      args: ["size"],
      stdin: "inherit",
      stdout: "piped",
      stderr: "null",
    }).outputSync();
    if (!output.success) return undefined;
    const text = textDecoder.decode(output.stdout).trim();
    const [rowsText, columnsText] = text.split(/\s+/, 2);
    const rows = Number.parseInt(rowsText ?? "", 10);
    const columns = Number.parseInt(columnsText ?? "", 10);
    if (!Number.isFinite(rows) || !Number.isFinite(columns) || rows <= 0 || columns <= 0) return undefined;
    return { columns, rows };
  } catch {
    return undefined;
  }
}

function canRunStty(): boolean {
  if (canRunSttyCached !== undefined) return canRunSttyCached;
  try {
    canRunSttyCached = runtimeHost.permissions.querySync({ name: "run", command: "stty" }).state === "granted";
    return canRunSttyCached;
  } catch {
    canRunSttyCached = false;
    return false;
  }
}
