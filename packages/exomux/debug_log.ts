// Copyright 2023 Im-Beast. MIT license.

// Opt-in debug logging.
//
// Two settings open loggers with `createExomuxDebugLogger()`: the global
// "Debug logging" toggle (prefix `exomux`, with global error/rejection
// capture) and the butterchurn "Debug overlay" (prefix `butterchurn`). A
// logger:
//   * writes to `logs/<prefix>-<timestamp>.log` under the current working
//     directory (the project root during development), creating `logs/` if
//     needed,
//   * tees the JS `console` methods to the same file so stray warnings/info are
//     captured instead of corrupting the full-screen TUI, and
//   * (globally) records uncaught errors and unhandled rejections.
//
// GPU code that wants to record a message calls the free function
// `exomuxDebugLog(category, message)`, which forwards to the active logger when
// one exists and is a no-op otherwise — so the GPU path carries no logging cost
// (and no import of Deno FS APIs) unless debug mode is on.
//
// Every filesystem touch is guarded: a missing `--allow-write`, a read-only
// working directory, or any other error degrades to a silent no-op rather than
// taking the desktop down.

/** A live debug logger. `dispose()` restores `console` and closes the file. */
export interface ExomuxDebugLogger {
  log(category: string, message: string): void;
  dispose(): void;
  /** The absolute log path once open, or a short status ("unwritable"). For the overlay. */
  describe?(): string;
}

type DebugSink = (category: string, message: string) => void;

let activeSink: DebugSink | undefined;

/** Forwards a message to the active debug logger, if any. Cheap no-op otherwise. */
export function exomuxDebugLog(category: string, message: string): void {
  activeSink?.(category, message);
}

/** Whether a debug logger is currently installed (GPU code can gate extra work on this). */
export function exomuxDebugLoggingActive(): boolean {
  return activeSink !== undefined;
}

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug", "trace"] as const;
type ConsoleMethod = (typeof CONSOLE_METHODS)[number];

/** A short, filesystem-safe timestamp for the log filename. */
function logStamp(): string {
  try {
    return new Date().toISOString().replace(/[:.]/g, "-");
  } catch {
    return "session";
  }
}

/** Options for one debug logger. */
export interface ExomuxDebugLoggerOptions {
  /** Log filename prefix (`<prefix>-<timestamp>.log`). */
  readonly prefix?: string;
  /**
   * Also capture global `error` and `unhandledrejection` events. While on,
   * both are logged **and consumed** (`preventDefault`), so a stray rejection
   * is recorded instead of tearing the whole desktop down mid-diagnosis.
   */
  readonly captureGlobalErrors?: boolean;
}

/**
 * Opens a debug logger and installs it as the process-wide sink. At most one is
 * meaningfully active; creating a second replaces the sink and the newer one's
 * `dispose()` restores the console it captured.
 */
export function createExomuxDebugLogger(options: ExomuxDebugLoggerOptions = {}): ExomuxDebugLogger {
  const prefix = options.prefix ?? "butterchurn";
  const encoder = new TextEncoder();
  let file: Deno.FsFile | undefined;
  let failed = false;
  let resolvedPath: string | undefined;

  // Where the log can go, best first: a `logs/` dir under the working directory
  // (the project root during development), then a stable home fallback so a run
  // launched from a read-only directory — which is easy to hit with a detachable
  // daemon — still produces a log the user can find.
  const candidateDirs = (): string[] => {
    const dirs: string[] = [];
    try {
      dirs.push(`${Deno.cwd()}/logs`);
    } catch { /* no --allow-read for cwd */ }
    try {
      const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
      if (home) dirs.push(`${home}/.exomux/logs`);
    } catch { /* no --allow-env */ }
    return dirs;
  };

  const openFile = (): Deno.FsFile | undefined => {
    if (file || failed) return file;
    for (const dir of candidateDirs()) {
      try {
        Deno.mkdirSync(dir, { recursive: true });
        const path = `${dir}/${prefix}-${logStamp()}.log`;
        file = Deno.openSync(path, { create: true, write: true, append: true });
        resolvedPath = path;
        return file;
      } catch { /* try the next candidate */ }
    }
    failed = true; // No --allow-write, or nowhere writable — stay a silent no-op.
    return file;
  };

  const write = (category: string, message: string): void => {
    const handle = openFile();
    if (!handle) return;
    try {
      handle.writeSync(encoder.encode(`${logStamp()} [${category}] ${message}\n`));
    } catch {
      // A write failure mid-session (disk full, closed handle) is not fatal.
    }
  };

  // Capture JS console output to the file instead of the terminal, so it does
  // not scribble over the TUI while still being available for debugging. The
  // raw method reference is kept so `dispose()` restores console exactly.
  const original = {} as Record<ConsoleMethod, ((...args: unknown[]) => void) | undefined>;
  const consoleRef = globalThis.console as unknown as Record<ConsoleMethod, (...args: unknown[]) => void>;
  for (const method of CONSOLE_METHODS) {
    original[method] = consoleRef[method];
    consoleRef[method] = (...args: unknown[]) => {
      try {
        write(`console.${method}`, args.map((value) => stringifyArg(value)).join(" "));
      } catch {
        // Never let logging throw out of a console call.
      }
    };
  }

  const sink: DebugSink = write;
  activeSink = sink;

  // Uncaught errors and unhandled rejections are what a debug session most
  // needs on file; they are also exactly what a full-screen TUI hides.
  const onError = (event: Event): void => {
    const error = (event as ErrorEvent).error ?? (event as ErrorEvent).message;
    write("uncaught-error", stringifyArg(error));
    if (error instanceof Error && error.stack) write("uncaught-error", error.stack);
    event.preventDefault();
  };
  const onRejection = (event: Event): void => {
    const reason = (event as PromiseRejectionEvent).reason;
    write("unhandled-rejection", stringifyArg(reason));
    if (reason instanceof Error && reason.stack) write("unhandled-rejection", reason.stack);
    event.preventDefault();
  };
  if (options.captureGlobalErrors) {
    try {
      globalThis.addEventListener("error", onError);
      globalThis.addEventListener("unhandledrejection", onRejection);
    } catch {
      // An environment without event targets simply skips global capture.
    }
  }

  return {
    log: write,
    describe: () => {
      openFile();
      return resolvedPath ?? "unwritable";
    },
    dispose: () => {
      if (options.captureGlobalErrors) {
        try {
          globalThis.removeEventListener("error", onError);
          globalThis.removeEventListener("unhandledrejection", onRejection);
        } catch {
          // Nothing installed.
        }
      }
      for (const method of CONSOLE_METHODS) {
        const previous = original[method];
        if (previous) consoleRef[method] = previous;
      }
      if (activeSink === sink) activeSink = undefined;
      try {
        file?.close();
      } catch {
        // Already closed.
      }
      file = undefined;
    },
  };
}

/** Best-effort stringify for console arguments — never throws. */
function stringifyArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  } catch {
    return String(value);
  }
}
