// Copyright 2023 Im-Beast. MIT license.

// PLG-008: plugin state migrates BEFORE activation, under a backup. An
// upgrade walks the declared migration chain from the stored version to
// the target, keeps the prior { version, state } pair as a backup, and
// only then offers the migrated state to the new plugin's activation.
// The activation may accept, DECLINE (hot upgrade impossible — request a
// restart), or throw; decline and failure both restore the backup so the
// prior plugin/state pair keeps running, and every outcome names itself.

/** One versioned state record. */
export interface VersionedState {
  readonly version: number;
  readonly state: unknown;
}

/** One migration step. */
export interface StateMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(state: unknown): unknown;
}

/** The new plugin's activation verdict. */
export type ActivationVerdict = "ok" | "decline-restart";

/** An upgrade outcome. */
export type UpgradeResult =
  | { readonly ok: true; readonly fromVersion: number; readonly toVersion: number }
  | {
    readonly ok: false;
    readonly reason: "missing-migration" | "migration-failed" | "activation-failed" | "declined";
    readonly detail: string;
    /** true when the prior plugin/state pair was restored. */
    readonly restored: boolean;
    /** Set when the plugin asked for a restart instead of a hot upgrade. */
    readonly restartRequested?: boolean;
  };

/** The per-plugin state store with backup semantics. */
export class PluginStateStore {
  readonly #states = new Map<string, VersionedState>();
  readonly #backups = new Map<string, VersionedState>();

  get(pluginId: string): VersionedState | undefined {
    return this.#states.get(pluginId);
  }

  set(pluginId: string, record: VersionedState): void {
    this.#states.set(pluginId, record);
  }

  /** The retained backup from the most recent upgrade attempt. */
  backup(pluginId: string): VersionedState | undefined {
    return this.#backups.get(pluginId);
  }

  /**
   * Upgrades one plugin's state to `targetVersion` and activates the new
   * plugin with it. Migration precedes activation; decline or failure
   * restores the backup.
   */
  upgrade(
    pluginId: string,
    targetVersion: number,
    migrations: readonly StateMigration[],
    activate: (state: unknown) => ActivationVerdict,
  ): UpgradeResult {
    const current = this.#states.get(pluginId) ?? { version: 0, state: undefined };
    this.#backups.set(pluginId, current);

    // Walk the chain from the stored version to the target.
    let cursor = current;
    while (cursor.version < targetVersion) {
      const step = migrations.find((migration) => migration.fromVersion === cursor.version);
      if (!step || step.toVersion > targetVersion) {
        return {
          ok: false,
          reason: "missing-migration",
          detail: `no migration from version ${cursor.version} toward ${targetVersion}`,
          restored: true, // nothing was changed yet
        };
      }
      try {
        cursor = { version: step.toVersion, state: step.migrate(cursor.state) };
      } catch (error) {
        return {
          ok: false,
          reason: "migration-failed",
          detail: `migration ${step.fromVersion}->${step.toVersion} failed: ${String(error)}`,
          restored: true,
        };
      }
    }

    // Migration done; only now does the new plugin activate on it.
    let verdict: ActivationVerdict;
    try {
      verdict = activate(cursor.state);
    } catch (error) {
      this.#states.set(pluginId, current); // prior pair restored
      return {
        ok: false,
        reason: "activation-failed",
        detail: String(error),
        restored: true,
      };
    }
    if (verdict === "decline-restart") {
      this.#states.set(pluginId, current);
      return {
        ok: false,
        reason: "declined",
        detail: "plugin declined hot upgrade and requested restart",
        restored: true,
        restartRequested: true,
      };
    }
    this.#states.set(pluginId, cursor);
    return { ok: true, fromVersion: current.version, toVersion: cursor.version };
  }
}

/** Creates a plugin state store. */
export function createPluginStateStore(): PluginStateStore {
  return new PluginStateStore();
}
