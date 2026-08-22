// Copyright 2023 Im-Beast. MIT license.

// The browser presenter: `ShellPresenter` over the web TUI host. Owns what
// every page used to hand-wire — line signals, the cells-to-ANSI conversion,
// the animation-frame loop — so a page shrinks to "make a presenter, run the
// app". Capabilities are probed, never sniffed: WebGPU is `navigator.gpu`,
// audio input is `navigator.mediaDevices`.

import { Computed, Signal } from "../signals/mod.ts";
import { TextObject, type TextRectangle } from "../canvas/text.ts";
import type { KeyPressEvent } from "../input_reader/types.ts";
import type { PointerInputEvent } from "../pointer_input.ts";
import { type AsyncStore, IndexedDbStore, MemoryStore } from "../runtime/storage.ts";
import type {
  ShellApp,
  ShellAppHandle,
  ShellCapabilities,
  ShellPresentedFrame,
  ShellPresenter,
  ShellPresenterSize,
} from "../app/shell_presenter.ts";
import { runShellApp, shellCellsToAnsiRow } from "../app/shell_presenter.ts";
import { createWebTui, type WebTuiHost, type WebTuiHostOptions } from "./host.ts";

/** Options for the browser presenter; sink metrics default to a fitted font. */
export interface WebPresenterOptions {
  readonly root: HTMLElement;
  /** Extra host services (an audio monitor factory, an overlay loader, …). */
  readonly extras?: Readonly<Record<string, unknown>>;
  /** Passed through to the web TUI host; a fitted font is supplied by default. */
  readonly host?: Partial<WebTuiHostOptions>;
  /** Database name for the IndexedDB stores; defaults to "exotui". */
  readonly storeDatabase?: string;
}

/** A `ShellPresenter` over a browser canvas. Also exposes the underlying host. */
export interface WebShellPresenter extends ShellPresenter {
  readonly host: WebTuiHost;
}

/** Creates the browser presenter; the page supplies a mount element. */
export function webPresenter(options: WebPresenterOptions): WebShellPresenter {
  const host = createWebTui({
    root: options.root,
    sinkOptions: {
      cellWidth: 9,
      cellHeight: 18,
      font: "14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      ...(options.host?.sinkOptions ?? {}),
    },
    ...(options.host ?? {}),
  });

  const columns = () => host.platform.size.peek().columns;
  const rows = () => host.platform.size.peek().rows;
  const lineSignals: Signal<string>[] = [];
  const ensureLineSignals = (): void => {
    for (let row = lineSignals.length; row < rows(); row += 1) {
      const signal = new Signal("");
      const rowIndex = row;
      lineSignals.push(signal);
      new TextObject({
        canvas: host.canvas,
        rectangle: new Computed<TextRectangle>(() => ({ column: 0, row: rowIndex, width: columns() })),
        value: signal,
        overwriteRectangle: true,
        multiCodePointSupport: true,
        style: (text) => text,
        zIndex: 1,
      }).draw();
    }
  };
  ensureLineSignals();

  const capabilities: ShellCapabilities = {
    gpu: typeof navigator !== "undefined" && navigator.gpu !== undefined,
    audioInput: typeof navigator !== "undefined" && navigator.mediaDevices !== undefined,
    extras: options.extras,
  };

  const stores = new Map<string, AsyncStore<unknown>>();
  let disposed = false;
  host.start();

  return {
    host,
    capabilities,
    size: (): ShellPresenterSize => ({ columns: columns(), rows: rows() }),
    onResize(listener) {
      const subscription = () => {
        ensureLineSignals();
        listener({ columns: columns(), rows: rows() });
      };
      host.platform.size.subscribe(subscription);
      return () => host.platform.size.unsubscribe(subscription);
    },
    onKey(listener) {
      const handler = (event: KeyPressEvent) => listener(event);
      host.on("keyPress", handler);
      return () => host.off("keyPress", handler);
    },
    onPointer(listener) {
      const handler = (event: PointerInputEvent) => listener(event);
      host.on("pointerInput", handler);
      return () => host.off("pointerInput", handler);
    },
    present(frame: ShellPresentedFrame) {
      ensureLineSignals();
      const height = rows();
      for (let row = 0; row < height; row += 1) {
        const cells = frame[row];
        if (lineSignals[row]) lineSignals[row]!.value = cells ? shellCellsToAnsiRow(cells) : "";
      }
      for (let row = height; row < lineSignals.length; row += 1) lineSignals[row]!.value = "";
    },
    requestFrame(callback) {
      requestAnimationFrame(callback);
    },
    store<T>(name: string): AsyncStore<T> {
      let store = stores.get(name);
      if (!store) {
        // IndexedDB can be unavailable (private windows, sandboxed frames);
        // an in-memory store keeps the app running with honest volatility.
        try {
          store = new IndexedDbStore({ databaseName: options.storeDatabase ?? "exotui", storeName: name });
        } catch {
          store = new MemoryStore();
        }
        stores.set(name, store);
      }
      return store as AsyncStore<T>;
    },
    now: () => performance.now(),
    dispose() {
      if (disposed) return;
      disposed = true;
      host.destroy();
    },
  };
}

/** One call from a page: presenter plus app, running. */
export function runWebShellApp(options: WebPresenterOptions, app: ShellApp): ShellAppHandle {
  return runShellApp(webPresenter(options), app);
}
