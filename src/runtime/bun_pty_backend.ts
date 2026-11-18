// Copyright 2026 ubernaut. MIT license.
import { TerminalOutputController } from "../components/terminal_output.ts";
import type {
  TerminalBackend,
  TerminalBackendSpawnOptions,
  TerminalSessionHandle,
  TerminalSessionHandleInspection,
} from "./terminal_backend.ts";
import {
  formatProcessCommandLine,
  type ProcessSessionInspection,
  type ProcessSessionStatus,
} from "./process_session.ts";
import { BoundedOutputLineBuffer } from "./output_line_buffer.ts";
import { cloneTerminalCommand, normalizeTerminalDimension } from "./terminal_values.ts";
import { runtimeHost, type RuntimeSignal } from "./host.ts";
import {
  identifySpawnedLinuxChild,
  inspectLinuxForegroundProcessTitle,
  type LinuxProcessIdentity,
  snapshotLinuxDirectChildren,
} from "./linux_foreground_process.ts";

interface NativeTerminal {
  write(data: string | Uint8Array): number;
  resize(cols: number, rows: number): void;
  close(): void;
  readonly closed: boolean;
}
interface NativePtyProcess {
  pid: number;
  terminal: NativeTerminal;
  exited: Promise<number>;
  signalCode: string | number | null;
  kill(signal?: string): void;
}
interface NativePtyRuntime {
  Terminal: new (
    options: {
      cols: number;
      rows: number;
      data: (terminal: NativeTerminal, data: Uint8Array) => void;
      exit: () => void;
    },
  ) => NativeTerminal;
  spawn(
    args: string[],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      terminal: {
        cols: number;
        rows: number;
        data: (terminal: NativeTerminal, data: Uint8Array) => void;
        exit: () => void;
      };
    },
  ): NativePtyProcess;
}

/** Configuration for the native Bun PTY adapter. */
export interface BunPtyTerminalBackendOptions {
  id?: string;
  label?: string;
  pollingIntervalMs?: number;
  now?: () => number;
}
/** Creates a real native PTY backend on Bun. */
export function createBunPtyTerminalBackend(options: BunPtyTerminalBackendOptions = {}): TerminalBackend {
  const bun = (globalThis as unknown as { Bun?: NativePtyRuntime }).Bun;
  if (!bun?.Terminal) throw new Error("Bun.Terminal is required for the Bun PTY backend");
  return {
    id: options.id ?? "bun-pty",
    label: options.label ?? "Bun native PTY",
    pty: true,
    detachable: false,
    reconnectable: false,
    spawn: (spec) => new BunPtySession(bun, spec, options),
  };
}

class BunPtySession implements TerminalSessionHandle {
  readonly id = crypto.randomUUID();
  readonly backendId: string;
  readonly command: TerminalBackendSpawnOptions;
  readonly output: TerminalOutputController;
  readonly closed: Promise<ProcessSessionInspection>;
  readonly #terminal: NativeTerminal;
  readonly #process: NativePtyProcess;
  readonly #now: () => number;
  readonly #onData?: TerminalBackendSpawnOptions["onData"];
  readonly #identity?: LinuxProcessIdentity;
  readonly #startedAt: number;
  readonly #lines = new BoundedOutputLineBuffer();
  readonly #decoder = new TextDecoder();
  #status: ProcessSessionStatus = "running";
  #code?: number;
  #columns: number;
  #rows: number;
  #queue: Uint8Array[] = [];
  #buffered = 0;
  #draining = false;
  #exitSeen = false;
  #settled = false;
  #stopped = new Set<number>();
  #resolve!: (inspection: ProcessSessionInspection) => void;
  #disposed = false;
  #disposing?: Promise<void>;
  #cancelConsumer!: () => void;
  readonly #consumerCancelled = new Promise<void>((resolve) => this.#cancelConsumer = resolve);
  constructor(bun: NativePtyRuntime, spec: TerminalBackendSpawnOptions, options: BunPtyTerminalBackendOptions) {
    this.backendId = options.id ?? "bun-pty";
    this.command = cloneTerminalCommand(spec);
    this.#onData = spec.onData;
    this.output = spec.output ?? new TerminalOutputController();
    this.#now = options.now ?? Date.now;
    this.#startedAt = this.#now();
    this.#columns = normalizeTerminalDimension(spec.columns, 80);
    this.#rows = normalizeTerminalDimension(spec.rows, 24);
    this.closed = new Promise((resolve) => this.#resolve = resolve);
    const children = snapshotLinuxDirectChildren();
    // Inline creation makes Bun establish a new session and controlling terminal.
    // Passing an existing Bun.Terminal skips that setup and breaks shell job control.
    this.#process = bun.spawn([spec.command, ...(spec.args ?? [])], {
      cwd: spec.cwd,
      env: { ...runtimeHost.env.toObject(), ...spec.env },
      terminal: {
        cols: this.#columns,
        rows: this.#rows,
        data: (_term, data) => {
          this.#queue.push(new Uint8Array(data));
          this.#buffered += data.length;
          if (this.#buffered >= 256 * 1024) this.#pauseOutput();
          void this.#drain();
        },
        exit: () => {
          this.#exitSeen = true;
          this.#finish();
        },
      },
    });
    this.#terminal = this.#process.terminal;
    this.#identity = identifySpawnedLinuxChild(children);
    this.output.append({ source: "system", text: `$ ${formatProcessCommandLine(spec)}`, timestamp: this.#now() });
    void this.#process.exited.then((code) => {
      this.#code = code;
      this.#exitSeen = true;
      if (this.#status === "running") this.#status = code === 0 ? "exited" : "failed";
      this.#finish();
    });
  }
  #groups(): number[] {
    const groups = [this.#process.pid];
    if (runtimeHost.build.os === "linux") {
      try {
        const stat = runtimeHost.readTextFileSync(`/proc/${this.#process.pid}/stat`);
        const rest = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
        const foreground = Number(rest[5]);
        if (foreground > 0 && foreground !== this.#process.pid) groups.push(foreground);
      } catch { /* child may have exited */ }
    }
    return groups;
  }
  #pauseOutput(): void {
    for (const group of this.#groups()) {
      if (this.#stopped.has(group)) continue;
      try {
        runtimeHost.kill(-group, "SIGSTOP");
        this.#stopped.add(group);
      } catch { /* process group may have exited */ }
    }
  }
  #resumeOutput(): void {
    for (const group of this.#stopped) {
      try {
        runtimeHost.kill(-group, "SIGCONT");
      } catch { /* already gone */ }
    }
    this.#stopped.clear();
  }
  async #drain(): Promise<void> {
    if (this.#draining) return;
    this.#draining = true;
    try {
      while (this.#queue.length) {
        const bytes = this.#queue.shift()!;
        this.#buffered -= bytes.length;
        const consumed = this.#onData?.(bytes, "stdout");
        this.#lines.append(
          this.#decoder.decode(bytes, { stream: true }),
          (text) => this.output.append({ source: "stdout", text, timestamp: this.#now() }),
        );
        if (consumed) {
          this.#pauseOutput();
          await Promise.race([consumed, this.#consumerCancelled]);
        }
        if (this.#disposed) {
          this.#queue.length = 0;
          this.#buffered = 0;
          break;
        }
        if (this.#buffered < 128 * 1024) this.#resumeOutput();
      }
    } catch (error) {
      this.#status = "failed";
      this.#queue.length = 0;
      this.#buffered = 0;
      this.output.append({ source: "system", text: `PTY output failed: ${String(error)}`, timestamp: this.#now() });
      await this.kill();
    } finally {
      this.#draining = false;
      this.#resumeOutput();
      this.#finish();
    }
  }
  #finish(): void {
    if (this.#settled || !this.#exitSeen || this.#code === undefined || this.#draining || this.#queue.length) return;
    this.#settled = true;
    this.#resumeOutput();
    this.#terminal.close();
    this.#lines.append(
      this.#decoder.decode(),
      (text) => this.output.append({ source: "stdout", text, timestamp: this.#now() }),
    );
    this.#lines.finish((text) => this.output.append({ source: "stdout", text, timestamp: this.#now() }));
    this.#resolve(this.#inspection());
  }
  #inspection(): ProcessSessionInspection {
    return {
      command: this.command,
      commandLine: formatProcessCommandLine(this.command),
      status: this.#status,
      running: !this.#settled,
      exit: this.#code === undefined ? undefined : {
        code: this.#code,
        success: this.#code === 0,
        signal: typeof this.#process.signalCode === "string" ? this.#process.signalCode : undefined,
        durationMs: Math.max(0, this.#now() - this.#startedAt),
      },
      output: this.output.inspect(),
    };
  }
  async write(data: string | Uint8Array): Promise<boolean> {
    if (this.#settled || this.#disposed) return false;
    try {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      let offset = 0;
      while (offset < bytes.length) {
        const written = this.#terminal.write(bytes.subarray(offset));
        if (written > 0) offset += written;
        else await new Promise((resolve) => setTimeout(resolve, 1));
        if (this.#terminal.closed) return false;
      }
      return true;
    } catch {
      return false;
    }
  }
  async resize(columns: number, rows: number): Promise<boolean> {
    if (this.#settled) return false;
    this.#columns = normalizeTerminalDimension(columns, this.#columns);
    this.#rows = normalizeTerminalDimension(rows, this.#rows);
    try {
      this.#terminal.resize(this.#columns, this.#rows);
      return true;
    } catch {
      return false;
    }
  }
  async kill(signal: RuntimeSignal = "SIGTERM"): Promise<boolean> {
    if (this.#settled) return false;
    if (this.#status !== "failed") this.#status = "cancelled";
    this.#resumeOutput();
    let signalled = false;
    for (const group of this.#groups()) {
      try {
        runtimeHost.kill(-group, signal);
        signalled = true;
      } catch { /* fallback below */ }
    }
    if (!signalled) {
      try {
        this.#process.kill(signal);
      } catch {
        return false;
      }
    }
    return true;
  }
  inspect(): TerminalSessionHandleInspection {
    const title = this.#identity ? inspectLinuxForegroundProcessTitle(this.#identity) : undefined;
    return {
      id: this.id,
      backendId: this.backendId,
      pty: true,
      commandLine: formatProcessCommandLine(this.command),
      status: this.#status,
      running: !this.#settled,
      columns: this.#columns,
      rows: this.#rows,
      resizeSupported: true,
      title,
      exit: this.#inspection().exit,
    };
  }
  dispose(): Promise<void> {
    return this.#disposing ??= this.#dispose();
  }
  async #dispose(): Promise<void> {
    this.#disposed = true;
    this.#cancelConsumer();
    this.#queue.length = 0;
    this.#buffered = 0;
    if (!this.#settled) {
      await this.kill();
      const timer = setTimeout(() => {
        void this.kill("SIGKILL");
      }, 500);
      try {
        await this.closed;
      } finally {
        clearTimeout(timer);
      }
    }
    this.#terminal.close();
    this.output.dispose();
  }
}
