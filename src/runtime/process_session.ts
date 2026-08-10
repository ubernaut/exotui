// Copyright 2023 Im-Beast. MIT license.
import {
  TerminalOutputController,
  type TerminalOutputLine,
  type TerminalOutputSource,
} from "../components/terminal_output.ts";
import { Signal } from "../signals/mod.ts";
import { errorMessage } from "../utils/formatting.ts";
import type { DiagnosticsCollector } from "./diagnostics.ts";
import { cloneTerminalCommand } from "./terminal_values.ts";
import { BoundedOutputLineBuffer, MAX_PENDING_OUTPUT_LINE_LENGTH } from "./output_line_buffer.ts";

const INPUT_ENCODER = new TextEncoder();

/** Lifecycle status for a process-backed terminal output session. */
export type ProcessSessionStatus = "idle" | "running" | "exited" | "failed" | "cancelled";

/** Command specification used by ProcessSessionController. */
export interface ProcessSessionCommand {
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: Record<string, string>;
}

/** Exit metadata captured when a process session completes. */
export interface ProcessSessionExit {
  code: number;
  signal?: string;
  success: boolean;
  durationMs: number;
}

/** Minimal child process shape used by ProcessSessionController. */
export interface ProcessSessionChild {
  stdin?: WritableStream<Uint8Array> | null;
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  status: Promise<{ code: number; signal?: string | null; success: boolean }>;
  kill(signal?: Deno.Signal): void;
}

/** Injectable process spawning function for tests and future PTY backends. */
export type ProcessSessionSpawner = (command: ProcessSessionCommand) => ProcessSessionChild;

/** Options for configuring Process Session Controller. */
export interface ProcessSessionControllerOptions extends ProcessSessionCommand {
  output?: TerminalOutputController;
  limit?: number | Signal<number>;
  appendCommandLine?: boolean;
  now?: () => number;
  spawn?: ProcessSessionSpawner;
  /** Raw output consumer; a returned promise defers the next stream read (backpressure). */
  onOutputData?: (source: TerminalOutputSource, data: Uint8Array) => void | Promise<void>;
  diagnostics?: DiagnosticsCollector;
}

/** Serializable inspection snapshot for Process Session Controller. */
export interface ProcessSessionInspection {
  command: ProcessSessionCommand;
  commandLine: string;
  status: ProcessSessionStatus;
  running: boolean;
  exit?: ProcessSessionExit;
  output: ReturnType<TerminalOutputController["inspect"]>;
}

/** State and lifecycle controller for non-PTY subprocess output windows. */
export class ProcessSessionController {
  readonly command: Signal<ProcessSessionCommand>;
  readonly status: Signal<ProcessSessionStatus> = new Signal<ProcessSessionStatus>("idle");
  readonly exit: Signal<ProcessSessionExit | undefined> = new Signal<ProcessSessionExit | undefined>(undefined);
  readonly output: TerminalOutputController;

  readonly #appendCommandLine: boolean;
  readonly #now: () => number;
  readonly #spawn: ProcessSessionSpawner;
  readonly #onOutputData?: (source: TerminalOutputSource, data: Uint8Array) => void | Promise<void>;
  readonly #diagnostics?: DiagnosticsCollector;
  #child?: ProcessSessionChild;
  #runId = 0;
  #startedAt = 0;

  constructor(options: ProcessSessionControllerOptions) {
    this.command = new Signal(cloneTerminalCommand(options));
    this.output = options.output ?? new TerminalOutputController({ limit: options.limit });
    this.#appendCommandLine = options.appendCommandLine ?? true;
    this.#now = options.now ?? (() => Date.now());
    this.#spawn = options.spawn ?? spawnDenoProcessSessionChild;
    this.#onOutputData = options.onOutputData;
    this.#diagnostics = options.diagnostics;
  }

  get running(): boolean {
    return this.status.peek() === "running";
  }

  setCommand(command: ProcessSessionCommand): void {
    if (this.running) {
      throw new Error("Cannot change a running process session command");
    }
    this.command.value = cloneTerminalCommand(command);
  }

  async start(command?: ProcessSessionCommand): Promise<boolean> {
    if (this.running) return false;
    if (command) this.setCommand(command);

    const runId = ++this.#runId;
    const spec = this.command.peek();
    this.status.value = "running";
    this.exit.value = undefined;
    this.#startedAt = this.#now();
    if (this.#appendCommandLine) this.#appendSystemLine(`$ ${formatProcessCommandLine(spec)}`);

    try {
      const child = this.#spawn(spec);
      this.#child = child;
      const stdout = this.#pump(child.stdout, "stdout", runId);
      const stderr = this.#pump(child.stderr, "stderr", runId);
      const status = await child.status;
      await Promise.allSettled([stdout, stderr]);
      if (runId !== this.#runId) return true;

      const exit: ProcessSessionExit = {
        code: status.code,
        success: status.success,
        durationMs: Math.max(0, this.#now() - this.#startedAt),
      };
      if (status.signal) exit.signal = status.signal;
      const wasCancelled = this.status.peek() === "cancelled";
      this.exit.value = exit;
      this.status.value = wasCancelled ? "cancelled" : status.success ? "exited" : "failed";
      this.#appendSystemLine(
        `process ${
          wasCancelled ? "cancelled" : status.success ? "exited" : "failed"
        } code=${exit.code} duration=${exit.durationMs}ms`,
      );
      return true;
    } catch (error) {
      if (runId !== this.#runId) return false;
      this.exit.value = undefined;
      this.status.value = "failed";
      const detail = errorMessage(error);
      this.#appendSystemLine(`process failed: ${detail}`);
      this.#diagnostics?.report({
        source: "process",
        code: "spawn-failed",
        severity: "error",
        message: "Process session failed to start or run.",
        detail,
        context: { command: spec.command, args: [...(spec.args ?? [])], cwd: spec.cwd },
      });
      return false;
    } finally {
      if (runId === this.#runId) this.#child = undefined;
    }
  }

  async stop(signal: Deno.Signal = "SIGTERM"): Promise<boolean> {
    if (!this.#child || !this.running) return false;
    const child = this.#child;
    try {
      child.kill(signal);
      this.status.value = "cancelled";
      this.#appendSystemLine(`sent ${signal}`);
      await child.status.catch(() => undefined);
      return true;
    } catch (error) {
      const detail = errorMessage(error);
      this.#appendSystemLine(`stop failed: ${detail}`);
      this.#diagnostics?.report({
        source: "process",
        code: "stop-failed",
        severity: "warning",
        message: "Process session stop failed.",
        detail,
        context: { signal, command: this.command.peek().command },
      });
      return false;
    }
  }

  async writeInput(data: string | Uint8Array): Promise<boolean> {
    if (!this.#child || !this.running || !this.#child.stdin) return false;
    const bytes = typeof data === "string" ? INPUT_ENCODER.encode(data) : data;
    const writer = this.#child.stdin.getWriter();
    try {
      await writer.write(bytes);
      return true;
    } catch (error) {
      const detail = errorMessage(error);
      this.#appendSystemLine(`input failed: ${detail}`);
      this.#diagnostics?.report({
        source: "process",
        code: "input-failed",
        severity: "warning",
        message: "Process session input write failed.",
        detail,
        context: { command: this.command.peek().command },
      });
      return false;
    } finally {
      writer.releaseLock();
    }
  }

  async closeInput(): Promise<boolean> {
    if (!this.#child?.stdin) return false;
    const writer = this.#child.stdin.getWriter();
    try {
      await writer.close();
      return true;
    } catch (error) {
      const detail = errorMessage(error);
      this.#appendSystemLine(`input close failed: ${detail}`);
      this.#diagnostics?.report({
        source: "process",
        code: "input-close-failed",
        severity: "warning",
        message: "Process session input close failed.",
        detail,
        context: { command: this.command.peek().command },
      });
      return false;
    } finally {
      writer.releaseLock();
    }
  }

  async restart(command?: ProcessSessionCommand): Promise<boolean> {
    if (this.running) await this.stop();
    return await this.start(command);
  }

  clearOutput(): void {
    this.output.clear();
  }

  inspect(height?: number): ProcessSessionInspection {
    const command = this.command.peek();
    const inspectedCommand: ProcessSessionCommand = { command: command.command };
    if (command.args) inspectedCommand.args = [...command.args];
    if (command.cwd) inspectedCommand.cwd = command.cwd;
    if (command.env) inspectedCommand.env = { ...command.env };
    return {
      command: inspectedCommand,
      commandLine: formatProcessCommandLine(command),
      status: this.status.peek(),
      running: this.running,
      exit: this.exit.peek() ? { ...this.exit.peek()! } : undefined,
      output: this.output.inspect(height),
    };
  }

  async dispose(): Promise<void> {
    if (this.running) await this.stop();
    this.command.dispose();
    this.status.dispose();
    this.exit.dispose();
    this.output.dispose();
  }

  async #pump(
    stream: ReadableStream<Uint8Array> | null,
    source: TerminalOutputLine["source"],
    runId: number,
  ): Promise<void> {
    if (!stream) return;
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    const lines = new BoundedOutputLineBuffer();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const consumed = this.#onOutputData?.(source, value);
        const timestamp = this.#now();
        const truncated = lines.append(decoder.decode(value, { stream: true }), (line) => {
          if (runId !== this.#runId) return;
          this.output.append({ source, text: line, timestamp });
        });
        if (truncated && runId === this.#runId) {
          this.#appendSystemLine(
            `unterminated ${source} fragment truncated to ${MAX_PENDING_OUTPUT_LINE_LENGTH} characters; raw process data is unaffected`,
          );
        }
        // Consumer backpressure: hold the next read until it is ready, letting
        // the pipe fill and the child block instead of buffering unboundedly.
        if (consumed) await consumed;
      }
      const timestamp = this.#now();
      lines.append(decoder.decode(), (line) => {
        if (runId === this.#runId) this.output.append({ source, text: line, timestamp });
      });
      lines.finish((line) => {
        if (runId === this.#runId) this.output.append({ source, text: line, timestamp });
      });
    } finally {
      reader.releaseLock();
    }
  }

  #appendSystemLine(text: string): void {
    this.output.append({ source: "system", text, timestamp: this.#now() });
  }
}

/** Formats a command specification into a shell-like display string. */
export function formatProcessCommandLine(command: ProcessSessionCommand): string {
  let line = quoteCommandToken(command.command);
  const args = command.args ?? [];
  for (let index = 0; index < args.length; index += 1) {
    line += ` ${quoteCommandToken(args[index]!)}`;
  }
  return line;
}

function quoteCommandToken(token: string): string {
  if (/^[\w./:=@+-]+$/.test(token)) return token;
  return `"${token.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function spawnDenoProcessSessionChild(spec: ProcessSessionCommand): ProcessSessionChild {
  return new Deno.Command(spec.command, {
    args: [...(spec.args ?? [])],
    cwd: spec.cwd,
    env: spec.env,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
}
