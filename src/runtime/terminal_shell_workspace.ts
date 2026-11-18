import { type RuntimeSignal } from "./host.ts";
// Copyright 2023 Im-Beast. MIT license.
import type { DiagnosticsCollector } from "./diagnostics.ts";
import type { TerminalBackend } from "./terminal_backend.ts";
import { TerminalShellController, type TerminalShellInspection } from "./terminal_shell.ts";
import {
  isSpawnTerminalTemplate,
  shellTerminalTemplate,
  type SpawnTerminalTemplate,
  type TerminalSessionDescriptor,
  type TerminalTemplate,
} from "./terminal_templates.ts";
import {
  createTerminalWorkspaceController,
  type TerminalWorkspaceController,
  type TerminalWorkspaceControllerOptions,
  type TerminalWorkspaceInspection,
} from "./terminal_workspace.ts";

/** Options for constructing a multi-session shell workspace. */
export interface TerminalShellWorkspaceControllerOptions {
  workspace?: TerminalWorkspaceController;
  workspaceOptions?: TerminalWorkspaceControllerOptions;
  backend?: TerminalBackend;
  backendFactory?: () => TerminalBackend | Promise<TerminalBackend>;
  columns?: number;
  rows?: number;
  scrollbackLimit?: number;
  diagnostics?: DiagnosticsCollector;
  now?: () => number;
  onUpdate?: () => void;
}

/** Options for adding a live shell session to a shell workspace. */
export interface AddTerminalShellWorkspaceSessionOptions {
  activate?: boolean;
  start?: boolean;
}

/** Runtime shell inspection paired with its workspace session id. */
export interface TerminalShellWorkspaceSessionInspection {
  id: string;
  title: string;
  shell: TerminalShellInspection;
}

/** Serializable shell workspace inspection. */
export interface TerminalShellWorkspaceInspection {
  activeId?: string;
  activeShell?: TerminalShellInspection;
  sessions: TerminalShellWorkspaceSessionInspection[];
  workspace: TerminalWorkspaceInspection;
}

/** Coordinates renderer-neutral terminal workspace tabs with live shell controllers. */
export class TerminalShellWorkspaceController {
  readonly workspace: TerminalWorkspaceController;
  readonly #backend?: TerminalBackend;
  readonly #backendFactory?: () => TerminalBackend | Promise<TerminalBackend>;
  readonly #columns?: number;
  readonly #rows?: number;
  readonly #scrollbackLimit?: number;
  readonly #diagnostics?: DiagnosticsCollector;
  readonly #onUpdate?: () => void;
  readonly #shells = new Map<string, TerminalShellController>();
  readonly #syncKeys = new Map<string, string>();

  constructor(options: TerminalShellWorkspaceControllerOptions = {}) {
    this.workspace = options.workspace ?? createTerminalWorkspaceController({
      ...options.workspaceOptions,
      now: options.now ?? options.workspaceOptions?.now,
    });
    this.#backend = options.backend;
    this.#backendFactory = options.backendFactory;
    this.#columns = options.columns;
    this.#rows = options.rows;
    this.#scrollbackLimit = options.scrollbackLimit;
    this.#diagnostics = options.diagnostics;
    this.#onUpdate = options.onUpdate;

    const workspace = this.workspace.inspect();
    for (let index = 0; index < workspace.sessions.length; index += 1) {
      const descriptor = workspace.sessions[index]!;
      this.#ensureShell(descriptor.template, descriptor.id, descriptor);
    }
  }

  get activeShell(): TerminalShellController | undefined {
    const activeId = this.workspace.activeId.peek();
    return activeId ? this.#shells.get(activeId) : undefined;
  }

  add(
    template: TerminalTemplate = shellTerminalTemplate(),
    options: AddTerminalShellWorkspaceSessionOptions = {},
  ): TerminalSessionDescriptor {
    const descriptor = this.workspace.add(template, { activate: options.activate });
    this.#ensureShell(template, descriptor.id);
    if (options.start) void this.start(descriptor.id);
    return descriptor;
  }

  activate(id: string): boolean {
    return this.workspace.activate(id);
  }

  activateRelative(delta: number): TerminalSessionDescriptor | undefined {
    return this.workspace.activateRelative(delta);
  }

  shell(id: string | undefined = this.workspace.activeId.peek()): TerminalShellController | undefined {
    return id ? this.#shells.get(id) : undefined;
  }

  async start(id: string | undefined = this.workspace.activeId.peek()): Promise<boolean> {
    const shell = this.shell(id);
    if (!shell) return false;
    const started = await shell.start();
    this.#syncShell(id!, shell);
    return started;
  }

  async stop(id: string | undefined = this.workspace.activeId.peek()): Promise<boolean> {
    const shell = this.shell(id);
    if (!shell) return false;
    const stopped = await shell.stop();
    this.#syncShell(id!, shell);
    return stopped;
  }

  /** Detaches a live shell without terminating a retaining backend session. */
  async detach(id: string | undefined = this.workspace.activeId.peek()): Promise<boolean> {
    const shell = this.shell(id);
    if (!shell) return false;
    const detached = await shell.detach();
    this.#syncShell(id!, shell);
    return detached;
  }

  /** Reattaches a detached or attach-template shell session. */
  async attach(id: string | undefined = this.workspace.activeId.peek()): Promise<boolean> {
    const shell = this.shell(id);
    if (!shell) return false;
    const attached = await shell.attach();
    this.#syncShell(id!, shell);
    return attached;
  }

  /** Explicitly terminates a shell session instead of detaching it. */
  async terminate(
    id: string | undefined = this.workspace.activeId.peek(),
    signal: RuntimeSignal = "SIGTERM",
  ): Promise<boolean> {
    const shell = this.shell(id);
    if (!shell) return false;
    const terminated = await shell.terminate(signal);
    this.#syncShell(id!, shell);
    return terminated;
  }

  async restart(id: string | undefined = this.workspace.activeId.peek()): Promise<boolean> {
    const shell = this.shell(id);
    if (!shell) return false;
    const restarted = await shell.restart();
    this.#syncShell(id!, shell);
    return restarted;
  }

  async write(data: string | Uint8Array, id: string | undefined = this.workspace.activeId.peek()): Promise<boolean> {
    const shell = this.shell(id);
    return shell ? await shell.write(data) : false;
  }

  resize(columns: number, rows: number, id: string | undefined = this.workspace.activeId.peek()): boolean {
    const shell = this.shell(id);
    if (!shell) return false;
    shell.resize(columns, rows);
    this.#syncShell(id!, shell);
    return true;
  }

  sync(id?: string): void {
    if (id !== undefined) {
      const shell = this.#shells.get(id);
      if (shell) this.#syncShell(id, shell);
      return;
    }
    for (const [sessionId, shell] of this.#shells) {
      this.#syncShell(sessionId, shell);
    }
  }

  async remove(id: string): Promise<boolean> {
    const shell = this.#shells.get(id);
    if (shell) {
      this.#shells.delete(id);
      this.#syncKeys.delete(id);
      await shell.dispose();
    }
    return this.workspace.remove(id);
  }

  inspect(): TerminalShellWorkspaceInspection {
    this.sync();
    const workspace = this.workspace.inspect();
    const sessions: TerminalShellWorkspaceSessionInspection[] = [];
    for (let index = 0; index < workspace.sessions.length; index += 1) {
      const descriptor = workspace.sessions[index]!;
      const shell = this.#shells.get(descriptor.id);
      if (!shell) continue;
      sessions.push({
        id: descriptor.id,
        title: descriptor.title,
        shell: shell.inspect(),
      });
    }
    const activeShell = workspace.activeId ? this.#shells.get(workspace.activeId)?.inspect() : undefined;
    return activeShell ? { activeId: workspace.activeId, activeShell, sessions, workspace } : {
      activeId: workspace.activeId,
      sessions,
      workspace,
    };
  }

  async dispose(): Promise<void> {
    const shells = [...this.#shells.values()];
    this.#shells.clear();
    this.#syncKeys.clear();
    for (let index = 0; index < shells.length; index += 1) {
      await shells[index]!.dispose();
    }
    this.workspace.dispose();
  }

  #ensureShell(
    template: TerminalTemplate,
    id: string,
    descriptor?: TerminalSessionDescriptor,
  ): TerminalShellController {
    const existing = this.#shells.get(id);
    if (existing) return existing;
    const source = isSpawnTerminalTemplate(template) ? cloneSpawnTerminalTemplate(template) : undefined;
    const shell = new TerminalShellController({
      backend: this.#backend,
      backendFactory: this.#backendFactory,
      attachSessionId: isSpawnTerminalTemplate(template) ? undefined : template.sessionId,
      shell: source?.command,
      args: source?.args,
      cwd: source?.cwd,
      env: source?.env,
      columns: source?.columns ?? descriptor?.columns ?? this.#columns,
      rows: source?.rows ?? descriptor?.rows ?? this.#rows,
      scrollbackLimit: source?.scrollbackLimit ?? this.#scrollbackLimit,
      diagnostics: this.#diagnostics,
      onUpdate: () => {
        this.#syncShell(id, shell);
        this.#onUpdate?.();
      },
    });
    this.#shells.set(id, shell);
    return shell;
  }

  #syncShell(id: string, shell: TerminalShellController): void {
    const workspace = this.workspace.inspect();
    let descriptor: TerminalSessionDescriptor | undefined;
    for (let index = 0; index < workspace.sessions.length; index += 1) {
      const session = workspace.sessions[index]!;
      if (session.id === id) {
        descriptor = session;
        break;
      }
    }
    if (!descriptor) return;
    const inspection = shell.inspect();
    const syncKey = terminalShellWorkspaceSyncKey(inspection);
    if (this.#syncKeys.get(id) === syncKey) return;
    this.#syncKeys.set(id, syncKey);
    descriptor.backendId = inspection.backendId;
    descriptor.pty = inspection.pty;
    descriptor.commandLine = inspection.commandLine;
    descriptor.status = inspection.status === "starting" ? "running" : inspection.status;
    descriptor.running = inspection.running;
    descriptor.detached = inspection.detached ?? false;
    descriptor.reconnectable = inspection.reconnectable ?? descriptor.reconnectable;
    descriptor.columns = inspection.columns;
    descriptor.rows = inspection.rows;
    this.workspace.upsert(descriptor, { activate: false });
    if (inspection.title) this.workspace.updateRuntimeTitle(id, inspection.title);
  }
}

function terminalShellWorkspaceSyncKey(inspection: TerminalShellInspection): string {
  return [
    inspection.title ?? "",
    inspection.backendId ?? "",
    inspection.pty ? "1" : "0",
    inspection.commandLine,
    inspection.status,
    inspection.running ? "1" : "0",
    inspection.sessionId ?? "",
    inspection.detached ? "1" : "0",
    inspection.reconnectable ? "1" : "0",
    String(inspection.columns),
    String(inspection.rows),
  ].join("\x1f");
}

function cloneSpawnTerminalTemplate(template: SpawnTerminalTemplate): SpawnTerminalTemplate {
  return {
    id: template.id,
    title: template.title,
    kind: template.kind,
    command: template.command,
    args: template.args ? [...template.args] : undefined,
    cwd: template.cwd,
    env: template.env ? { ...template.env } : undefined,
    columns: template.columns,
    rows: template.rows,
    scrollbackLimit: template.scrollbackLimit,
    reconnectable: template.reconnectable,
    restartPolicy: template.restartPolicy,
    metadata: template.metadata ? { ...template.metadata } : undefined,
  };
}
