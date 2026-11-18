import { runtimeHost } from "./host.ts";
// Copyright 2023 Im-Beast. MIT license.
import type {
  TerminalBackend,
  TerminalBackendSpawnOptions,
  TerminalSessionHandle,
  TerminalSessionHandleInspection,
} from "./terminal_backend.ts";
import { formatProcessCommandLine, type ProcessSessionCommand } from "./process_session.ts";
import { normalizeTerminalDimension } from "./terminal_values.ts";

/** Restart policy metadata for terminal workspace sessions. */
export type TerminalRestartPolicy = "never" | "on-failure" | "always";

/** Terminal templates that spawn a backend process. */
export type SpawnTerminalTemplateKind = "shell" | "deno-task" | "command" | "project-task";

/** Terminal template that attaches to an existing backend-owned session. */
export interface AttachTerminalTemplate {
  id: string;
  title: string;
  kind: "attach";
  sessionId: string;
  reconnectable: true;
  metadata?: Record<string, string>;
}

/** Serializable template for spawning a terminal window. */
export interface SpawnTerminalTemplate extends ProcessSessionCommand {
  id: string;
  title: string;
  kind: SpawnTerminalTemplateKind;
  columns?: number;
  rows?: number;
  scrollbackLimit?: number;
  reconnectable?: boolean;
  restartPolicy?: TerminalRestartPolicy;
  metadata?: Record<string, string>;
}

/** Terminal workspace template. */
export type TerminalTemplate = SpawnTerminalTemplate | AttachTerminalTemplate;

/** Options shared by terminal template builders. */
export interface TerminalTemplateOptions {
  id?: string;
  title?: string;
  cwd?: string;
  env?: Record<string, string>;
  columns?: number;
  rows?: number;
  scrollbackLimit?: number;
  reconnectable?: boolean;
  restartPolicy?: TerminalRestartPolicy;
  metadata?: Record<string, string>;
}

/** Options for a shell terminal template. */
export interface ShellTerminalTemplateOptions extends TerminalTemplateOptions {
  shell?: string;
  args?: readonly string[];
}

/** Options for a command terminal template. */
export interface CommandTerminalTemplateOptions extends TerminalTemplateOptions {
  command: string;
  args?: readonly string[];
  kind?: "command" | "project-task";
}

/** Options for a Deno task terminal template. */
export interface DenoTaskTerminalTemplateOptions extends TerminalTemplateOptions {
  denoExecutable?: string;
  task: string;
  taskArgs?: readonly string[];
}

/** Options for creating a terminal session from a template. */
export interface CreateTerminalTemplateSessionOptions {
  columns?: number;
  rows?: number;
  title?: string;
}

/** Serializable terminal session metadata that can be persisted with a workspace. */
export interface TerminalSessionDescriptor {
  id: string;
  title: string;
  runtimeTitle?: string;
  template: TerminalTemplate;
  backendId?: string;
  pty?: boolean;
  commandLine?: string;
  status?: TerminalSessionHandleInspection["status"];
  running?: boolean;
  detached?: boolean;
  columns?: number;
  rows?: number;
  reconnectable: boolean;
  restartPolicy: TerminalRestartPolicy;
  createdAt: number;
  updatedAt: number;
}

/** Runtime session created from a template and backend handle. */
export interface TerminalTemplateSession {
  readonly id: string;
  readonly title: string;
  readonly template: SpawnTerminalTemplate;
  readonly handle: TerminalSessionHandle;
  readonly createdAt: number;
  inspect(now?: number): TerminalSessionDescriptor;
}

/** Builds a shell terminal template using the host shell or an explicit command. */
export function shellTerminalTemplate(options: ShellTerminalTemplateOptions = {}): SpawnTerminalTemplate {
  const command = options.shell ?? defaultShellCommand();
  const template = baseSpawnTerminalTemplate({
    ...options,
    id: options.id ?? "shell",
    title: options.title ?? "Shell",
    kind: "shell",
    command,
    args: options.args,
  });
  return template;
}

/** Builds a template for an arbitrary command. */
export function commandTerminalTemplate(options: CommandTerminalTemplateOptions): SpawnTerminalTemplate {
  return baseSpawnTerminalTemplate({
    ...options,
    id: options.id ?? slugTerminalId(options.title ?? options.command),
    title: options.title ?? formatProcessCommandLine({ command: options.command, args: options.args }),
    kind: options.kind ?? "command",
    command: options.command,
    args: options.args,
  });
}

/** Builds a template for `deno task <name>`. */
export function denoTaskTerminalTemplate(options: DenoTaskTerminalTemplateOptions): SpawnTerminalTemplate {
  const args = ["task", options.task, ...(options.taskArgs ?? [])];
  return baseSpawnTerminalTemplate({
    ...options,
    id: options.id ?? `deno-task-${slugTerminalId(options.task)}`,
    title: options.title ?? `deno task ${options.task}`,
    kind: "deno-task",
    command: options.denoExecutable ?? "deno",
    args,
    metadata: {
      task: options.task,
      ...(options.metadata ?? {}),
    },
  });
}

/** Builds a project-task template. It is a named command with project metadata attached. */
export function projectTaskTerminalTemplate(options: CommandTerminalTemplateOptions): SpawnTerminalTemplate {
  return commandTerminalTemplate({
    ...options,
    kind: "project-task",
    metadata: {
      projectTask: options.title ?? options.command,
      ...(options.metadata ?? {}),
    },
  });
}

/** Builds metadata for a backend-owned session that can be attached later. */
export function attachTerminalTemplate(
  sessionId: string,
  options: Pick<TerminalTemplateOptions, "id" | "title" | "metadata"> = {},
): AttachTerminalTemplate {
  return {
    id: options.id ?? `attach-${slugTerminalId(sessionId)}`,
    title: options.title ?? `Attach ${sessionId}`,
    kind: "attach",
    sessionId,
    reconnectable: true,
    metadata: options.metadata ? { ...options.metadata } : undefined,
  };
}

/** Returns true when a terminal template can spawn a new backend process. */
export function isSpawnTerminalTemplate(template: TerminalTemplate): template is SpawnTerminalTemplate {
  return template.kind !== "attach";
}

/** Converts a spawn template to backend spawn options. */
export function terminalTemplateToSpawnOptions(
  template: SpawnTerminalTemplate,
  options: CreateTerminalTemplateSessionOptions = {},
): TerminalBackendSpawnOptions {
  const spawn: TerminalBackendSpawnOptions = {
    command: template.command,
    args: template.args ? [...template.args] : undefined,
    cwd: template.cwd,
    env: template.env ? { ...template.env } : undefined,
    columns: normalizeTerminalDimension(options.columns ?? template.columns),
    rows: normalizeTerminalDimension(options.rows ?? template.rows),
  };
  return spawn;
}

/** Spawns a terminal session from a template and returns persistent metadata helpers. */
export function createTerminalTemplateSession(
  backend: TerminalBackend,
  template: SpawnTerminalTemplate,
  options: CreateTerminalTemplateSessionOptions = {},
): TerminalTemplateSession {
  const handle = backend.spawn(terminalTemplateToSpawnOptions(template, options));
  const createdAt = Date.now();
  return {
    id: template.id,
    title: options.title ?? template.title,
    template: cloneSpawnTerminalTemplate(template),
    handle,
    createdAt,
    inspect(now = Date.now()): TerminalSessionDescriptor {
      return describeTerminalTemplateSession(this, now);
    },
  };
}

/** Creates a serializable descriptor for a spawned template session. */
export function describeTerminalTemplateSession(
  session: TerminalTemplateSession,
  now: number = Date.now(),
): TerminalSessionDescriptor {
  const inspected = session.handle.inspect();
  const descriptor: TerminalSessionDescriptor = {
    id: session.id,
    title: session.title,
    template: cloneSpawnTerminalTemplate(session.template),
    backendId: inspected.backendId,
    pty: inspected.pty,
    commandLine: inspected.commandLine,
    status: inspected.status,
    running: inspected.running,
    columns: inspected.columns,
    rows: inspected.rows,
    reconnectable: session.template.reconnectable ?? false,
    restartPolicy: session.template.restartPolicy ?? "never",
    createdAt: session.createdAt,
    updatedAt: now,
  };
  if (inspected.title) descriptor.runtimeTitle = inspected.title;
  return descriptor;
}

/** Creates a serializable descriptor for an attachable session reference. */
export function describeAttachTerminalTemplate(
  template: AttachTerminalTemplate,
  now: number = Date.now(),
): TerminalSessionDescriptor {
  return {
    id: template.id,
    title: template.title,
    template: { ...template, metadata: template.metadata ? { ...template.metadata } : undefined },
    reconnectable: true,
    restartPolicy: "never",
    createdAt: now,
    updatedAt: now,
  };
}

function baseSpawnTerminalTemplate(
  options: TerminalTemplateOptions & ProcessSessionCommand & { kind: SpawnTerminalTemplateKind },
): SpawnTerminalTemplate {
  const template: SpawnTerminalTemplate = {
    id: options.id ?? slugTerminalId(options.title ?? options.command),
    title: options.title ?? options.command,
    kind: options.kind,
    command: options.command,
    args: options.args ? [...options.args] : undefined,
    cwd: options.cwd,
    env: options.env ? { ...options.env } : undefined,
    columns: normalizeTerminalDimension(options.columns),
    rows: normalizeTerminalDimension(options.rows),
    scrollbackLimit: normalizeScrollbackLimit(options.scrollbackLimit),
    reconnectable: options.reconnectable,
    restartPolicy: options.restartPolicy ?? "never",
    metadata: options.metadata ? { ...options.metadata } : undefined,
  };
  return template;
}

function cloneSpawnTerminalTemplate(template: SpawnTerminalTemplate): SpawnTerminalTemplate {
  return {
    ...template,
    args: template.args ? [...template.args] : undefined,
    env: template.env ? { ...template.env } : undefined,
    metadata: template.metadata ? { ...template.metadata } : undefined,
  };
}

function defaultShellCommand(): string {
  if (runtimeHost.build.os === "windows") return readEnv("COMSPEC") ?? "cmd.exe";
  return readEnv("SHELL") ?? "sh";
}

function slugTerminalId(value: string): string {
  const slug = value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/(^-|-$)/g, "");
  return slug || crypto.randomUUID();
}

function readEnv(name: string): string | undefined {
  try {
    return runtimeHost.env.get(name);
  } catch {
    return undefined;
  }
}

function normalizeScrollbackLimit(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value!));
}
