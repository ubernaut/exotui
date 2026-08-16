// Copyright 2023 Im-Beast. MIT license.

// THEM-007: density is a TOKEN SET, not a re-layout hack. Each density
// profile (compact, comfortable, touch) declares component geometry —
// row heights, paddings, gaps, and minimum hit-target sizes — as plain
// values a layout reads at render time. Switching density swaps which
// profile is consulted and nothing else: application state, focus, and
// component structure are untouched, which the tests verify by asserting
// the switch is a pure function on the profile object.

/** The declared density profiles. */
export type DensityProfileName = "compact" | "comfortable" | "touch";

/** Geometry tokens one profile declares (cells). */
export interface DensityTokens {
  readonly rowHeight: number;
  readonly controlPaddingX: number;
  readonly controlPaddingY: number;
  readonly gap: number;
  /** Minimum interactive hit-target size (width, height). */
  readonly minHitTarget: readonly [number, number];
  /** Scale multiplier applied to declared optional spacings. */
  readonly scale: number;
}

/** The built-in profiles. */
export const DENSITY_PROFILES: Readonly<Record<DensityProfileName, DensityTokens>> = Object.freeze({
  compact: Object.freeze({
    rowHeight: 1,
    controlPaddingX: 1,
    controlPaddingY: 0,
    gap: 0,
    minHitTarget: [3, 1] as const,
    scale: 1,
  }),
  comfortable: Object.freeze({
    rowHeight: 1,
    controlPaddingX: 2,
    controlPaddingY: 0,
    gap: 1,
    minHitTarget: [6, 1] as const,
    scale: 1,
  }),
  touch: Object.freeze({
    rowHeight: 3,
    controlPaddingX: 3,
    controlPaddingY: 1,
    gap: 1,
    minHitTarget: [10, 3] as const,
    scale: 1.5,
  }),
});

/** A resolved density context components read geometry from. */
export class DensityContext {
  #profile: DensityProfileName;
  readonly #overrides: Partial<Record<DensityProfileName, Partial<DensityTokens>>>;
  readonly #listeners = new Set<(profile: DensityProfileName) => void>();

  constructor(
    initial: DensityProfileName = "comfortable",
    overrides: Partial<Record<DensityProfileName, Partial<DensityTokens>>> = {},
  ) {
    this.#profile = initial;
    this.#overrides = overrides;
  }

  profile(): DensityProfileName {
    return this.#profile;
  }

  /** The active geometry tokens. */
  tokens(): DensityTokens {
    const base = DENSITY_PROFILES[this.#profile];
    const override = this.#overrides[this.#profile];
    return override ? { ...base, ...override } : base;
  }

  /** Scales an optional spacing by the active profile's multiplier. */
  spacing(cells: number): number {
    return Math.round(cells * this.tokens().scale);
  }

  /** Grows a declared rectangle to at least the profile's hit target. */
  hitTarget(width: number, height: number): readonly [number, number] {
    const [minWidth, minHeight] = this.tokens().minHitTarget;
    return [Math.max(width, minWidth), Math.max(height, minHeight)];
  }

  /**
   * Switches profiles. Only the profile pointer changes — no state
   * outside this object is touched; listeners re-read geometry.
   */
  switch(profile: DensityProfileName): void {
    if (profile === this.#profile) return;
    this.#profile = profile;
    for (const listener of [...this.#listeners]) listener(profile);
  }

  /** Subscribes to density switches (for re-render scheduling). */
  onSwitch(listener: (profile: DensityProfileName) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

/** Creates a density context. */
export function createDensityContext(
  initial: DensityProfileName = "comfortable",
  overrides: Partial<Record<DensityProfileName, Partial<DensityTokens>>> = {},
): DensityContext {
  return new DensityContext(initial, overrides);
}
