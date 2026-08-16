// Copyright 2023 Im-Beast. MIT license.

// THEM-008: motion is declared, and so is its absence. A motion token
// names its duration, easing, and delay AND its static behavior — what
// happens when the user asks for reduced motion. Resolution under
// reduced motion substitutes every NONESSENTIAL transition with that
// declared static behavior (duration 0, the declared end state policy);
// transitions marked essential (they carry meaning, e.g. a focus flash)
// keep a minimal declared fallback instead of vanishing silently. There
// is no unresolved case: every token resolves in both modes.

/** Built-in easing curves. */
export type MotionEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

/** Declared static substitutions for reduced motion. */
export type StaticBehavior = "jump-to-end" | "none" | "instant-fade";

/** One motion token. */
export interface MotionToken {
  readonly durationMs: number;
  readonly easing: MotionEasing;
  readonly delayMs?: number;
  /** Essential transitions keep (reduced) motion; default false. */
  readonly essential?: boolean;
  /** What replaces this transition under reduced motion. */
  readonly staticBehavior: StaticBehavior;
  /** Essential tokens' reduced duration (default 80ms). */
  readonly essentialReducedMs?: number;
}

/** A resolved transition plan. */
export type ResolvedMotion =
  | {
    readonly kind: "animate";
    readonly durationMs: number;
    readonly easing: MotionEasing;
    readonly delayMs: number;
  }
  | { readonly kind: "static"; readonly behavior: StaticBehavior };

/** Evaluates an easing curve at progress t in [0,1]. */
export function easingValue(easing: MotionEasing, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case "linear":
      return clamped;
    case "ease-in":
      return clamped * clamped;
    case "ease-out":
      return 1 - (1 - clamped) * (1 - clamped);
    case "ease-in-out":
      return clamped < 0.5 ? 2 * clamped * clamped : 1 - 2 * (1 - clamped) * (1 - clamped);
  }
}

/** The motion registry + reduced-motion resolver. */
export class MotionContext {
  readonly #tokens = new Map<string, MotionToken>();
  #reducedMotion: boolean;

  constructor(options: { readonly reducedMotion?: boolean } = {}) {
    this.#reducedMotion = options.reducedMotion ?? false;
  }

  declare(name: string, token: MotionToken): void {
    this.#tokens.set(name, token);
  }

  reducedMotion(): boolean {
    return this.#reducedMotion;
  }

  setReducedMotion(enabled: boolean): void {
    this.#reducedMotion = enabled;
  }

  /** Resolves one named transition — total in both modes. */
  resolve(name: string): ResolvedMotion {
    const token = this.#tokens.get(name);
    if (!token) return { kind: "static", behavior: "jump-to-end" }; // undeclared = no motion
    if (!this.#reducedMotion) {
      return {
        kind: "animate",
        durationMs: token.durationMs,
        easing: token.easing,
        delayMs: token.delayMs ?? 0,
      };
    }
    if (token.essential) {
      // Essential transitions keep a short declared motion, no delay.
      return {
        kind: "animate",
        durationMs: token.essentialReducedMs ?? 80,
        easing: "linear",
        delayMs: 0,
      };
    }
    return { kind: "static", behavior: token.staticBehavior };
  }

  /** Every declared nonessential token with its reduced substitution. */
  reducedSubstitutions(): readonly { name: string; behavior: StaticBehavior }[] {
    return [...this.#tokens.entries()]
      .filter(([, token]) => !token.essential)
      .map(([name, token]) => ({ name, behavior: token.staticBehavior }));
  }
}

/** Creates a motion context. */
export function createMotionContext(options: { readonly reducedMotion?: boolean } = {}): MotionContext {
  return new MotionContext(options);
}
