// Copyright 2023 Im-Beast. MIT license.
import { TerminalOutputController } from "../components/terminal_output.ts";
import type { TerminalOutputSource } from "../components/terminal_output.ts";
import {
  formatProcessCommandLine,
  type ProcessSessionCommand,
  type ProcessSessionExit,
  type ProcessSessionInspection,
  type ProcessSessionStatus,
} from "./process_session.ts";
import type {
  TerminalBackend,
  TerminalBackendSpawnOptions,
  TerminalSessionHandle,
  TerminalSessionHandleInspection,
} from "./terminal_backend.ts";
import type { TerminalBackendAvailability, TerminalBackendProvider } from "./terminal_backend_registry.ts";
import type { DiagnosticsCollector } from "./diagnostics.ts";
import { cloneTerminalCommand, normalizeTerminalDimension } from "./terminal_values.ts";
import { errorMessage } from "../utils/formatting.ts";
import { createRuntimePermissionManifest } from "../permissions.ts";
import { BoundedOutputLineBuffer, MAX_PENDING_OUTPUT_LINE_LENGTH } from "./output_line_buffer.ts";
import {
  identifySpawnedLinuxChild,
  inspectLinuxForegroundProcessTitle,
  type LinuxProcessIdentity,
  snapshotLinuxDirectChildren,
} from "./linux_foreground_process.ts";

const INPUT_DECODER = new TextDecoder();

/** Command options accepted by the optional Sigma PTY adapter. */
export interface SigmaPtyCommandOptions {
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/** Resize shape accepted by the optional Sigma PTY adapter. */
export interface SigmaPtySize {
  rows: number;
  cols: number;
  pixel_width?: number;
  pixel_height?: number;
}

/** Minimal structural PTY instance expected by the Sigma PTY backend wrapper. */
export interface SigmaPtyLike {
  readonly readable: ReadableStream<string>;
  readonly exitCode?: number;
  readBytes?(): { data: Uint8Array; done: boolean };
  write(data: string): void;
  resize(size: SigmaPtySize): void;
  close(): void;
  setPollingInterval?(ms: number): void;
}

/** Structural constructor for the optional Sigma PTY package. */
export interface SigmaPtyConstructor {
  new (command: string, options?: SigmaPtyCommandOptions): SigmaPtyLike;
}

/** Structural module shape for `jsr:@sigma/pty-ffi`. */
export interface SigmaPtyModule {
  Pty: SigmaPtyConstructor;
  instantiate?: (libPath?: string) => Promise<void>;
}

/** Options for loading the optional Sigma PTY module. */
export interface LoadSigmaPtyModuleOptions {
  loader?: () => SigmaPtyModule | Promise<SigmaPtyModule>;
  libPath?: string;
  instantiate?: boolean;
}

/** Options for creating a Sigma PTY terminal backend. */
export interface SigmaPtyTerminalBackendOptions extends LoadSigmaPtyModuleOptions {
  id?: string;
  label?: string;
  pollingIntervalMs?: number;
  now?: () => number;
  diagnostics?: DiagnosticsCollector;
}

/** Lazily imports and initializes the optional Sigma PTY FFI module. */
export async function loadSigmaPtyModule(options: LoadSigmaPtyModuleOptions = {}): Promise<SigmaPtyModule> {
  const module = options.loader ? await options.loader() : await importSigmaPtyModule();
  if (options.instantiate ?? true) await module.instantiate?.(options.libPath);
  return module;
}

/** Creates a PTY backend from the optional `jsr:@sigma/pty-ffi` package. */
export async function createSigmaPtyTerminalBackend(
  options: SigmaPtyTerminalBackendOptions = {},
): Promise<TerminalBackend> {
  const module = await loadSigmaPtyModule(options);
  return createSigmaPtyTerminalBackendFromConstructor(module.Pty, options);
}

/** Creates a PTY backend from an already-loaded structural PTY constructor. */
export function createSigmaPtyTerminalBackendFromConstructor(
  Pty: SigmaPtyConstructor,
  options: Omit<SigmaPtyTerminalBackendOptions, "loader" | "libPath" | "instantiate"> = {},
): TerminalBackend {
  return new SigmaPtyTerminalBackend(Pty, options);
}

/** Returns a lazy backend provider for the optional Sigma PTY adapter. */
export function createSigmaPtyTerminalBackendProvider(
  options: SigmaPtyTerminalBackendOptions = {},
): TerminalBackendProvider {
  const id = options.id ?? "sigma-pty";
  const label = options.label ?? "Sigma PTY";
  let modulePromise: Promise<SigmaPtyModule> | undefined;
  const loadModule = () => modulePromise ??= loadSigmaPtyModule(options);
  return {
    id,
    label,
    pty: true,
    permissionManifest: createRuntimePermissionManifest({
      adapterId: `terminal-backend:${id}`,
      required: [
        { kind: "subprocess", operation: "spawn", target: "*" },
        { kind: "ffi", operation: "load", target: options.libPath ?? "jsr:@sigma/pty-ffi@0.42.0" },
      ],
      optional: [
        { kind: "read", operation: "content", target: "/proc" },
      ],
    }),
    priority: 100,
    detachable: false,
    reconnectable: false,
    probe: async () => {
      try {
        await loadModule();
        return {
          available: true,
          backendId: id,
          label,
          pty: true,
          detachable: false,
          reconnectable: false,
        };
      } catch (error) {
        return {
          available: false,
          reason: error instanceof Error ? error.message : String(error),
          backendId: id,
          label,
          pty: true,
          detachable: false,
          reconnectable: false,
        };
      }
    },
    create: async () => createSigmaPtyTerminalBackendFromConstructor((await loadModule()).Pty, options),
  };
}

/** Probes whether the optional Sigma PTY backend can be loaded. */
export async function probeSigmaPtyAvailability(
  options: LoadSigmaPtyModuleOptions = {},
): Promise<TerminalBackendAvailability> {
  try {
    await loadSigmaPtyModule(options);
    return {
      available: true,
      backendId: "sigma-pty",
      label: "Sigma PTY",
      pty: true,
      detachable: false,
      reconnectable: false,
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
      backendId: "sigma-pty",
      label: "Sigma PTY",
      pty: true,
      detachable: false,
      reconnectable: false,
    };
  }
}

async function importSigmaPtyModule(): Promise<SigmaPtyModule> {
  return await import("@sigma/pty-ffi") as SigmaPtyModule;
}

class SigmaPtyTerminalBackend implements TerminalBackend {
  readonly id: string;
  readonly label: string;
  readonly pty = true;
  readonly detachable = false;
  readonly reconnectable = false;
  readonly #Pty: SigmaPtyConstructor;
  readonly #pollingIntervalMs?: number;
  readonly #now: () => number;
  readonly #diagnostics?: DiagnosticsCollector;

  constructor(Pty: SigmaPtyConstructor, options: Omit<SigmaPtyTerminalBackendOptions, "loader" | "libPath"> = {}) {
    this.id = options.id ?? "sigma-pty";
    this.label = options.label ?? "Sigma PTY";
    this.#Pty = Pty;
    this.#pollingIntervalMs = options.pollingIntervalMs;
    this.#now = options.now ?? (() => Date.now());
    this.#diagnostics = options.diagnostics;
  }

  spawn(options: TerminalBackendSpawnOptions): TerminalSessionHandle {
    const childrenBeforeSpawn = snapshotLinuxDirectChildren();
    const pty = new this.#Pty(options.command, {
      args: options.args ? [...options.args] : undefined,
      cwd: options.cwd,
      env: options.env ? { ...options.env } : undefined,
    });
    const processIdentity = identifySpawnedLinuxChild(childrenBeforeSpawn);
    if (this.#pollingIntervalMs !== undefined) pty.setPollingInterval?.(this.#pollingIntervalMs);
    return new SigmaPtySessionHandle({
      backendId: this.id,
      command: options,
      pty,
      output: options.output,
      onData: options.onData,
      columns: options.columns,
      rows: options.rows,
      pollingIntervalMs: this.#pollingIntervalMs,
      processIdentity,
      now: this.#now,
      diagnostics: this.#diagnostics,
    });
  }
}

class SigmaPtySessionHandle implements TerminalSessionHandle {
  readonly id = crypto.randomUUID();
  readonly backendId: string;
  readonly command: ProcessSessionCommand;
  readonly output: TerminalOutputController;
  readonly closed: Promise<ProcessSessionInspection>;
  readonly #pty: SigmaPtyLike;
  readonly #now: () => number;
  readonly #onData?: (data: string | Uint8Array, source: TerminalOutputSource) => void | Promise<void>;
  readonly #diagnostics?: DiagnosticsCollector;
  readonly #pollingIntervalMs: number;
  readonly #processIdentity?: LinuxProcessIdentity;
  #columns: number;
  #rows: number;
  #status: ProcessSessionStatus = "running";
  #exit?: ProcessSessionExit;
  #closed = false;
  #ptyClosed = false;
  #startedAt: number;

  constructor(options: {
    backendId: string;
    command: ProcessSessionCommand;
    pty: SigmaPtyLike;
    output?: TerminalOutputController;
    onData?: (data: string | Uint8Array, source: TerminalOutputSource) => void | Promise<void>;
    columns?: number;
    rows?: number;
    pollingIntervalMs?: number;
    processIdentity?: LinuxProcessIdentity;
    now: () => number;
    diagnostics?: DiagnosticsCollector;
  }) {
    this.backendId = options.backendId;
    this.command = cloneTerminalCommand(options.command);
    this.#pty = options.pty;
    this.output = options.output ?? new TerminalOutputController();
    this.#onData = options.onData;
    this.#diagnostics = options.diagnostics;
    this.#columns = normalizeTerminalDimension(options.columns, 80);
    this.#rows = normalizeTerminalDimension(options.rows, 24);
    this.#pollingIntervalMs = Math.max(1, Math.floor(options.pollingIntervalMs ?? 100));
    this.#processIdentity = options.processIdentity;
    this.#now = options.now;
    this.#startedAt = this.#now();
    this.#appendSystemLine(`$ ${formatProcessCommandLine(this.command)}`);
    this.resize(this.#columns, this.#rows);
    this.closed = this.#pumpReadable();
  }

  write(data: string | Uint8Array): Promise<boolean> {
    if (this.#closed) return Promise.resolve(false);
    try {
      this.#pty.write(typeof data === "string" ? data : INPUT_DECODER.decode(data));
      return Promise.resolve(true);
    } catch (error) {
      const detail = errorMessage(error);
      this.#appendSystemLine(`input failed: ${detail}`);
      this.#reportDiagnostic("input-failed", "PTY input write failed.", error, { command: this.command.command });
      return Promise.resolve(false);
    }
  }

  resize(columns: number, rows: number): Promise<boolean> {
    this.#columns = normalizeTerminalDimension(columns, this.#columns);
    this.#rows = normalizeTerminalDimension(rows, this.#rows);
    if (this.#closed) return Promise.resolve(false);
    try {
      this.#pty.resize({ cols: this.#columns, rows: this.#rows });
      return Promise.resolve(true);
    } catch (error) {
      const detail = errorMessage(error);
      this.#appendSystemLine(`resize failed: ${detail}`);
      this.#reportDiagnostic("resize-failed", "PTY resize failed.", error, {
        command: this.command.command,
        columns: this.#columns,
        rows: this.#rows,
      });
      return Promise.resolve(false);
    }
  }

  kill(signal: Deno.Signal = "SIGTERM"): Promise<boolean> {
    if (this.#closed) return Promise.resolve(false);
    this.#status = "cancelled";
    this.#appendSystemLine(`sent ${signal}`);
    this.#closePty();
    return Promise.resolve(true);
  }

  inspect(): TerminalSessionHandleInspection {
    const result: TerminalSessionHandleInspection = {
      id: this.id,
      backendId: this.backendId,
      pty: true,
      commandLine: formatProcessCommandLine(this.command),
      status: this.#status,
      running: this.#status === "running",
      columns: this.#columns,
      rows: this.#rows,
      resizeSupported: true,
    };
    const title = this.#processIdentity ? inspectLinuxForegroundProcessTitle(this.#processIdentity) : undefined;
    if (title) result.title = title;
    if (this.#exit) result.exit = { ...this.#exit };
    return result;
  }

  async dispose(): Promise<void> {
    this.#closePty();
    await this.closed.catch(() => undefined);
    this.output.dispose();
  }

  async #pumpReadable(): Promise<ProcessSessionInspection> {
    const lines = new BoundedOutputLineBuffer();
    const decoder = new TextDecoder();
    try {
      for await (const value of this.#readChunks()) {
        const consumed = this.#onData?.(value, "stdout");
        const timestamp = this.#now();
        const text = typeof value === "string" ? value : decoder.decode(value, { stream: true });
        const truncated = lines.append(text, (text) => {
          this.output.append({ source: "stdout", text, timestamp });
        });
        if (truncated) {
          this.#appendSystemLine(
            `unterminated output fragment truncated to ${MAX_PENDING_OUTPUT_LINE_LENGTH} characters; raw terminal data is unaffected`,
          );
        }
        // Consumer backpressure: a deferred consumer pauses the poll loop, so
        // the kernel PTY buffer fills and the child's writes block — the same
        // flow control a real terminal applies to a program that outruns it.
        if (consumed) await consumed;
      }
      const timestamp = this.#now();
      lines.append(decoder.decode(), (text) => this.output.append({ source: "stdout", text, timestamp }));
      lines.finish((text) => this.output.append({ source: "stdout", text, timestamp }));
      if (this.#status === "running") this.#setExit(this.#pty.exitCode ?? 0);
    } catch (error) {
      if (!this.#ptyClosed) {
        if (this.#status === "running") this.#status = "failed";
        const detail = errorMessage(error);
        this.#appendSystemLine(`pty failed: ${detail}`);
        this.#reportDiagnostic("read-failed", "PTY read stream failed.", error, { command: this.command.command });
      }
    } finally {
      this.#closed = true;
    }
    return this.#processInspection();
  }

  async *#readChunks(): AsyncGenerator<string | Uint8Array> {
    if (this.#pty.readBytes) {
      while (!this.#ptyClosed) {
        const { data, done } = this.#pty.readBytes();
        if (data.byteLength > 0) yield data;
        if (done) return;
        await waitForPtyPoll(this.#pollingIntervalMs);
      }
      return;
    }

    const reader = this.#pty.readable.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  #setExit(code: number): void {
    const durationMs = Math.max(0, this.#now() - this.#startedAt);
    this.#exit = { code, success: code === 0, durationMs };
    this.#status = code === 0 ? "exited" : "failed";
    this.#appendSystemLine(`process ${this.#status} code=${code} duration=${durationMs}ms`);
  }

  #closePty(): void {
    if (this.#ptyClosed) return;
    try {
      this.#pty.close();
    } finally {
      this.#ptyClosed = true;
      this.#closed = true;
    }
  }

  #appendSystemLine(text: string): void {
    this.output.append({ source: "system", text, timestamp: this.#now() });
  }

  #reportDiagnostic(code: string, message: string, error: unknown, context: Record<string, unknown>): void {
    this.#diagnostics?.report({
      source: "terminal-pty",
      code,
      severity: code === "read-failed" ? "error" : "warning",
      message,
      detail: errorMessage(error),
      context: {
        backendId: this.backendId,
        ...context,
      },
    });
  }

  #processInspection(): ProcessSessionInspection {
    return {
      command: cloneTerminalCommand(this.command),
      commandLine: formatProcessCommandLine(this.command),
      status: this.#status,
      running: this.#status === "running",
      exit: this.#exit ? { ...this.#exit } : undefined,
      output: this.output.inspect(),
    };
  }
}

function waitForPtyPoll(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
