// Copyright 2023 Im-Beast. MIT license.

import {
  connectExomuxWebSocket,
  defaultExomuxStateDirectory,
  ensurePrivateExomuxStateDirectory,
  ExomuxClientError,
  type ExomuxLocalHostDescriptor,
  type ExomuxProcessProbe,
  type ExomuxWebSocketLike,
  probeExomuxHostProcess,
  readExomuxHostDescriptor,
  removeExomuxHostDescriptor,
} from "./client.ts";

/** The session bare launches create; legacy state directories map onto it unrenamed. */
export const EXOMUX_DEFAULT_SESSION_NAME = "main";
const SESSION_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DEFAULT_SESSION_PROBE_TIMEOUT_MS = 1_500;

/** Session names become path segments; the pattern forbids separators and dotfiles. */
export function isExomuxSessionName(value: unknown): value is string {
  return typeof value === "string" && SESSION_NAME_PATTERN.test(value);
}

export function assertExomuxSessionName(value: string): string {
  if (!isExomuxSessionName(value)) {
    throw new ExomuxClientError(
      "invalid-session-name",
      "Exomux session names start with a letter or digit and use letters, digits, dots, dashes, or underscores " +
        "(64 characters at most).",
    );
  }
  return value;
}

/** Where one named session keeps its host descriptor and persisted layout. */
export interface ExomuxSessionPaths {
  readonly name: string;
  readonly stateDirectory: string;
  readonly descriptorPath: string;
  readonly layoutPath: string;
}

/**
 * The default session lives directly in the state root — exactly where
 * pre-session Exomux kept its descriptor and layout — so an already-detached
 * host and its persisted desktop keep working across the upgrade. Every other
 * session gets a private directory under `sessions/`.
 */
export function resolveExomuxSessionPaths(stateRoot: string, name: string): ExomuxSessionPaths {
  assertExomuxSessionName(name);
  const stateDirectory = name === EXOMUX_DEFAULT_SESSION_NAME
    ? stateRoot
    : joinPath(joinPath(stateRoot, "sessions"), name);
  return Object.freeze({
    name,
    stateDirectory,
    descriptorPath: joinPath(stateDirectory, "host.json"),
    layoutPath: joinPath(stateDirectory, "layout.json"),
  });
}

/** Creates the session's private directories ahead of its first launch. */
export async function ensureExomuxSessionDirectories(stateRoot: string, name: string): Promise<ExomuxSessionPaths> {
  const paths = resolveExomuxSessionPaths(stateRoot, name);
  await ensurePrivateExomuxStateDirectory(stateRoot);
  if (paths.stateDirectory !== stateRoot) {
    await ensurePrivateExomuxStateDirectory(joinPath(stateRoot, "sessions"));
    await ensurePrivateExomuxStateDirectory(paths.stateDirectory);
  }
  return paths;
}

/** Picks the smallest free numeric name, tmux-style, skipping every known session. */
export function generateExomuxSessionName(existing: Iterable<string>): string {
  const taken = new Set(existing);
  for (let candidate = 1;; candidate++) {
    const name = String(candidate);
    if (!taken.has(name)) return name;
  }
}

export type ExomuxSessionState = "attachable" | "unresponsive" | "stopped";

/** One terminal inside a probed session, as shown by session listings. */
export interface ExomuxSessionTerminal {
  readonly title: string;
  readonly commandLine: string;
  readonly running: boolean;
}

/** One discovered session, probed for liveness and terminal inventory. */
export interface ExomuxSessionProbe extends ExomuxSessionPaths {
  readonly state: ExomuxSessionState;
  readonly descriptor?: ExomuxLocalHostDescriptor;
  /** Milliseconds the recorded host has been up; absent for stopped sessions. */
  readonly upMs?: number;
  readonly terminals: readonly ExomuxSessionTerminal[];
}

export interface ProbeExomuxSessionsOptions {
  readonly stateRoot?: string;
  /** Per-session connect budget; listings must stay snappy even with wedged hosts. */
  readonly timeoutMs?: number;
  readonly now?: () => number;
  readonly processProbe?: ExomuxProcessProbe;
  readonly createWebSocket?: (url: string) => ExomuxWebSocketLike;
}

/**
 * Enumerates every session that left state behind: the default session in the
 * state root plus each directory under `sessions/`. Purely filesystem-based;
 * liveness comes from {@linkcode probeExomuxSessions}.
 */
export async function discoverExomuxSessions(stateRoot: string): Promise<readonly ExomuxSessionPaths[]> {
  const sessions: ExomuxSessionPaths[] = [];
  const main = resolveExomuxSessionPaths(stateRoot, EXOMUX_DEFAULT_SESSION_NAME);
  if (await regularFileExists(main.descriptorPath) || await regularFileExists(main.layoutPath)) sessions.push(main);
  const namedRoot = joinPath(stateRoot, "sessions");
  const entries: Deno.DirEntry[] = [];
  try {
    for await (const entry of Deno.readDir(namedRoot)) entries.push(entry);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (!entry.isDirectory || !isExomuxSessionName(entry.name)) continue;
    if (entry.name === EXOMUX_DEFAULT_SESSION_NAME) continue;
    const paths = resolveExomuxSessionPaths(stateRoot, entry.name);
    // A directory with neither descriptor nor layout never hosted anything.
    if (await regularFileExists(paths.descriptorPath) || await regularFileExists(paths.layoutPath)) {
      sessions.push(paths);
    }
  }
  return sessions;
}

/**
 * Discovers sessions and asks each recorded host for its terminal inventory.
 * A session whose host is gone — dead pid, or a recycled pid that is no longer
 * an Exomux daemon — has its descriptor pruned and reports as `stopped`, the
 * same judgement the launcher would make; a host that looks alive but never
 * answers reports as `unresponsive` without blocking the listing.
 */
export async function probeExomuxSessions(
  options: ProbeExomuxSessionsOptions = {},
): Promise<readonly ExomuxSessionProbe[]> {
  const stateRoot = options.stateRoot ?? defaultExomuxStateDirectory();
  const discovered = await discoverExomuxSessions(stateRoot);
  return await Promise.all(discovered.map((paths) => probeExomuxSession(paths, options)));
}

async function probeExomuxSession(
  paths: ExomuxSessionPaths,
  options: ProbeExomuxSessionsOptions,
): Promise<ExomuxSessionProbe> {
  const now = options.now ?? Date.now;
  const descriptor = await readExomuxHostDescriptor(paths.descriptorPath).catch(() => undefined);
  if (!descriptor) return { ...paths, state: "stopped", terminals: [] };
  let client: Awaited<ReturnType<typeof connectExomuxWebSocket>> | undefined;
  try {
    client = await connectExomuxWebSocket({
      url: descriptor.url,
      authToken: descriptor.token,
      requestTimeoutMs: options.timeoutMs ?? DEFAULT_SESSION_PROBE_TIMEOUT_MS,
      flowControlledReplay: descriptor.flowControlledReplay === true,
      createWebSocket: options.createWebSocket,
    });
    const terminals = (await client.list()).map((session) =>
      Object.freeze({
        title: session.title,
        commandLine: session.commandLine,
        running: session.running,
      })
    );
    return {
      ...paths,
      state: "attachable",
      descriptor,
      upMs: Math.max(0, now() - descriptor.startedAt),
      terminals,
    };
  } catch {
    const process = await (options.processProbe ?? probeExomuxHostProcess)(descriptor.pid);
    if (process === "dead" || process === "foreign") {
      await removeExomuxHostDescriptor(paths.descriptorPath, descriptor.hostId);
      return { ...paths, state: "stopped", terminals: [] };
    }
    return {
      ...paths,
      state: "unresponsive",
      descriptor,
      upMs: Math.max(0, now() - descriptor.startedAt),
      terminals: [],
    };
  } finally {
    await client?.dispose();
  }
}

/** Renders session listings; pure so tests can pin the layout. */
export function formatExomuxSessionList(probes: readonly ExomuxSessionProbe[]): string {
  if (probes.length === 0) return "No Exomux sessions. Launching exomux creates one.";
  const header = ["NAME", "STATE", "UP", "TERMINALS", "RUNNING"];
  const rows = probes.map((probe) => [
    probe.name,
    probe.state,
    probe.upMs === undefined ? "-" : formatExomuxUptime(probe.upMs),
    probe.state === "attachable" ? String(probe.terminals.length) : "-",
    describeExomuxSessionActivity(probe),
  ]);
  const widths = header.map((column, index) => Math.max(column.length, ...rows.map((row) => row[index]!.length)));
  return [header, ...rows]
    .map((row) => row.map((cell, index) => cell.padEnd(widths[index]!)).join("  ").trimEnd())
    .join("\n");
}

/** Milliseconds of uptime as the two most significant units: `3d 2h`, `5m`, `12s`. */
export function formatExomuxUptime(upMs: number): string {
  const seconds = Math.max(0, Math.floor(upMs / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function describeExomuxSessionActivity(probe: ExomuxSessionProbe): string {
  if (probe.state === "unresponsive") return `host pid ${probe.descriptor?.pid} is not answering`;
  if (probe.state === "stopped") return "not running";
  const titles = probe.terminals
    .filter((terminal) => terminal.running)
    .map((terminal) => terminal.title || terminal.commandLine);
  if (titles.length === 0) return "idle";
  const shown = titles.slice(0, 4);
  const extra = titles.length - shown.length;
  return shown.join(", ") + (extra > 0 ? ` (+${extra} more)` : "");
}

async function regularFileExists(path: string): Promise<boolean> {
  try {
    const info = await Deno.lstat(path);
    return info.isFile && !info.isSymlink;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

function joinPath(parent: string, child: string): string {
  const separator = Deno.build.os === "windows" ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/g, "")}${separator}${child.replace(/^[\\/]+/g, "")}`;
}

function pathDirname(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index <= 0 ? "." : path.slice(0, index);
}

function pathBasename(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index < 0 ? path : path.slice(index + 1);
}

/**
 * The state root a session's `host.json` descriptor lives under, or undefined
 * if the path is not a recognized session descriptor. The default session's
 * descriptor sits in the root itself; a named session's sits under
 * `<root>/sessions/<name>/`.
 */
export function exomuxSessionStateRoot(descriptorPath: string): string | undefined {
  if (pathBasename(descriptorPath) !== "host.json") return undefined;
  const dir = pathDirname(descriptorPath);
  const parent = pathDirname(dir);
  if (pathBasename(parent) === "sessions") return pathDirname(parent);
  return dir;
}

/**
 * Whether a daemon at `currentPath` may relocate its descriptor to `newPath`:
 * both must be session descriptors under the same state root, with no path
 * traversal — the guard the daemon applies to a client's rename request.
 */
export function isExomuxDescriptorRelocation(currentPath: string, newPath: string): boolean {
  if (newPath.includes("\0") || newPath.split(/[\\/]+/).includes("..")) return false;
  const root = exomuxSessionStateRoot(currentPath);
  const newRoot = exomuxSessionStateRoot(newPath);
  return root !== undefined && root === newRoot;
}
