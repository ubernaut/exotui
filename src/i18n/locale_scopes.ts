// Copyright 2023 Im-Beast. MIT license.

// LOC-007: subtree locale scopes. A scope tree mirrors the UI tree: any
// node may override language, locale preferences, or base direction, and
// everything it does NOT specify inherits from its parent — resolution is
// per-node and pure, so one subtree's Hebrew RTL cannot leak formatting or
// direction into a sibling, and removing a scope restores inheritance.

import { UnicodeLocaleContext } from "./locale.ts";
import type { UnicodeLocaleContextOptions } from "./locale.ts";

/** What one scope may override; unspecified fields inherit. */
export interface LocaleScopeOverride {
  readonly requested?: readonly string[];
  readonly timeZone?: string;
  readonly numberingSystem?: string;
  readonly calendar?: string;
  /** Base direction; "auto" derives from the resolved language. */
  readonly direction?: "ltr" | "rtl" | "auto";
}

/** A node's fully resolved locale state. */
export interface ResolvedLocaleScope {
  readonly context: UnicodeLocaleContext;
  readonly direction: "ltr" | "rtl";
  /** Which fields this resolution overrode locally (vs inherited). */
  readonly overridden: readonly string[];
}

const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur", "ps", "sd", "ug", "yi", "dv", "ckb"]);

function directionOfLanguage(tag: string): "ltr" | "rtl" {
  const language = tag.split("-")[0]!.toLowerCase();
  return RTL_LANGUAGES.has(language) ? "rtl" : "ltr";
}

interface ScopeNode {
  readonly id: string;
  readonly parent: string | undefined;
  override: LocaleScopeOverride;
}

/** The scope tree. */
export class LocaleScopeTree {
  readonly #root: UnicodeLocaleContextOptions;
  readonly #rootDirection: "ltr" | "rtl" | "auto";
  readonly #nodes = new Map<string, ScopeNode>();

  constructor(root: UnicodeLocaleContextOptions & { readonly direction?: "ltr" | "rtl" | "auto" } = {}) {
    this.#root = root;
    this.#rootDirection = root.direction ?? "auto";
  }

  /** Declares a scope node under a parent (undefined = the root). */
  declare(id: string, parent: string | undefined, override: LocaleScopeOverride = {}): () => void {
    this.#nodes.set(id, { id, parent, override });
    return () => {
      this.#nodes.delete(id);
    };
  }

  /** Updates a scope's override in place. */
  update(id: string, override: LocaleScopeOverride): boolean {
    const node = this.#nodes.get(id);
    if (!node) return false;
    node.override = override;
    return true;
  }

  /**
   * Resolves a node: walks to the root collecting the nearest specified
   * value per field. Unknown ids resolve as the root — safe by default.
   */
  resolve(id: string | undefined): ResolvedLocaleScope {
    const chain: LocaleScopeOverride[] = [];
    for (let current = id !== undefined ? this.#nodes.get(id) : undefined; current;) {
      chain.push(current.override);
      current = current.parent !== undefined ? this.#nodes.get(current.parent) : undefined;
    }

    const overridden: string[] = [];
    const pick = <K extends keyof LocaleScopeOverride>(field: K): LocaleScopeOverride[K] | undefined => {
      for (let depth = 0; depth < chain.length; depth += 1) {
        const value = chain[depth]![field];
        if (value !== undefined) {
          if (depth === 0) overridden.push(field);
          return value;
        }
      }
      return undefined;
    };

    const requested = pick("requested") ?? this.#root.requested;
    const context = new UnicodeLocaleContext({
      ...this.#root,
      requested,
      timeZone: pick("timeZone") ?? this.#root.timeZone,
      numberingSystem: pick("numberingSystem") ?? this.#root.numberingSystem,
      calendar: pick("calendar") ?? this.#root.calendar,
    });
    const declaredDirection = pick("direction") ?? this.#rootDirection;
    const direction = declaredDirection === "auto"
      ? directionOfLanguage(context.resolve().resolved)
      : declaredDirection;
    return { context, direction, overridden };
  }

  inspect(): { readonly scopes: readonly string[] } {
    return { scopes: [...this.#nodes.keys()].sort() };
  }
}

/** Creates a locale scope tree over root options. */
export function createLocaleScopeTree(
  root: UnicodeLocaleContextOptions & { readonly direction?: "ltr" | "rtl" | "auto" } = {},
): LocaleScopeTree {
  return new LocaleScopeTree(root);
}
