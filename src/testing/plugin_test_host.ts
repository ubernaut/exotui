// Copyright 2023 Im-Beast. MIT license.

// PLG-010: the headless plugin test host. Plugin authors verify the
// whole install-to-dispose arc against FAKES — a capability broker
// seeded with test services, the PLG-007 transactional lifecycle over an
// in-memory contribution registry with per-phase fault injection, a
// scripted RPC transport for PLG-005 proxy assertions, and PLG-001
// manifest contract validation — all pure in-memory objects. This module
// touches no Deno API at all (a contract test greps the source), so a
// plugin's own test suite runs with zero ambient permissions.

import { parsePluginManifest, type PluginManifest } from "../app/plugin_manifest.ts";
import { createPluginCapabilityBroker, type PluginCapabilityBroker } from "../app/plugin_capabilities.ts";
import {
  createHostContributionRegistry,
  disablePlugin,
  enablePlugin,
  type HostContributionRegistry,
  installPlugin,
  type LifecyclePlugin,
  type LifecycleResult,
  uninstallPlugin,
} from "../app/plugin_lifecycle.ts";
import type { ContributionTransport } from "../app/plugin_rpc_proxies.ts";

/** Lifecycle phases fault injection can target. */
export type LifecyclePhase = "install" | "enable" | "disable" | "uninstall";

/** One phase's outcome in a lifecycle run. */
export interface PhaseReport {
  readonly phase: LifecyclePhase;
  readonly result: LifecycleResult;
  /** Registry snapshot after the phase settled. */
  readonly snapshot: string;
}

/** The full install-to-dispose report. */
export interface LifecycleRunReport {
  readonly phases: readonly PhaseReport[];
  /** true when a faulted phase restored its pre-phase snapshot exactly. */
  readonly rollbackClean: boolean;
  /** true when the registry ended empty (full arc completed). */
  readonly fullyDisposed: boolean;
}

/** A scripted RPC transport for proxy assertions. */
export interface ScriptedTransport {
  readonly transport: ContributionTransport;
  /** Scripts the reply for one method (or a rejection). */
  reply(method: string, value: unknown): void;
  fail(method: string, error: string): void;
  /** Every call the plugin side made, in order. */
  calls(): readonly { method: string; args: unknown }[];
}

/** The headless host. */
export class PluginTestHost {
  readonly #manifestJson: string;
  readonly #broker: PluginCapabilityBroker;
  readonly #registry: HostContributionRegistry;

  constructor(options: { readonly manifestJson: string; readonly capabilities?: Readonly<Record<string, unknown>> }) {
    this.#manifestJson = options.manifestJson;
    this.#broker = createPluginCapabilityBroker();
    for (const [capability, service] of Object.entries(options.capabilities ?? {})) {
      this.#broker.provide(capability, service);
    }
    this.#registry = createHostContributionRegistry();
  }

  /** PLG-001 contract validation — throws with the exact path on breach. */
  manifest(): PluginManifest {
    return parsePluginManifest(this.#manifestJson);
  }

  /** The fake-seeded capability broker (SEC-003 semantics). */
  broker(): PluginCapabilityBroker {
    return this.#broker;
  }

  registry(): HostContributionRegistry {
    return this.#registry;
  }

  /**
   * Runs install → enable → disable → uninstall with optional fault
   * injection in one phase. A faulted phase must leave the registry at
   * its pre-phase snapshot; later phases are skipped.
   */
  runLifecycle(
    plugin: LifecyclePlugin,
    options: { readonly faultPhase?: LifecyclePhase } = {},
  ): LifecycleRunReport {
    const emptySnapshot = this.#registry.snapshot();
    const subject: LifecyclePlugin = options.faultPhase === undefined ? plugin : {
      ...plugin,
      activate: (contribution) => {
        if (options.faultPhase === "enable") throw new Error("injected enable fault");
        plugin.activate?.(contribution);
      },
      deactivate: (contribution) => {
        if (options.faultPhase === "disable") throw new Error("injected disable fault");
        plugin.deactivate?.(contribution);
      },
    };
    const faultyInstall: LifecyclePlugin = options.faultPhase === "install"
      ? { ...subject, contributions: [...subject.contributions, ...subject.contributions] } // duplicate = fault
      : subject;
    const faultyUninstall: LifecyclePlugin = options.faultPhase === "uninstall"
      ? { ...subject, contributions: [{ kind: "ghost", name: "missing", value: 0 }, ...subject.contributions] }
      : subject;

    const phases: PhaseReport[] = [];
    let rollbackClean = true;
    const run = (phase: LifecyclePhase, execute: () => LifecycleResult): boolean => {
      const before = this.#registry.snapshot();
      const result = execute();
      const snapshot = this.#registry.snapshot();
      phases.push({ phase, result, snapshot });
      if (!result.ok && snapshot !== before) rollbackClean = false;
      return result.ok;
    };

    const arc = run("install", () => installPlugin(this.#registry, faultyInstall)) &&
      run("enable", () => enablePlugin(this.#registry, subject)) &&
      run("disable", () => disablePlugin(this.#registry, subject)) &&
      run("uninstall", () => uninstallPlugin(this.#registry, faultyUninstall));

    return {
      phases,
      rollbackClean,
      fullyDisposed: arc && this.#registry.snapshot() === emptySnapshot,
    };
  }

  /** A scripted transport for RPC proxy assertions. */
  scriptedTransport(): ScriptedTransport {
    const replies = new Map<string, { kind: "reply"; value: unknown } | { kind: "fail"; error: string }>();
    const calls: { method: string; args: unknown }[] = [];
    return {
      transport: (method, args) => {
        calls.push({ method, args });
        const scripted = replies.get(method);
        if (!scripted) return Promise.reject(new Error(`no scripted reply for "${method}"`));
        return scripted.kind === "reply" ? Promise.resolve(scripted.value) : Promise.reject(new Error(scripted.error));
      },
      reply: (method, value) => void replies.set(method, { kind: "reply", value }),
      fail: (method, error) => void replies.set(method, { kind: "fail", error }),
      calls: () => [...calls],
    };
  }
}

/** Creates a headless plugin test host. */
export function createPluginTestHost(
  options: { readonly manifestJson: string; readonly capabilities?: Readonly<Record<string, unknown>> },
): PluginTestHost {
  return new PluginTestHost(options);
}
