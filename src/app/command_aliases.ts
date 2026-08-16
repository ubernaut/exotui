// Copyright 2023 Im-Beast. MIT license.

// AUT-010: aliases and favorites as REFERENCES, never copies. An alias
// binds a name to a command id plus validated partial arguments; invoking
// it merges the caller's arguments over the partial and runs through the
// normal registry gates. A command that was renamed or removed produces a
// migration diagnostic — the alias can never silently execute a different
// command, because resolution goes by the recorded id (optionally through
// an explicit rename table) and fails closed otherwise.

import type { CommandOutcome, TypedCommandRegistry } from "./typed_commands.ts";

/** One alias definition. */
export interface CommandAlias {
  readonly name: string;
  readonly commandId: string;
  /** Partial arguments merged under the caller's. */
  readonly partialArgs?: Readonly<Record<string, unknown>>;
  readonly favorite?: boolean;
}

/** A migration diagnostic for a stale alias. */
export interface AliasDiagnostic {
  readonly alias: string;
  readonly commandId: string;
  readonly kind: "removed" | "renamed";
  readonly renamedTo?: string;
  readonly detail: string;
}

/** The alias store. */
export class CommandAliasStore {
  readonly #registry: TypedCommandRegistry;
  readonly #aliases = new Map<string, CommandAlias>();
  /** old id → new id, declared explicitly by the host on renames. */
  readonly #renames = new Map<string, string>();

  constructor(registry: TypedCommandRegistry) {
    this.#registry = registry;
  }

  /** Defines an alias; the command must exist NOW (references stay honest). */
  define(alias: CommandAlias): { readonly ok: boolean; readonly reason?: string } {
    if (!this.#registry.has(alias.commandId)) {
      return { ok: false, reason: `command "${alias.commandId}" does not exist` };
    }
    this.#aliases.set(alias.name, alias);
    return { ok: true };
  }

  /** Declares that a command id was renamed. */
  declareRename(oldId: string, newId: string): void {
    this.#renames.set(oldId, newId);
  }

  /** Migration diagnostics for every stale alias. */
  diagnostics(): readonly AliasDiagnostic[] {
    const findings: AliasDiagnostic[] = [];
    for (const alias of this.#aliases.values()) {
      if (this.#registry.has(alias.commandId)) continue;
      const renamedTo = this.#renames.get(alias.commandId);
      if (renamedTo && this.#registry.has(renamedTo)) {
        findings.push({
          alias: alias.name,
          commandId: alias.commandId,
          kind: "renamed",
          renamedTo,
          detail: `"${alias.commandId}" is now "${renamedTo}"; migrate the alias explicitly`,
        });
      } else {
        findings.push({
          alias: alias.name,
          commandId: alias.commandId,
          kind: "removed",
          detail: `"${alias.commandId}" no longer exists`,
        });
      }
    }
    return findings;
  }

  /** Applies a rename migration to one alias, explicitly. */
  migrate(name: string): boolean {
    const alias = this.#aliases.get(name);
    if (!alias) return false;
    const renamedTo = this.#renames.get(alias.commandId);
    if (!renamedTo || !this.#registry.has(renamedTo)) return false;
    this.#aliases.set(name, { ...alias, commandId: renamedTo });
    return true;
  }

  /**
   * Invokes an alias. Stale targets fail closed with the diagnostic —
   * never a different command.
   */
  async invoke<TResult = unknown>(
    name: string,
    args: Readonly<Record<string, unknown>> = {},
  ): Promise<CommandOutcome<TResult> | { readonly status: "stale-alias"; readonly diagnostic: AliasDiagnostic }> {
    const alias = this.#aliases.get(name);
    if (!alias) return { status: "unknown-command", id: name };
    if (!this.#registry.has(alias.commandId)) {
      const diagnostic = this.diagnostics().find((finding) => finding.alias === name)!;
      return { status: "stale-alias", diagnostic };
    }
    return await this.#registry.invoke<TResult>(alias.commandId, { ...alias.partialArgs, ...args });
  }

  /** Favorites, then the rest, both name-sorted. */
  list(): readonly CommandAlias[] {
    return [...this.#aliases.values()].sort((left, right) =>
      Number(right.favorite ?? false) - Number(left.favorite ?? false) || (left.name < right.name ? -1 : 1)
    );
  }
}

/** Creates an alias store over a typed command registry. */
export function createCommandAliasStore(registry: TypedCommandRegistry): CommandAliasStore {
  return new CommandAliasStore(registry);
}
