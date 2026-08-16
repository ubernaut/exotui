// Copyright 2023 Im-Beast. MIT license.

// THEM-002: components PUBLISH what they need from a theme — required and
// optional tokens, the states each must cover, and component defaults —
// and validation walks every (component, token, state) cell against the
// theme's per-state values through the THEM-001 registry's fallback
// chains. Every gap is reported with full provenance: which component,
// which token, which state, and at what level (required vs optional vs
// covered-by-default), so a theme author fixes exact cells instead of
// guessing.

import type { Style } from "./theme.ts";
import type { SemanticTokenRegistry, SemanticTokenValues } from "./theme_tokens.ts";

/** One token requirement with the states it must cover. */
export interface TokenRequirement {
  readonly token: string;
  /** States that need coverage (default: ["base"]). */
  readonly states?: readonly string[];
}

/** One component's published token schema. */
export interface ComponentTokenSchema {
  readonly component: string;
  readonly required: readonly TokenRequirement[];
  readonly optional?: readonly TokenRequirement[];
  /** Component-supplied fallback styles that satisfy missing tokens. */
  readonly defaults?: Readonly<Record<string, Style>>;
}

/** A theme as per-state token values; "base" backs every other state. */
export type ThemeStateValues = Readonly<Record<string, SemanticTokenValues>>;

/** One validation finding with full provenance. */
export interface TokenCoverageIssue {
  readonly component: string;
  readonly token: string;
  readonly state: string;
  readonly level: "missing-required" | "missing-optional" | "default-applied";
}

/** The validation report. */
export interface TokenCoverageReport {
  /** true when no required token is missing anywhere. */
  readonly complete: boolean;
  readonly issues: readonly TokenCoverageIssue[];
  readonly checkedCells: number;
}

function resolves(
  registry: SemanticTokenRegistry<string>,
  token: string,
  theme: ThemeStateValues,
  state: string,
): boolean {
  if (!registry.has(token)) return false;
  const inState = state !== "base" ? registry.style(token, theme[state] ?? {}) : undefined;
  if (inState !== undefined) return true;
  return registry.style(token, theme["base"] ?? {}) !== undefined;
}

/** Validates one theme against every published component schema. */
export function validateThemeTokenCoverage(
  theme: ThemeStateValues,
  schemas: readonly ComponentTokenSchema[],
  registry: SemanticTokenRegistry<string>,
): TokenCoverageReport {
  const issues: TokenCoverageIssue[] = [];
  let checkedCells = 0;

  for (const schema of schemas) {
    const requirements: Array<{ requirement: TokenRequirement; requiredLevel: boolean }> = [
      ...schema.required.map((requirement) => ({ requirement, requiredLevel: true })),
      ...(schema.optional ?? []).map((requirement) => ({ requirement, requiredLevel: false })),
    ];
    for (const { requirement, requiredLevel } of requirements) {
      for (const state of requirement.states ?? ["base"]) {
        checkedCells += 1;
        if (resolves(registry, requirement.token, theme, state)) continue;
        if (schema.defaults?.[requirement.token] !== undefined) {
          issues.push({
            component: schema.component,
            token: requirement.token,
            state,
            level: "default-applied",
          });
          continue;
        }
        issues.push({
          component: schema.component,
          token: requirement.token,
          state,
          level: requiredLevel ? "missing-required" : "missing-optional",
        });
      }
    }
  }
  return {
    complete: issues.every((issue) => issue.level !== "missing-required"),
    issues,
    checkedCells,
  };
}

/** Resolves one component token: theme state → theme base → component default. */
export function resolveComponentToken(
  schema: ComponentTokenSchema,
  registry: SemanticTokenRegistry<string>,
  theme: ThemeStateValues,
  token: string,
  state = "base",
): Style | undefined {
  if (registry.has(token)) {
    const inState = state !== "base" ? registry.style(token, theme[state] ?? {}) : undefined;
    if (inState !== undefined) return inState;
    const base = registry.style(token, theme["base"] ?? {});
    if (base !== undefined) return base;
  }
  return schema.defaults?.[token];
}
