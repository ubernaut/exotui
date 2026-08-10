// Copyright 2023 Im-Beast. MIT license.
import type { TerminalOutputController, TerminalOutputSource } from "../components/terminal_output.ts";
import {
  formatProcessCommandLine,
  type ProcessSessionCommand,
  ProcessSessionController,
  type ProcessSessionControllerOptions,
  type ProcessSessionExit,
  type ProcessSessionInspection,
  type ProcessSessionSpawner,
  type ProcessSessionStatus,
} from "./process_session.ts";
import { normalizeTerminalDimension } from "./terminal_values.ts";

/** Command and geometry options for spawning a terminal session backend. */
export interface TerminalBackendSpawnOptions extends ProcessSessionCommand {
  columns?: number;
  rows?: number;
  output?: TerminalOutputController;
  /**
   * Raw output consumer. Returning a promise applies backpressure: the backend
   * defers its next read until the promise settles, so the kernel buffer fills
   * and the child's writes block — exactly a real terminal under a slow reader.
   */
  onData?: (data: string | Uint8Array, source: TerminalOutputSource) => void | Promise<void>;
}

/** Options used when reattaching to a backend-owned terminal session. */
export interface TerminalBackendAttachOptions {
  columns?: number;
  rows?: number;
  output?: TerminalOutputController;
  /** See {@linkcode TerminalBackendSpawnOptions.onData}: a returned promise defers the next read. */
  onData?: (data: string | Uint8Array, source: TerminalOutputSource) => void | Promise<void>;
}

/** Serializable descriptor for a session retained by a backend outside the active window handle. */
export interface TerminalDetachedSession {
  id: string;
  backendId: string;
  title?: string;
  commandLine?: string;
  columns?: number;
  rows?: number;
  createdAt?: number;
  updatedAt?: number;
  metadata?: Record<string, string>;
}

/** Serializable inspection snapshot for terminal backend sessions. */
export interface TerminalSessionHandleInspection {
  id: string;
  backendId: string;
  pty?: boolean;
  title?: string;
  commandLine: string;
  status: ProcessSessionStatus;
  running: boolean;
  columns: number;
  rows: number;
  resizeSupported: boolean;
  detached?: boolean;
  reconnectable?: boolean;
  exit?: ProcessSessionExit;
}

/** Runtime handle returned by terminal backends. */
export interface TerminalSessionHandle {
  readonly id: string;
  readonly backendId: string;
  readonly command: ProcessSessionCommand;
  readonly output: TerminalOutputController;
  readonly closed: Promise<ProcessSessionInspection>;
  write(data: string | Uint8Array): Promise<boolean>;
  resize(columns: number, rows: number): Promise<boolean>;
  kill(signal?: Deno.Signal): Promise<boolean>;
  inspect(): TerminalSessionHandleInspection;
  dispose(): Promise<void>;
}

/** Backend abstraction for process, PTY, tmux, or remote terminal sessions. */
export interface TerminalBackend {
  readonly id: string;
  readonly label: string;
  readonly pty: boolean;
  readonly detachable?: boolean;
  readonly reconnectable?: boolean;
  spawn(options: TerminalBackendSpawnOptions): TerminalSessionHandle;
  /** Optional async-capable spawn path used by remote or daemon-backed providers. */
  spawnAsync?(options: TerminalBackendSpawnOptions): TerminalSessionHandle | Promise<TerminalSessionHandle>;
  attach?(
    sessionId: string,
    options?: TerminalBackendAttachOptions,
  ): TerminalSessionHandle | Promise<TerminalSessionHandle>;
  detach?(session: TerminalSessionHandle): Promise<TerminalDetachedSession | undefined>;
  listDetached?(): Promise<TerminalDetachedSession[]>;
}

/** Options for configuring the process-backed terminal backend. */
export interface ProcessTerminalBackendOptions {
  id?: string;
  label?: string;
  spawn?: ProcessSessionSpawner;
}

/** Creates the default non-PTY process terminal backend. */
export function createProcessTerminalBackend(options: ProcessTerminalBackendOptions = {}): TerminalBackend {
  return new ProcessTerminalBackend(options);
}

/** Non-PTY terminal backend implemented with ProcessSessionController and Deno.Command. */
export class ProcessTerminalBackend implements TerminalBackend {
  readonly id: string;
  readonly label: string;
  readonly pty = false;
  readonly detachable = false;
  readonly reconnectable = false;
  readonly #spawn?: ProcessSessionSpawner;

  constructor(options: ProcessTerminalBackendOptions = {}) {
    this.id = options.id ?? "process";
    this.label = options.label ?? "Process";
    this.#spawn = options.spawn;
  }

  spawn(options: TerminalBackendSpawnOptions): TerminalSessionHandle {
    // A PTY hands its child a tty, whose line discipline maps LF to CRLF on the
    // way out (OPOST|ONLCR). This backend has only a pipe, so it stands in for
    // that discipline itself; without it a bare LF is an index — down a row, same
    // column — and ordinary piped output would staircase down the screen.
    const translateNewlines = onlcrTranslator();
    const controllerOptions: ProcessSessionControllerOptions = {
      command: options.command,
      args: options.args,
      cwd: options.cwd,
      env: options.env,
      output: options.output,
      spawn: this.#spawn,
      onOutputData: options.onData ? (source, data) => options.onData?.(translateNewlines(data), source) : undefined,
    };
    const session = new ProcessSessionController(controllerOptions);
    return new ProcessTerminalSessionHandle({
      backendId: this.id,
      session,
      columns: options.columns,
      rows: options.rows,
    });
  }
}

class ProcessTerminalSessionHandle implements TerminalSessionHandle {
  readonly id: string;
  readonly backendId: string;
  readonly command: ProcessSessionCommand;
  readonly output: TerminalOutputController;
  readonly closed: Promise<ProcessSessionInspection>;
  readonly #session: ProcessSessionController;
  #columns: number;
  #rows: number;

  constructor(options: {
    backendId: string;
    session: ProcessSessionController;
    columns?: number;
    rows?: number;
  }) {
    this.id = crypto.randomUUID();
    this.backendId = options.backendId;
    this.#session = options.session;
    this.command = this.#session.command.peek();
    this.output = this.#session.output;
    this.#columns = normalizeTerminalDimension(options.columns, 80);
    this.#rows = normalizeTerminalDimension(options.rows, 24);
    this.closed = this.#session.start().then(() => this.#session.inspect());
  }

  write(data: string | Uint8Array): Promise<boolean> {
    return this.#session.writeInput(data);
  }

  resize(columns: number, rows: number): Promise<boolean> {
    this.#columns = normalizeTerminalDimension(columns, this.#columns);
    this.#rows = normalizeTerminalDimension(rows, this.#rows);
    return Promise.resolve(false);
  }

  kill(signal?: Deno.Signal): Promise<boolean> {
    return this.#session.stop(signal);
  }

  inspect(): TerminalSessionHandleInspection {
    const inspection = this.#session.inspect();
    const result: TerminalSessionHandleInspection = {
      id: this.id,
      backendId: this.backendId,
      pty: false,
      commandLine: formatProcessCommandLine(this.command),
      status: inspection.status,
      running: inspection.running,
      columns: this.#columns,
      rows: this.#rows,
      resizeSupported: false,
    };
    if (inspection.exit) result.exit = inspection.exit;
    return result;
  }

  dispose(): Promise<void> {
    return this.#session.dispose();
  }
}

const CARRIAGE_RETURN = 0x0d;
const LINE_FEED = 0x0a;

/**
 * Stateful ONLCR translation: every LF not already preceded by a CR gains one.
 * The carry across calls matters because a CRLF can straddle two reads, and
 * inserting a second CR there would send the line back to column zero twice.
 */
function onlcrTranslator(): (data: Uint8Array) => Uint8Array {
  let precededByCarriageReturn = false;
  return (data) => {
    if (data.length === 0) return data;
    const openedAfterCarriageReturn = precededByCarriageReturn;
    let bare = 0;
    let previous = openedAfterCarriageReturn;
    for (const byte of data) {
      if (byte === LINE_FEED && !previous) bare += 1;
      previous = byte === CARRIAGE_RETURN;
    }
    precededByCarriageReturn = previous;
    if (bare === 0) return data;
    const translated = new Uint8Array(data.length + bare);
    let cursor = 0;
    let afterCarriageReturn = openedAfterCarriageReturn;
    for (const byte of data) {
      if (byte === LINE_FEED && !afterCarriageReturn) translated[cursor++] = CARRIAGE_RETURN;
      translated[cursor++] = byte;
      afterCarriageReturn = byte === CARRIAGE_RETURN;
    }
    return translated;
  };
}
