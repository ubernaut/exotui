// Copyright 2023 Im-Beast. MIT license.

// FRM-004: the field-dependency graph, explicit and inspectable. Each rule
// declares the fields it reads and what it computes — conditional visibility,
// enablement, a derived value, and/or revalidation. A source edit propagates
// through the affected subgraph in topological order, recomputing every
// affected rule exactly once (a diamond converges to one recomputation of its
// sink). Cycles among derive rules are diagnosed at construction and those
// rules are excluded from propagation instead of looping forever.

import type { FieldName, FormController, FormValues } from "./forms.ts";

/** One dependency rule. */
export interface FormFieldRule<TValues extends FormValues> {
  /** The field this rule governs. */
  readonly field: string;
  /** The fields it reads. */
  readonly dependsOn: readonly string[];
  readonly visible?: (values: TValues) => boolean;
  readonly enabled?: (values: TValues) => boolean;
  /** Derived value written to the field when dependencies change. */
  readonly derive?: (values: TValues) => unknown;
  /** Revalidate this field when dependencies change. */
  readonly revalidate?: boolean;
}

/** Result of one propagation. */
export interface FormDependencyUpdate {
  /** Rules recomputed, in propagation order — each at most once. */
  readonly recomputed: readonly string[];
  readonly derived: readonly string[];
  readonly revalidated: readonly string[];
  readonly visibilityChanged: readonly string[];
  readonly enablementChanged: readonly string[];
}

/** Per-field UI state the graph maintains. */
export interface FormFieldUiState {
  readonly visible: boolean;
  readonly enabled: boolean;
}

/**
 * The graph. Rules are fixed at construction; cycle diagnostics are
 * available immediately and cyclic derive rules never propagate.
 */
export class FormDependencyGraph<TValues extends FormValues> {
  readonly #form: FormController<TValues>;
  readonly #rules = new Map<string, FormFieldRule<TValues>>();
  /** dependency field → rule fields that read it. */
  readonly #dependents = new Map<string, string[]>();
  readonly #state = new Map<string, FormFieldUiState>();
  readonly #cycles: readonly (readonly string[])[];
  readonly #cyclic = new Set<string>();

  constructor(form: FormController<TValues>, rules: readonly FormFieldRule<TValues>[]) {
    this.#form = form;
    for (const rule of rules) {
      this.#rules.set(rule.field, rule);
      for (const dependency of rule.dependsOn) {
        const list = this.#dependents.get(dependency) ?? [];
        list.push(rule.field);
        this.#dependents.set(dependency, list);
      }
    }
    this.#cycles = this.#findDeriveCycles();
    for (const cycle of this.#cycles) for (const field of cycle) this.#cyclic.add(field);
    // Initial state pass so visibility/enablement are defined before edits.
    const values = form.values.peek();
    for (const rule of rules) this.#applyUiState(rule, values);
  }

  /** Diagnosed cycles among derive rules (each as its member fields). */
  cycles(): readonly (readonly string[])[] {
    return this.#cycles;
  }

  /** The maintained UI state for a field (defaults to visible+enabled). */
  state(field: string): FormFieldUiState {
    return this.#state.get(field) ?? { visible: true, enabled: true };
  }

  /** Propagates one source edit through the affected subgraph. */
  onFieldChange(source: FieldName<TValues>): FormDependencyUpdate {
    const order = this.#affectedInTopoOrder(String(source));
    const recomputed: string[] = [];
    const derived: string[] = [];
    const revalidated: string[] = [];
    const visibilityChanged: string[] = [];
    const enablementChanged: string[] = [];

    for (const field of order) {
      const rule = this.#rules.get(field);
      if (!rule || this.#cyclic.has(field)) continue;
      recomputed.push(field);
      const values = this.#form.values.peek();
      const before = this.state(field);
      const after = this.#applyUiState(rule, values);
      if (before.visible !== after.visible) visibilityChanged.push(field);
      if (before.enabled !== after.enabled) enablementChanged.push(field);
      if (rule.derive) {
        const next = rule.derive(values);
        const current = readPath(values, field);
        if (!Object.is(current, next)) {
          this.#form.setValue(field as FieldName<TValues>, next as TValues[FieldName<TValues> & keyof TValues]);
          derived.push(field);
        }
      }
      if (rule.revalidate) {
        this.#form.validateField(field as FieldName<TValues>);
        revalidated.push(field);
      }
    }
    return { recomputed, derived, revalidated, visibilityChanged, enablementChanged };
  }

  inspect(): { readonly rules: number; readonly cyclicFields: readonly string[] } {
    return { rules: this.#rules.size, cyclicFields: [...this.#cyclic] };
  }

  /** BFS levelization: every affected rule appears once, after its sources. */
  #affectedInTopoOrder(source: string): string[] {
    const order: string[] = [];
    const seen = new Set<string>([source]);
    let frontier = [source];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const field of frontier) {
        for (const dependent of this.#dependents.get(field) ?? []) {
          if (seen.has(dependent)) continue;
          seen.add(dependent);
          order.push(dependent);
          next.push(dependent);
        }
      }
      frontier = next;
    }
    return order;
  }

  #applyUiState(rule: FormFieldRule<TValues>, values: TValues): FormFieldUiState {
    const state: FormFieldUiState = {
      visible: rule.visible?.(values) ?? true,
      enabled: rule.enabled?.(values) ?? true,
    };
    this.#state.set(rule.field, state);
    return state;
  }

  /** Cycles only matter where a rule can WRITE a field another rule reads. */
  #findDeriveCycles(): readonly (readonly string[])[] {
    const cycles: string[][] = [];
    const visiting = new Set<string>();
    const done = new Set<string>();
    const stack: string[] = [];

    const visit = (field: string): void => {
      if (done.has(field)) return;
      if (visiting.has(field)) {
        const start = stack.indexOf(field);
        if (start >= 0) cycles.push(stack.slice(start));
        return;
      }
      visiting.add(field);
      stack.push(field);
      const rule = this.#rules.get(field);
      if (rule?.derive) {
        for (const dependent of this.#dependents.get(field) ?? []) visit(dependent);
      }
      stack.pop();
      visiting.delete(field);
      done.add(field);
    };
    for (const field of this.#rules.keys()) visit(field);
    return cycles;
  }
}

function readPath(values: object, path: string): unknown {
  let current: unknown = values;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Creates a dependency graph over a form. */
export function createFormDependencyGraph<TValues extends FormValues>(
  form: FormController<TValues>,
  rules: readonly FormFieldRule<TValues>[],
): FormDependencyGraph<TValues> {
  return new FormDependencyGraph(form, rules);
}
