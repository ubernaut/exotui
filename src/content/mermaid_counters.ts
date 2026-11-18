// Copyright 2023 Im-Beast. MIT license.
import { generatedCounterName, generatedCounterTokens } from "./mermaid_counter_styles.ts";

export interface GeneratedCounterDirective {
  reset?: number;
  /** An omitted reversed initial value needs the original forward-scope count. */
  reversed?: boolean;
  increment?: number;
  set?: number;
}

const minimum = -2_147_483_648, maximum = 2_147_483_647;
const clamp = (value: number) => Math.min(maximum, Math.max(minimum, value));

/** Collapse computed ordered directives, retaining resets/sets and summing repeated increments. */
export function generatedCounterDirectives(
  reset: string,
  increment: string,
  set: string,
): ReadonlyMap<string, GeneratedCounterDirective> {
  const result = new Map<string, GeneratedCounterDirective>();
  for (const [property, source] of [["reset", reset], ["increment", increment], ["set", set]] as const) {
    if (!source || source === "none") continue;
    const tokens = generatedCounterTokens(source);
    for (let at = 0; at < tokens.length;) {
      const token = tokens[at++]!, reverse = /^reversed\((.*)\)$/.exec(token);
      if (reverse && property !== "reset") throw new TypeError("Only counter-reset can be reversed.");
      const name = generatedCounterName(reverse ? reverse[1]! : token);
      if (!name) throw new TypeError("Malformed computed counter directive identifier.");
      let value: number | undefined;
      if (/^[+-]?\d+$/.test(tokens[at] ?? "")) {
        value = Number(tokens[at++]!);
        if (!Number.isSafeInteger(value)) throw new RangeError("Mermaid counter directive exceeds its integer budget.");
        value = clamp(value);
      } else if (!reverse) value = property === "increment" ? 1 : 0;
      const directive = result.get(name) ?? {};
      if (property === "reset") {
        directive.reset = value;
        directive.reversed = !!reverse;
      } else if (property === "increment") directive.increment = clamp((directive.increment ?? 0) + value!);
      else directive.set = value;
      result.set(name, directive);
    }
  }
  return result;
}

/** A node in original flattened layout order, including generated siblings. */
export interface GeneratedCounterNode {
  parent?: GeneratedCounterNode;
}

interface Entry {
  origin: GeneratedCounterNode;
  value: number;
}

/**
 * Counter inheritance ledger. Style boundaries stop writes, not reads. Unlike
 * a quotation-depth clone, a contained increment can instantiate a new counter.
 * The current Chromium layout profile combines set/reset/increment per name.
 */
export class GeneratedCounterLedger {
  #stacks = new Map<string, (Entry | null)[]>();
  #entries = 0;
  #work = 0;
  #ancestor(candidate: GeneratedCounterNode, node: GeneratedCounterNode): boolean {
    let depth = 0;
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (++depth > 256 || ++this.#work > 4_194_304) {
        throw new RangeError("Mermaid counter inheritance exceeds its ancestor-work budget.");
      }
      if (parent === candidate) return true;
    }
    return false;
  }

  #stale(name: string, node: GeneratedCounterNode): void {
    const stack = this.#stacks.get(name);
    while (stack?.length) {
      const entry = stack.at(-1);
      if (!entry || !entry.origin.parent || this.#ancestor(entry.origin.parent, node)) return;
      stack.pop();
      this.#entries--;
    }
  }

  #create(name: string, node: GeneratedCounterNode, value: number): void {
    const stack = this.#stacks.get(name) ?? [];
    const previous = stack.at(-1);
    // Sibling resets replace each other; an ancestor reset remains an outer
    // instance. Pseudo-elements are genuine siblings of the owner's children.
    if (previous && previous.origin.parent === node.parent) {
      stack.pop();
      this.#entries--;
    }
    if (stack.length >= 128 || this.#entries >= 32_768 || !this.#stacks.has(name) && this.#stacks.size >= 1024) {
      throw new RangeError("Mermaid counter inheritance exceeds its stack budget.");
    }
    stack.push({ origin: node, value });
    this.#entries++;
    this.#stacks.set(name, stack);
  }

  enter(
    node: GeneratedCounterNode,
    directives: ReadonlyMap<string, GeneratedCounterDirective>,
    reversedInitial?: (name: string) => number,
  ): void {
    if (directives.size > 1024) throw new RangeError("Mermaid counter directives exceed their name budget.");
    for (const [name, directive] of directives) {
      if (name.length > 4096) throw new RangeError("Mermaid counter name exceeds its budget.");
      this.#stale(name, node);
      const resets = directive.reset !== undefined || directive.reversed;
      if (directive.reversed && directive.reset === undefined && !reversedInitial) {
        throw new TypeError("Reversed counter capture requires an original forward-scope count.");
      }
      const resetValue = directive.reset ?? (directive.reversed ? reversedInitial!(name) : 0);
      if (![resetValue, directive.increment ?? 0, directive.set ?? 0].every(Number.isSafeInteger)) {
        throw new RangeError("Mermaid counter state has a non-integer value.");
      }
      const combined = clamp(directive.set ?? resetValue + (directive.increment ?? 0));
      if (resets) this.#create(name, node, combined);
      else {
        const last = this.#stacks.get(name)?.at(-1);
        if (!last) this.#create(name, node, combined);
        else if (directive.set !== undefined) last.value = combined;
        else {
          const sum = last.value + (directive.increment ?? 0);
          // Chromium ignores overflowing increments rather than wrapping them.
          if (minimum <= sum && sum <= maximum) last.value = sum;
        }
      }
    }
  }

  leave(node: GeneratedCounterNode, directives: ReadonlyMap<string, GeneratedCounterDirective>): void {
    for (const [name, directive] of directives) {
      if (directive.reset === undefined && !directive.reversed) continue;
      const stack = this.#stacks.get(name)!;
      const last = stack.at(-1), previous = stack.at(-2);
      if (!last || !previous || last.origin !== node) continue;
      if (
        this.#ancestor(previous.origin, node) || previous.origin.parent &&
          previous.origin.parent !== node.parent && this.#ancestor(previous.origin.parent, node)
      ) {
        stack.pop();
        this.#entries--;
      }
    }
  }

  /** Containment starts after its originating element's own directives. */
  contain(): void {
    for (const stack of this.#stacks.values()) {
      if (stack.length >= 128 || this.#entries >= 32_768) {
        throw new RangeError("Mermaid counter containment exceeds its stack budget.");
      }
      stack.push(null);
      this.#entries++;
    }
  }

  releaseContainment(): void {
    for (const stack of this.#stacks.values()) {
      while (stack.length) {
        this.#entries--;
        if (stack.pop() === null) break;
      }
    }
  }

  /** Detached outer-to-inner values, never borrowed mutable stack entries. */
  values(node: GeneratedCounterNode, name: string): readonly number[] {
    this.#stale(name, node);
    const values = this.#stacks.get(name)?.flatMap((entry) => entry ? [entry.value] : []) ?? [];
    return values.length ? values : [0];
  }
}
