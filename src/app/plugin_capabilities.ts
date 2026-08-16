// Copyright 2023 Im-Beast. MIT license.

// SEC-003: plugins get per-instance capability GRANTS, not the host's
// service registry. A plugin declares the capabilities it needs (plus
// optional ones); the host provides services per capability and may deny
// any grant per instance; install receives a frozen context whose OWN
// enumerable properties are exactly the granted intersection — an
// undeclared capability is structurally absent (`in` is false, keys omit
// it, the prototype is null), so no typed slot, command surface, or
// install hook can discover it. Missing REQUIRED capabilities refuse the
// install fail-closed with the missing list named.

/** A capability name; slots use the `slot:<name>` form. */
export type PluginCapabilityName = string;

/** A capability-scoped plugin definition. */
export interface CapabilityPluginDefinition {
  readonly id: string;
  /** Capabilities install cannot run without. */
  readonly capabilities: readonly PluginCapabilityName[];
  /** Capabilities used when available, skipped silently when not. */
  readonly optionalCapabilities?: readonly PluginCapabilityName[];
  install(context: Readonly<Record<PluginCapabilityName, unknown>>): (() => void) | void;
}

/** One install outcome. */
export type PluginInstallResult =
  | { readonly ok: true; readonly instanceId: string; readonly granted: readonly string[]; dispose(): void }
  | { readonly ok: false; readonly missing: readonly string[] };

/** The host-side broker. */
export class PluginCapabilityBroker {
  readonly #providers = new Map<PluginCapabilityName, unknown>();
  #instanceCounter = 0;

  /** Registers the host service backing one capability. */
  provide(capability: PluginCapabilityName, service: unknown): void {
    this.#providers.set(capability, service);
  }

  /** Capabilities the host currently backs. */
  provided(): readonly PluginCapabilityName[] {
    return [...this.#providers.keys()];
  }

  /**
   * Installs one plugin instance. `deny` removes specific grants for THIS
   * instance; two installs of the same definition are independent.
   */
  install(
    definition: CapabilityPluginDefinition,
    options: { readonly deny?: readonly PluginCapabilityName[] } = {},
  ): PluginInstallResult {
    const denied = new Set(options.deny ?? []);
    const missing = definition.capabilities.filter(
      (capability) => denied.has(capability) || !this.#providers.has(capability),
    );
    if (missing.length > 0) return { ok: false, missing };

    // The context: null prototype, own enumerable props = granted set only.
    const context = Object.create(null) as Record<PluginCapabilityName, unknown>;
    const granted: string[] = [];
    for (const capability of definition.capabilities) {
      context[capability] = this.#providers.get(capability);
      granted.push(capability);
    }
    for (const capability of definition.optionalCapabilities ?? []) {
      if (denied.has(capability) || !this.#providers.has(capability)) continue;
      context[capability] = this.#providers.get(capability);
      granted.push(capability);
    }
    Object.freeze(context);

    const cleanup = definition.install(context);
    const instanceId = `${definition.id}#${++this.#instanceCounter}`;
    let disposed = false;
    return {
      ok: true,
      instanceId,
      granted,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        cleanup?.();
      },
    };
  }
}

/** Creates a plugin capability broker. */
export function createPluginCapabilityBroker(): PluginCapabilityBroker {
  return new PluginCapabilityBroker();
}
