// Copyright 2023 Im-Beast. MIT license.

import {
  type AsyncStore,
  DiagnosticsCollector,
  type DiagnosticSeverity,
  type MarkupWindowSnapshot,
  MemoryStore,
  Signal,
  TiledWorkspaceController,
  type TiledWorkspaceControllerOptions,
  type TiledWorkspaceInspection,
  WorkbenchWindowHostController,
  type WorkbenchWindowHostControllerOptions,
} from "../../mod.ts";
import { normalizeShowcaseManifest, type ShowcaseManifest } from "./manifest.ts";
import {
  preflightShowcaseProvider,
  type ShowcaseDiagnosticReporter,
  type ShowcaseProvider,
  type ShowcaseProviderPreflight,
  type ShowcaseProviderStatus,
} from "./provider.ts";
import {
  cloneShowcaseJsonValue,
  createShowcaseSession,
  createShowcaseWindowingSnapshot,
  normalizeShowcaseSession,
  parseShowcaseSession,
  type ShowcaseSession,
} from "./session.ts";

/** Construction options for a renderer-neutral showcase kernel. */
export interface ShowcaseKernelOptions<TState, TProvider extends ShowcaseProvider> {
  readonly manifest: ShowcaseManifest;
  readonly provider: TProvider;
  readonly initialState: TState;
  readonly normalizeState?: (value: unknown) => TState;
  readonly store?: AsyncStore<unknown>;
  readonly storageKey?: string;
  readonly workspace?: TiledWorkspaceControllerOptions;
  /** Optional advanced host composed over the exact workspace created by this kernel. */
  readonly advancedWindows?: Omit<WorkbenchWindowHostControllerOptions, "workspace">;
  readonly diagnostics?: DiagnosticsCollector;
  readonly now?: () => number;
  /** Trailing delay for coalescing bursty persistence; flush and dispose bypass it. */
  readonly persistenceDebounceMs?: number;
}

/** Clone-safe lifecycle inspection. App data is deliberately omitted. */
export interface ShowcaseKernelInspection {
  readonly ready: boolean;
  readonly disposing: boolean;
  readonly disposed: boolean;
  readonly routeId: string;
  readonly providerId: string;
  readonly providerStatus: ShowcaseProviderStatus;
  readonly storageKey: string;
  readonly persistenceStatus: "idle" | "writing" | "ready" | "error" | "disposed";
  readonly persistencePending: boolean;
  readonly preflight: ShowcaseProviderPreflight;
  readonly workspace: TiledWorkspaceInspection;
  readonly advancedWindows?: ReturnType<WorkbenchWindowHostController["inspect"]>;
  readonly diagnostics: ReturnType<DiagnosticsCollector["inspect"]>;
}

/**
 * Reusable fixture-first showcase lifecycle and persistence kernel.
 *
 * Manifest host/capability declarations are descriptive; only provider preflight
 * controls activation, and neither mechanism is a security or permission boundary.
 */
/** How far the kernel has got with writing its state to storage. */
export type ShowcasePersistenceStatus = "idle" | "writing" | "ready" | "error" | "disposed";

export class ShowcaseKernel<TState, TProvider extends ShowcaseProvider = ShowcaseProvider> {
  readonly manifest: ShowcaseManifest;
  readonly provider: TProvider;
  readonly workspace: TiledWorkspaceController;
  readonly windowHost?: WorkbenchWindowHostController;
  readonly routeId: Signal<string>;
  readonly appState: Signal<TState>;
  readonly diagnostics: DiagnosticsCollector;
  readonly providerStatus: Signal<ShowcaseProviderStatus> = new Signal<ShowcaseProviderStatus>("inactive");
  readonly persistenceStatus: Signal<ShowcasePersistenceStatus> = new Signal<ShowcasePersistenceStatus>("idle");
  readonly preflight: ShowcaseProviderPreflight;
  readonly ready: Promise<void>;
  readonly signal: AbortSignal;

  readonly #store: AsyncStore<unknown>;
  readonly #storageKey: string;
  readonly #normalizeState: (value: unknown) => TState;
  readonly #now: () => number;
  readonly #persistenceDebounceMs: number;
  readonly #abort = new AbortController();
  readonly #restoreWindows: TiledWorkspaceControllerOptions["windows"];
  #committedWindowSnapshot?: MarkupWindowSnapshot;
  #writeTail: Promise<void> = Promise.resolve();
  #pendingSession?: ShowcaseSession<TState>;
  #persistenceTimer?: ReturnType<typeof setTimeout>;
  #writeActive = false;
  #ready = false;
  #initializing = true;
  #disposing = false;
  #disposed = false;
  #disposePromise?: Promise<void>;

  constructor(options: ShowcaseKernelOptions<TState, TProvider>) {
    this.manifest = normalizeShowcaseManifest(options.manifest);
    this.provider = options.provider;
    this.#validateProviderIdentity();
    this.#normalizeState = options.normalizeState ?? ((value) => value as TState);
    this.#store = options.store ?? new MemoryStore<unknown>();
    this.#storageKey = options.storageKey ?? `showcase:${this.manifest.id}:session`;
    this.#now = options.now ?? Date.now;
    this.#persistenceDebounceMs = normalizePersistenceDebounce(options.persistenceDebounceMs);
    this.diagnostics = options.diagnostics ?? new DiagnosticsCollector();
    this.workspace = new TiledWorkspaceController(options.workspace);
    this.windowHost = options.advancedWindows
      ? new WorkbenchWindowHostController({ ...options.advancedWindows, workspace: this.workspace })
      : undefined;
    this.#committedWindowSnapshot = this.windowHost?.snapshot();
    this.#restoreWindows = options.workspace?.windows;
    this.routeId = new Signal(this.manifest.initialRouteId);
    this.appState = new Signal(this.#normalizeAppState(options.initialState));
    this.preflight = preflightShowcaseProvider(this.manifest, this.provider);
    this.signal = this.#abort.signal;

    const persist = () => this.#enqueuePersistence();
    this.routeId.subscribe(persist, this.signal);
    this.appState.subscribe(persist, this.signal);
    if (this.windowHost) {
      // The host commit revision is the durable boundary for its shared
      // workspace. Raw workspace signals also fire for provisional drag
      // frames, which must never escape into persisted sessions.
      this.windowHost.commitRevision.subscribe(() => {
        this.#committedWindowSnapshot = this.windowHost!.snapshot();
        persist();
      }, this.signal);
    } else {
      this.workspace.state.subscribe(persist, this.signal);
      this.workspace.gap.subscribe(persist, this.signal);
    }
    this.ready = this.#initialize();
  }

  /** Navigates only to a route declared by the versioned manifest. */
  navigate(routeId: string): boolean {
    this.#assertUsable();
    if (!this.manifest.routes.some((route) => route.id === routeId)) {
      this.#report("route-rejected", "warning", "A route change was rejected.");
      return false;
    }
    this.routeId.value = routeId;
    return true;
  }

  /** Replaces app state after domain normalization and defensive JSON cloning. */
  setState(next: TState | ((current: TState) => TState)): void {
    this.#assertUsable();
    const candidate = typeof next === "function"
      ? (next as (current: TState) => TState)(cloneShowcaseJsonValue(this.appState.peek()))
      : next;
    this.appState.value = this.#normalizeAppState(candidate);
  }

  /** Captures a validated, versioned session detached from live signals. */
  snapshot(): ShowcaseSession<TState> {
    // Advanced hosts expose provisional geometry while a pointer gesture is
    // active. Persist only the most recent host commit captured above.
    const windowSnapshot = this.#committedWindowSnapshot;
    const windowing = windowSnapshot ? createShowcaseWindowingSnapshot(windowSnapshot) : undefined;
    return createShowcaseSession({
      manifest: this.manifest,
      providerId: this.provider.id,
      normalizeState: this.#normalizeState,
      routeId: this.routeId.peek(),
      workspace: windowSnapshot?.workspace ?? this.workspace.snapshot(),
      ...(windowing === undefined ? {} : { windowing }),
      appState: this.appState.peek(),
      savedAt: this.#safeNow(),
    });
  }

  /** Waits for initialization and persists the latest complete session. */
  async flush(): Promise<void> {
    await this.ready;
    this.#assertUsable();
    this.#enqueuePersistence(true);
    await this.#awaitPersistence();
  }

  /** Returns content-minimized lifecycle and workspace diagnostics. */
  inspect(): ShowcaseKernelInspection {
    return {
      ready: this.#ready,
      disposing: this.#disposing,
      disposed: this.#disposed,
      routeId: this.routeId.peek(),
      providerId: this.provider.id,
      providerStatus: this.providerStatus.peek(),
      storageKey: this.#storageKey,
      persistenceStatus: this.persistenceStatus.peek(),
      persistencePending: this.#persistenceTimer !== undefined || this.#writeActive ||
        this.#pendingSession !== undefined,
      preflight: this.preflight,
      workspace: this.workspace.inspect(),
      advancedWindows: this.windowHost?.inspect(),
      diagnostics: this.diagnostics.inspect(),
    };
  }

  /** Aborts work, persists a final snapshot, and disposes owned resources exactly once. */
  dispose(): Promise<void> {
    this.#disposePromise ??= this.#dispose();
    return this.#disposePromise;
  }

  async #initialize(): Promise<void> {
    try {
      await this.#restore();
      if (!this.preflight.ok) {
        this.providerStatus.value = "blocked";
        this.#report("provider-preflight-blocked", "warning", "Provider activation was blocked by preflight.", {
          missingRequired: this.preflight.missingRequired.length,
          unavailableRequired: this.preflight.unavailableRequired.length,
        });
        return;
      }

      this.providerStatus.value = "activating";
      try {
        const result = await this.provider.activate({
          signal: this.signal,
          diagnostics: this.#providerDiagnostics(),
        });
        if (!result || (result.status !== "ready" && result.status !== "degraded")) {
          throw new TypeError("Invalid provider activation result.");
        }
        const degraded = result.status === "degraded" || this.preflight.degraded;
        this.providerStatus.value = degraded ? "degraded" : "ready";
        if (degraded) {
          this.#report("provider-degraded", "warning", "The provider is running with degraded capabilities.");
        }
      } catch {
        this.providerStatus.value = "failed";
        if (!this.#disposing) {
          this.#report("provider-activation-failed", "error", "Provider activation failed.");
        }
      }
    } finally {
      this.#initializing = false;
      this.#ready = true;
      this.#enqueuePersistence();
    }
  }

  async #restore(): Promise<void> {
    let stored: unknown;
    try {
      stored = await this.#store.get(this.#storageKey);
    } catch {
      this.#report("session-load-failed", "warning", "The saved session could not be loaded.");
      return;
    }
    if (stored === undefined) return;

    try {
      const options = {
        manifest: this.manifest,
        providerId: this.provider.id,
        normalizeState: this.#normalizeState,
      };
      const session = typeof stored === "string"
        ? parseShowcaseSession(stored, options)
        : normalizeShowcaseSession(stored, options);
      if (this.windowHost) {
        const result = session.windowing
          ? this.windowHost.restoreSnapshot({ ...session.windowing, workspace: session.workspace })
          : this.windowHost.restoreLegacyWorkspace(session.workspace);
        if (!result.ok) throw new TypeError("Saved advanced window state was rejected.");
      } else {
        this.workspace.restore(session.workspace, this.#restoreWindows);
      }
      // Apply content state only after the structural restore succeeds so a
      // host/schema mismatch cannot leak a route or document from a rejected session.
      this.routeId.value = session.routeId;
      this.appState.value = cloneShowcaseJsonValue(session.appState);
    } catch {
      this.#report("session-restore-rejected", "warning", "The saved session was rejected and defaults were restored.");
    }
  }

  #enqueuePersistence(immediate = false): void {
    if (this.#initializing || this.#disposed) return;
    if (this.#persistenceTimer !== undefined) {
      clearTimeout(this.#persistenceTimer);
      this.#persistenceTimer = undefined;
    }
    if (!immediate && this.#persistenceDebounceMs > 0) {
      this.#persistenceTimer = setTimeout(() => {
        this.#persistenceTimer = undefined;
        this.#capturePendingPersistence();
      }, this.#persistenceDebounceMs);
      return;
    }
    this.#capturePendingPersistence();
  }

  #capturePendingPersistence(): void {
    let session: ShowcaseSession<TState>;
    try {
      session = this.snapshot();
    } catch {
      this.persistenceStatus.value = "error";
      this.#report("session-snapshot-failed", "warning", "The current session could not be normalized.");
      return;
    }
    // Latest-wins coalescing bounds bursty editor updates to one in-flight and
    // one pending complete snapshot. Flush still waits for the newest state.
    this.#pendingSession = session;
    if (this.#writeActive) return;
    this.#writeActive = true;
    this.#writeTail = this.#drainPersistence();
  }

  async #drainPersistence(): Promise<void> {
    this.persistenceStatus.value = "writing";
    try {
      while (this.#pendingSession !== undefined) {
        const session = this.#pendingSession;
        this.#pendingSession = undefined;
        try {
          await this.#store.set(this.#storageKey, session);
          this.persistenceStatus.value = this.#pendingSession === undefined ? "ready" : "writing";
        } catch {
          this.persistenceStatus.value = "error";
          this.#report("session-persist-failed", "warning", "The current session could not be persisted.");
        }
      }
    } finally {
      this.#writeActive = false;
      if (this.#pendingSession !== undefined && !this.#disposed) {
        this.#writeActive = true;
        this.#writeTail = this.#drainPersistence();
      }
    }
  }

  async #awaitPersistence(): Promise<void> {
    while (this.#writeActive || this.#pendingSession !== undefined) {
      const tail = this.#writeTail;
      await tail;
      if (tail === this.#writeTail && !this.#writeActive && this.#pendingSession === undefined) return;
    }
  }

  async #dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposing = true;
    this.#abort.abort();
    try {
      await this.ready;
      this.#enqueuePersistence(true);
      await this.#awaitPersistence();
      try {
        await this.provider.dispose();
      } catch {
        this.#report("provider-dispose-failed", "warning", "Provider disposal failed.");
      }
    } finally {
      if (this.#persistenceTimer !== undefined) {
        clearTimeout(this.#persistenceTimer);
        this.#persistenceTimer = undefined;
      }
      this.providerStatus.value = "disposed";
      this.windowHost?.dispose();
      this.workspace.dispose();
      this.routeId.dispose();
      this.appState.dispose();
      this.providerStatus.dispose();
      this.persistenceStatus.value = "disposed";
      this.persistenceStatus.dispose();
      this.#disposed = true;
      this.#disposing = false;
    }
  }

  #providerDiagnostics(): ShowcaseDiagnosticReporter {
    return {
      report: (input) => {
        const code = typeof input?.code === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(input.code)
          ? input.code
          : "invalid-code";
        const severity: DiagnosticSeverity = input?.severity === "debug" || input?.severity === "info" ||
            input?.severity === "warning" || input?.severity === "error"
          ? input.severity
          : "info";
        this.#report("provider-reported", severity, "The provider reported a lifecycle diagnostic.", {
          providerCode: code,
        });
      },
    };
  }

  #report(
    code: string,
    severity: DiagnosticSeverity,
    message: string,
    context?: Record<string, string | number | boolean>,
  ): void {
    this.diagnostics.report({ source: "showcase-kernel", code, severity, message, context });
  }

  #normalizeAppState(value: unknown): TState {
    let normalized: TState;
    try {
      normalized = this.#normalizeState(cloneShowcaseJsonValue(value));
      return cloneShowcaseJsonValue(normalized);
    } catch {
      throw new TypeError("Invalid showcase app state.");
    }
  }

  #validateProviderIdentity(): void {
    if (
      typeof this.provider?.id !== "string" ||
      !/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/.test(this.provider.id) ||
      typeof this.provider.label !== "string" || this.provider.label.length === 0 || this.provider.label.length > 160
    ) {
      throw new TypeError("Invalid showcase provider identity.");
    }
  }

  #safeNow(): number {
    try {
      const value = this.#now();
      return Number.isFinite(value) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value))) : 0;
    } catch {
      return 0;
    }
  }

  #assertUsable(): void {
    if (this.#disposing || this.#disposed) throw new Error("Showcase kernel is disposed.");
  }
}

function normalizePersistenceDebounce(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(60_000, Math.max(0, Math.trunc(value)));
}
