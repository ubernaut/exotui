// Copyright 2023 Im-Beast. MIT license.

// PLG-003: plugin dependencies resolve as a DAG with names for every
// failure. Hard dependencies must exist and satisfy their range —
// missing or conflicting ones exclude the plugin AND its dependents
// transitively, each exclusion carrying a diagnostic; cycles exclude
// every member with the cycle spelled out; optional peers produce only
// a diagnostic (the plugin activates without the peer) and one failed
// optional peer never blocks unrelated plugins. Activation order is a
// stable Kahn topological sort: dependencies first, declaration order
// breaking ties, identical inputs always producing identical order.

import { hostApiSatisfies } from "./plugin_manifest.ts";

/** One plugin's dependency declaration. */
export interface PluginDependencyNode {
  readonly id: string;
  readonly version: string;
  /** Hard dependencies: must exist and satisfy the range. */
  readonly dependencies?: readonly { readonly id: string; readonly range: string }[];
  /** Optional peers: used when available, skipped with a diagnostic. */
  readonly optionalPeers?: readonly { readonly id: string; readonly range: string }[];
}

/** One resolution diagnostic. */
export interface DependencyDiagnostic {
  readonly pluginId: string;
  readonly kind:
    | "missing-dependency"
    | "version-conflict"
    | "cycle"
    | "optional-peer-unavailable"
    | "dependent-excluded";
  readonly detail: string;
}

/** The resolution result. */
export interface DependencyResolution {
  /** Stable activation order over the activatable plugins. */
  readonly activationOrder: readonly string[];
  /** Plugins that cannot activate, with reasons. */
  readonly excluded: readonly { readonly id: string; readonly reason: string }[];
  readonly diagnostics: readonly DependencyDiagnostic[];
}

/** Resolves dependency order and exclusions for one plugin set. */
export function resolvePluginDependencies(nodes: readonly PluginDependencyNode[]): DependencyResolution {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const diagnostics: DependencyDiagnostic[] = [];
  const excluded = new Map<string, string>();

  // Pass 1: hard-dependency existence and version checks.
  for (const node of nodes) {
    for (const dependency of node.dependencies ?? []) {
      const target = byId.get(dependency.id);
      if (!target) {
        diagnostics.push({
          pluginId: node.id,
          kind: "missing-dependency",
          detail: `dependency "${dependency.id}" is not installed`,
        });
        excluded.set(node.id, `missing dependency "${dependency.id}"`);
      } else if (!hostApiSatisfies(dependency.range, target.version)) {
        diagnostics.push({
          pluginId: node.id,
          kind: "version-conflict",
          detail: `dependency "${dependency.id}" is ${target.version}, needs ${dependency.range}`,
        });
        excluded.set(node.id, `version conflict on "${dependency.id}"`);
      }
    }
    for (const peer of node.optionalPeers ?? []) {
      const target = byId.get(peer.id);
      if (!target || !hostApiSatisfies(peer.range, target.version)) {
        diagnostics.push({
          pluginId: node.id,
          kind: "optional-peer-unavailable",
          detail: target
            ? `optional peer "${peer.id}" is ${target.version}, wanted ${peer.range}`
            : `optional peer "${peer.id}" is not installed`,
        });
        // Diagnostic only: the plugin still activates.
      }
    }
  }

  // Pass 2: cycles among hard dependencies (only over still-included nodes).
  const inCycle = findCycleMembers(nodes, byId, excluded);
  for (const [id, cycle] of inCycle) {
    diagnostics.push({ pluginId: id, kind: "cycle", detail: `dependency cycle: ${cycle}` });
    excluded.set(id, `dependency cycle: ${cycle}`);
  }

  // Pass 3: transitive exclusion of dependents.
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (excluded.has(node.id)) continue;
      const dead = (node.dependencies ?? []).find((dependency) => excluded.has(dependency.id));
      if (dead) {
        const reason = `dependency "${dead.id}" is excluded (${excluded.get(dead.id)})`;
        diagnostics.push({ pluginId: node.id, kind: "dependent-excluded", detail: reason });
        excluded.set(node.id, reason);
        changed = true;
      }
    }
  }

  // Pass 4: stable Kahn ordering over the survivors; optional peers order
  // softly (peer first when present) without creating hard edges.
  const active = nodes.filter((node) => !excluded.has(node.id));
  const activeIds = new Set(active.map((node) => node.id));
  const indegree = new Map<string, number>(active.map((node) => [node.id, 0]));
  const dependents = new Map<string, string[]>();
  for (const node of active) {
    const edges = [
      ...(node.dependencies ?? []),
      ...(node.optionalPeers ?? []).filter((peer) => activeIds.has(peer.id)),
    ];
    for (const edge of edges) {
      if (!activeIds.has(edge.id)) continue;
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      const list = dependents.get(edge.id) ?? [];
      list.push(node.id);
      dependents.set(edge.id, list);
    }
  }
  const order: string[] = [];
  // Declaration order is the tie-break: scan the declared list each round.
  const ready = () => active.filter((node) => !order.includes(node.id) && (indegree.get(node.id) ?? 0) === 0);
  let round = ready();
  while (round.length > 0) {
    for (const node of round) {
      order.push(node.id);
      for (const dependent of dependents.get(node.id) ?? []) {
        indegree.set(dependent, (indegree.get(dependent) ?? 0) - 1);
      }
    }
    round = ready();
  }
  // Optional-peer cycles could strand nodes; append them in declaration
  // order rather than dropping them (hard cycles were excluded already).
  for (const node of active) if (!order.includes(node.id)) order.push(node.id);

  return {
    activationOrder: order,
    excluded: [...excluded.entries()].map(([id, reason]) => ({ id, reason })),
    diagnostics,
  };
}

function findCycleMembers(
  nodes: readonly PluginDependencyNode[],
  byId: ReadonlyMap<string, PluginDependencyNode>,
  excluded: ReadonlyMap<string, string>,
): Map<string, string> {
  const members = new Map<string, string>();
  const visiting = new Set<string>();
  const done = new Set<string>();

  const visit = (id: string, path: string[]): void => {
    if (done.has(id) || excluded.has(id)) return;
    if (visiting.has(id)) {
      const start = path.indexOf(id);
      const cycle = [...path.slice(start), id].join(" -> ");
      for (const member of path.slice(start)) members.set(member, cycle);
      return;
    }
    visiting.add(id);
    path.push(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) {
      if (byId.has(dependency.id)) visit(dependency.id, path);
    }
    path.pop();
    visiting.delete(id);
    done.add(id);
  };
  for (const node of nodes) visit(node.id, []);
  return members;
}
