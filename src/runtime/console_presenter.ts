import { runtimeHost } from "./host.ts";
// Copyright 2023 Im-Beast. MIT license.

// The console presenter: `ShellPresenter` over a real terminal. The other
// half of plan 045 — an application composed of cells runs here and in a
// browser with zero additional code paths. Output goes through the diffing
// ANSI screen painter; input arrives from the terminal reader and is adapted
// into the same pointer envelope the browser platform emits, so the
// application sees one event shape on both hosts.

import { EventEmitter } from "../event_emitter.ts";
import type { Stdin } from "../types.ts";
import type { CanvasStdout } from "../canvas/sink.ts";
import { emitInputEvents, type InputEventRecord } from "../input_reader/mod.ts";
import type { KeyPressEvent, MousePressEvent, MouseScrollEvent } from "../input_reader/types.ts";
import { InputEnvelopeFactory } from "../input_envelope.ts";
import { adaptTerminalMousePointer, type PointerInputEvent } from "../pointer_input.ts";
import { type AsyncStore, JsonFileStore, MemoryStore } from "./storage.ts";
import { WorkbenchAnsiScreenPainter } from "../app/workbench_ansi_screen.ts";
import { renderFrameRow, renderFrameSlice, toStyledCells } from "../app/workbench_frame.ts";
import type {
  ShellApp,
  ShellAppHandle,
  ShellCapabilities,
  ShellPresentedFrame,
  ShellPresenter,
  ShellPresenterSize,
} from "../app/shell_presenter.ts";
import { runShellApp, shellCellsToAnsiRow } from "../app/shell_presenter.ts";

/** Options for the console presenter. */
export interface ConsolePresenterOptions {
  /** Extra host services, mirroring the browser presenter's record. */
  readonly extras?: Readonly<Record<string, unknown>>;
  /** Directory JSON stores live in; defaults to `.exotui` under HOME (or cwd). */
  readonly storeDirectory?: string;
  /** Frame interval in milliseconds; defaults to ~30 frames per second. */
  readonly frameIntervalMs?: number;
}

const ENTER_SCREEN = "\x1b[?1049h\x1b[?25l\x1b[?1002h\x1b[?1003h\x1b[?1006h";
const LEAVE_SCREEN = "\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?25h\x1b[?1049l";

/**
 * Creates the console presenter. Enters the alternate screen with mouse
 * reporting immediately; `dispose` restores the terminal.
 */
export function consolePresenter(options: ConsolePresenterOptions = {}): ShellPresenter {
  const storeDirectory = options.storeDirectory ?? `${runtimeHost.env.get("HOME") ?? "."}/.exotui`;
  return consolePresenterForHost({
    stdin: runtimeHost.stdin,
    stdout: runtimeHost.stdout,
    size: consoleSizeNow,
    cbreak: runtimeHost.build.os !== "windows",
    watchResize: runtimeHost.build.os === "windows" ? undefined : (listener) => {
      runtimeHost.addSignalListener("SIGWINCH", listener);
      return () => runtimeHost.removeSignalListener("SIGWINCH", listener);
    },
    store<T>(name: string) {
      try {
        runtimeHost.mkdirSync(storeDirectory, { recursive: true });
        return new JsonFileStore<T>(`${storeDirectory}/${name}.json`);
      } catch {
        return new MemoryStore<T>();
      }
    },
  }, options);
}

/** Internal console services; the presenter does not need the full OS host. */
export interface ConsolePresenterHost {
  readonly stdin: Pick<Stdin, "read" | "setRaw">;
  readonly stdout: CanvasStdout;
  readonly cbreak: boolean;
  size(): ShellPresenterSize;
  watchResize?(listener: () => void): () => void;
  store<T>(name: string): AsyncStore<T>;
  onInputError?(error: unknown): void;
}

/** Internal host-injected console presenter. */
export function consolePresenterForHost(
  host: ConsolePresenterHost,
  options: ConsolePresenterOptions = {},
): ShellPresenter {
  const encoder = new TextEncoder();
  const stdout = host.stdout;
  const write = (text: string) => stdout.writeSync(encoder.encode(text));
  write(ENTER_SCREEN);

  const painter = new WorkbenchAnsiScreenPainter(stdout);
  const emitter = new EventEmitter<InputEventRecord>();
  const abort = new AbortController();
  const envelopes = new InputEnvelopeFactory({ now: Date.now });
  void emitInputEvents(host.stdin, emitter, 0, { signal: abort.signal, cbreak: host.cbreak }).catch((error) => {
    if (!abort.signal.aborted) {
      if (host.onInputError) host.onInputError(error);
      else throw error;
    }
  });

  let size: ShellPresenterSize = host.size();
  const resizeListeners = new Set<(size: ShellPresenterSize) => void>();
  const pollResize = () => {
    const next = host.size();
    if (next.columns !== size.columns || next.rows !== size.rows) {
      size = next;
      for (const listener of resizeListeners) listener(size);
    }
  };
  const resizeTimer = setInterval(pollResize, 250);
  let unwatch: (() => void) | undefined;
  try {
    unwatch = host.watchResize?.(pollResize);
  } catch {
    // Polling still detects size changes.
  }

  const pointerListeners = new Set<(event: PointerInputEvent) => void>();
  const emitPointer = (event: MousePressEvent | MouseScrollEvent): void => {
    const envelope = envelopes.create("terminal", {
      kind: "pointer",
      device: "mouse",
      modifiers: {
        alt: false,
        ctrl: event.ctrl === true,
        meta: event.meta === true,
        shift: event.shift === true,
      },
      data: {},
    });
    let pointer: PointerInputEvent;
    try {
      pointer = adaptTerminalMousePointer(envelope, event);
    } catch {
      return;
    }
    for (const listener of pointerListeners) listener(pointer);
  };
  emitter.on("mousePress", emitPointer);
  const wheelListeners = new Set<(event: MouseScrollEvent) => void>();
  emitter.on("mouseScroll", (event) => {
    for (const listener of wheelListeners) listener(event);
  });

  const stores = new Map<string, AsyncStore<unknown>>();

  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  return {
    capabilities: {
      gpu: typeof navigator !== "undefined" && (navigator as { gpu?: unknown }).gpu !== undefined,
      audioInput: false,
      extras: options.extras,
    } satisfies ShellCapabilities,
    size: () => size,
    onResize(listener) {
      resizeListeners.add(listener);
      return () => resizeListeners.delete(listener);
    },
    onKey(listener) {
      const handler = (event: KeyPressEvent) => listener(event);
      emitter.on("keyPress", handler);
      return () => emitter.off("keyPress", handler);
    },
    onPointer(listener) {
      pointerListeners.add(listener);
      return () => pointerListeners.delete(listener);
    },
    onWheel(listener) {
      wheelListeners.add(listener);
      return () => wheelListeners.delete(listener);
    },
    present(frame: ShellPresentedFrame) {
      const rows: (string[] | undefined)[] = [];
      for (let row = 0; row < size.rows; row += 1) {
        const cells = frame[row];
        rows.push(cells ? toStyledCells(shellCellsToAnsiRow(cells)) : undefined);
      }
      painter.flush(rows, size.columns, size.rows, renderFrameRow, renderFrameSlice);
    },
    requestFrame(callback) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        callback(performance.now());
      }, options.frameIntervalMs ?? 33);
      timers.add(timer);
    },
    store<T>(name: string): AsyncStore<T> {
      let store = stores.get(name);
      if (!store) {
        store = host.store(name);
        stores.set(name, store);
      }
      return store as AsyncStore<T>;
    },
    now: () => performance.now(),
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      clearInterval(resizeTimer);
      for (const timer of timers) clearTimeout(timer);
      if (unwatch) {
        try {
          unwatch();
        } catch {
          // Already removed with the process teardown.
        }
      }
      try {
        host.stdin.setRaw(false);
      } catch {
        // Not a TTY; nothing to restore.
      }
      write(LEAVE_SCREEN);
    },
  };
}

function consoleSizeNow(): ShellPresenterSize {
  try {
    const { columns, rows } = runtimeHost.consoleSize();
    return { columns, rows };
  } catch {
    return { columns: 80, rows: 24 };
  }
}

/** One call from a console entry: presenter plus app, running. */
export function runConsoleShellApp(app: ShellApp, options: ConsolePresenterOptions = {}): ShellAppHandle {
  return runShellApp(consolePresenter(options), app);
}
