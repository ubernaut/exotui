// Copyright 2023 Im-Beast. MIT license.

// THEM-004: contrast between declared foreground/background token pairs
// is a CONSTRAINT, not a hope. Ratios are WCAG relative-luminance
// contrast; enforcement either reports violations (error mode) or
// repairs them (repair mode) by moving the repairable token of the pair
// toward whichever pole (white or black) can actually reach the target,
// in fixed 1/64 mix steps — the same inputs always produce the same
// repaired color. Locked brand tokens are never altered: when the
// movable side is locked the other side moves, and when both are locked
// the violation is reported as unrepairable instead of silently touched.

import type { Rgb } from "./theme_expressions.ts";

/** One declared pair constraint. */
export interface ContrastConstraint {
  readonly foreground: string;
  readonly background: string;
  /** Minimum WCAG contrast ratio (e.g. 4.5). */
  readonly minRatio: number;
}

/** WCAG relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.04045 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** WCAG contrast ratio (>= 1). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/** One reported violation. */
export interface ContrastViolation {
  readonly constraint: ContrastConstraint;
  readonly actualRatio: number;
  /** Present when repair mode could not fix it (both tokens locked). */
  readonly unrepairable?: boolean;
}

/** One applied repair, as a diff entry. */
export interface ContrastRepair {
  readonly token: string;
  readonly before: Rgb;
  readonly after: Rgb;
  readonly constraint: ContrastConstraint;
  readonly achievedRatio: number;
}

/** The enforcement report. */
export interface ContrastReport {
  readonly ok: boolean;
  readonly violations: readonly ContrastViolation[];
  readonly repairs: readonly ContrastRepair[];
  /** The (possibly repaired) color set. */
  readonly colors: Readonly<Record<string, Rgb>>;
}

function mixToward(color: Rgb, pole: Rgb, t: number): Rgb {
  return [
    Math.round(color[0] + (pole[0] - color[0]) * t),
    Math.round(color[1] + (pole[1] - color[1]) * t),
    Math.round(color[2] + (pole[2] - color[2]) * t),
  ];
}

/** Deterministically repairs `movable` against `fixed`, or undefined. */
function repairColor(movable: Rgb, fixed: Rgb, minRatio: number): Rgb | undefined {
  const white: Rgb = [255, 255, 255];
  const black: Rgb = [0, 0, 0];
  // The pole with the better achievable contrast wins; ties go to white
  // for determinism.
  const pole = contrastRatio(white, fixed) >= contrastRatio(black, fixed) ? white : black;
  for (let step = 1; step <= 64; step += 1) {
    const candidate = mixToward(movable, pole, step / 64);
    if (contrastRatio(candidate, fixed) >= minRatio) return candidate;
  }
  return undefined;
}

/** Enforces the constraints in error or repair mode. */
export function enforceContrastConstraints(
  colors: Readonly<Record<string, Rgb>>,
  constraints: readonly ContrastConstraint[],
  options: { readonly mode: "error" | "repair"; readonly locked?: readonly string[] } = { mode: "error" },
): ContrastReport {
  const locked = new Set(options.locked ?? []);
  const working: Record<string, Rgb> = { ...colors };
  const violations: ContrastViolation[] = [];
  const repairs: ContrastRepair[] = [];

  for (const constraint of constraints) {
    const foreground = working[constraint.foreground];
    const background = working[constraint.background];
    if (!foreground || !background) {
      violations.push({ constraint, actualRatio: 0, unrepairable: true });
      continue;
    }
    const actual = contrastRatio(foreground, background);
    if (actual >= constraint.minRatio) continue;

    if (options.mode === "error") {
      violations.push({ constraint, actualRatio: actual });
      continue;
    }
    // Repair: prefer moving the foreground; a locked one shifts the duty
    // to the background; both locked → unrepairable, untouched.
    const movableToken = !locked.has(constraint.foreground)
      ? constraint.foreground
      : !locked.has(constraint.background)
      ? constraint.background
      : undefined;
    if (movableToken === undefined) {
      violations.push({ constraint, actualRatio: actual, unrepairable: true });
      continue;
    }
    const fixedToken = movableToken === constraint.foreground ? constraint.background : constraint.foreground;
    const repaired = repairColor(working[movableToken]!, working[fixedToken]!, constraint.minRatio);
    if (!repaired) {
      violations.push({ constraint, actualRatio: actual, unrepairable: true });
      continue;
    }
    repairs.push({
      token: movableToken,
      before: working[movableToken]!,
      after: repaired,
      constraint,
      achievedRatio: contrastRatio(repaired, working[fixedToken]!),
    });
    working[movableToken] = repaired;
  }

  return {
    ok: violations.length === 0,
    violations,
    repairs,
    colors: working,
  };
}
