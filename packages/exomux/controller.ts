// Copyright 2023 Im-Beast. MIT license.

import {
  type AsyncStore,
  Computed,
  type DiagnosticsCollector,
  type Rectangle,
  Signal,
  TerminalScreenController,
  TerminalScrollbackController,
  TreeController,
  type TreeNode,
  type WorkbenchWindowHostDescriptor,
  type WorkbenchWindowHostProjection,
  type WorkbenchWindowHostResult,
} from "@ubernaut/deno-tui";
import {
  ShowcaseKernel,
  type ShowcaseProvider,
  type ShowcaseProviderActivationContext,
  type ShowcaseProviderActivationResult,
} from "@showcase/kit";
import {
  createTailscaleStatusSource,
  type TailnetDevice,
  TailnetPoller,
  type TailnetStatusResult,
  type TailnetStatusSource,
} from "./tailnet.ts";
import {
  clampExomuxShaderParam,
  defaultExomuxShaderConfig,
  EXOMUX_SHADER_EFFECTS,
  EXOMUX_SHADER_PARAMS,
  exomuxEnabledShaderEffects,
  exomuxFormatShaderValue,
  type ExomuxShaderConfig,
  type ExomuxShaderEffect,
  type ExomuxShaderEffectConfig,
  exomuxShaderParamValue,
} from "./ghostty.ts";
import {
  cycleExomuxBackgroundSetting,
  cycleExomuxGlobalSetting,
  cycleExomuxWindowSetting,
  defaultExomuxGlobalSettings,
  defaultExomuxWindowSettings,
  EXOMUX_BACKGROUND_IDS,
  EXOMUX_BACKGROUND_SETTING_SPECS,
  EXOMUX_GLOBAL_SETTING_SPECS,
  EXOMUX_MANIFEST,
  EXOMUX_MAX_COLUMNS,
  EXOMUX_MAX_ROWS,
  EXOMUX_MAX_SESSIONS,
  EXOMUX_THEMES,
  EXOMUX_WINDOW_SETTING_SPECS,
  type ExomuxBackgroundId,
  exomuxBackgroundId,
  exomuxBackgroundSettingsFor,
  type ExomuxBackgroundSettingsMap,
  type ExomuxClientPort,
  type ExomuxControllerInspection,
  type ExomuxGlobalSettingId,
  type ExomuxGlobalSettings,
  type ExomuxOutputFrame,
  exomuxSessionIdFromWindow,
  type ExomuxSessionSummary,
  type ExomuxSpawnOptions,
  exomuxTheme,
  type ExomuxThemeId,
  type ExomuxThemeSpec,
  exomuxWindowId,
  type ExomuxWindowSettingId,
  type ExomuxWindowSettings,
  type ExomuxWorkspaceState,
  initialExomuxWorkspaceState,
  isExomuxSessionId,
  isExomuxSshTarget,
  normalizeExomuxWorkspaceState,
  withExomuxBackgroundString,
} from "./model.ts";

/** Stable host-manager window shown alongside terminal windows. */
export const EXOMUX_SESSIONS_WINDOW_ID = "sessions" as const;

/**
 * How long a transient per-terminal warning stays on screen. The notice is
 * painted over the bottom row of the window's content, so it has to retire on
 * its own rather than blocking that row for the life of the session.
 */
export const EXOMUX_WARNING_TTL_MS = 6_000;

/** Focusable panes inside the global config modal, in Tab order. */
export const EXOMUX_GLOBAL_CONFIG_PANES = Object.freeze(["theme", "background", "options"] as const);

/** The user's home directory, or the filesystem root when it is unreadable. */
function homeDirectory(): string {
  try {
    return Deno.env.get("HOME") || "/";
  } catch {
    return "/";
  }
}

/** One focusable pane inside the global config modal. */
export type ExomuxGlobalConfigPane = (typeof EXOMUX_GLOBAL_CONFIG_PANES)[number];

/** Network tree node id for one saved SSH host entry. */
export function exomuxNetworkHostNodeId(target: string): string {
  return `host:${target}`;
}

/** Extracts the saved SSH target from a `host:` parent node id. */
export function exomuxNetworkNodeHostTarget(nodeId: string): string | undefined {
  return nodeId.startsWith("host:") ? nodeId.slice(5) : undefined;
}

/** Extracts the SSH target from an `act:host-shell:` action leaf id. */
export function exomuxNetworkNodeHostShellTarget(nodeId: string): string | undefined {
  return nodeId.startsWith("act:host-shell:") ? nodeId.slice(15) : undefined;
}

/** Extracts the daemon session id from a `ses:` open-shell leaf id. */
export function exomuxNetworkNodeSessionId(nodeId: string): string | undefined {
  return nodeId.startsWith("ses:") ? nodeId.slice(4) : undefined;
}

/** Extracts the tailnet device id from a `dev:` machine or `act:shell:` action node id. */
export function exomuxNetworkNodeDeviceId(nodeId: string): string | undefined {
  if (nodeId.startsWith("dev:")) return nodeId.slice(4);
  if (nodeId.startsWith("act:shell:")) return nodeId.slice(10);
  return undefined;
}

/** Compact single-line label for one tailnet device row. */
export function exomuxNetworkDeviceLabel(device: TailnetDevice): string {
  const glyph = device.online ? "●" : "○";
  const relay = device.relayed && device.online ? " · relay" : "";
  const suffix = device.self ? " · this device" : device.online ? "" : " · offline";
  return `${glyph} ${device.shortName} · ${device.os}${relay}${suffix}`;
}

/**
 * Extracts one plausible local file path from pasted text: single line, an
 * absolute or `~/` path, optionally quoted or a `file://` URI. Anything else —
 * including multi-line pastes and control characters — is left untouched.
 */
export function exomuxScpCandidatePath(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 1024) return undefined;
  // deno-lint-ignore no-control-regex
  if (/[\r\n\x00-\x1f]/.test(trimmed)) return undefined;
  let path = trimmed;
  if (path.startsWith("file://")) {
    try {
      path = decodeURIComponent(new URL(path).pathname);
    } catch {
      return undefined;
    }
  }
  if ((path.startsWith("'") && path.endsWith("'")) || (path.startsWith('"') && path.endsWith('"'))) {
    path = path.slice(1, -1);
  }
  path = path.replace(/\\ /g, " ");
  if (path.startsWith("~/")) {
    try {
      const home = Deno.env.get("HOME");
      if (!home) return undefined;
      path = `${home}${path.slice(1)}`;
    } catch {
      return undefined;
    }
  }
  return path.startsWith("/") ? path : undefined;
}

async function defaultExomuxStatFile(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isFile;
  } catch {
    return false;
  }
}

/**
 * Finds the path printed by a `pwd` probe in raw shell output: a line that is
 * exactly one conservatively-charactered absolute path, ANSI sequences
 * stripped, ignoring the probe's own echo and prompt lines.
 */
export function exomuxCapturedPwdPath(output: string): string | undefined {
  // deno-lint-ignore no-control-regex
  const plain = output.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  for (const rawLine of plain.split(/[\r\n]+/)) {
    const line = rawLine.trim();
    if (!line.startsWith("/") || line.length > 510) continue;
    if (!/^\/[A-Za-z0-9._/@+-]*$/.test(line)) continue;
    return line;
  }
  return undefined;
}

/** Builds the Hosts/Tailscale hierarchy consumed by the shared workbench tree widget. */
export function buildExomuxNetworkNodes(
  savedHosts: readonly string[],
  status: TailnetStatusResult | undefined,
  expansion: ReadonlySet<string>,
  sessions: readonly ExomuxSessionSummary[] = [],
  sessionHosts: Readonly<Record<string, string>> = {},
): TreeNode[] {
  const shellsForTargets = (targets: readonly (string | undefined)[]): TreeNode[] => {
    const nodes: TreeNode[] = [];
    for (const session of sessions) {
      const target = sessionHosts[session.id];
      if (!target || !targets.includes(target)) continue;
      nodes.push({
        id: `ses:${session.id}`,
        label: `⌨ ${session.title}${session.running ? "" : " · exited"}`,
      });
    }
    return nodes;
  };
  const hostChildren: TreeNode[] = savedHosts.length > 0
    ? savedHosts.map((target) => {
      const id = exomuxNetworkHostNodeId(target);
      return {
        id,
        label: `@ ${target}`,
        children: [
          { id: `act:host-shell:${target}`, label: "Open shell" },
          ...shellsForTargets([target]),
        ],
        expanded: expansion.has(id),
      };
    })
    : [{ id: "note:hosts-empty", label: "No saved hosts · SSH once to remember", note: true }];
  const tailscaleChildren: TreeNode[] = [];
  if (!status) {
    tailscaleChildren.push({ id: "note:ts-loading", label: "Checking tailscaled…", note: true });
  } else if (!status.snapshot || status.availability === "unavailable") {
    tailscaleChildren.push({ id: "note:ts-detail", label: status.detail, note: true });
  } else {
    if (status.availability === "degraded") {
      tailscaleChildren.push({ id: "note:ts-detail", label: status.detail, note: true });
    }
    if (status.snapshot.devices.length === 0) {
      tailscaleChildren.push({ id: "note:ts-empty", label: "No devices in this tailnet.", note: true });
    }
    for (const device of status.snapshot.devices) {
      const id = `dev:${device.id}`;
      tailscaleChildren.push({
        id,
        label: exomuxNetworkDeviceLabel(device),
        status: device.online ? "online" : "offline",
        children: [
          { id: `act:shell:${device.id}`, label: "Open shell" },
          ...shellsForTargets([device.dnsName || undefined, device.ipv4]),
        ],
        expanded: expansion.has(id),
      });
    }
  }
  return [
    { id: "hosts", label: "HOSTS", children: hostChildren, expanded: expansion.has("hosts") },
    { id: "tailscale", label: "TAILSCALE", children: tailscaleChildren, expanded: expansion.has("tailscale") },
  ];
}
/** Stable left-docked network panel window listing saved hosts and tailnet devices. */
export const EXOMUX_NETWORK_WINDOW_ID = "network" as const;
/** Stable floating window carrying the desktop-wide settings. */
export const EXOMUX_SETTINGS_WINDOW_ID = "settings" as const;
/** Bounds used for settings-window commands when the caller has no live desktop rect. */
const SETTINGS_FALLBACK_BOUNDS: Rectangle = Object.freeze({ column: 0, row: 0, width: 120, height: 36 });
const WINDOW_RECONCILE_ATTEMPTS = 8;

/** Live client-side projection of one daemon-owned terminal. */
export interface ExomuxTerminalRuntime {
  readonly sessionId: string;
  readonly screen: TerminalScreenController;
  readonly scrollback: TerminalScrollbackController;
  readonly summary: Signal<ExomuxSessionSummary>;
  readonly attached: Signal<boolean>;
  readonly renderRevision: Signal<number>;
  readonly warning: Signal<string | undefined>;
  /** Transient observers of decoded output text (e.g. remote cwd capture). */
  readonly outputTaps: Set<(chunk: string) => void>;
  hostTitle: string;
  screenTitle?: string;
  lastSequence: number;
  attachGeneration: number;
  requestedColumns: number;
  requestedRows: number;
}

/** Outcome of a session rename attempt. */
export interface ExomuxRenameResult {
  readonly ok: boolean;
  /** The accepted session name on success. */
  readonly name?: string;
  /** A human-readable reason on failure. */
  readonly error?: string;
}

/** How one shader settings row renders as a real exotui control. */
export type ExomuxShaderRowControl =
  | { readonly kind: "checkbox"; readonly checked: boolean }
  | { readonly kind: "cycler"; readonly options: readonly string[]; readonly activeIndex: number };

/** One shader settings row: its id, label, formatted value, and its control. */
export interface ExomuxShaderOptionRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly control: ExomuxShaderRowControl;
}

/** The durable preference subset shared across sessions via the config file. */
export interface ExomuxPreferences {
  readonly themeId: ExomuxThemeId;
  readonly backgroundId: ExomuxBackgroundId;
  readonly globalSettings: ExomuxGlobalSettings;
  readonly backgroundSettings: ExomuxBackgroundSettingsMap;
  /** Preset names favorited for the butterchurn "Favorites only" cycle. */
  readonly butterchurnFavorites: readonly string[];
}

/** Construction options after the detached client has connected. */
export interface ExomuxControllerOptions {
  readonly client: ExomuxClientPort;
  readonly initialSessions?: readonly ExomuxSessionSummary[];
  readonly store?: AsyncStore<unknown>;
  readonly storageKey?: string;
  readonly diagnostics?: DiagnosticsCollector;
  readonly defaultCommand?: string;
  readonly defaultArgs?: readonly string[];
  readonly defaultCwd?: string;
  readonly now?: () => number;
  readonly persistenceDebounceMs?: number;
  /** Durable preferences to seed theme, background, and settings from the config file. */
  readonly initialPreferences?: ExomuxPreferences;
  /** Called whenever a durable preference changes, for config-file persistence. */
  readonly onPreferencesChanged?: (preferences: ExomuxPreferences) => void;
  /** The tmux-style name of the session this client attached to. */
  readonly initialSessionName?: string;
  /** True when running inside Ghostty; unlocks the GLSL shader settings. */
  readonly ghosttyDetected?: boolean;
  /** Initial shader configuration from the config file. */
  readonly initialShaders?: ExomuxShaderConfig;
  /** Called when the shader configuration changes, to apply it to disk. */
  readonly onShadersChanged?: (config: ExomuxShaderConfig) => void;
  /** Performs a live session rename; returns the accepted name or an error. */
  readonly onRenameSession?: (newName: string) => Promise<ExomuxRenameResult>;
  readonly tailnetSource?: Pick<TailnetStatusSource, "fetchStatus">;
  readonly tailnetPollIntervalMs?: number;
  /** Injectable local-file existence probe for paste-to-scp interception. */
  readonly statFile?: (path: string) => Promise<boolean>;
  /** How long the remote `pwd` capture may wait before falling back to the remote home. */
  readonly scpCwdTimeoutMs?: number;
}

/** One intercepted paste awaiting a Send / Paste path / Cancel decision. */
export interface ExomuxScpRequest {
  readonly sessionId: string;
  readonly target: string;
  readonly localPath: string;
  /** Remote directory captured from the shell, or undefined for the remote home. */
  readonly remoteDir?: string;
  /** Original pasted text, forwarded verbatim when the user picks "Paste path". */
  readonly pasteText: string;
  /** Optional password typed into the modal; empty means key/agent auth. */
  readonly password: string;
}

/** Human-readable destination for one pending transfer. */
export function exomuxScpDestinationLabel(request: Pick<ExomuxScpRequest, "target" | "remoteDir">): string {
  return `${request.target}:${request.remoteDir ?? "~"}`;
}

/** Options for launching and positioning one terminal window. */
export interface ExomuxControllerSpawnOptions {
  readonly command?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly title?: string;
  readonly columns?: number;
  readonly rows?: number;
  readonly dock?: "right" | "bottom";
  readonly bounds?: Rectangle;
}

/** Creates, restores, and attaches a complete renderer-neutral multiplexer controller. */
export async function createExomuxController(options: ExomuxControllerOptions): Promise<ExomuxController> {
  const initialSessions = options.initialSessions ?? await options.client.list();
  const controller = new ExomuxController({ ...options, initialSessions });
  await controller.ready;
  return controller;
}

/** Renderer-neutral controller for detached terminals and advanced window state. */
export class ExomuxController {
  readonly client: ExomuxClientPort;
  readonly kernel: ShowcaseKernel<ExomuxWorkspaceState, ExomuxClientProvider>;
  readonly windowHost: NonNullable<ShowcaseKernel<ExomuxWorkspaceState>["windowHost"]>;
  readonly ready: Promise<void>;

  readonly sessions: Signal<readonly ExomuxSessionSummary[]>;
  readonly themeId = new Signal<ExomuxWorkspaceState["themeId"]>("midnight");
  readonly theme: Computed<ExomuxThemeSpec>;
  readonly themeRevision = new Signal(0);
  readonly prefixPending = new Signal(false);
  readonly helpVisible = new Signal(false);
  readonly pendingKillSessionId = new Signal<string | undefined>(undefined);
  readonly quitModalVisible = new Signal(false);
  /** Whether the top-left start menu dropdown is open. */
  readonly startMenuVisible = new Signal(false);
  /** Where the menu is anchored; undefined docks it under the start button. */
  readonly startMenuAnchor = new Signal<{ readonly column: number; readonly row: number } | undefined>(undefined);
  /**
   * The butterchurn preset showing when the menu opened, or undefined when the
   * active background is not a butterchurn one. Drives the menu's context items
   * (background settings / favorite this preset); captured at open time since
   * the menu is a momentary popup.
   */
  readonly startMenuPreset: Signal<string | undefined> = new Signal<string | undefined>(undefined);
  /** The tmux-style name of the attached session, editable from settings. */
  readonly sessionName = new Signal<string>("main");
  /** True while a rename is in flight, to gate concurrent attempts. */
  readonly sessionRenaming = new Signal(false);
  /** The in-progress rename draft, or undefined when not editing the name. */
  readonly sessionNameDraft = new Signal<string | undefined>(undefined);
  /** True when running inside Ghostty, where GLSL interface shaders are offered. */
  readonly ghosttyDetected = new Signal(false);
  /** The current GLSL shader configuration, applied when inside Ghostty. */
  readonly shaderConfig = new Signal<ExomuxShaderConfig>(defaultExomuxShaderConfig());
  readonly status = new Signal("Connecting to local Exomux host…");
  readonly networkStatus = new Signal<TailnetStatusResult | undefined>(undefined);
  readonly savedHosts = new Signal<readonly string[]>([]);
  readonly sessionHosts = new Signal<Readonly<Record<string, string>>>({});
  readonly backgroundId = new Signal<ExomuxBackgroundId>("metaballs");
  /** Running total of preset steps requested; the desktop applies the delta. */
  readonly backgroundPresetStep: Signal<number> = new Signal(0);
  /** Session id → per-window shell settings edited from the titlebar config button. */
  readonly windowSettings = new Signal<Readonly<Record<string, ExomuxWindowSettings>>>({});
  /** Session whose per-window config modal is open, when any. */
  readonly configSessionId = new Signal<string | undefined>(undefined);
  /** Highlighted row inside the per-window config modal. */
  readonly configRowIndex = new Signal(0);
  /** Desktop-wide settings edited from the global config modal. */
  readonly globalSettings = new Signal<ExomuxGlobalSettings>(defaultExomuxGlobalSettings());
  /** Whether the global config modal is open. */
  readonly globalConfigVisible = new Signal(false);
  /** Focused pane inside the global config modal. */
  readonly globalConfigPane = new Signal<ExomuxGlobalConfigPane>("theme");
  /** Per-background settings, persisted with the workspace. */
  readonly backgroundSettings: Signal<ExomuxBackgroundSettingsMap> = new Signal<ExomuxBackgroundSettingsMap>(
    Object.freeze({}),
  );
  /**
   * Preset names favorited for the butterchurn "Favorites only" cycle, shared
   * across both butterchurn renderers. A durable preference persisted to the
   * config file; the field filters it to its own catalog at cycle time.
   */
  readonly butterchurnFavorites: Signal<readonly string[]> = new Signal<readonly string[]>(Object.freeze([]));
  /** Whether the background config modal is open. */
  readonly backgroundConfigVisible: Signal<boolean> = new Signal(false);
  /** Selected option row in the background config modal. */
  readonly backgroundConfigOptionIndex: Signal<number> = new Signal(0);
  /** Which pane of the background config modal has focus. */
  readonly backgroundConfigPane: Signal<"list" | "options"> = new Signal<"list" | "options">("options");
  /** Selection inside the modal's list pane (preset index, or browser row). */
  readonly backgroundConfigListIndex: Signal<number> = new Signal(0);
  /**
   * Explicit viewport top for the modal's list pane, for wheel scrolling; `-1`
   * (the default) makes the viewport follow the selection. The wheel sets it so
   * scrolling moves the viewport without moving the selection; moving the
   * selection (keys, click) resets it to `-1`.
   */
  readonly backgroundConfigScrollTop: Signal<number> = new Signal(-1);
  /** Directory the image background's file browser is showing. */
  readonly backgroundBrowsePath: Signal<string> = new Signal<string>("");
  /** Bumped whenever a background's settings change, so the field rebuilds. */
  readonly backgroundSettingsRevision: Signal<number> = new Signal(0);
  /** Highlighted option row inside the global config modal. */
  readonly globalConfigOptionIndex = new Signal(0);
  /** Pending paste-to-scp confirmation; non-undefined opens the transfer modal. */
  readonly pendingScp = new Signal<ExomuxScpRequest | undefined>(undefined);
  /** Hierarchical Hosts/Tailscale browser state, driven by the shared workbench tree widget. */
  readonly networkTree: TreeController;

  readonly #runtimes = new Map<string, ExomuxTerminalRuntime>();
  readonly #lifecycleTails = new Map<string, Promise<void>>();
  readonly #warningTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #pendingResizes = new Map<string, { columns: number; rows: number }>();
  readonly #resizeFlights = new Map<string, Promise<void>>();
  readonly #killFlights = new Map<string, Promise<boolean>>();
  readonly #defaultCommand: string;
  readonly #defaultArgs?: readonly string[];
  readonly #defaultCwd?: string;
  #terminalOrdinal = 1;
  #disposed = false;
  #disposePromise?: Promise<void>;
  /** Serializes adopted-session window reconciliation (UX-007). */
  #adoptionQueue: Promise<void> = Promise.resolve();
  /** The in-flight local spawn, so adoption never races its reconciliation. */
  #spawnFlight?: Promise<void>;
  #unsubscribeSessions?: () => void;
  #lastBounds: Rectangle = { column: 0, row: 0, width: 120, height: 36 };
  readonly #networkExpansion = new Set<string>(["hosts", "tailscale"]);
  #tailnetPoller?: TailnetPoller;
  readonly #tailnetSource: Pick<TailnetStatusSource, "fetchStatus">;
  readonly #tailnetPollIntervalMs?: number;
  readonly #statFile: (path: string) => Promise<boolean>;
  readonly #scpCwdTimeoutMs: number;
  readonly #initialPreferences?: ExomuxPreferences;
  readonly #onPreferencesChanged?: (preferences: ExomuxPreferences) => void;
  readonly #onRenameSession?: (newName: string) => Promise<ExomuxRenameResult>;
  readonly #onShadersChanged?: (config: ExomuxShaderConfig) => void;
  #scpCwdCapture?: Promise<string | undefined>;

  constructor(options: ExomuxControllerOptions) {
    this.client = options.client;
    this.#initialPreferences = options.initialPreferences;
    this.#onPreferencesChanged = options.onPreferencesChanged;
    this.#onRenameSession = options.onRenameSession;
    this.#onShadersChanged = options.onShadersChanged;
    if (options.initialSessionName) this.sessionName.value = options.initialSessionName;
    if (options.ghosttyDetected) this.ghosttyDetected.value = true;
    if (options.initialShaders) this.shaderConfig.value = options.initialShaders;
    this.#defaultCommand = options.defaultCommand ?? defaultExomuxShell();
    this.#defaultArgs = options.defaultArgs ? [...options.defaultArgs] : undefined;
    this.#defaultCwd = options.defaultCwd;
    const initialSessions = normalizeSessionList(options.initialSessions ?? []);
    this.sessions = new Signal<readonly ExomuxSessionSummary[]>(initialSessions);
    for (const session of initialSessions) this.#runtimes.set(session.id, createTerminalRuntime(session));

    const provider = new ExomuxClientProvider(this.client);
    this.kernel = new ShowcaseKernel({
      manifest: EXOMUX_MANIFEST,
      provider,
      initialState: initialExomuxWorkspaceState(),
      normalizeState: normalizeExomuxWorkspaceState,
      store: options.store,
      storageKey: options.storageKey ?? "showcase:exomux:workspace",
      diagnostics: options.diagnostics,
      now: options.now,
      persistenceDebounceMs: options.persistenceDebounceMs,
      workspace: { gap: 1 },
      advancedWindows: {
        windows: this.#windowDescriptors(),
        compactMode: "auto",
        historyCapacity: 160,
        ownerId: "exomux-window-host",
        snapDistance: 2,
        snapOnRelease: true,
        // Terminal windows own per-window shell settings; the manager and
        // network panels have nothing to configure.
        windowConfigButton: (id: string) => exomuxSessionIdFromWindow(id) !== undefined,
        windowConfigLabel: "cfg",
      },
    });
    const windowHost = this.kernel.windowHost;
    if (!windowHost) throw new Error("Exomux requires the advanced window host.");
    this.windowHost = windowHost;
    this.theme = new Computed(() => exomuxTheme(this.themeId.value));
    this.#tailnetSource = options.tailnetSource ?? createTailscaleStatusSource();
    this.#tailnetPollIntervalMs = options.tailnetPollIntervalMs;
    this.#statFile = options.statFile ?? defaultExomuxStatFile;
    this.#scpCwdTimeoutMs = Math.min(10_000, Math.max(50, options.scpCwdTimeoutMs ?? 1_500));
    this.networkTree = new TreeController({
      nodes: buildExomuxNetworkNodes([], undefined, this.#networkExpansion),
      onToggle: (row, expanded) => {
        if (expanded) this.#networkExpansion.add(row.id);
        else this.#networkExpansion.delete(row.id);
      },
    });
    this.savedHosts.subscribe(() => this.#rebuildNetworkTree());
    this.networkStatus.subscribe(() => this.#rebuildNetworkTree());
    this.sessionHosts.subscribe(() => this.#rebuildNetworkTree());
    this.sessions.subscribe(() => this.#rebuildNetworkTree());
    // Adopt terminals other clients of this host open or close (UX-007).
    this.#unsubscribeSessions = this.client.subscribeSessions?.((session) => {
      this.#acceptBroadcastSession(session);
    });
    this.ready = this.#initialize();
  }

  #rebuildNetworkTree(): void {
    if (this.#disposed) return;
    this.networkTree.nodes.value = buildExomuxNetworkNodes(
      this.savedHosts.peek(),
      this.networkStatus.peek(),
      this.#networkExpansion,
      this.sessions.peek(),
      this.sessionHosts.peek(),
    );
  }

  /** Resolves a tailnet device referenced by a network tree node id. */
  networkDevice(nodeId: string): TailnetDevice | undefined {
    const deviceId = exomuxNetworkNodeDeviceId(nodeId);
    if (!deviceId) return undefined;
    return this.networkStatus.peek()?.snapshot?.devices.find((device) => device.id === deviceId);
  }

  /** Returns the live screen/runtime for one stable daemon session. */
  runtime(sessionId: string): ExomuxTerminalRuntime | undefined {
    return this.#runtimes.get(sessionId);
  }

  /** Returns the terminal selected by the advanced window host. */
  activeRuntime(): ExomuxTerminalRuntime | undefined {
    const sessionId = exomuxSessionIdFromWindow(this.windowHost.controller.inspect().activeWindowId);
    return sessionId ? this.#runtimes.get(sessionId) : undefined;
  }

  /** Persists the window host's current terminal focus without waiting on PTY work. */
  syncActiveSession(): void {
    if (!this.#disposed) this.#persistActiveSession();
  }

  /**
   * Opens the menu, docked under the start button or anchored at a cursor.
   *
   * `presetName` is the butterchurn preset showing when the menu opened, or
   * undefined when the active background is not a butterchurn one; it drives the
   * menu's context items (background settings / favorite this preset).
   */
  openStartMenu(anchor?: { readonly column: number; readonly row: number }, presetName?: string): void {
    this.#assertActive();
    this.prefixPending.value = false;
    this.startMenuAnchor.value = anchor;
    this.startMenuPreset.value = presetName;
    this.startMenuVisible.value = true;
  }

  /** Closes the start menu dropdown. */
  closeStartMenu(): void {
    if (this.#disposed) return;
    this.startMenuVisible.value = false;
    this.startMenuAnchor.value = undefined;
    this.startMenuPreset.value = undefined;
  }

  /** True when the session can be renamed (discovered through the state root). */
  get canRenameSession(): boolean {
    return this.#onRenameSession !== undefined;
  }

  /** The shader settings rows shown in the settings window under Ghostty. */
  shaderOptionRows(): readonly ExomuxShaderOptionRow[] {
    if (!this.ghosttyDetected.peek()) return [];
    const config = this.shaderConfig.peek();
    const rows: ExomuxShaderOptionRow[] = [];
    // Each effect has its own on/off row, so more than one can run at once;
    // an enabled effect's parameters follow it, indented. Each row also carries
    // how it renders as a real control — a CheckBox toggle or a `< value >`
    // Cycler over the parameter's steps.
    for (const effect of EXOMUX_SHADER_EFFECTS) {
      const effectConfig = config.effects[effect];
      const enabled = effectConfig?.enabled ?? false;
      rows.push({
        id: `shader-toggle:${effect}`,
        label: effect === "scanline" ? "CRT scanlines" : "CRT pincushion",
        value: enabled ? "On" : "Off",
        control: { kind: "checkbox", checked: enabled },
      });
      if (!enabled) continue;
      for (const param of EXOMUX_SHADER_PARAMS[effect]) {
        const value = exomuxShaderParamValue(config, effect, param);
        const options: string[] = [];
        let activeIndex = 0;
        const steps = Math.max(1, Math.round((param.max - param.min) / param.step));
        for (let step = 0; step <= steps; step += 1) {
          const stepped = clampExomuxShaderParam(param, param.min + step * param.step);
          options.push(exomuxFormatShaderValue(stepped));
          if (Math.abs(stepped - value) < param.step / 2) activeIndex = step;
        }
        rows.push({
          id: `shader-param:${effect}:${param.id}`,
          label: `  ${param.label}`,
          value: exomuxFormatShaderValue(value),
          control: { kind: "cycler", options, activeIndex },
        });
      }
    }
    return rows;
  }

  /** Applies one settings-row action: toggle an effect, or nudge a parameter. */
  cycleShaderRow(id: string, direction: number): void {
    if (this.#disposed || !this.ghosttyDetected.peek()) return;
    const config = this.shaderConfig.peek();
    if (id.startsWith("shader-toggle:")) {
      const effect = id.slice("shader-toggle:".length) as ExomuxShaderEffect;
      const current = config.effects[effect];
      if (!current) return;
      this.#setShaderConfig(this.#withEffect(config, effect, { ...current, enabled: !current.enabled }));
      return;
    }
    if (id.startsWith("shader-param:")) {
      const rest = id.slice("shader-param:".length);
      const separator = rest.indexOf(":");
      if (separator < 0) return;
      const effect = rest.slice(0, separator) as ExomuxShaderEffect;
      const paramId = rest.slice(separator + 1);
      const current = config.effects[effect];
      const param = current && EXOMUX_SHADER_PARAMS[effect]?.find((entry) => entry.id === paramId);
      if (!current || !param) return;
      const nextValue = clampExomuxShaderParam(
        param,
        exomuxShaderParamValue(config, effect, param) + direction * param.step,
      );
      this.#setShaderConfig(
        this.#withEffect(config, effect, { ...current, params: { ...current.params, [paramId]: nextValue } }),
      );
    }
  }

  #withEffect(
    config: ExomuxShaderConfig,
    effect: ExomuxShaderEffect,
    next: ExomuxShaderEffectConfig,
  ): ExomuxShaderConfig {
    return { effects: { ...config.effects, [effect]: next } };
  }

  #setShaderConfig(config: ExomuxShaderConfig): void {
    this.shaderConfig.value = config;
    this.#onShadersChanged?.(config);
    const enabled = exomuxEnabledShaderEffects(config);
    this.status.value = enabled.length > 0
      ? `CRT shaders: ${enabled.join(", ")}. Reload Ghostty's config to apply (or restart Ghostty).`
      : "CRT shaders off. Reload Ghostty's config to apply.";
  }

  /** Begins editing the session name, seeding the draft with the current name. */
  beginSessionRename(): void {
    if (this.#disposed || !this.#onRenameSession || this.sessionRenaming.peek()) return;
    this.sessionNameDraft.value = this.sessionName.peek();
  }

  /** Appends printable characters to the rename draft, within the name limit. */
  appendSessionRenameChar(text: string): void {
    const draft = this.sessionNameDraft.peek();
    if (draft === undefined) return;
    const filtered = text.replace(/[^A-Za-z0-9._-]/g, "");
    if (!filtered) return;
    this.sessionNameDraft.value = (draft + filtered).slice(0, 64);
  }

  /** Sets the rename draft to `text`, applying the same filtering and limit. */
  setSessionRenameDraft(text: string): void {
    if (this.sessionNameDraft.peek() === undefined) return;
    this.sessionNameDraft.value = text.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64);
  }

  /** Removes the last character of the rename draft. */
  backspaceSessionRename(): void {
    const draft = this.sessionNameDraft.peek();
    if (draft === undefined) return;
    this.sessionNameDraft.value = draft.slice(0, -1);
  }

  /** Abandons the rename draft without applying it. */
  cancelSessionRename(): void {
    this.sessionNameDraft.value = undefined;
  }

  /** Applies the rename draft, then clears it whatever the outcome. */
  async commitSessionRename(): Promise<ExomuxRenameResult> {
    const draft = this.sessionNameDraft.peek();
    if (draft === undefined) return { ok: false, error: "No rename in progress." };
    this.sessionNameDraft.value = undefined;
    return await this.renameSession(draft);
  }

  /**
   * Renames the attached session — its attach key and on-disk state — through
   * the injected rename hook. Serialized against itself, a no-op when the name
   * is unchanged, and reports the outcome on the status line.
   */
  async renameSession(newName: string): Promise<ExomuxRenameResult> {
    this.#assertActive();
    const trimmed = newName.trim();
    if (trimmed === this.sessionName.peek()) return { ok: true, name: trimmed };
    if (!this.#onRenameSession) {
      const error = "Renaming is unavailable for this session.";
      this.status.value = error;
      return { ok: false, error };
    }
    if (this.sessionRenaming.peek()) return { ok: false, error: "A rename is already in progress." };
    this.sessionRenaming.value = true;
    this.status.value = `Renaming session to "${trimmed}"…`;
    try {
      const result = await this.#onRenameSession(trimmed);
      if (result.ok && result.name) {
        this.sessionName.value = result.name;
        this.status.value = `Session renamed to "${result.name}". Attach with: exomux -a ${result.name}`;
      } else {
        this.status.value = `Rename failed: ${result.error ?? "unknown error"}`;
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status.value = `Rename failed: ${message}`;
      return { ok: false, error: message };
    } finally {
      this.sessionRenaming.value = false;
    }
  }

  /** Toggles the start menu dropdown, returning its new visibility. */
  toggleStartMenu(presetName?: string): boolean {
    if (this.startMenuVisible.peek()) {
      this.closeStartMenu();
      return false;
    }
    this.openStartMenu(undefined, presetName);
    return true;
  }

  /** Opens the end-session choice modal and clears conflicting transient UI. */
  openQuitModal(): void {
    this.#assertActive();
    this.prefixPending.value = false;
    this.helpVisible.value = false;
    this.pendingKillSessionId.value = undefined;
    this.startMenuVisible.value = false;
    this.quitModalVisible.value = true;
    this.status.value = "End session? d detaches, t terminates the host, Escape cancels.";
  }

  /** Closes the end-session modal without detaching or terminating anything. */
  cancelQuitModal(): void {
    if (this.#disposed) return;
    this.quitModalVisible.value = false;
    this.status.value = this.#statusSummary();
  }

  /** Returns the effective per-window settings for one session. */
  windowSettingsFor(sessionId: string): ExomuxWindowSettings {
    return this.windowSettings.peek()[sessionId] ?? defaultExomuxWindowSettings();
  }

  /** Opens the per-window config modal for one terminal session. */
  openWindowConfig(sessionId: string): boolean {
    if (this.#disposed || !this.#runtimes.has(sessionId)) return false;
    this.prefixPending.value = false;
    this.helpVisible.value = false;
    this.pendingKillSessionId.value = undefined;
    this.configRowIndex.value = 0;
    this.configSessionId.value = sessionId;
    this.status.value = "Window config · ↑↓ choose · ←→/Enter change · r reset · Escape close";
    return true;
  }

  /** Closes the per-window config modal. */
  closeWindowConfig(): void {
    if (this.#disposed) return;
    this.configSessionId.value = undefined;
    this.status.value = this.#statusSummary();
  }

  /** Moves the highlighted row inside the config modal. */
  moveWindowConfigRow(delta: number): void {
    if (this.#disposed || !this.configSessionId.peek()) return;
    const count = EXOMUX_WINDOW_SETTING_SPECS.length;
    const next = (this.configRowIndex.peek() + Math.trunc(delta) + count) % count;
    this.configRowIndex.value = next;
  }

  /** Cycles one setting for a session and applies it to the live runtime. */
  cycleWindowSetting(sessionId: string, id: ExomuxWindowSettingId, direction = 1): ExomuxWindowSettings {
    const current = this.windowSettingsFor(sessionId);
    if (this.#disposed) return current;
    const next = cycleExomuxWindowSetting(current, id, direction);
    this.#commitWindowSettings(sessionId, next);
    const spec = EXOMUX_WINDOW_SETTING_SPECS.find((candidate) => candidate.id === id);
    if (spec) this.status.value = `${spec.label}: ${spec.format(next[id])}`;
    return next;
  }

  /** Restores factory defaults for one window. */
  resetWindowSettings(sessionId: string): ExomuxWindowSettings {
    const defaults = defaultExomuxWindowSettings();
    if (this.#disposed) return defaults;
    this.#commitWindowSettings(sessionId, defaults);
    this.status.value = "Window settings reset to defaults.";
    return defaults;
  }

  #commitWindowSettings(sessionId: string, settings: ExomuxWindowSettings): void {
    this.windowSettings.value = Object.freeze({ ...this.windowSettings.peek(), [sessionId]: settings });
    this.#applyWindowSettings(sessionId, settings);
    const runtime = this.#runtimes.get(sessionId);
    if (runtime) runtime.renderRevision.value += 1;
    this.#persistMetadata();
  }

  /** Pushes settings that own live runtime state into the session's screen model. */
  #applyWindowSettings(sessionId: string, settings: ExomuxWindowSettings): void {
    const runtime = this.#runtimes.get(sessionId);
    if (!runtime) return;
    runtime.screen.setScrollbackLimit(settings.scrollbackLimit);
  }

  /** Selects one theme by id and persists it. */
  setTheme(id: ExomuxThemeId): ExomuxThemeSpec {
    this.#assertActive();
    const theme = exomuxTheme(id);
    if (theme.id !== this.themeId.peek()) {
      this.themeId.value = theme.id;
      this.themeRevision.value += 1;
      for (const runtime of this.#runtimes.values()) runtime.renderRevision.value += 1;
      this.#persistMetadata();
    }
    this.status.value = `Theme: ${theme.label}`;
    return theme;
  }

  /** Selects one animated desktop background by id and persists it. */
  setBackground(id: ExomuxBackgroundId): ExomuxBackgroundId {
    this.#assertActive();
    const next = exomuxBackgroundId(id);
    if (next !== this.backgroundId.peek()) {
      this.backgroundId.value = next;
      this.themeRevision.value += 1;
      this.#persistMetadata();
    }
    this.status.value = `Background: ${next}`;
    return next;
  }

  /** Opens the desktop-wide settings window and focuses it. */
  openGlobalConfig(bounds: Rectangle = SETTINGS_FALLBACK_BOUNDS): void {
    this.#assertActive();
    this.prefixPending.value = false;
    this.helpVisible.value = false;
    this.pendingKillSessionId.value = undefined;
    this.configSessionId.value = undefined;
    this.globalConfigPane.value = "theme";
    this.globalConfigOptionIndex.value = 0;
    this.globalConfigVisible.value = true;
    this.windowHost.execute({ kind: "restore", id: EXOMUX_SETTINGS_WINDOW_ID }, bounds);
    this.windowHost.execute({ kind: "focus", id: EXOMUX_SETTINGS_WINDOW_ID }, bounds);
    this.status.value = "Settings · Tab pane · ↑↓ choose · ←→ change · Escape close";
  }

  /** Closes the desktop-wide settings window. */
  closeGlobalConfig(bounds: Rectangle = SETTINGS_FALLBACK_BOUNDS): void {
    if (this.#disposed) return;
    this.globalConfigVisible.value = false;
    this.windowHost.execute({ kind: "minimize", id: EXOMUX_SETTINGS_WINDOW_ID }, bounds);
    this.status.value = this.#statusSummary();
  }

  /** Moves focus between the theme, background and options panes. */
  moveGlobalConfigPane(delta: number): ExomuxGlobalConfigPane {
    if (this.#disposed) return this.globalConfigPane.peek();
    const panes = EXOMUX_GLOBAL_CONFIG_PANES;
    const current = panes.indexOf(this.globalConfigPane.peek());
    const next = panes[(Math.max(0, current) + Math.trunc(delta) + panes.length) % panes.length]!;
    this.globalConfigPane.value = next;
    return next;
  }

  /** Moves the selection inside the focused pane, applying list picks live. */
  moveGlobalConfigSelection(delta: number): void {
    if (this.#disposed) return;
    const step = Math.trunc(delta);
    if (step === 0) return;
    switch (this.globalConfigPane.peek()) {
      case "theme":
        this.cycleTheme(step > 0 ? 1 : -1);
        return;
      case "background":
        this.cycleBackground(step > 0 ? 1 : -1);
        return;
      case "options": {
        const count = this.settingsOptionCount();
        this.globalConfigOptionIndex.value = (this.globalConfigOptionIndex.peek() + step + count) % count;
        return;
      }
    }
  }

  /** Total settings-pane option rows: the global specs plus any shader rows. */
  settingsOptionCount(): number {
    return EXOMUX_GLOBAL_SETTING_SPECS.length + this.shaderOptionRows().length;
  }

  /** Cycles the option at a combined index — a global spec or a shader row. */
  cycleSettingsOption(index: number, direction: number): void {
    const specs = EXOMUX_GLOBAL_SETTING_SPECS;
    if (index < specs.length) {
      this.cycleGlobalSetting(specs[index]!.id, direction);
      return;
    }
    const shaderRow = this.shaderOptionRows()[index - specs.length];
    if (shaderRow) this.cycleShaderRow(shaderRow.id, direction);
  }

  /** Cycles one desktop-wide setting and persists it. */
  cycleGlobalSetting(id: ExomuxGlobalSettingId, direction = 1): ExomuxGlobalSettings {
    const current = this.globalSettings.peek();
    if (this.#disposed) return current;
    const next = cycleExomuxGlobalSetting(current, id, direction);
    this.globalSettings.value = next;
    this.themeRevision.value += 1;
    this.#persistMetadata();
    const spec = EXOMUX_GLOBAL_SETTING_SPECS.find((candidate) => candidate.id === id);
    if (spec) this.status.value = `${spec.label}: ${spec.format(next[id])}`;
    return next;
  }

  /** Opens the background config modal for the active background. */
  openBackgroundConfig(): void {
    this.#assertActive();
    this.prefixPending.value = false;
    this.helpVisible.value = false;
    if (this.globalConfigVisible.peek()) {
      this.globalConfigVisible.value = false;
      this.windowHost.execute({ kind: "minimize", id: EXOMUX_SETTINGS_WINDOW_ID }, SETTINGS_FALLBACK_BOUNDS);
    }
    this.configSessionId.value = undefined;
    const id = this.backgroundId.peek();
    const specs = EXOMUX_BACKGROUND_SETTING_SPECS[id] ?? [];
    this.backgroundConfigOptionIndex.value = 0;
    this.backgroundConfigListIndex.value = 0;
    this.backgroundConfigScrollTop.value = -1;
    this.backgroundConfigPane.value = id === "butterchurn" || id === "butterchurn cpu" || id === "image"
      ? "list"
      : "options";
    if (id === "image" && !this.backgroundBrowsePath.peek()) {
      this.backgroundBrowsePath.value = homeDirectory();
    }
    this.backgroundConfigVisible.value = true;
    this.status.value = specs.length > 0 || id === "butterchurn" || id === "butterchurn cpu" || id === "image"
      ? "Background settings · Tab pane · ↑↓ choose · ←→/Enter change · Escape close"
      : "This background has nothing to configure.";
  }

  /** Closes the background config modal. */
  closeBackgroundConfig(): void {
    if (this.#disposed) return;
    this.backgroundConfigVisible.value = false;
    this.status.value = this.#statusSummary();
  }

  /** Cycles one setting of the active background and persists it. */
  cycleBackgroundSetting(settingId: string, direction = 1): void {
    if (this.#disposed) return;
    const id = this.backgroundId.peek();
    const next = cycleExomuxBackgroundSetting(this.backgroundSettings.peek(), id, settingId, direction);
    if (next === this.backgroundSettings.peek()) return;
    this.backgroundSettings.value = next;
    this.backgroundSettingsRevision.value += 1;
    this.#persistMetadata();
    const spec = (EXOMUX_BACKGROUND_SETTING_SPECS[id] ?? []).find((candidate) => candidate.id === settingId);
    if (spec) this.status.value = `${spec.label}: ${spec.format(exomuxBackgroundSettingsFor(next, id)[settingId]!)}`;
  }

  /** Stores the image background's picture path and persists it. */
  setBackgroundImagePath(path: string): void {
    if (this.#disposed) return;
    const next = withExomuxBackgroundString(this.backgroundSettings.peek(), "image", "path", path);
    if (next === this.backgroundSettings.peek()) return;
    this.backgroundSettings.value = next;
    this.backgroundSettingsRevision.value += 1;
    this.#persistMetadata();
    this.status.value = `Background image: ${path}`;
  }

  /** Whether a butterchurn preset (by name) is in the favorites list. */
  isButterchurnFavorite(name: string): boolean {
    return this.butterchurnFavorites.peek().includes(name);
  }

  /**
   * Adds or removes a butterchurn preset from the favorites list and persists
   * it, returning the new membership. Shared across both butterchurn renderers;
   * the field filters the list to its own catalog when cycling favorites only.
   */
  toggleButterchurnFavorite(name: string): boolean {
    if (this.#disposed || name.length === 0) return this.isButterchurnFavorite(name);
    const current = this.butterchurnFavorites.peek();
    const favorited = current.includes(name);
    const next = favorited ? current.filter((entry) => entry !== name) : [...current, name];
    this.butterchurnFavorites.value = Object.freeze(next);
    this.#persistMetadata();
    this.status.value = favorited ? `Unfavorited ${name}` : `Favorited ${name}`;
    return !favorited;
  }

  /**
   * Shows a transient warning on one terminal and schedules its retirement, so
   * a one-off notice cannot occupy a content row forever.
   */
  #warn(runtime: ExomuxTerminalRuntime, message: string): void {
    runtime.warning.value = message;
    const existing = this.#warningTimers.get(runtime.sessionId);
    if (existing !== undefined) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.#warningTimers.delete(runtime.sessionId);
      if (this.#disposed || runtime.warning.peek() !== message) return;
      runtime.warning.value = undefined;
      runtime.renderRevision.value += 1;
    }, EXOMUX_WARNING_TTL_MS);
    // Never let a pending notice hold the process (or a test) open.
    if (typeof Deno !== "undefined" && typeof Deno.unrefTimer === "function") Deno.unrefTimer(timer);
    this.#warningTimers.set(runtime.sessionId, timer);
  }

  /** Retires a terminal's warning immediately, e.g. once its view is usable. */
  clearWarning(sessionId: string): void {
    const runtime = this.#runtimes.get(sessionId);
    if (!runtime) return;
    const timer = this.#warningTimers.get(sessionId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.#warningTimers.delete(sessionId);
    }
    if (runtime.warning.peek() === undefined) return;
    runtime.warning.value = undefined;
    runtime.renderRevision.value += 1;
  }

  /** Arms the tmux-style Ctrl-N prefix without forwarding it to a child. */
  beginPrefix(): void {
    this.#assertActive();
    this.prefixPending.value = true;
    this.status.value = 'PREFIX · c new · % right · " below · d detach · & kill · t theme';
  }

  /** Cancels a pending prefix sequence. */
  cancelPrefix(): void {
    if (this.#disposed) return;
    this.prefixPending.value = false;
    this.status.value = this.#statusSummary();
  }

  /** Executes one awaited Ctrl-N command. Unknown keys are consumed and explained. */
  async handlePrefixKey(key: string, bounds: Rectangle): Promise<boolean> {
    this.#assertActive();
    this.prefixPending.value = false;
    const normalized = key.toLowerCase();
    switch (normalized) {
      case "c":
        await this.spawn({ bounds });
        return true;
      case "%":
        await this.spawn({ bounds, dock: "right" });
        return true;
      case '"':
        await this.spawn({ bounds, dock: "bottom" });
        return true;
      case "d":
      case "x":
        await this.closeActive(bounds);
        return true;
      case "&": {
        const active = this.activeRuntime();
        if (active) this.requestKillSession(active.sessionId);
        return true;
      }
      case "?":
        this.openHelp();
        return true;
      case "t":
        this.cycleTheme();
        return true;
      case "b":
        this.cycleBackground();
        return true;
      case "]":
        this.stepBackgroundPreset(1);
        return true;
      case "[":
        this.stepBackgroundPreset(-1);
        return true;
      case "f":
      case "space":
        this.windowHost.execute({ kind: "toggle-placement" }, bounds);
        return true;
      case "z":
        this.windowHost.execute({ kind: "toggle-maximize" }, bounds);
        return true;
      case "m":
        this.windowHost.execute({ kind: "minimize" }, bounds);
        return true;
      case "n":
        this.windowHost.execute({ kind: "focus-next", direction: 1 }, bounds);
        this.#persistActiveSession();
        return true;
      case "p":
        this.windowHost.execute({ kind: "focus-next", direction: -1 }, bounds);
        this.#persistActiveSession();
        return true;
      case "w":
        this.windowHost.execute({ kind: "switcher-open", direction: 1 }, bounds);
        return true;
      case "s":
        this.windowHost.execute({ kind: "restore", id: EXOMUX_SESSIONS_WINDOW_ID }, bounds);
        this.windowHost.execute({ kind: "focus", id: EXOMUX_SESSIONS_WINDOW_ID }, bounds);
        return true;
      case "r":
        await this.refreshSessions();
        this.windowHost.execute({ kind: "recover-all" }, bounds);
        return true;
      case "left":
      case "right":
      case "up":
      case "down":
        this.windowHost.execute({
          kind: "snap",
          target: {
            kind: "workspace",
            edge: normalized === "up" ? "top" : normalized === "down" ? "bottom" : normalized,
          },
        }, bounds);
        return true;
      case "escape":
        this.cancelPrefix();
        return true;
      default:
        this.status.value = `Unknown prefix command: ${key} · Ctrl-N ? for help`;
        return true;
    }
  }

  /** Opens the destructive-session confirmation without touching the host. */
  requestKillSession(sessionId: string): boolean {
    this.#assertActive();
    const runtime = this.#runtimes.get(sessionId);
    if (!runtime) return false;
    this.prefixPending.value = false;
    this.helpVisible.value = false;
    // Windows configured without a close prompt terminate straight away.
    if (!this.windowSettingsFor(sessionId).confirmClose) {
      this.pendingKillSessionId.value = undefined;
      void this.killSession(sessionId);
      return true;
    }
    this.pendingKillSessionId.value = sessionId;
    this.status.value = `Kill ${runtime.summary.peek().title}? Press y/Enter to confirm or Escape to cancel.`;
    return true;
  }

  /** Confirms the currently requested destructive session termination. */
  async confirmKillSession(): Promise<boolean> {
    this.#assertActive();
    const sessionId = this.pendingKillSessionId.peek();
    if (!sessionId) return false;
    this.pendingKillSessionId.value = undefined;
    if (!this.#runtimes.has(sessionId)) return false;
    return await this.killSession(sessionId);
  }

  /** Cancels the pending destructive action while leaving its PTY untouched. */
  cancelKillSession(): void {
    if (this.#disposed) return;
    this.pendingKillSessionId.value = undefined;
    this.status.value = this.#statusSummary();
  }

  /** Opens the modal key reference and clears conflicting destructive UI. */
  openHelp(): void {
    this.#assertActive();
    this.prefixPending.value = false;
    this.pendingKillSessionId.value = undefined;
    this.helpVisible.value = true;
    this.status.value = "Exomux key reference open · Escape, tap, or click closes help.";
  }

  /** Closes the modal key reference. */
  closeHelp(): void {
    if (this.#disposed) return;
    this.helpVisible.value = false;
    this.status.value = this.#statusSummary();
  }

  /** Toggles the left-docked network panel; opening starts tailnet polling, closing stops it. */
  toggleNetworkPanel(bounds: Rectangle): void {
    this.#assertActive();
    const active = this.windowHost.controller.inspect().activeWindowId === EXOMUX_NETWORK_WINDOW_ID;
    if (active) {
      this.windowHost.execute({ kind: "minimize", id: EXOMUX_NETWORK_WINDOW_ID }, bounds);
      this.#tailnetPoller?.setVisible(false);
      this.status.value = this.#statusSummary();
      return;
    }
    this.windowHost.execute({ kind: "restore", id: EXOMUX_NETWORK_WINDOW_ID }, bounds);
    this.windowHost.execute({ kind: "focus", id: EXOMUX_NETWORK_WINDOW_ID }, bounds);
    this.#ensureTailnetPoller().setVisible(true);
    this.status.value = "Network panel · Enter opens SSH · Del forgets a saved host · r refreshes.";
  }

  /** Forces one immediate tailnet status fetch. */
  async refreshNetwork(): Promise<void> {
    this.#assertActive();
    await this.#ensureTailnetPoller().refresh();
  }

  /** Opens an SSH terminal to a validated target through the detached host and remembers it. */
  async spawnNetworkShell(
    target: string,
    title: string,
    bounds: Rectangle,
  ): Promise<ExomuxSessionSummary | undefined> {
    this.#assertActive();
    if (!isExomuxSshTarget(target)) {
      this.status.value = `Refusing SSH target with unsupported characters: ${target.slice(0, 40)}`;
      return undefined;
    }
    const session = await this.spawn({ bounds, command: "ssh", args: [target], title: title || target });
    if (session) {
      this.rememberHost(target);
      this.sessionHosts.value = Object.freeze({ ...this.sessionHosts.peek(), [session.id]: target });
      this.#persistMetadata();
    }
    return session;
  }

  /** Preferred SSH target for one tailnet device (MagicDNS name over raw IP). */
  static tailnetSshTarget(device: TailnetDevice): string | undefined {
    const target = device.dnsName || device.ipv4;
    return target && isExomuxSshTarget(target) ? target : undefined;
  }

  /** Persists one SSH target in the saved-hosts list. */
  rememberHost(target: string): void {
    if (this.#disposed || !isExomuxSshTarget(target)) return;
    const current = this.savedHosts.peek();
    if (current.includes(target)) return;
    this.savedHosts.value = Object.freeze([target, ...current].slice(0, 64));
    this.#persistMetadata();
  }

  /** Removes one SSH target from the saved-hosts list. */
  forgetHost(target: string): boolean {
    this.#assertActive();
    const current = this.savedHosts.peek();
    if (!current.includes(target)) return false;
    this.savedHosts.value = Object.freeze(current.filter((host) => host !== target));
    this.#persistMetadata();
    this.status.value = `Forgot saved host ${target}.`;
    return true;
  }

  /** Centered default rect for a freshly spawned floating terminal, cascading slightly per launch. */
  /**
   * Refits floating windows after the desktop changes shape. A window whose
   * durable rect now falls partly or wholly outside the viewport is shrunk to
   * fit and nudged back on screen, so a smaller parent never strands a window
   * where it cannot be reached. Windows that still fit are left untouched, and
   * tiled/maximized/minimized windows are the layout's concern, not this pass.
   * Returns true when any window moved.
   */
  reflowFloatingWindows(bounds: Rectangle): boolean {
    if (this.#disposed) return false;
    const viewport = normalizeReflowBounds(bounds);
    if (!viewport) return false;
    let changed = false;
    // Cascade successive rescued windows so several never land on one another.
    let cascadeIndex = 0;
    for (const window of this.windowHost.controller.inspect().windows) {
      if (window.placement !== "floating" || window.state === "minimized" || window.state === "maximized") continue;
      const rect = window.floatingRect;
      if (!rect) continue;
      if (floatingRectFitsIn(rect, viewport)) continue;
      // A window too big for the view, or with most of its body off it, is
      // re-centered (and cascaded); one that is only slightly off is nudged
      // back on so a small resize does not yank it to the middle.
      const tooBig = rect.width > viewport.width || rect.height > viewport.height;
      const fitted = tooBig || floatingVisibleFraction(rect, viewport) < EXOMUX_REFLOW_CENTER_THRESHOLD
        ? centerFloatingRect(rect, viewport, cascadeIndex++)
        : nudgeFloatingRectIntoView(rect, viewport);
      this.windowHost.execute({ kind: "set-placement", id: window.id, placement: "floating", rect: fitted }, viewport);
      changed = true;
    }
    if (changed) this.#lastBounds = { ...viewport };
    return changed;
  }

  #centeredFloatingRect(): Rectangle {
    const bounds = this.#lastBounds;
    const width = Math.max(24, Math.min(86, bounds.width - 6));
    const height = Math.max(8, Math.min(28, bounds.height - 4));
    const cascade = ((this.#terminalOrdinal % 5) - 2) * 2;
    return {
      column: Math.max(bounds.column, bounds.column + Math.floor((bounds.width - width) / 2) + cascade),
      row: Math.max(bounds.row, bounds.row + Math.floor((bounds.height - height) / 2) + Math.trunc(cascade / 2)),
      width,
      height,
    };
  }

  /**
   * SSH target of one session, from the network-panel mapping or, for shells
   * launched any other way, parsed from the session's `ssh …` command line.
   */
  scpEligibleTarget(sessionId: string): string | undefined {
    const mapped = this.sessionHosts.peek()[sessionId];
    if (mapped) return mapped;
    const summary = this.#runtimes.get(sessionId)?.summary.peek();
    if (!summary) return undefined;
    const tokens = summary.commandLine.trim().split(/\s+/);
    const command = tokens[0] ?? "";
    if (command !== "ssh" && !command.endsWith("/ssh")) return undefined;
    for (let index = tokens.length - 1; index >= 1; index -= 1) {
      const token = tokens[index]!;
      if (token.startsWith("-")) continue;
      return isExomuxSshTarget(token) ? token : undefined;
    }
    return undefined;
  }

  /**
   * Intercepts a paste that names one existing local file while an SSH shell
   * is focused. The modal opens as soon as the fast local stat confirms the
   * file; the remote cwd resolves in the background and never blocks input.
   * Returns true when the modal was opened; false means the caller must
   * forward the paste verbatim.
   */
  async maybeInterceptScpPaste(text: string): Promise<boolean> {
    if (this.#disposed || this.pendingScp.peek()) return false;
    const runtime = this.activeRuntime();
    if (!runtime) return false;
    const target = this.scpEligibleTarget(runtime.sessionId);
    if (!target) return false;
    const localPath = exomuxScpCandidatePath(text);
    if (!localPath) return false;
    const exists = await this.#statFile(localPath).catch(() => false);
    if (!exists || this.#disposed) return false;
    this.prefixPending.value = false;
    const request: ExomuxScpRequest = {
      sessionId: runtime.sessionId,
      target,
      localPath,
      pasteText: text,
      password: "",
    };
    this.pendingScp.value = request;
    this.status.value = `Send ${localPath} → ${
      exomuxScpDestinationLabel(request)
    } ? Type a password if needed · Enter sends · Escape cancels.`;
    this.#scpCwdCapture = this.captureRemoteCwd(runtime.sessionId).then((remoteDir) => {
      if (remoteDir && !this.#disposed && this.pendingScp.peek() === request) {
        this.pendingScp.value = { ...request, remoteDir };
      }
      return remoteDir;
    }).catch(() => undefined);
    return true;
  }

  /**
   * Runs a hidden-history `pwd` in the shell and captures the printed path, so
   * transfers land in the directory the user is actually in. Skipped for
   * alternate-screen apps and whenever the shell is not sitting at an empty
   * prompt (the probe would otherwise type into a half-written command);
   * undefined falls back to the remote home directory.
   */
  async captureRemoteCwd(sessionId: string, timeoutMs = this.#scpCwdTimeoutMs): Promise<string | undefined> {
    const runtime = this.#runtimes.get(sessionId);
    if (!runtime || !runtime.attached.peek() || !runtime.summary.peek().running) return undefined;
    const inspection = runtime.screen.inspect();
    if (inspection.alternate) return undefined;
    const cursorLine = runtime.screen.textRows()[inspection.cursor.row] ?? "";
    const beforeCursor = cursorLine.slice(0, inspection.cursor.column).trimEnd();
    if (!/[$#%>❯]$/.test(beforeCursor)) return undefined;
    let settle: (value: string | undefined) => void;
    const captured = new Promise<string | undefined>((resolve) => settle = resolve);
    let buffer = "";
    const tap = (chunk: string) => {
      buffer = (buffer + chunk).slice(-8_192);
      const path = exomuxCapturedPwdPath(buffer);
      if (path) settle(path);
    };
    runtime.outputTaps.add(tap);
    const timer = setTimeout(() => settle(undefined), Math.max(50, timeoutMs));
    try {
      // The leading space keeps the probe out of history in most shells.
      await this.writeSession(sessionId, " pwd\r");
      return await captured;
    } finally {
      clearTimeout(timer);
      runtime.outputTaps.delete(tap);
    }
  }

  /** Sets the pending transfer's password field outright (from the composited Input's value). */
  setScpPassword(password: string): void {
    const request = this.pendingScp.peek();
    if (this.#disposed || !request) return;
    const capped = password.length > 256 ? password.slice(0, 256) : password;
    if (capped === request.password) return;
    this.pendingScp.value = { ...request, password: capped };
  }

  /** Appends one typed character to the pending transfer's password field. */
  appendScpPassword(char: string): void {
    const request = this.pendingScp.peek();
    if (this.#disposed || !request || char.length === 0 || request.password.length >= 256) return;
    this.pendingScp.value = { ...request, password: request.password + char };
  }

  /** Removes the last character from the pending transfer's password field. */
  backspaceScpPassword(): void {
    const request = this.pendingScp.peek();
    if (this.#disposed || !request || request.password.length === 0) return;
    this.pendingScp.value = { ...request, password: request.password.slice(0, -1) };
  }

  /**
   * Opens a dedicated terminal window running scp so its native progress meter
   * is visible. When a password was typed, it is injected once at the first
   * password prompt; otherwise scp uses key/agent auth or prompts in-window.
   */
  async confirmScpTransfer(bounds: Rectangle): Promise<boolean> {
    this.#assertActive();
    const request = this.pendingScp.peek();
    if (!request) return false;
    this.pendingScp.value = undefined;
    // A still-running cwd probe may finish after confirmation; honor it.
    const capturedDir = request.remoteDir ?? await (this.#scpCwdCapture ?? Promise.resolve(undefined));
    this.#scpCwdCapture = undefined;
    if (this.#disposed) return false;
    const remoteDir = capturedDir ?? request.remoteDir;
    const remoteSpec = `${request.target}:${remoteDir ? `${remoteDir}/` : ""}`;
    const fileName = request.localPath.split("/").pop() || request.localPath;
    const session = await this.spawn({
      bounds,
      command: "scp",
      // No -q: scp draws its progress meter when stdout is a PTY.
      args: ["-o", "StrictHostKeyChecking=accept-new", "--", request.localPath, remoteSpec],
      title: `scp ${fileName}`,
    });
    if (!session) return false;
    if (request.password) this.#injectScpPassword(session.id, request.password);
    this.status.value = `Transferring ${fileName} → ${exomuxScpDestinationLabel(request)} in a new window…`;
    return true;
  }

  /** Watches one scp session for its password prompt and answers it exactly once. */
  #injectScpPassword(sessionId: string, password: string, timeoutMs = 30_000): void {
    const runtime = this.#runtimes.get(sessionId);
    if (!runtime) return;
    let buffer = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      runtime.outputTaps.delete(tap);
    };
    const tap = (chunk: string) => {
      if (done) return;
      buffer = (buffer + chunk).slice(-256);
      if (/[Pp]assword:\s*$|[Pp]assphrase[^:]*:\s*$/.test(buffer)) {
        finish();
        void this.writeSession(sessionId, `${password}\r`).catch(() => false);
      }
    };
    const timer = setTimeout(finish, Math.max(1_000, timeoutMs));
    runtime.outputTaps.add(tap);
  }

  /** Dismisses the modal; returns the original paste text when it should be forwarded. */
  cancelScpTransfer(pastePathInstead: boolean): string | undefined {
    if (this.#disposed) return undefined;
    const request = this.pendingScp.peek();
    this.pendingScp.value = undefined;
    this.#scpCwdCapture = undefined;
    this.status.value = this.#statusSummary();
    return pastePathInstead ? request?.pasteText : undefined;
  }

  #ensureTailnetPoller(): TailnetPoller {
    this.#tailnetPoller ??= new TailnetPoller({
      source: this.#tailnetSource,
      onResult: (result) => {
        if (this.#disposed) return;
        this.networkStatus.value = result;
      },
      ...(this.#tailnetPollIntervalMs !== undefined ? { intervalMs: this.#tailnetPollIntervalMs } : {}),
    });
    return this.#tailnetPoller;
  }

  /** Launches a daemon-owned shell, floating by default or tiled when explicitly docked. */
  async spawn(options: ExomuxControllerSpawnOptions = {}): Promise<ExomuxSessionSummary | undefined> {
    this.#assertActive();
    if (options.bounds) this.#lastBounds = { ...options.bounds };
    if (this.#runtimes.size >= EXOMUX_MAX_SESSIONS) {
      this.status.value = `Session limit reached (${EXOMUX_MAX_SESSIONS}).`;
      return undefined;
    }
    const activeWindowId = this.windowHost.controller.inspect().activeWindowId;
    const targetId = exomuxSessionIdFromWindow(activeWindowId);
    const minimizeSessionManager = this.#runtimes.size === 0 || activeWindowId === EXOMUX_SESSIONS_WINDOW_ID;
    this.#terminalOrdinal += 1;
    this.#persistMetadata();
    const spawnOptions: ExomuxSpawnOptions = {
      command: options.command ?? this.#defaultCommand,
      args: options.args ? [...options.args] : this.#defaultArgs,
      cwd: options.cwd ?? this.#defaultCwd,
      env: options.env ? { ...options.env } : undefined,
      ...(options.title !== undefined ? { title: options.title } : {}),
      columns: clampDimension(options.columns, 80, EXOMUX_MAX_COLUMNS),
      rows: clampDimension(options.rows, 24, EXOMUX_MAX_ROWS),
    };
    this.status.value = `Launching ${options.title ?? applicationCommandName(spawnOptions.command)}…`;
    let resolveFlight: (() => void) | undefined;
    this.#spawnFlight = new Promise<void>((resolve) => {
      resolveFlight = resolve;
    });
    try {
      const session = normalizeSession(await this.client.spawn(spawnOptions));
      const runtime = createTerminalRuntime(session);
      const candidateRuntimes = new Map(this.#runtimes);
      candidateRuntimes.set(session.id, runtime);
      const reconciliation = await this.#reconcileWindows(
        this.#windowDescriptors(candidateRuntimes, new Map(), options.dock ? undefined : session.id),
      );
      if (!windowReconciliationApplied(reconciliation)) {
        const rolledBack = await this.client.kill(session.id).catch(() => false);
        disposeTerminalRuntime(runtime);
        this.status.value = rolledBack
          ? `Launch rolled back because window creation failed: ${reconciliation.reason ?? reconciliation.status}.`
          : `Window creation failed; detached host session ${session.id} may require recovery.`;
        return undefined;
      }
      this.#runtimes.set(session.id, runtime);
      this.#publishSessions();
      const bounds = options.bounds ?? { column: 0, row: 0, width: 120, height: 36 };
      if (options.dock && targetId && this.#runtimes.has(targetId)) {
        const targetWindowId = exomuxWindowId(targetId);
        const targetWindow = this.windowHost.controller.inspect().windows.find((window) =>
          window.id === targetWindowId
        );
        // A default-floating terminal can still become the anchor for an
        // explicit tmux-style split. Docking requires both peers in the tiled
        // workspace, so promote the focused target before placing its child.
        if (targetWindow?.placement === "floating") {
          this.windowHost.execute({ kind: "set-placement", id: targetWindowId, placement: "tiled" }, bounds);
        }
        this.windowHost.execute({
          kind: "dock",
          id: exomuxWindowId(session.id),
          targetId: targetWindowId,
          edge: options.dock,
          ratio: 0.5,
        }, bounds);
      }
      this.windowHost.execute({ kind: "restore", id: exomuxWindowId(session.id) }, bounds);
      this.windowHost.execute({ kind: "focus", id: exomuxWindowId(session.id) }, bounds);
      // Leaving the manager over the first focused shell hides the prompt and
      // early echo, which looks like severe input latency even though the PTY
      // is current. Keep it one Ctrl-N s away on the shelf when it launched
      // the terminal.
      if (minimizeSessionManager) {
        this.windowHost.execute({ kind: "minimize", id: EXOMUX_SESSIONS_WINDOW_ID }, bounds);
      }
      await this.#attachRuntime(runtime);
      this.#persistActiveSession();
      this.status.value = this.#statusSummary();
      return session;
    } catch {
      this.status.value = "The local host rejected the terminal launch.";
      return undefined;
    } finally {
      this.#spawnFlight = undefined;
      resolveFlight?.();
    }
  }

  /** Closes the active presentation window and detaches without terminating its PTY. */
  async closeActive(bounds: Rectangle): Promise<boolean> {
    this.#assertActive();
    const runtime = this.activeRuntime();
    if (!runtime) return false;
    const result = this.windowHost.execute({ kind: "close", id: exomuxWindowId(runtime.sessionId) }, bounds);
    await this.#detachRuntime(runtime);
    this.#persistActiveSession();
    this.status.value = `Detached ${runtime.summary.peek().title}; its PTY is still running.`;
    return result.handled;
  }

  /** Restores and reattaches one hidden terminal by stable host session id. */
  async openSession(sessionId: string, bounds: Rectangle): Promise<boolean> {
    this.#assertActive();
    const runtime = this.#runtimeRequired(sessionId);
    const targetId = exomuxWindowId(sessionId);
    const maximizedId = this.windowHost.controller.inspect().maximizedWindowId;
    if (maximizedId && maximizedId !== targetId) {
      this.windowHost.execute({ kind: "restore", id: maximizedId }, bounds);
    }
    this.windowHost.execute({ kind: "restore", id: targetId }, bounds);
    this.windowHost.execute({ kind: "focus", id: targetId }, bounds);
    if (maximizedId && maximizedId !== targetId) {
      this.windowHost.execute({ kind: "maximize", id: targetId }, bounds);
    }
    const attached = await this.#attachRuntime(runtime);
    this.#persistActiveSession();
    this.status.value = attached ? `Attached ${runtime.summary.peek().title}.` : "Attach failed.";
    return attached;
  }

  /** Opens the persistent session selector, clearing any terminal fullscreen lock. */
  openSessionManager(bounds: Rectangle): boolean {
    this.#assertActive();
    const maximizedId = this.windowHost.controller.inspect().maximizedWindowId;
    if (maximizedId) this.windowHost.execute({ kind: "restore", id: maximizedId }, bounds);
    const restored = this.windowHost.execute({ kind: "restore", id: EXOMUX_SESSIONS_WINDOW_ID }, bounds);
    const focused = this.windowHost.execute({ kind: "focus", id: EXOMUX_SESSIONS_WINDOW_ID }, bounds);
    return restored.handled || focused.handled;
  }

  /** Explicitly destroys one host-owned process and removes its window. */
  /**
   * A session-state broadcast from the host, possibly for a terminal this
   * client never opened. Known ids ride the per-attachment update path;
   * unknown running ids are adopted so a window another client opened appears
   * here live instead of on the next reconnect (UX-007).
   */
  #acceptBroadcastSession(value: ExomuxSessionSummary): void {
    if (this.#disposed) return;
    const summary = normalizeSession(value);
    const runtime = this.#runtimes.get(summary.id);
    if (runtime) {
      // Attached runtimes get the same update through their attachment; an
      // unattached one still wants the freshest summary (e.g. exit state).
      if (!runtime.attached.peek() && summary.updatedAt >= runtime.summary.peek().updatedAt) {
        runtime.summary.value = summary;
        this.#publishSessions();
      }
      return;
    }
    if (!summary.running) return;
    this.#adoptionQueue = this.#adoptionQueue
      .then(() => this.#adoptBroadcastSession(summary))
      .catch(() => {
        // A failed adoption must not wedge the queue; the next broadcast for
        // the same session retries.
      });
  }

  async #adoptBroadcastSession(summary: ExomuxSessionSummary): Promise<void> {
    // A local spawn's own session-state echo must never race the spawn's
    // window reconciliation.
    while (this.#spawnFlight) await this.#spawnFlight;
    if (this.#disposed || this.#runtimes.has(summary.id)) return;
    if (this.#runtimes.size >= EXOMUX_MAX_SESSIONS) return;
    const runtime = createTerminalRuntime(summary);
    const candidates = new Map(this.#runtimes);
    candidates.set(summary.id, runtime);
    const reconciliation = await this.#reconcileWindows(this.#windowDescriptors(candidates));
    if (!windowReconciliationApplied(reconciliation)) {
      disposeTerminalRuntime(runtime);
      return;
    }
    this.#runtimes.set(summary.id, runtime);
    this.#publishSessions();
    // Visible but never focus-stealing: someone else opened this window.
    this.windowHost.execute({ kind: "restore", id: exomuxWindowId(summary.id) }, this.#lastBounds);
    await this.#attachRuntime(runtime);
    this.status.value = this.#statusSummary();
  }

  async killSession(sessionId: string): Promise<boolean> {
    this.#assertActive();
    const pending = this.#killFlights.get(sessionId);
    if (pending) return await pending;
    const flight = this.#killSessionOnce(sessionId);
    this.#killFlights.set(sessionId, flight);
    try {
      return await flight;
    } finally {
      if (this.#killFlights.get(sessionId) === flight) this.#killFlights.delete(sessionId);
    }
  }

  async #killSessionOnce(sessionId: string): Promise<boolean> {
    const runtime = this.#runtimeRequired(sessionId);
    if (this.pendingKillSessionId.peek() === sessionId) this.pendingKillSessionId.value = undefined;
    const title = runtime.summary.peek().title;
    const killed = await this.client.kill(sessionId).catch(() => false);
    if (!killed) {
      this.status.value = "The host did not terminate that session.";
      return false;
    }
    runtime.attachGeneration += 1;
    runtime.attached.value = false;
    runtime.renderRevision.value += 1;
    const survivors = new Map(this.#runtimes);
    survivors.delete(sessionId);
    const reconciliation = await this.#reconcileWindows(this.#windowDescriptors(survivors));
    if (!windowReconciliationApplied(reconciliation)) {
      const summary = runtime.summary.peek();
      runtime.summary.value = normalizeSession({
        ...summary,
        status: "exited",
        running: false,
        updatedAt: Math.max(summary.updatedAt, Date.now()),
      });
      this.#warn(
        runtime,
        `Terminated; window cleanup is pending (${reconciliation.reason ?? reconciliation.status}).`,
      );
      runtime.renderRevision.value += 1;
      this.#publishSessions();
      this.windowHost.execute({ kind: "close", id: exomuxWindowId(sessionId) }, {
        column: 0,
        row: 0,
        width: 120,
        height: 36,
      });
      this.status.value = `Terminated ${title}; window cleanup will retry on refresh.`;
      return true;
    }
    this.#runtimes.delete(sessionId);
    this.#lifecycleTails.delete(sessionId);
    disposeTerminalRuntime(runtime);
    this.#publishSessions();
    this.#persistActiveSession();
    this.status.value = `Terminated ${title}.`;
    return true;
  }

  /** Explicitly shuts down the retaining host; unlike UI disposal, this is destructive. */
  async shutdownHost(): Promise<boolean> {
    this.#assertActive();
    const stopped = await this.client.shutdownHost();
    this.status.value = stopped
      ? "Detached host stopped; all of its terminal processes were terminated."
      : "The detached host did not acknowledge shutdown.";
    return stopped;
  }

  /** Cycles all Exomux chrome/default colors while preserving child ANSI colors. */
  cycleTheme(direction: -1 | 1 = 1): ExomuxThemeSpec {
    this.#assertActive();
    const current = EXOMUX_THEMES.findIndex((candidate) => candidate.id === this.themeId.peek());
    const next = (Math.max(0, current) + direction + EXOMUX_THEMES.length) % EXOMUX_THEMES.length;
    this.themeId.value = EXOMUX_THEMES[next]!.id;
    this.themeRevision.value += 1;
    for (const runtime of this.#runtimes.values()) runtime.renderRevision.value += 1;
    this.#persistMetadata();
    this.status.value = `Theme: ${EXOMUX_THEMES[next]!.label}`;
    return EXOMUX_THEMES[next]!;
  }

  /** Cycles the animated desktop background and persists the selection. */
  /**
   * Asks the active background to move to another preset.
   *
   * The preset catalogs live with the fields, which the controller does not
   * own, so this records the request and the desktop applies it to whichever
   * field is on screen — the same shape as the other background signals.
   */
  stepBackgroundPreset(direction: -1 | 1 = 1): void {
    if (this.#disposed) return;
    this.backgroundPresetStep.value += direction;
  }

  cycleBackground(direction: -1 | 1 = 1): ExomuxBackgroundId {
    this.#assertActive();
    const current = EXOMUX_BACKGROUND_IDS.indexOf(this.backgroundId.peek());
    const next = (Math.max(0, current) + direction + EXOMUX_BACKGROUND_IDS.length) % EXOMUX_BACKGROUND_IDS.length;
    this.backgroundId.value = EXOMUX_BACKGROUND_IDS[next]!;
    this.themeRevision.value += 1;
    this.#persistMetadata();
    this.status.value = `Background: ${EXOMUX_BACKGROUND_IDS[next]!}`;
    return EXOMUX_BACKGROUND_IDS[next]!;
  }

  /** Writes exact bytes to the selected attached terminal. */
  async writeActive(data: string | Uint8Array): Promise<boolean> {
    this.#assertActive();
    const runtime = this.activeRuntime();
    return runtime ? await this.writeSession(runtime.sessionId, data) : false;
  }

  /** Writes exact bytes to one ingress-captured daemon session. */
  async writeSession(sessionId: string, data: string | Uint8Array): Promise<boolean> {
    this.#assertActive();
    const runtime = this.#runtimes.get(sessionId);
    if (!runtime || !runtime.attached.peek() || !runtime.summary.peek().running) return false;
    return await this.client.input(sessionId, data);
  }

  /** Reconciles non-destructive visibility changes with daemon attachments. */
  async syncWindowVisibility(_bounds: Rectangle): Promise<void> {
    this.#assertActive();
    const windows = this.windowHost.controller.inspect().windows;
    const operations: Promise<unknown>[] = [];
    for (const runtime of this.#runtimes.values()) {
      const state = windows.find((window) => window.id === exomuxWindowId(runtime.sessionId))?.state;
      if (state === "closed" && runtime.attached.peek() && !this.#killFlights.has(runtime.sessionId)) {
        operations.push(this.#detachRuntime(runtime));
      } else if (state && state !== "closed" && !runtime.attached.peek()) operations.push(this.#attachRuntime(runtime));
    }
    await Promise.allSettled(operations);
    this.#persistActiveSession();
  }

  /** Resizes host PTYs only when projected client geometry actually changes. */
  syncTerminalGeometry(projection: WorkbenchWindowHostProjection): void {
    if (this.#disposed) return;
    for (const window of projection.windows) {
      const sessionId = exomuxSessionIdFromWindow(window.id);
      const runtime = sessionId ? this.#runtimes.get(sessionId) : undefined;
      if (!runtime || window.clientRect.width <= 0 || window.clientRect.height <= 0) continue;
      const columns = clampDimension(window.clientRect.width, runtime.requestedColumns, EXOMUX_MAX_COLUMNS);
      const rows = clampDimension(window.clientRect.height, runtime.requestedRows, EXOMUX_MAX_ROWS);
      runtime.scrollback.setViewportRows(rows);
      if (columns === runtime.requestedColumns && rows === runtime.requestedRows) continue;
      runtime.requestedColumns = columns;
      runtime.requestedRows = rows;
      runtime.screen.resize(columns, rows);
      runtime.renderRevision.value += 1;
      if (runtime.attached.peek() && runtime.summary.peek().running) {
        this.#scheduleTerminalResize(runtime, columns, rows);
      }
    }
  }

  /** Reconciles the local navigator with the authoritative host inventory. */
  async refreshSessions(): Promise<void> {
    this.#assertActive();
    const listed = normalizeSessionList(await this.client.list());
    const listedIds = new Set(listed.map((session) => session.id));
    const listedSummaries = new Map(listed.map((session) => [session.id, session]));
    const candidateRuntimes = new Map<string, ExomuxTerminalRuntime>();
    const createdRuntimes: ExomuxTerminalRuntime[] = [];
    for (const summary of listed) {
      const runtime = this.#runtimes.get(summary.id);
      if (runtime) candidateRuntimes.set(summary.id, runtime);
      else {
        const created = createTerminalRuntime(summary);
        createdRuntimes.push(created);
        candidateRuntimes.set(summary.id, created);
      }
    }
    const reconciliation = await this.#reconcileWindows(
      this.#windowDescriptors(candidateRuntimes, listedSummaries),
    );
    if (!windowReconciliationApplied(reconciliation)) {
      for (const runtime of createdRuntimes) disposeTerminalRuntime(runtime);
      this.status.value = `Session refresh deferred: ${reconciliation.reason ?? reconciliation.status}.`;
      return;
    }
    for (const [sessionId, runtime] of this.#runtimes) {
      if (listedIds.has(sessionId)) continue;
      runtime.attachGeneration += 1;
      this.#lifecycleTails.delete(sessionId);
      disposeTerminalRuntime(runtime);
    }
    this.#runtimes.clear();
    for (const [sessionId, runtime] of candidateRuntimes) {
      this.#setHostSummary(runtime, listedSummaries.get(sessionId)!);
      this.#runtimes.set(sessionId, runtime);
    }
    this.#publishSessions();
    this.status.value = this.#statusSummary();
  }

  /** Content-minimized lifecycle and multiplexer inspection. */
  inspect(): ExomuxControllerInspection {
    const sessions = this.sessions.peek();
    return {
      disposed: this.#disposed,
      connected: this.client.connected,
      themeId: this.themeId.peek(),
      activeSessionId: exomuxSessionIdFromWindow(this.windowHost.controller.inspect().activeWindowId),
      prefixPending: this.prefixPending.peek(),
      status: this.status.peek(),
      sessionCount: sessions.length,
      attachedCount: [...this.#runtimes.values()].filter((runtime) => runtime.attached.peek()).length,
      runningCount: sessions.filter((session) => session.running).length,
      persistenceStatus: this.kernel.persistenceStatus.peek(),
      sessions: sessions.map((session) => ({ ...session })),
    };
  }

  /** Detaches every client view, persists layout, and leaves daemon PTYs alive. */
  dispose(): Promise<void> {
    this.#unsubscribeSessions?.();
    this.#unsubscribeSessions = undefined;
    this.#disposePromise ??= this.#dispose();
    return this.#disposePromise;
  }

  async #initialize(): Promise<void> {
    await this.kernel.ready;
    const restored = normalizeExomuxWorkspaceState(this.kernel.appState.peek());
    this.themeId.value = restored.themeId;
    this.#terminalOrdinal = restored.terminalOrdinal;
    this.savedHosts.value = restored.savedHosts;
    this.sessionHosts.value = restored.sessionHosts;
    this.backgroundId.value = restored.backgroundId;
    this.windowSettings.value = restored.windowSettings;
    this.globalSettings.value = restored.globalSettings;
    this.backgroundSettings.value = restored.backgroundSettings;
    // The durable config file is the source of truth for preferences shared
    // across sessions, so it overrides the per-session layout snapshot.
    const preferences = this.#initialPreferences;
    if (preferences) {
      this.themeId.value = preferences.themeId;
      this.backgroundId.value = preferences.backgroundId;
      this.globalSettings.value = preferences.globalSettings;
      this.backgroundSettings.value = preferences.backgroundSettings;
      this.butterchurnFavorites.value = preferences.butterchurnFavorites;
    }
    for (const [sessionId, settings] of Object.entries(restored.windowSettings)) {
      this.#applyWindowSettings(sessionId, settings);
    }
    this.themeRevision.value += 1;
    // The network panel and settings window open on demand from the menu; a
    // restored session starts with both tucked away regardless of how the
    // last run ended.
    this.windowHost.execute(
      { kind: "minimize", id: EXOMUX_NETWORK_WINDOW_ID },
      { column: 0, row: 0, width: 120, height: 36 },
    );
    this.windowHost.execute(
      { kind: "minimize", id: EXOMUX_SETTINGS_WINDOW_ID },
      { column: 0, row: 0, width: 120, height: 36 },
    );
    const windows = this.windowHost.controller.inspect().windows;
    const activeId = restored.activeSessionId && this.#runtimes.has(restored.activeSessionId)
      ? restored.activeSessionId
      : this.sessions.peek()[0]?.id;
    if (activeId) {
      this.windowHost.execute(
        { kind: "focus", id: exomuxWindowId(activeId) },
        { column: 0, row: 0, width: 120, height: 36 },
      );
    }
    const attaches: Promise<unknown>[] = [];
    for (const runtime of this.#runtimes.values()) {
      const state = windows.find((window) => window.id === exomuxWindowId(runtime.sessionId))?.state;
      if (state !== "closed") attaches.push(this.#attachRuntime(runtime));
    }
    await Promise.allSettled(attaches);
    this.#persistActiveSession();
    this.status.value = this.#statusSummary();
  }

  #attachRuntime(runtime: ExomuxTerminalRuntime): Promise<boolean> {
    let result = false;
    const tail = (this.#lifecycleTails.get(runtime.sessionId) ?? Promise.resolve()).then(async () => {
      if (this.#disposed || runtime.attached.peek() || !this.#runtimes.has(runtime.sessionId)) {
        result = runtime.attached.peek();
        return;
      }
      const generation = ++runtime.attachGeneration;
      try {
        const attachment = await this.client.attach(runtime.sessionId, {
          sinceSequence: runtime.lastSequence,
          onOutput: (frame) => this.#acceptOutput(runtime, frame, generation),
          onSession: (summary) => this.#acceptSession(runtime, summary, generation),
        });
        if (generation !== runtime.attachGeneration || this.#disposed) return;
        if (attachment.truncated) {
          runtime.screen.clear();
          this.#warn(runtime, "Replay buffer was truncated; this view resumed at the retained boundary.");
          runtime.lastSequence = 0;
        }
        this.#setHostSummary(runtime, attachment.session);
        for (const frame of attachment.replay) this.#acceptOutput(runtime, frame, generation);
        runtime.attached.value = true;
        this.#scheduleTerminalResize(runtime, runtime.requestedColumns, runtime.requestedRows);
        runtime.renderRevision.value += 1;
        this.#publishSessions();
        result = true;
      } catch {
        this.#warn(runtime, "The detached terminal could not be attached.");
        runtime.renderRevision.value += 1;
      }
    });
    this.#lifecycleTails.set(runtime.sessionId, tail);
    return tail.then(() => result);
  }

  #detachRuntime(runtime: ExomuxTerminalRuntime): Promise<boolean> {
    let result = false;
    const tail = (this.#lifecycleTails.get(runtime.sessionId) ?? Promise.resolve()).then(async () => {
      if (!runtime.attached.peek()) {
        result = true;
        return;
      }
      runtime.attachGeneration += 1;
      this.#pendingResizes.delete(runtime.sessionId);
      try {
        result = await this.client.detach(runtime.sessionId);
      } catch {
        result = false;
      }
      runtime.attached.value = false;
      runtime.renderRevision.value += 1;
    });
    this.#lifecycleTails.set(runtime.sessionId, tail);
    return tail.then(() => result);
  }

  #acceptOutput(runtime: ExomuxTerminalRuntime, frameValue: ExomuxOutputFrame, generation: number): void {
    if (generation !== runtime.attachGeneration || frameValue.sessionId !== runtime.sessionId) return;
    const sequence = Number.isSafeInteger(frameValue.sequence) ? frameValue.sequence : -1;
    if (sequence <= runtime.lastSequence) return;
    if (runtime.lastSequence > 0 && sequence !== runtime.lastSequence + 1) {
      this.#warn(runtime, `Output sequence gap (${runtime.lastSequence} → ${sequence}).`);
    }
    runtime.lastSequence = sequence;
    runtime.screen.write(frameValue.data);
    if (runtime.outputTaps.size > 0) {
      const text = typeof frameValue.data === "string" ? frameValue.data : new TextDecoder().decode(frameValue.data);
      for (const tap of runtime.outputTaps) tap(text);
    }
    const observedTitle = runtime.screen.inspect().title;
    if (observedTitle !== undefined) {
      const screenTitle = normalizeRuntimeTitle(observedTitle);
      if (screenTitle !== runtime.screenTitle) {
        runtime.screenTitle = screenTitle;
        const summary = runtime.summary.peek();
        const title = screenTitle ?? runtime.hostTitle;
        if (title !== summary.title) {
          runtime.summary.value = normalizeSession({ ...summary, title });
          this.#publishSessions();
        }
      }
    }
    runtime.renderRevision.value += 1;
  }

  #acceptSession(runtime: ExomuxTerminalRuntime, summary: ExomuxSessionSummary, generation: number): void {
    if (generation !== runtime.attachGeneration || summary.id !== runtime.sessionId) return;
    this.#setHostSummary(runtime, summary);
    this.#publishSessions();
  }

  #setHostSummary(runtime: ExomuxTerminalRuntime, summary: ExomuxSessionSummary): void {
    const normalized = normalizeSession(summary);
    runtime.hostTitle = normalized.title;
    runtime.summary.value = runtime.screenTitle === undefined
      ? normalized
      : normalizeSession({ ...normalized, title: runtime.screenTitle });
  }

  #scheduleTerminalResize(runtime: ExomuxTerminalRuntime, columns: number, rows: number): void {
    if (this.#disposed) return;
    this.#pendingResizes.set(runtime.sessionId, { columns, rows });
    if (this.#resizeFlights.has(runtime.sessionId)) return;
    const flight = this.#drainTerminalResize(runtime);
    this.#resizeFlights.set(runtime.sessionId, flight);
    const settle = () => {
      if (this.#resizeFlights.get(runtime.sessionId) !== flight) return;
      this.#resizeFlights.delete(runtime.sessionId);
      if (this.#pendingResizes.has(runtime.sessionId)) {
        this.#scheduleTerminalResize(runtime, runtime.requestedColumns, runtime.requestedRows);
      }
    };
    void flight.then(settle, settle);
  }

  async #drainTerminalResize(runtime: ExomuxTerminalRuntime): Promise<void> {
    while (!this.#disposed) {
      const next = this.#pendingResizes.get(runtime.sessionId);
      this.#pendingResizes.delete(runtime.sessionId);
      if (!next) return;
      if (
        this.#runtimes.get(runtime.sessionId) !== runtime || !runtime.attached.peek() ||
        !runtime.summary.peek().running
      ) return;
      try {
        await this.client.resize(runtime.sessionId, next.columns, next.rows);
      } catch {
        // A later geometry observation may enqueue a fresh, recoverable resize.
      }
    }
  }

  #publishSessions(): void {
    this.sessions.value = [...this.#runtimes.values()]
      .map((runtime) => runtime.summary.peek())
      .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
  }

  async #reconcileWindows(
    descriptors: readonly WorkbenchWindowHostDescriptor<string>[],
  ): Promise<WorkbenchWindowHostResult> {
    let result = this.windowHost.reconcileWindows(descriptors);
    for (let attempt = 1; result.status === "blocked" && attempt < WINDOW_RECONCILE_ATTEMPTS; attempt += 1) {
      await yieldWindowMutationBoundary();
      if (this.#disposed) return result;
      result = this.windowHost.reconcileWindows(descriptors);
    }
    return result;
  }

  #windowDescriptors(
    runtimes: ReadonlyMap<string, ExomuxTerminalRuntime> = this.#runtimes,
    summaries: ReadonlyMap<string, ExomuxSessionSummary> = new Map(),
    floatingSessionId?: string,
  ): WorkbenchWindowHostDescriptor<string>[] {
    return [
      {
        id: EXOMUX_SESSIONS_WINDOW_ID,
        title: "Sessions / Host",
        minWidth: 26,
        minHeight: 9,
        maxWidth: 72,
        maxHeight: 30,
        placement: "floating",
        floatingRect: { column: 2, row: 2, width: 38, height: 16 },
      },
      // The network panel stacks in the normal tier so freshly spawned
      // terminals (which take focus) always land above it.
      {
        id: EXOMUX_NETWORK_WINDOW_ID,
        title: "Network",
        minWidth: 24,
        minHeight: 8,
        maxWidth: 46,
        maxHeight: 42,
        placement: "floating",
        floatingRect: { column: 0, row: 0, width: 32, height: 22 },
      },
      // Settings ride an ordinary floating window — movable, resizable, and
      // stacked like any other window (UX-003): raised on focus, never
      // pinned on top. Born minimized: the menu restores it on demand.
      {
        id: EXOMUX_SETTINGS_WINDOW_ID,
        title: "Exomux settings",
        minWidth: 48,
        minHeight: 16,
        maxWidth: 90,
        maxHeight: 44,
        state: "minimized",
        placement: "floating",
        floatingRect: { column: 5, row: 2, width: 64, height: 24 },
      },
      ...[...runtimes.values()].map((runtime) => ({
        id: exomuxWindowId(runtime.sessionId),
        title: (summaries.get(runtime.sessionId) ?? runtime.summary.peek()).title,
        minWidth: 20,
        minHeight: 6,
        maxWidth: EXOMUX_MAX_COLUMNS + 2,
        maxHeight: EXOMUX_MAX_ROWS + 2,
        ...(runtime.sessionId === floatingSessionId
          ? { placement: "floating" as const, floatingRect: this.#centeredFloatingRect() }
          : {}),
      })),
    ];
  }

  #persistActiveSession(): void {
    this.#persistMetadata(exomuxSessionIdFromWindow(this.windowHost.controller.inspect().activeWindowId));
  }

  #persistMetadata(activeSessionId?: string): void {
    if (this.#disposed) return;
    const current = normalizeExomuxWorkspaceState(this.kernel.appState.peek());
    const selected = activeSessionId === undefined ? current.activeSessionId : activeSessionId;
    const sessionHosts: Record<string, string> = {};
    for (const [sessionId, target] of Object.entries(this.sessionHosts.peek())) {
      if (this.#runtimes.has(sessionId)) sessionHosts[sessionId] = target;
    }
    const windowSettings: Record<string, ExomuxWindowSettings> = {};
    for (const [sessionId, settings] of Object.entries(this.windowSettings.peek())) {
      if (this.#runtimes.has(sessionId)) windowSettings[sessionId] = settings;
    }
    this.kernel.setState({
      schemaVersion: 1,
      themeId: this.themeId.peek(),
      terminalOrdinal: this.#terminalOrdinal,
      ...(selected && this.#runtimes.has(selected) ? { activeSessionId: selected } : {}),
      savedHosts: this.savedHosts.peek(),
      backgroundId: this.backgroundId.peek(),
      sessionHosts,
      windowSettings,
      globalSettings: this.globalSettings.peek(),
      backgroundSettings: this.backgroundSettings.peek(),
    });
    this.#onPreferencesChanged?.({
      themeId: this.themeId.peek(),
      backgroundId: this.backgroundId.peek(),
      globalSettings: this.globalSettings.peek(),
      backgroundSettings: this.backgroundSettings.peek(),
      butterchurnFavorites: this.butterchurnFavorites.peek(),
    });
  }

  #statusSummary(): string {
    const sessions = this.sessions.peek();
    const running = sessions.filter((session) => session.running).length;
    const hidden = [...this.#runtimes.values()].filter((runtime) => !runtime.attached.peek()).length;
    return `${running}/${sessions.length} running · ${hidden} detached · Ctrl-N ? commands`;
  }

  #runtimeRequired(sessionId: string): ExomuxTerminalRuntime {
    if (!isExomuxSessionId(sessionId)) throw new TypeError("Invalid Exomux session id.");
    const runtime = this.#runtimes.get(sessionId);
    if (!runtime) throw new RangeError("Exomux session was not found.");
    return runtime;
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("Exomux controller is disposed.");
  }

  async #dispose(): Promise<void> {
    if (this.#disposed) return;
    this.prefixPending.value = false;
    this.helpVisible.value = false;
    this.pendingKillSessionId.value = undefined;
    this.#pendingResizes.clear();
    for (const timer of this.#warningTimers.values()) clearTimeout(timer);
    this.#warningTimers.clear();
    const detachments = [...this.#runtimes.values()].map((runtime) => this.#detachRuntime(runtime));
    await Promise.allSettled(detachments);
    await this.kernel.dispose();
    this.#disposed = true;
    for (const runtime of this.#runtimes.values()) disposeTerminalRuntime(runtime);
    this.#runtimes.clear();
    this.#lifecycleTails.clear();
    this.#resizeFlights.clear();
    this.theme.dispose();
    this.sessions.dispose();
    this.themeId.dispose();
    this.themeRevision.dispose();
    this.prefixPending.dispose();
    this.helpVisible.dispose();
    this.pendingKillSessionId.dispose();
    this.quitModalVisible.dispose();
    this.startMenuVisible.dispose();
    this.startMenuPreset.dispose();
    this.#tailnetPoller?.dispose();
    this.networkTree.dispose();
    this.networkStatus.dispose();
    this.savedHosts.dispose();
    this.sessionHosts.dispose();
    this.backgroundId.dispose();
    this.backgroundPresetStep.dispose();
    this.butterchurnFavorites.dispose();
    this.pendingScp.dispose();
    this.status.value = "disposed";
    this.status.dispose();
  }
}

class ExomuxClientProvider implements ShowcaseProvider {
  readonly id = "exomux-local-host";
  readonly label = "Exomux local detached terminal host";
  readonly capabilities = Object.freeze([
    Object.freeze({ id: "terminal.multiplex", status: "available" as const }),
    Object.freeze({ id: "window.advanced", status: "available" as const }),
    Object.freeze({ id: "terminal.pty", status: "available" as const }),
    Object.freeze({ id: "terminal.replay", status: "available" as const }),
  ]);
  #disposed = false;

  constructor(readonly client: ExomuxClientPort) {}

  activate(_context: ShowcaseProviderActivationContext): ShowcaseProviderActivationResult {
    if (this.#disposed || !this.client.connected) return { status: "degraded", message: "Client is disconnected." };
    return { status: "ready" };
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await this.client.dispose();
  }
}

function createTerminalRuntime(summary: ExomuxSessionSummary): ExomuxTerminalRuntime {
  const screen = new TerminalScreenController({
    columns: summary.columns,
    rows: summary.rows,
    scrollbackLimit: 2_000,
  });
  return {
    sessionId: summary.id,
    screen,
    scrollback: new TerminalScrollbackController({ screen, viewportRows: summary.rows }),
    summary: new Signal(summary),
    attached: new Signal(false),
    renderRevision: new Signal(0),
    warning: new Signal<string | undefined>(undefined),
    outputTaps: new Set(),
    hostTitle: summary.title,
    lastSequence: 0,
    attachGeneration: 0,
    requestedColumns: summary.columns,
    requestedRows: summary.rows,
  };
}

function disposeTerminalRuntime(runtime: ExomuxTerminalRuntime): void {
  runtime.summary.dispose();
  runtime.attached.dispose();
  runtime.renderRevision.dispose();
  runtime.warning.dispose();
}

function normalizeSessionList(input: readonly ExomuxSessionSummary[]): readonly ExomuxSessionSummary[] {
  if (!Array.isArray(input) || input.length > EXOMUX_MAX_SESSIONS) {
    throw new TypeError("Invalid Exomux session inventory.");
  }
  const seen = new Set<string>();
  return input.map((session) => {
    const normalized = normalizeSession(session);
    if (seen.has(normalized.id)) throw new TypeError("Duplicate Exomux session id.");
    seen.add(normalized.id);
    return normalized;
  });
}

function normalizeSession(session: ExomuxSessionSummary): ExomuxSessionSummary {
  if (!session || typeof session !== "object" || !isExomuxSessionId(session.id)) {
    throw new TypeError("Invalid Exomux session.");
  }
  const status = session.status === "running" || session.status === "exited" || session.status === "failed"
    ? session.status
    : session.running
    ? "running"
    : "failed";
  const title = boundedText(session.title, "terminal", 160);
  const commandLine = boundedText(session.commandLine, "shell", 8_192);
  const sequence = Number.isSafeInteger(session.sequence) && session.sequence >= 0 ? session.sequence : 0;
  const createdAt = finiteTime(session.createdAt);
  const updatedAt = Math.max(createdAt, finiteTime(session.updatedAt));
  return Object.freeze({
    id: session.id,
    title,
    commandLine,
    status,
    running: status === "running" && session.running !== false,
    columns: clampDimension(session.columns, 80, EXOMUX_MAX_COLUMNS),
    rows: clampDimension(session.rows, 24, EXOMUX_MAX_ROWS),
    sequence,
    createdAt,
    updatedAt,
    ...(Number.isSafeInteger(session.exitCode) ? { exitCode: session.exitCode } : {}),
  });
}

function boundedText(value: unknown, fallback: string, maximum: number): string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !value.includes("\0")
    ? value
    : fallback;
}

function normalizeRuntimeTitle(value: string): string | undefined {
  let result = "";
  let pendingSpace = false;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || /\s/u.test(char)) {
      pendingSpace = result.length > 0;
      continue;
    }
    if (pendingSpace && result.length < 160) result += " ";
    pendingSpace = false;
    if (result.length + char.length > 160) break;
    result += char;
  }
  const normalized = result.trim();
  return normalized || undefined;
}

function applicationCommandName(command: string): string {
  const title = normalizeRuntimeTitle(command);
  if (!title) return "terminal";
  return title.includes(" ") ? title : title.split(/[\\/]/).at(-1) ?? title;
}

function finiteTime(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Below this visible fraction a stranded floating window is re-centered rather than nudged. */
const EXOMUX_REFLOW_CENTER_THRESHOLD = 0.6;
/** Cell offset between successive re-centered windows, and how many before the cascade wraps. */
const EXOMUX_REFLOW_CASCADE_STEP = 2;
const EXOMUX_REFLOW_CASCADE_SPAN = 6;

/** Fraction of one floating window's area that is presently inside the viewport. */
function floatingVisibleFraction(rect: Rectangle, bounds: Rectangle): number {
  const area = Math.max(1, rect.width * rect.height);
  const overlapWidth = Math.max(
    0,
    Math.min(rect.column + rect.width, bounds.column + bounds.width) - Math.max(rect.column, bounds.column),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(rect.row + rect.height, bounds.row + bounds.height) - Math.max(rect.row, bounds.row),
  );
  return (overlapWidth * overlapHeight) / area;
}

/** True when a floating rect already sits wholly inside the viewport at its current size. */
function floatingRectFitsIn(rect: Rectangle, bounds: Rectangle): boolean {
  return (
    rect.width <= bounds.width && rect.height <= bounds.height &&
    rect.column >= bounds.column && rect.row >= bounds.row &&
    rect.column + rect.width <= bounds.column + bounds.width &&
    rect.row + rect.height <= bounds.row + bounds.height
  );
}

/** Shrinks a floating rect to fit and nudges it fully on-screen, keeping its position otherwise. */
function nudgeFloatingRectIntoView(rect: Rectangle, bounds: Rectangle): Rectangle {
  const width = Math.max(1, Math.min(rect.width, bounds.width));
  const height = Math.max(1, Math.min(rect.height, bounds.height));
  return {
    column: clampValue(rect.column, bounds.column, bounds.column + bounds.width - width),
    row: clampValue(rect.row, bounds.row, bounds.row + bounds.height - height),
    width,
    height,
  };
}

/** Shrinks a floating rect to fit and centers it in the viewport, offset by a cascade index. */
function centerFloatingRect(rect: Rectangle, bounds: Rectangle, cascadeIndex: number): Rectangle {
  const width = Math.max(1, Math.min(rect.width, bounds.width));
  const height = Math.max(1, Math.min(rect.height, bounds.height));
  const cascade = (cascadeIndex % EXOMUX_REFLOW_CASCADE_SPAN) * EXOMUX_REFLOW_CASCADE_STEP;
  return {
    column: clampValue(
      bounds.column + Math.floor((bounds.width - width) / 2) + cascade,
      bounds.column,
      bounds.column + bounds.width - width,
    ),
    row: clampValue(
      bounds.row + Math.floor((bounds.height - height) / 2) + Math.trunc(cascade / 2),
      bounds.row,
      bounds.row + bounds.height - height,
    ),
    width,
    height,
  };
}

/** Clamps a value into an inclusive range, tolerating an inverted range. */
function clampValue(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(Math.max(low, high), value));
}

/** Integer-normalizes viewport bounds for reflow; undefined when unusable. */
function normalizeReflowBounds(bounds: Rectangle): Rectangle | undefined {
  const width = Math.floor(bounds.width);
  const height = Math.floor(bounds.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  return { column: Math.floor(bounds.column), row: Math.floor(bounds.row), width, height };
}

function clampDimension(value: unknown, fallback: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(maximum, Math.floor(value)))
    : fallback;
}

function windowReconciliationApplied(result: WorkbenchWindowHostResult): boolean {
  return result.status === "applied" || result.status === "unchanged";
}

function yieldWindowMutationBoundary(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function defaultExomuxShell(): string {
  if (Deno.build.os === "windows") return "powershell.exe";
  try {
    return Deno.env.get("SHELL") || "/bin/sh";
  } catch {
    return "/bin/sh";
  }
}
