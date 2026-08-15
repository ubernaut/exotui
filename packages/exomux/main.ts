// Copyright 2023 Im-Beast. MIT license.

import { type AsyncStore, DiagnosticsCollector } from "@ubernaut/deno-tui";
import { createShowcaseTerminalStore } from "@showcase/kit";
import { createExomuxTerminalApp, type ExomuxTerminalAppRuntime } from "./app.ts";
import {
  connectOrLaunchExomuxLocalHost,
  defaultExomuxStateDirectory,
  ExomuxClientError,
  type ExomuxConnectMode,
  type ExomuxLocalHostDescriptor,
  removeExomuxHostDescriptor,
  writeExomuxHostDescriptor,
} from "./client.ts";
import {
  assertExomuxSessionName,
  ensureExomuxSessionDirectories,
  EXOMUX_DEFAULT_SESSION_NAME,
  type ExomuxSessionPaths,
  formatExomuxSessionList,
  generateExomuxSessionName,
  isExomuxDescriptorRelocation,
  isExomuxSessionName,
  probeExomuxSessions,
  resolveExomuxSessionPaths,
} from "./sessions.ts";
import {
  createExomuxController,
  type ExomuxController,
  type ExomuxPreferences,
  type ExomuxRenameResult,
} from "./controller.ts";
import {
  defaultExomuxConfigDirectory,
  type ExomuxConfig,
  exomuxConfigFilePath,
  loadExomuxConfig,
  persistExomuxBackgroundImage,
  resetExomuxConfig,
  writeExomuxConfig,
} from "./config.ts";
import { exomuxBackgroundSettingsFor, withExomuxBackgroundString } from "./model.ts";
import {
  applyExomuxCursorConfig,
  applyExomuxShaders,
  ensureExomuxGhosttyInclude,
  type ExomuxShaderConfig,
  isGhosttyAvailable,
  reloadExomuxGhosttyConfig,
} from "./ghostty.ts";
import { type ExomuxHostServer, serveExomuxHost } from "./host.ts";
import { isExomuxAuthToken } from "./protocol.ts";

/** Deliberately small launcher/daemon CLI surface. */
export interface ExomuxShowcaseLaunchOptions {
  readonly daemon: boolean;
  readonly stateDirectory?: string;
  readonly descriptorPath?: string;
  readonly layoutPath?: string;
  readonly configDirectory?: string;
  readonly persistLayout: boolean;
  readonly listSessions: boolean;
  readonly attachSession?: string;
  readonly newSession: boolean;
  readonly newSessionName?: string;
  readonly showHelp: boolean;
  readonly resetConfig: boolean;
}

/** Every flag and prefix command, printed by `-h`/`--help` and on launch failure. */
export const EXOMUX_HELP_TEXT = `Exomux — a terminal multiplexer with a detachable host.

Usage: exomux [options]

Session options:
  (none)               Attach to the single live session, or create "main"
  -a, --attach <name>  Attach to a named session; never launches a host
  -n, --new-session [name]
                       Create a new session (numeric name generated if omitted)
  --list-sessions      List every session with state, uptime, and terminals

Config options:
  --reset-config       Reset saved settings to safe defaults and exit
  --config-dir=<path>  Use a config directory other than ~/.config/exomux

Other options:
  --memory             Do not persist this session's window layout
  --persist            Persist the window layout (the default)
  -h, --help           Show this help and exit

Config and wallpapers live in ~/.config/exomux (exomux.json, images/).

Inside the workbench, Ctrl-N is the prefix key; Ctrl-N ? lists every command.`;

/** Parses Exomux options without performing filesystem or network I/O. */
export function parseExomuxShowcaseArgs(args: readonly string[]): ExomuxShowcaseLaunchOptions {
  let daemon = false;
  let stateDirectory: string | undefined;
  let descriptorPath: string | undefined;
  let layoutPath: string | undefined;
  let persistLayout = true;
  let listSessions = false;
  let attachSession: string | undefined;
  let newSession = false;
  let newSessionName: string | undefined;
  let configDirectory: string | undefined;
  let showHelp = false;
  let resetConfig = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--daemon") daemon = true;
    else if (argument === "-h" || argument === "--help") showHelp = true;
    else if (argument === "--reset-config") resetConfig = true;
    else if (argument.startsWith("--config-dir=")) configDirectory = requiredOption(argument, "--config-dir=");
    else if (argument === "--memory") persistLayout = false;
    else if (argument === "--persist") persistLayout = true;
    else if (argument === "--list-sessions") listSessions = true;
    else if (argument === "-a" || argument === "--attach") {
      attachSession = sessionNameValue(args[++index], argument);
    } else if (argument.startsWith("--attach=")) {
      attachSession = sessionNameValue(argument.slice("--attach=".length), "--attach");
    } else if (argument === "-n" || argument === "--new-session") {
      newSession = true;
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith("-")) newSessionName = sessionNameValue(args[++index], argument);
    } else if (argument.startsWith("--new-session=")) {
      newSession = true;
      newSessionName = sessionNameValue(argument.slice("--new-session=".length), "--new-session");
    } else if (argument.startsWith("--state-dir=")) stateDirectory = requiredOption(argument, "--state-dir=");
    else if (argument.startsWith("--descriptor=")) descriptorPath = requiredOption(argument, "--descriptor=");
    else if (argument.startsWith("--layout-file=")) {
      layoutPath = requiredOption(argument, "--layout-file=");
      persistLayout = true;
    } else throw new TypeError(`Unknown Exomux option: ${argument}`);
  }
  const selections = [listSessions, attachSession !== undefined, newSession].filter(Boolean).length;
  if (selections > 1) throw new TypeError("Exomux accepts only one of --list-sessions, -a, or -n.");
  if (daemon && selections > 0) throw new TypeError("Exomux --daemon does not combine with session selection.");
  if (descriptorPath && selections > 0) {
    throw new TypeError("Exomux --descriptor pins one host file and does not combine with session selection.");
  }
  return Object.freeze({
    daemon,
    persistLayout,
    listSessions,
    newSession,
    showHelp,
    resetConfig,
    ...(stateDirectory ? { stateDirectory } : {}),
    ...(descriptorPath ? { descriptorPath } : {}),
    ...(layoutPath ? { layoutPath } : {}),
    ...(configDirectory ? { configDirectory } : {}),
    ...(attachSession !== undefined ? { attachSession } : {}),
    ...(newSessionName !== undefined ? { newSessionName } : {}),
  });
}

function sessionNameValue(value: string | undefined, flag: string): string {
  if (!value || value.startsWith("-")) throw new TypeError(`Exomux option ${flag} needs a session name.`);
  try {
    return assertExomuxSessionName(value);
  } catch {
    throw new TypeError(
      `Exomux option ${flag} needs a session name made of letters, digits, dots, dashes, or underscores.`,
    );
  }
}

/** Runs either the persistent local host or its detachable terminal workbench client. */
export async function runExomuxShowcase(options: ExomuxShowcaseLaunchOptions): Promise<void> {
  if (options.showHelp) {
    console.log(EXOMUX_HELP_TEXT);
    return;
  }
  const configDirectory = options.configDirectory ?? defaultExomuxConfigDirectory();
  const configPath = exomuxConfigFilePath(configDirectory);
  if (options.resetConfig) {
    await resetExomuxConfig(configPath);
    console.log(`Reset Exomux settings to defaults at ${configPath}`);
    return;
  }
  if (options.daemon) {
    await runExomuxDaemon(options);
    return;
  }
  await runExomuxClient(options, configDirectory, configPath);
}

/** The session and bootstrap mode one client invocation resolved to. */
interface ExomuxLaunchTarget extends ExomuxSessionPaths {
  readonly mode: ExomuxConnectMode;
}

/**
 * Chooses the tmux-like target: `-a` attaches and never launches, `-n`
 * creates and never reuses, and a bare launch attaches to the single live
 * session, creates the default session when none exists, or — when the choice
 * is ambiguous — lists the candidates and returns undefined.
 */
async function resolveExomuxLaunchTarget(
  options: ExomuxShowcaseLaunchOptions,
  stateRoot: string,
): Promise<ExomuxLaunchTarget | undefined> {
  if (options.attachSession) {
    return { ...resolveExomuxSessionPaths(stateRoot, options.attachSession), mode: "attach-only" };
  }
  if (options.newSession) {
    const existing = await probeExomuxSessions({ stateRoot });
    const name = options.newSessionName ?? generateExomuxSessionName(existing.map((probe) => probe.name));
    if (existing.some((probe) => probe.name === name && probe.state === "attachable")) {
      throw new ExomuxClientError(
        "session-exists",
        `Exomux session "${name}" is already running; attach to it with: -a ${name}`,
      );
    }
    return { ...(await ensureExomuxSessionDirectories(stateRoot, name)), mode: "launch-only" };
  }
  const probes = await probeExomuxSessions({ stateRoot });
  const live = probes.filter((probe) => probe.state === "attachable");
  if (live.length > 1) {
    console.log(formatExomuxSessionList(probes));
    console.log('\nSeveral sessions are live; attach with "-a <name>" or create another with "-n".');
    return undefined;
  }
  const name = live[0]?.name ?? EXOMUX_DEFAULT_SESSION_NAME;
  return { ...(await ensureExomuxSessionDirectories(stateRoot, name)), mode: "attach-or-launch" };
}

/** Starts the UI client; destroying it never shuts down the detached host. */
export async function runExomuxClient(
  options: ExomuxShowcaseLaunchOptions,
  configDirectory: string = options.configDirectory ?? defaultExomuxConfigDirectory(),
  configPath: string = exomuxConfigFilePath(configDirectory),
): Promise<void> {
  // The sessions panel can switch this client between exomux sessions
  // (UX-006): each pass runs one attachment; a requested switch tears the
  // desktop down cleanly and re-runs against the chosen session.
  let attachOverride: string | undefined;
  for (;;) {
    const next = await runExomuxClientSession(
      attachOverride ? { ...options, attachSession: attachOverride, newSession: false } : options,
      configDirectory,
      configPath,
    );
    if (!next) return;
    attachOverride = next;
  }
}

/** One client attachment; resolves with a switch target or undefined to exit. */
async function runExomuxClientSession(
  options: ExomuxShowcaseLaunchOptions,
  configDirectory: string,
  configPath: string,
): Promise<string | undefined> {
  const stateRoot = options.stateDirectory ?? defaultExomuxStateDirectory();
  if (options.listSessions) {
    console.log(formatExomuxSessionList(await probeExomuxSessions({ stateRoot })));
    return;
  }
  // An explicit descriptor pins one host file and bypasses session discovery.
  const target: ExomuxLaunchTarget | undefined = options.descriptorPath
    ? {
      name: EXOMUX_DEFAULT_SESSION_NAME,
      mode: "attach-or-launch",
      stateDirectory: stateRoot,
      descriptorPath: options.descriptorPath,
      layoutPath: joinPath(stateRoot, "layout.json"),
    }
    : await resolveExomuxLaunchTarget(options, stateRoot);
  if (!target) return;
  const diagnostics = new DiagnosticsCollector();
  let connection;
  try {
    connection = await connectOrLaunchExomuxLocalHost({
      stateDirectory: target.stateDirectory,
      descriptorPath: target.descriptorPath,
      mode: target.mode,
    });
  } catch (error) {
    if (target.mode === "attach-only" && error instanceof ExomuxClientError) {
      console.log(formatExomuxSessionList(await probeExomuxSessions({ stateRoot })));
      console.error(`\nCannot attach to session "${target.name}": ${error.message}`);
      Deno.exitCode = 1;
      return;
    }
    throw error;
  }
  const layoutPath = options.persistLayout ? options.layoutPath ?? target.layoutPath : undefined;
  const storage = await createShowcaseTerminalStore({
    enabled: options.persistLayout,
    path: layoutPath,
    diagnostics,
  });
  // A retargetable proxy lets a live rename re-point layout persistence at the
  // renamed session's directory without rebuilding the controller.
  const retargetableStore = new ExomuxRetargetableStore(storage.store);
  const config = await loadExomuxConfig(configPath);
  const configWriter = createExomuxConfigWriter(configDirectory, configPath, config);
  // Offer (and drive) the interface shaders whenever Ghostty is available —
  // running inside it, or just installed — so the settings manage the same
  // Ghostty shader config the installer sets up, even from another terminal.
  //
  // Only ever touch the user's *global* Ghostty config when running against
  // their real config directory. A run with an explicit `--config-dir` (the
  // launch-lifecycle tests do this) is sandboxed: it must not write includes
  // into ~/.config/ghostty/config, or leftover temp paths break Ghostty on
  // its next launch with `error opening config-file …: FileNotFound`.
  const ghostty = isGhosttyAvailable() && configDirectory === defaultExomuxConfigDirectory();
  // Applying shaders writes the GLSL and a managed Ghostty config; Ghostty
  // picks it up on its next config reload, which cannot be forced from here.
  const applyShaders = ghostty
    ? (shaders: ExomuxShaderConfig) => {
      configWriter.writeShaders(shaders);
      void applyExomuxShaders(configDirectory, shaders)
        // Make enabling a shader take effect without a manual edit: add the
        // managed include to the user's Ghostty config (idempotent, best-effort).
        .then((result) => ensureExomuxGhosttyInclude(result.configPath))
        // Then ask the hosting Ghostty to reload (SIGUSR2, the reload_config
        // equivalent) so shader changes take effect immediately.
        .then(() => reloadExomuxGhosttyConfig())
        .catch(() => undefined);
    }
    : undefined;
  // Only a session discovered through the state root (not an explicit
  // --descriptor) can be renamed, since rename moves its directory.
  const renameSession = options.descriptorPath ? undefined : createExomuxSessionRenamer({
    stateRoot,
    current: target,
    client: connection.client,
    store: retargetableStore,
    persistLayout: options.persistLayout,
    diagnostics,
  });
  let requestedSwitch: string | undefined;
  let liveRuntime: ExomuxTerminalAppRuntime | undefined;
  const controller = await createExomuxController({
    client: connection.client,
    store: retargetableStore,
    hostSessionsSource: {
      probe: async () =>
        (await probeExomuxSessions({ stateRoot })).map((probe) => ({
          name: probe.name,
          state: probe.state,
          ...(probe.upMs !== undefined ? { upMs: probe.upMs } : {}),
          terminals: probe.terminals.map((terminal) => ({ title: terminal.title, running: terminal.running })),
        })),
    },
    onSwitchSession: (name) => {
      requestedSwitch = name;
      // Destroying the runtime detaches the client; the host and its PTYs
      // live on, and the loop above reattaches to the chosen session.
      void liveRuntime?.destroy().catch(() => undefined);
    },
    diagnostics,
    persistenceDebounceMs: storage.inspect().durable ? 120 : 0,
    initialPreferences: exomuxConfigToPreferences(config),
    onPreferencesChanged: (preferences) => configWriter.writePreferences(preferences),
    initialSessionName: target.name,
    ghosttyDetected: ghostty,
    initialShaders: config.shaders,
    ...(applyShaders ? { onShadersChanged: applyShaders } : {}),
    ...(renameSession ? { onRenameSession: renameSession } : {}),
  });
  // When the block cursor is enabled under Ghostty, hide Ghostty's own pointer
  // while typing to cut the double-cursor — a managed config with its include.
  if (ghostty) {
    let lastBlockCursor: boolean | undefined;
    const applyCursorConfig = (hideWhileTyping: boolean): void => {
      if (hideWhileTyping === lastBlockCursor) return;
      lastBlockCursor = hideWhileTyping;
      void applyExomuxCursorConfig(configDirectory, hideWhileTyping)
        .then((path) => ensureExomuxGhosttyInclude(path))
        .catch(() => undefined);
    };
    applyCursorConfig(controller.globalSettings.peek().blockCursor);
    controller.globalSettings.subscribe(() => applyCursorConfig(controller.globalSettings.peek().blockCursor));
  }
  let connectionStatus = connection.launched
    ? `Started session "${target.name}" · terminals survive UI exit · Ctrl-N ? commands`
    : `Attached to session "${target.name}" · Ctrl-N ? commands`;
  if (connection.recovery) {
    connectionStatus += connection.recovery.reason === "unresponsive-host"
      ? ` · replaced unresponsive host pid ${connection.recovery.pid}`
      : " · cleared crashed host state";
  }
  await launchInitialExomuxTerminalIfEmpty(controller, connectionStatus);
  const runtime = await createExomuxTerminalApp({ controller });
  liveRuntime = runtime;
  bindAwaitedExomuxClientShutdown(runtime, () => requestedSwitch !== undefined);
  runtime.start();
  if (!bindingsAreLoopAware()) return undefined;
  // Wait out this attachment: the tui's destroy fires on quit and on switch.
  await new Promise<void>((resolve) => {
    runtime.app.tui.on("destroy", () => resolve());
  });
  if (!requestedSwitch) return undefined;
  await runtime.destroy().catch(() => undefined);
  return requestedSwitch;
}

/** The client loop needs the destroy event; always true today, seam for tests. */
function bindingsAreLoopAware(): boolean {
  return true;
}

/** An AsyncStore proxy whose backing store can be swapped on a live rename. */
export class ExomuxRetargetableStore implements AsyncStore<unknown> {
  #inner: AsyncStore<unknown>;
  constructor(inner: AsyncStore<unknown>) {
    this.#inner = inner;
  }
  get(key: string): Promise<unknown> {
    return this.#inner.get(key);
  }
  set(key: string, value: unknown): Promise<void> {
    return this.#inner.set(key, value);
  }
  delete(key: string): Promise<void> {
    return this.#inner.delete(key);
  }
  retarget(inner: AsyncStore<unknown>): void {
    this.#inner = inner;
  }
}

interface ExomuxSessionRenamerOptions {
  readonly stateRoot: string;
  readonly current: ExomuxSessionPaths;
  readonly client: { renameDescriptor(descriptorPath: string): Promise<boolean> };
  readonly store: ExomuxRetargetableStore;
  readonly persistLayout: boolean;
  readonly diagnostics?: DiagnosticsCollector;
}

/**
 * Builds the live-rename hook for one session. It validates the new name, asks
 * the daemon to relocate its descriptor, moves the layout state, re-points the
 * layout store, and reports the new attach key. Ordering matters: the store is
 * re-pointed before the old files are removed so no late write recreates the
 * old session directory.
 */
export function createExomuxSessionRenamer(
  options: ExomuxSessionRenamerOptions,
): (newName: string) => Promise<ExomuxRenameResult> {
  let current = options.current;
  return async (newName: string): Promise<ExomuxRenameResult> => {
    if (!isExomuxSessionName(newName)) {
      return { ok: false, error: "Names use letters, digits, dots, dashes, or underscores (64 max)." };
    }
    if (newName === current.name) return { ok: true, name: newName };
    const next = resolveExomuxSessionPaths(options.stateRoot, newName);
    // Refuse to clobber an existing session's state.
    if (await exomuxPathExists(next.descriptorPath) || await exomuxPathExists(next.layoutPath)) {
      return { ok: false, error: `A session named "${newName}" already exists.` };
    }
    try {
      await ensureExomuxSessionDirectories(options.stateRoot, newName);
      const relocated = await options.client.renameDescriptor(next.descriptorPath);
      if (!relocated) return { ok: false, error: "The host refused to relocate its descriptor." };
      if (options.persistLayout) {
        await exomuxMoveFileIfPresent(current.layoutPath, next.layoutPath);
        options.store.retarget(
          (await createShowcaseTerminalStore({
            enabled: true,
            path: next.layoutPath,
            diagnostics: options.diagnostics,
          }))
            .store,
        );
        await exomuxMoveFileIfPresent(`${current.layoutPath}.bak`, `${next.layoutPath}.bak`);
      }
      await exomuxRemoveIfPresent(`${current.descriptorPath}.unresponsive`);
      // The default session leaves its now-empty root files behind; a named
      // session's old directory can be removed once emptied.
      await exomuxRemoveEmptyNamedSessionDir(options.stateRoot, current.name);
      current = next;
      return { ok: true, name: newName };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
}

async function exomuxPathExists(path: string): Promise<boolean> {
  try {
    await Deno.lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function exomuxMoveFileIfPresent(from: string, to: string): Promise<void> {
  if (!(await exomuxPathExists(from))) return;
  await Deno.rename(from, to).catch(async () => {
    // Cross-device or racing rename: fall back to copy + remove.
    await Deno.copyFile(from, to);
    await Deno.remove(from).catch(() => undefined);
  });
}

async function exomuxRemoveIfPresent(path: string): Promise<void> {
  await Deno.remove(path).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
}

async function exomuxRemoveEmptyNamedSessionDir(stateRoot: string, name: string): Promise<void> {
  if (name === EXOMUX_DEFAULT_SESSION_NAME) return;
  const dir = resolveExomuxSessionPaths(stateRoot, name).stateDirectory;
  try {
    for await (const _entry of Deno.readDir(dir)) return; // not empty
    await Deno.remove(dir);
  } catch {
    // The directory is gone or unreadable; nothing to clean.
  }
}

/** The preference subset the config file carries, drawn from a loaded config. */
export function exomuxConfigToPreferences(config: ExomuxConfig): ExomuxPreferences {
  return {
    themeId: config.themeId,
    backgroundId: config.backgroundId,
    globalSettings: config.globalSettings,
    backgroundSettings: config.backgroundSettings,
    butterchurnFavorites: config.butterchurnFavorites,
  };
}

/**
 * Builds the debounced preference sink handed to the controller. It copies a
 * freshly chosen background image into the config directory (so the wallpaper
 * survives the original moving) and writes the config file. Writes are
 * coalesced and best-effort: a failed persist must never disturb the session.
 */
/** Persists config changes: preferences (theme/bg/settings) and shaders alike. */
export interface ExomuxConfigWriter {
  writePreferences(preferences: ExomuxPreferences): void;
  writeShaders(shaders: ExomuxShaderConfig): void;
}

/**
 * A single debounced, serialized writer over the whole config file. Preference
 * and shader updates each merge into one retained config so neither wipes the
 * other, and a chosen wallpaper is copied into the config directory before it
 * is recorded.
 */
export function createExomuxConfigWriter(
  configDirectory: string,
  configPath: string,
  initial: ExomuxConfig,
): ExomuxConfigWriter {
  let current: ExomuxConfig = initial;
  let last = JSON.stringify(initial);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> = Promise.resolve();
  const schedule = () => {
    const signature = JSON.stringify(current);
    if (signature === last) return;
    last = signature;
    const snapshot = current;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      writing = writing.then(() => writeExomuxConfig(configPath, snapshot)).catch(() => undefined);
    }, 150);
    Deno.unrefTimer?.(timer);
  };
  return {
    writePreferences(preferences: ExomuxPreferences): void {
      let backgroundSettings = preferences.backgroundSettings;
      // Copy a freshly chosen wallpaper synchronously enough that the recorded
      // path points at the durable copy on the next write.
      const imagePath = exomuxBackgroundSettingsFor(backgroundSettings, "image").path;
      if (typeof imagePath === "string" && imagePath.length > 0) {
        writing = writing.then(async () => {
          const stored = await persistExomuxBackgroundImage(configDirectory, imagePath);
          if (stored !== imagePath) {
            current = {
              ...current,
              backgroundSettings: withExomuxBackgroundString(current.backgroundSettings, "image", "path", stored),
            };
            await writeExomuxConfig(configPath, current);
          }
        }).catch(() => undefined);
      }
      current = {
        ...current,
        themeId: preferences.themeId,
        backgroundId: preferences.backgroundId,
        globalSettings: preferences.globalSettings,
        backgroundSettings,
        butterchurnFavorites: preferences.butterchurnFavorites,
      };
      schedule();
    },
    writeShaders(shaders: ExomuxShaderConfig): void {
      current = { ...current, shaders };
      schedule();
    },
  };
}

/** Launches the default floating shell only when the persistent host is empty. */
export async function launchInitialExomuxTerminalIfEmpty(
  controller: ExomuxController,
  connectionStatus: string,
): Promise<boolean> {
  if (controller.sessions.peek().length > 0) {
    controller.status.value = connectionStatus;
    return false;
  }
  const firstTerminal = await controller.spawn();
  controller.status.value = firstTerminal
    ? `${connectionStatus} · floating terminal ready`
    : `${connectionStatus} · ${controller.status.peek()}`;
  return firstTerminal !== undefined;
}

/** Runs the retaining host until an authenticated shutdown or process signal. */
export async function runExomuxDaemon(options: ExomuxShowcaseLaunchOptions): Promise<void> {
  const stateDirectory = options.stateDirectory ?? defaultExomuxStateDirectory();
  let descriptorPath = options.descriptorPath ?? joinPath(stateDirectory, "host.json");
  let authToken: string | undefined;
  try {
    authToken = Deno.env.get("EXOMUX_TOKEN");
    Deno.env.delete("EXOMUX_TOKEN");
  } catch {
    authToken = undefined;
  }
  if (!isExomuxAuthToken(authToken)) throw new TypeError("Exomux daemon requires a valid private startup token.");

  // Rewrites the descriptor at a new path on rename: only within the same state
  // root, and the daemon then cleans up the new path — not the old — at exit.
  let descriptor: ExomuxLocalHostDescriptor | undefined;
  const relocateDescriptor = async (newDescriptorPath: string): Promise<boolean> => {
    if (!descriptor || !isExomuxDescriptorRelocation(descriptorPath, newDescriptorPath)) return false;
    try {
      await writeExomuxHostDescriptor(newDescriptorPath, descriptor);
      if (newDescriptorPath !== descriptorPath) {
        await removeExomuxHostDescriptor(descriptorPath, descriptor.hostId);
      }
      descriptorPath = newDescriptorPath;
      return true;
    } catch {
      return false;
    }
  };

  const server = serveExomuxHost({ authToken, relocateDescriptor });
  const address = await server.address;
  descriptor = {
    schemaVersion: 1,
    flowControlledReplay: true,
    hostId: server.controller.id,
    url: address.url,
    token: authToken,
    pid: Deno.pid,
    startedAt: Date.now(),
  };
  await writeExomuxHostDescriptor(descriptorPath, descriptor);
  const fatalHandler = createExomuxDaemonFatalHandler(
    server,
    () => removeExomuxHostDescriptor(descriptorPath, server.controller.id),
  );
  globalThis.addEventListener("unhandledrejection", fatalHandler);
  globalThis.addEventListener("error", fatalHandler);
  const unbind = bindExomuxDaemonSignals(server);
  try {
    await server.finished;
  } finally {
    globalThis.removeEventListener("unhandledrejection", fatalHandler);
    globalThis.removeEventListener("error", fatalHandler);
    unbind();
    await removeExomuxHostDescriptor(descriptorPath, server.controller.id);
  }
}

/**
 * A daemon that faults must exit and clear its descriptor rather than linger:
 * a half-alive host answers `/proc` liveness checks while refusing every
 * connection, which is exactly the state that used to block relaunching after
 * a crash. Shutdown is bounded — if it wedges too, the descriptor is removed
 * and the process force-exits so the next launch starts clean.
 */
export function createExomuxDaemonFatalHandler(
  server: { shutdown(): Promise<void> },
  removeDescriptor: () => Promise<void>,
  exit: (code: number) => void = Deno.exit,
  shutdownTimeoutMs = 3_000,
): (event: { preventDefault(): void }) => void {
  let faulted = false;
  const abandon = async () => {
    try {
      await removeDescriptor();
    } finally {
      exit(1);
    }
  };
  return (event) => {
    event.preventDefault();
    if (faulted) return;
    faulted = true;
    const deadline = setTimeout(() => void abandon(), shutdownTimeoutMs);
    // The timer must never keep an otherwise-exiting daemon alive.
    Deno.unrefTimer(deadline);
    server.shutdown().then(
      () => clearTimeout(deadline),
      () => {
        clearTimeout(deadline);
        void abandon();
      },
    );
  };
}

function bindAwaitedExomuxClientShutdown(
  runtime: ExomuxTerminalAppRuntime,
  switching: () => boolean = () => false,
): void {
  const signals: Deno.Signal[] = Deno.build.os === "windows" ? ["SIGINT", "SIGBREAK"] : ["SIGINT", "SIGTERM"];
  let shutdown: Promise<void> | undefined;
  const removeSignals = () => {
    for (const signal of signals) {
      try {
        Deno.removeSignalListener(signal, requestShutdown);
      } catch {
        // Listener was unavailable or already removed.
      }
    }
  };
  const requestShutdown = () => {
    // A session switch tears the desktop down without ending the process; the
    // client loop reattaches to the chosen session instead of exiting.
    if (switching()) {
      removeSignals();
      return;
    }
    shutdown ??= (async () => {
      removeSignals();
      // Bounded: teardown that hangs — a host handshake, a wedged PTY — must
      // not leave the client alive and animating. Whatever happens, quit quits.
      const deadline = new Promise<void>((resolve) => setTimeout(resolve, 3000));
      await Promise.race([runtime.destroy(), deadline]);
      Deno.exit(0);
    })();
    void shutdown;
  };
  for (const signal of signals) Deno.addSignalListener(signal, requestShutdown);
  runtime.app.tui.on("destroy", requestShutdown);
}

function bindExomuxDaemonSignals(server: ExomuxHostServer): () => void {
  const signals: Deno.Signal[] = Deno.build.os === "windows" ? ["SIGINT", "SIGBREAK"] : ["SIGINT", "SIGTERM"];
  const shutdown = () => void server.shutdown();
  for (const signal of signals) Deno.addSignalListener(signal, shutdown);
  return () => {
    for (const signal of signals) {
      try {
        Deno.removeSignalListener(signal, shutdown);
      } catch {
        // Listener was unavailable or already removed.
      }
    }
  };
}

function requiredOption(argument: string, prefix: string): string {
  const value = argument.slice(prefix.length);
  if (!value || value.includes("\0")) throw new TypeError(`Exomux option ${prefix.slice(0, -1)} needs a path.`);
  return value;
}

function joinPath(parent: string, child: string): string {
  const separator = Deno.build.os === "windows" ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/g, "")}${separator}${child}`;
}

/** Parses argv and runs Exomux, turning a launch failure into actionable help. */
export async function runExomuxCli(argv: readonly string[]): Promise<number> {
  let options: ExomuxShowcaseLaunchOptions;
  try {
    options = parseExomuxShowcaseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${EXOMUX_HELP_TEXT}`);
    return 2;
  }
  try {
    await runExomuxShowcase(options);
    return Deno.exitCode ?? 0;
  } catch (error) {
    // A launch that fell over is most often a wedged host or a bad config;
    // show what the flags are and point at the reset that fixes the latter.
    console.error(`Exomux failed to launch: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`\n${EXOMUX_HELP_TEXT}`);
    console.error("\nIf this keeps happening, reset saved settings with: exomux --reset-config");
    return 1;
  }
}

if (import.meta.main) {
  const code = await runExomuxCli(Deno.args);
  // Never force-exit on success: the interactive client returns as soon as its
  // render loop is started and stays alive through its own event listeners, so
  // a `Deno.exit(0)` here would kill the workbench the instant it attached.
  // Terminating commands (help, reset, list) leave no pending work and exit on
  // their own. Only a nonzero code needs an explicit exit.
  if (code !== 0) Deno.exit(code);
}
