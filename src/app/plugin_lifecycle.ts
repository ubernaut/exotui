// Copyright 2023 Im-Beast. MIT license.

// PLG-007: every lifecycle operation is a TRANSACTION over the host
// contribution registry. Install registers contributions one step at a
// time while recording each step's undo; a fault at any step runs the
// recorded undos in reverse and the registry is byte-identical to the
// state before the transaction began. Enable and disable activate and
// deactivate contributions with the same discipline, and uninstall
// removes them with per-step rollback re-adding what was already
// removed. Snapshots make "identical to a known state" a checkable
// equality, not a claim.

/** One declared contribution. */
export interface PluginContribution {
  readonly kind: string;
  readonly name: string;
  readonly value: unknown;
}

/** One plugin's lifecycle definition. */
export interface LifecyclePlugin {
  readonly id: string;
  readonly contributions: readonly PluginContribution[];
  /** Optional per-contribution activation (throwing = fault). */
  activate?(contribution: PluginContribution): void;
  deactivate?(contribution: PluginContribution): void;
}

/** A lifecycle transaction outcome. */
export type LifecycleResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly step: number; readonly error: string; readonly rolledBack: true };

/** The host contribution registry. */
export class HostContributionRegistry {
  readonly #entries = new Map<string, { value: unknown; active: boolean; pluginId: string }>();

  /** A deterministic snapshot for state-identity assertions. */
  snapshot(): string {
    const entries = [...this.#entries.entries()]
      .map(([key, entry]) => `${key}=${JSON.stringify(entry.value)}:${entry.active ? "on" : "off"}:${entry.pluginId}`)
      .sort();
    return entries.join("|");
  }

  has(kind: string, name: string): boolean {
    return this.#entries.has(`${kind}:${name}`);
  }

  active(kind: string, name: string): boolean {
    return this.#entries.get(`${kind}:${name}`)?.active === true;
  }

  /** @internal lifecycle-only mutators */
  _add(pluginId: string, contribution: PluginContribution): void {
    const key = `${contribution.kind}:${contribution.name}`;
    if (this.#entries.has(key)) throw new Error(`contribution "${key}" already registered`);
    this.#entries.set(key, { value: contribution.value, active: false, pluginId });
  }

  _remove(contribution: PluginContribution): { value: unknown; active: boolean; pluginId: string } | undefined {
    const key = `${contribution.kind}:${contribution.name}`;
    const entry = this.#entries.get(key);
    this.#entries.delete(key);
    return entry;
  }

  _restore(contribution: PluginContribution, entry: { value: unknown; active: boolean; pluginId: string }): void {
    this.#entries.set(`${contribution.kind}:${contribution.name}`, entry);
  }

  _setActive(contribution: PluginContribution, active: boolean): void {
    const entry = this.#entries.get(`${contribution.kind}:${contribution.name}`);
    if (entry) entry.active = active;
  }
}

/** Runs steps transactionally: a fault reverses completed undos. */
function transaction(
  steps: readonly { run(): void; undo(): void }[],
): LifecycleResult {
  const undos: Array<() => void> = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    try {
      step.run();
      undos.push(step.undo);
    } catch (error) {
      for (const undo of undos.reverse()) undo();
      return { ok: false, step: index, error: String(error), rolledBack: true };
    }
  }
  return { ok: true };
}

/** Installs: all contributions registered (inactive) or none. */
export function installPlugin(registry: HostContributionRegistry, plugin: LifecyclePlugin): LifecycleResult {
  return transaction(plugin.contributions.map((contribution) => ({
    run: () => registry._add(plugin.id, contribution),
    undo: () => void registry._remove(contribution),
  })));
}

/** Enables: every contribution activates or none stay active. */
export function enablePlugin(registry: HostContributionRegistry, plugin: LifecyclePlugin): LifecycleResult {
  return transaction(plugin.contributions.map((contribution) => ({
    run: () => {
      plugin.activate?.(contribution);
      registry._setActive(contribution, true);
    },
    undo: () => {
      plugin.deactivate?.(contribution);
      registry._setActive(contribution, false);
    },
  })));
}

/** Disables: the reverse, with reactivation as rollback. */
export function disablePlugin(registry: HostContributionRegistry, plugin: LifecyclePlugin): LifecycleResult {
  return transaction(plugin.contributions.map((contribution) => ({
    run: () => {
      plugin.deactivate?.(contribution);
      registry._setActive(contribution, false);
    },
    undo: () => {
      plugin.activate?.(contribution);
      registry._setActive(contribution, true);
    },
  })));
}

/** Uninstalls: removals roll back by restoring removed entries. */
export function uninstallPlugin(registry: HostContributionRegistry, plugin: LifecyclePlugin): LifecycleResult {
  const removed = new Map<string, { value: unknown; active: boolean; pluginId: string }>();
  return transaction(plugin.contributions.map((contribution) => ({
    run: () => {
      const entry = registry._remove(contribution);
      if (!entry) throw new Error(`contribution "${contribution.kind}:${contribution.name}" is not registered`);
      removed.set(`${contribution.kind}:${contribution.name}`, entry);
    },
    undo: () => {
      const entry = removed.get(`${contribution.kind}:${contribution.name}`);
      if (entry) registry._restore(contribution, entry);
    },
  })));
}

/** Creates a host contribution registry. */
export function createHostContributionRegistry(): HostContributionRegistry {
  return new HostContributionRegistry();
}
