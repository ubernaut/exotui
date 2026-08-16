// Copyright 2023 Im-Beast. MIT license.

// THEM-001: semantic tokens become an OPEN, typed registry. The seven
// existing tokens stay exactly as they are — they form the compatibility
// profile every old theme already satisfies — and packages declare
// namespaced tokens (`namespace:name`) on top. Type checking never
// weakens: `declare` returns a registry whose type includes the new name,
// so `style()` accepts only tokens that are actually known at compile
// time. Every namespaced token declares a fallback to an ALREADY-KNOWN
// token, which makes chains acyclic by construction and lets a plain
// seven-token theme resolve any registered token without changing.

import type { Style } from "./theme.ts";
import { themeTokenNames } from "./theme.ts";

/** The compatibility profile: the original seven tokens. */
export type CoreThemeTokenName = (typeof themeTokenNames)[number];

/** Namespaced token names use the `namespace:name` form. */
export type NamespacedThemeTokenName = `${string}:${string}`;

/** One namespaced declaration. */
export interface SemanticTokenDeclaration<Known extends string> {
  /** An already-known token the new one resolves to when a theme lacks it. */
  readonly fallback: Known;
  readonly description?: string;
}

/** A theme value map: core tokens plus any namespaced entries. */
export type SemanticTokenValues = Partial<Record<string, Style>>;

const CORE_SET = new Set<string>(themeTokenNames);

/** The open token registry; `Known` accumulates declared names. */
export class SemanticTokenRegistry<Known extends string = CoreThemeTokenName> {
  readonly #declarations: ReadonlyMap<string, { fallback: string; description?: string }>;

  constructor(declarations?: ReadonlyMap<string, { fallback: string; description?: string }>) {
    this.#declarations = declarations ?? new Map();
  }

  /**
   * Declares one namespaced token with a fallback to a known token.
   * Returns a NEW registry whose type includes the declared name.
   */
  declare<Name extends NamespacedThemeTokenName>(
    name: Name,
    declaration: SemanticTokenDeclaration<Known>,
  ): SemanticTokenRegistry<Known | Name> {
    if (!name.includes(":")) throw new TypeError(`token "${name}" must be namespaced as "namespace:name"`);
    if (CORE_SET.has(name)) throw new TypeError(`token "${name}" collides with the compatibility profile`);
    if (this.#declarations.has(name)) throw new TypeError(`token "${name}" is already declared`);
    if (!CORE_SET.has(declaration.fallback) && !this.#declarations.has(declaration.fallback)) {
      throw new TypeError(`fallback "${declaration.fallback}" is not a known token`);
    }
    const next = new Map(this.#declarations);
    next.set(name, { fallback: declaration.fallback, description: declaration.description });
    return new SemanticTokenRegistry<Known | Name>(next);
  }

  /** Is a token name known (core or declared)? */
  has(name: string): boolean {
    return CORE_SET.has(name) || this.#declarations.has(name);
  }

  /** Every known token: the compatibility profile first, then declared. */
  known(): readonly string[] {
    return [...themeTokenNames, ...this.#declarations.keys()];
  }

  /** The fallback chain from a token down to its core token. */
  chain(name: Known): readonly string[] {
    const path: string[] = [name];
    let current: string = name;
    while (!CORE_SET.has(current)) {
      const declaration = this.#declarations.get(current);
      if (!declaration) break;
      current = declaration.fallback;
      path.push(current);
    }
    return path;
  }

  /**
   * Resolves a token against a theme's values: the token itself when the
   * theme defines it, else the first defined ancestor in its fallback
   * chain. Old seven-token themes therefore satisfy every declared token.
   */
  style(name: Known, values: SemanticTokenValues): Style | undefined {
    for (const candidate of this.chain(name)) {
      const style = values[candidate];
      if (style !== undefined) return style;
    }
    return undefined;
  }
}

/** Creates the registry seeded with the compatibility profile. */
export function createSemanticTokenRegistry(): SemanticTokenRegistry<CoreThemeTokenName> {
  return new SemanticTokenRegistry();
}
