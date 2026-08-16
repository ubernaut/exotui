// Copyright 2023 Im-Beast. MIT license.

// PLG-006: plugins load lazily, and only when THEIR event fires. A plugin
// declares activation events ("onStartup", "onCommand:git.blame",
// "onRoute:/settings", "onFileType:ts", "onLanguage:rust"); firing an
// event activates exactly the matching plugins — unrelated plugins are
// never loaded. Activation is single-flight per plugin (a fire during an
// in-flight activation awaits the same attempt, it never double-runs),
// and a FAILED activation stays failed: further fires skip it unless the
// plugin's declared retry policy still has attempts left or the host
// explicitly resets it.

/** Recognized activation-event prefixes. */
export type ActivationEventKind = "onStartup" | "onCommand" | "onRoute" | "onFileType" | "onLanguage";

/** One lazily activated plugin. */
export interface LazyPlugin {
  readonly id: string;
  /** e.g. ["onCommand:git.blame", "onFileType:ts", "onStartup"]. */
  readonly activationEvents: readonly string[];
  activate(): Promise<void> | void;
  /** How many activation attempts policy allows (default 1). */
  readonly maxAttempts?: number;
}

/** One plugin's activation state. */
export type ActivationState = "registered" | "activating" | "active" | "failed";

/** One fire's outcome. */
export interface ActivationFireResult {
  readonly event: string;
  readonly activated: readonly string[];
  /** Matched but already active. */
  readonly alreadyActive: readonly string[];
  /** Matched but failed (now or previously, out of attempts). */
  readonly failed: readonly { readonly id: string; readonly error: string }[];
}

interface PluginEntry {
  readonly plugin: LazyPlugin;
  state: ActivationState;
  attempts: number;
  lastError?: string;
  inflight?: Promise<void>;
}

/** The activation coordinator. */
export class PluginActivationCoordinator {
  readonly #entries = new Map<string, PluginEntry>();

  register(plugin: LazyPlugin): void {
    this.#entries.set(plugin.id, { plugin, state: "registered", attempts: 0 });
  }

  /** Fires one event; only matching plugins are touched at all. */
  async fire(event: string): Promise<ActivationFireResult> {
    const activated: string[] = [];
    const alreadyActive: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const entry of this.#entries.values()) {
      if (!entry.plugin.activationEvents.includes(event)) continue;
      if (entry.state === "active") {
        alreadyActive.push(entry.plugin.id);
        continue;
      }
      if (entry.state === "failed" && entry.attempts >= (entry.plugin.maxAttempts ?? 1)) {
        failed.push({ id: entry.plugin.id, error: entry.lastError ?? "activation failed" });
        continue;
      }
      try {
        await this.#activate(entry);
        activated.push(entry.plugin.id);
      } catch (error) {
        failed.push({ id: entry.plugin.id, error: String(error) });
      }
    }
    return { event, activated, alreadyActive, failed };
  }

  /** Explicit host reset: grants a failed plugin a fresh attempt budget. */
  reset(id: string): boolean {
    const entry = this.#entries.get(id);
    if (!entry || entry.state !== "failed") return false;
    entry.state = "registered";
    entry.attempts = 0;
    entry.lastError = undefined;
    return true;
  }

  state(id: string): ActivationState | undefined {
    return this.#entries.get(id)?.state;
  }

  inspect(): readonly { id: string; state: ActivationState; attempts: number; lastError?: string }[] {
    return [...this.#entries.values()].map((entry) => ({
      id: entry.plugin.id,
      state: entry.state,
      attempts: entry.attempts,
      lastError: entry.lastError,
    }));
  }

  /** Single-flight: concurrent fires share one attempt. */
  #activate(entry: PluginEntry): Promise<void> {
    if (entry.inflight) return entry.inflight;
    entry.state = "activating";
    entry.attempts += 1;
    entry.inflight = Promise.resolve()
      .then(() => entry.plugin.activate())
      .then(() => {
        entry.state = "active";
      })
      .catch((error) => {
        entry.state = "failed";
        entry.lastError = String(error);
        throw error;
      })
      .finally(() => {
        entry.inflight = undefined;
      });
    return entry.inflight;
  }
}

/** Creates a plugin activation coordinator. */
export function createPluginActivationCoordinator(): PluginActivationCoordinator {
  return new PluginActivationCoordinator();
}
