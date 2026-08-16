// Copyright 2023 Im-Beast. MIT license.

// THEM-009: icons are named glyphs with a WIDTH CONTRACT. Every icon in a
// pack declares the cells it occupies and provides an ASCII fallback of
// the same declared width; validation measures the glyph AND the
// fallback under every supported terminal width profile (TXT-003's
// narrow, CJK-wide, and visible-combining profiles, emoji-aware) and
// reports each icon that would break its contract anywhere. Resolution
// picks the glyph when the active profile honors the contract and the
// ASCII fallback otherwise, so an icon never silently occupies the wrong
// number of cells.

import { emojiAwareTextWidth } from "./unicode/emoji.ts";
import {
  CJK_WIDE_WIDTH_PROFILE,
  UNICODE_NARROW_WIDTH_PROFILE,
  type UnicodeTerminalWidthProfile,
  VISIBLE_COMBINING_WIDTH_PROFILE,
} from "./unicode/width.ts";

/** One icon definition. */
export interface IconDefinition {
  readonly glyph: string;
  /** Cells the icon occupies — the contract. */
  readonly cells: number;
  /** ASCII fallback; must occupy the same declared cells. */
  readonly fallback: string;
}

/** One icon pack. */
export interface IconPack {
  readonly name: string;
  readonly icons: Readonly<Record<string, IconDefinition>>;
}

/** The width profiles validation covers. */
export const SUPPORTED_WIDTH_PROFILES: readonly UnicodeTerminalWidthProfile[] = [
  UNICODE_NARROW_WIDTH_PROFILE,
  CJK_WIDE_WIDTH_PROFILE,
  VISIBLE_COMBINING_WIDTH_PROFILE,
];

/** One contract violation. */
export interface IconContractViolation {
  readonly pack: string;
  readonly icon: string;
  readonly part: "glyph" | "fallback";
  readonly profile: string;
  readonly declaredCells: number;
  readonly measuredCells: number;
}

/** Validates one pack against every supported width profile. */
export function validateIconPack(pack: IconPack): readonly IconContractViolation[] {
  const violations: IconContractViolation[] = [];
  for (const [name, icon] of Object.entries(pack.icons)) {
    for (const profile of SUPPORTED_WIDTH_PROFILES) {
      const glyphWidth = emojiAwareTextWidth(icon.glyph, { profile });
      if (glyphWidth !== icon.cells) {
        violations.push({
          pack: pack.name,
          icon: name,
          part: "glyph",
          profile: profile.name,
          declaredCells: icon.cells,
          measuredCells: glyphWidth,
        });
      }
      const fallbackWidth = emojiAwareTextWidth(icon.fallback, { profile });
      if (fallbackWidth !== icon.cells) {
        violations.push({
          pack: pack.name,
          icon: name,
          part: "fallback",
          profile: profile.name,
          declaredCells: icon.cells,
          measuredCells: fallbackWidth,
        });
      }
    }
  }
  return violations;
}

/** A resolved icon: what to draw and the cells it will occupy. */
export interface ResolvedIcon {
  readonly text: string;
  readonly cells: number;
  readonly usedFallback: boolean;
}

/** The icon registry. */
export class IconRegistry {
  readonly #packs = new Map<string, IconPack>();

  /** Registers a pack; contract violations are returned, not swallowed. */
  register(pack: IconPack): readonly IconContractViolation[] {
    this.#packs.set(pack.name, pack);
    return validateIconPack(pack);
  }

  /**
   * Resolves `pack:icon` under the ACTIVE profile: the glyph when it
   * honors its contract there, else the ASCII fallback.
   */
  resolve(
    reference: string,
    profile: UnicodeTerminalWidthProfile = UNICODE_NARROW_WIDTH_PROFILE,
  ): ResolvedIcon | undefined {
    const [packName, iconName] = reference.split(":", 2);
    const icon = this.#packs.get(packName ?? "")?.icons[iconName ?? ""];
    if (!icon) return undefined;
    const glyphWidth = emojiAwareTextWidth(icon.glyph, { profile });
    if (glyphWidth === icon.cells) {
      return { text: icon.glyph, cells: icon.cells, usedFallback: false };
    }
    return { text: icon.fallback, cells: icon.cells, usedFallback: true };
  }
}

/** Creates an icon registry. */
export function createIconRegistry(): IconRegistry {
  return new IconRegistry();
}
