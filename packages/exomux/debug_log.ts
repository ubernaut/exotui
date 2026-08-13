// Copyright 2023 Im-Beast. MIT license.

// Opt-in debug logging for the butterchurn background.
//
// When the butterchurn "Debug overlay" setting is on, the field opens a logger
// with `createExomuxDebugLogger()`. That logger:
//   * writes to `logs/butterchurn-<timestamp>.log` under the current working
//     directory (the project root during development), creating `logs/` if
//     needed, and
//   * tees the JS `console` methods to the same file so stray warnings/info are
//     captured instead of corrupting the full-screen TUI.
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

/**
 * Opens a debug logger and installs it as the process-wide sink. At most one is
 * meaningfully active; creating a second replaces the sink and the newer one's
 * `dispose()` restores the console it captured.
 */
export function createExomuxDebugLogger(): ExomuxDebugLogger {
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
        const path = `${dir}/butterchurn-${logStamp()}.log`;
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

  return {
    log: write,
    describe: () => {
      openFile();
      return resolvedPath ?? "unwritable";
    },
    dispose: () => {
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
