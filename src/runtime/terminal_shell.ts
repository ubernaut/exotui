import { type RuntimeSignal } from "./host.ts";
// Copyright 2023 Im-Beast. MIT license.
import { TerminalOutputController } from "../components/terminal_output.ts";
import { Signal } from "../signals/mod.ts";
import {
  createProcessTerminalBackend,
  type TerminalBackend,
  type TerminalBackendAttachOptions,
  type TerminalBackendSpawnOptions,
  type TerminalDetachedSession,
  type TerminalSessionHandle,
} from "./terminal_backend.ts";
import {
  formatProcessCommandLine,
  type ProcessSessionCommand,
  type ProcessSessionExit,
  type ProcessSessionStatus,
} from "./process_session.ts";
import type { DiagnosticsCollector } from "./diagnostics.ts";
import { TerminalScrollbackController, type TerminalScrollbackInspection } from "./terminal_scrollback.ts";
import { TerminalScreenController, type TerminalScreenInspection } from "./terminal_screen.ts";
import type { TerminalClipboardWrite } from "./terminal_services.ts";
import { shellTerminalTemplate, terminalTemplateToSpawnOptions } from "./terminal_templates.ts";
import { cloneTerminalCommand, normalizeTerminalDimension } from "./terminal_values.ts";

/** Options for an interactive shell session backed by a terminal backend. */
export interface TerminalShellControllerOptions {
  backend?: TerminalBackend;
  backendFactory?: () => TerminalBackend | Promise<TerminalBackend>;
  /** Existing backend-owned session to attach instead of spawning a new shell. */
  attachSessionId?: string;
  shell?: string;
  args?: readonly string[];
  cwd?: string;
  env?: Record<string, string>;
  columns?: number;
  rows?: number;
  scrollbackLimit?: number;
  scrollbackViewportRows?: number;
  output?: TerminalOutputController;
  screen?: TerminalScreenController;
  diagnostics?: DiagnosticsCollector;
  now?: () => number;
  onUpdate?: () => void;
  /** Optional handler for bounded, write-only child OSC 52 clipboard writes. */
  onClipboardWrite?: (write: TerminalClipboardWrite) => void;
}

/** Serializable inspection snapshot for TerminalShellController. */
export interface TerminalShellInspection {
  title?: string;
  status: ProcessSessionStatus | "starting";
  running: boolean;
  backendId?: string;
  backendLabel?: string;
  sessionId?: string;
  pty: boolean;
  detached?: boolean;
  reconnectable?: boolean;
  command: ProcessSessionCommand;
  commandLine: string;
  columns: number;
  rows: number;
  resizeSupported: boolean;
  screen: TerminalScreenInspection;
  scrollback: TerminalScrollbackInspection;
  exit?: ProcessSessionExit;
  error?: string;
}

/** Interactive shell controller that streams raw backend data into a terminal screen model. */
export class TerminalShellController {
  readonly status: Signal<ProcessSessionStatus | "starting"> = new Signal<ProcessSessionStatus | "starting">("idle");
  readonly output: TerminalOutputController;
  readonly screen: TerminalScreenController;
  readonly scrollback: TerminalScrollbackController;
  readonly #backend?: TerminalBackend;
  readonly #backendFactory?: () => TerminalBackend | Promise<TerminalBackend>;
  readonly #attachOnly: boolean;
  readonly #shell?: string;
  readonly #args?: readonly string[];
  readonly #cwd?: string;
  readonly #env?: Record<string, string>;
  readonly #diagnostics?: DiagnosticsCollector;
  readonly #now: () => number;
  readonly #onUpdate?: () => void;
  #session?: TerminalSessionHandle;
  #sessionBackend?: TerminalBackend;
  #attachSessionId?: string;
  #sessionId?: string;
  #detached: boolean;
  #reconnectable: boolean;
  #backendLabel?: string;
  #pty = false;
  #columns: number;
  #rows: number;
  #error?: string;
  #command: ProcessSessionCommand;

  constructor(options: TerminalShellControllerOptions = {}) {
    this.#backend = options.backend;
    this.#backendFactory = options.backendFactory;
    this.#attachSessionId = normalizeAttachSessionId(options.attachSessionId);
    this.#attachOnly = this.#attachSessionId !== undefined;
    this.#detached = this.#attachSessionId !== undefined;
    this.#reconnectable = this.#detached;
    this.#shell = options.shell;
    this.#args = options.args ? [...options.args] : undefined;
    this.#cwd = options.cwd;
    this.#env = options.env ? { ...options.env } : undefined;
    this.#diagnostics = options.diagnostics;
    this.#columns = normalizeTerminalDimension(options.columns, 80);
    this.#rows = normalizeTerminalDimension(options.rows, 24);
    this.#now = options.now ?? (() => Date.now());
    this.#onUpdate = options.onUpdate;
    this.output = options.output ?? new TerminalOutputController();
    this.screen = options.screen ??
      new TerminalScreenController({
        columns: this.#columns,
        rows: this.#rows,
        scrollbackLimit: options.scrollbackLimit,
        ...(options.onClipboardWrite ? { onClipboardWrite: options.onClipboardWrite } : {}),
      });
    this.scrollback = new TerminalScrollbackController({
      screen: this.screen,
      viewportRows: options.scrollbackViewportRows ?? this.#rows,
    });
    this.#command = shellTerminalTemplate({
      shell: this.#shell,
      args: this.#args,
      cwd: this.#cwd,
      env: this.#env,
      columns: this.#columns,
      rows: this.#rows,
    });
  }

  get running(): boolean {
    return this.status.peek() === "running";
  }

  async start(): Promise<boolean> {
    if (this.status.peek() === "starting" || this.running) return false;
    this.#error = undefined;
    this.status.value = "starting";
    this.#onUpdate?.();

    const template = shellTerminalTemplate({
      shell: this.#shell,
      args: this.#args,
      cwd: this.#cwd,
      env: this.#env,
      columns: this.#columns,
      rows: this.#rows,
    });
    this.#command = template;

    try {
      const backend = await this.#resolveBackend();
      this.#backendLabel = backend.label;
      this.#pty = backend.pty;
      this.screen.resize(this.#columns, this.#rows);
      const sessionOptions: TerminalBackendSpawnOptions = {
        ...terminalTemplateToSpawnOptions(template, {
          columns: this.#columns,
          rows: this.#rows,
        }),
        output: this.output,
        onData: (data) => {
          this.screen.write(data);
          this.#onUpdate?.();
        },
      };
      const attachSessionId = this.#attachSessionId;
      const handle = attachSessionId
        ? await attachTerminalSession(backend, attachSessionId, {
          columns: this.#columns,
          rows: this.#rows,
          output: this.output,
          onData: sessionOptions.onData,
        })
        : await (backend.spawnAsync?.(sessionOptions) ?? backend.spawn(sessionOptions));
      const inspection = handle.inspect();
      this.#sessionBackend = backend;
      this.#session = handle;
      this.#sessionId = handle.id;
      this.#command = cloneTerminalCommand(handle.command);
      this.#detached = false;
      this.#reconnectable = inspection.reconnectable ?? backend.reconnectable ?? backend.detachable ??
        (backend.detach !== undefined || attachSessionId !== undefined);
      this.status.value = inspection.running ? "running" : inspection.status;
      this.#onUpdate?.();
      void handle.closed.then((inspection) => {
        if (this.#session !== handle) return;
        this.status.value = inspection.status;
        this.#onUpdate?.();
      }).catch((error) => {
        if (this.#session !== handle) return;
        this.#error = error instanceof Error ? error.message : String(error);
        this.status.value = "failed";
        this.output.appendText("system", `shell failed: ${this.#error}`, this.#now());
        this.#reportDiagnostic("shell-closed-failed", "Shell backend close watcher failed", error);
        this.#onUpdate?.();
      });
      return true;
    } catch (error) {
      this.#error = error instanceof Error ? error.message : String(error);
      this.status.value = "failed";
      this.output.appendText("system", `shell failed: ${this.#error}`, this.#now());
      this.#reportDiagnostic("shell-start-failed", "Shell session failed to start", error);
      this.#onUpdate?.();
      return false;
    }
  }

  async restart(): Promise<boolean> {
    if (this.running) await this.stop();
    this.clear();
    return await this.start();
  }

  async stop(signal: RuntimeSignal = "SIGTERM"): Promise<boolean> {
    return await this.terminate(signal);
  }

  /** Explicitly terminates the active backend session. */
  async terminate(signal: RuntimeSignal = "SIGTERM"): Promise<boolean> {
    const session = this.#session;
    if (!session) return false;
    const stopped = await session.kill(signal);
    if (stopped) {
      this.status.value = "cancelled";
      this.#detached = false;
      this.#reconnectable = false;
      if (!this.#attachOnly) this.#attachSessionId = undefined;
    }
    this.#onUpdate?.();
    return stopped;
  }

  /** Releases the active client handle while retaining a backend-owned session. */
  async detach(): Promise<boolean> {
    const session = this.#session;
    const backend = this.#sessionBackend;
    if (!session || !backend?.detach) return false;
    let detached: TerminalDetachedSession | undefined;
    try {
      detached = await backend.detach(session);
    } catch (error) {
      this.#error = error instanceof Error ? error.message : String(error);
      this.#reportDiagnostic("shell-detach-failed", "Shell session failed to detach", error);
      this.#onUpdate?.();
      return false;
    }
    if (!detached) return false;
    if (this.#session === session) this.#session = undefined;
    this.#sessionId = detached.id;
    this.#attachSessionId = detached.id;
    this.#detached = true;
    this.#reconnectable = true;
    this.status.value = "idle";
    this.#onUpdate?.();
    return true;
  }

  /** Attaches this controller to a retained backend session. */
  async attach(sessionId: string | undefined = this.#attachSessionId): Promise<boolean> {
    const normalized = normalizeAttachSessionId(sessionId);
    if (!normalized || this.status.peek() === "starting" || this.running) return false;
    this.#attachSessionId = normalized;
    this.#sessionId = normalized;
    this.#detached = true;
    this.#reconnectable = true;
    return await this.start();
  }

  async write(data: string | Uint8Array): Promise<boolean> {
    if (!this.#session || !this.running) return false;
    return await this.#session.write(data);
  }

  resize(columns: number, rows: number): void {
    const nextColumns = normalizeTerminalDimension(columns, this.#columns);
    const nextRows = normalizeTerminalDimension(rows, this.#rows);
    if (nextColumns === this.#columns && nextRows === this.#rows) return;
    this.#columns = nextColumns;
    this.#rows = nextRows;
    this.screen.resize(nextColumns, nextRows);
    this.scrollback.setViewportRows(nextRows);
    void this.#session?.resize(nextColumns, nextRows).then(() => this.#onUpdate?.());
  }

  clear(): void {
    this.screen.clear();
    this.output.clear();
    this.#onUpdate?.();
  }

  inspect(): TerminalShellInspection {
    const session = this.#session?.inspect();
    const status = this.status.peek();
    const command = cloneTerminalCommand(this.#command);
    const screen = this.screen.inspect();
    const result: TerminalShellInspection = {
      title: screen.title,
      status,
      running: status === "running",
      backendId: session?.backendId ?? this.#sessionBackend?.id,
      backendLabel: this.#backendLabel,
      pty: this.#pty,
      command,
      commandLine: session?.commandLine ?? formatProcessCommandLine(command),
      columns: this.#columns,
      rows: this.#rows,
      resizeSupported: session?.resizeSupported ?? false,
      screen,
      scrollback: this.scrollback.inspect(),
    };
    if (this.#sessionId) result.sessionId = this.#sessionId;
    if (this.#detached) result.detached = true;
    if (this.#reconnectable) result.reconnectable = true;
    if (session?.exit) result.exit = { ...session.exit };
    if (this.#error) result.error = this.#error;
    return result;
  }

  async dispose(): Promise<void> {
    const session = this.#session;
    const detached = session && this.#reconnectable && this.#sessionBackend?.detach ? await this.detach() : false;
    if (session && !detached) {
      if (this.#session === session) this.#session = undefined;
      await session.dispose();
    }
    this.output.dispose();
    this.status.dispose();
  }

  async #resolveBackend(): Promise<TerminalBackend> {
    if (this.#backend) return this.#backend;
    if (this.#backendFactory) return await this.#backendFactory();
    return createProcessTerminalBackend();
  }

  #reportDiagnostic(code: string, message: string, error: unknown): void {
    this.#diagnostics?.report({
      source: "terminal-shell",
      code,
      severity: "error",
      message,
      detail: error instanceof Error ? error.message : String(error),
      context: {
        command: this.#command.command,
        backend: this.#session?.inspect().backendId ?? this.#backend?.id,
      },
    });
  }
}

async function attachTerminalSession(
  backend: TerminalBackend,
  sessionId: string,
  options: TerminalBackendAttachOptions,
): Promise<TerminalSessionHandle> {
  if (!backend.attach) {
    throw new Error(`Terminal backend ${backend.id} does not support session attachment`);
  }
  return await backend.attach(sessionId, options);
}

function normalizeAttachSessionId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
