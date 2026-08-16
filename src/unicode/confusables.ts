// Copyright 2023 Im-Beast. MIT license.

// SEC-007: UTS #39 identifier security for registries. Skeletons map
// confusable characters onto canonical Latin prototypes (a bounded common
// table over the TXT-009 set) so `pаypal` (Cyrillic а) and `paypal` share a
// skeleton; mixed-script restriction levels classify identifiers from
// single-script through unrestricted; and the registry guard diagnoses
// skeleton COLLISIONS between distinct identifiers — display text in one
// consistent script is never banned, because only collisions and
// high-risk mixes warn, not foreign scripts per se.

/** Confusable → prototype (bounded common set; superset of TXT-009's). */
const CONFUSABLE_PROTOTYPES = new Map<number, string>([
  // Cyrillic lowercase lookalikes.
  [0x0430, "a"],
  [0x0435, "e"],
  [0x043e, "o"],
  [0x0440, "p"],
  [0x0441, "c"],
  [0x0445, "x"],
  [0x0455, "s"],
  [0x0456, "i"],
  [0x0458, "j"],
  [0x04bb, "h"],
  // Cyrillic uppercase.
  [0x0410, "A"],
  [0x0412, "B"],
  [0x0415, "E"],
  [0x041a, "K"],
  [0x041c, "M"],
  [0x041d, "H"],
  [0x041e, "O"],
  [0x0420, "P"],
  [0x0421, "C"],
  [0x0422, "T"],
  [0x0425, "X"],
  // Greek.
  [0x03b1, "a"],
  [0x03bf, "o"],
  [0x03c1, "p"],
  [0x03c5, "u"],
  [0x03bd, "v"],
  [0x0391, "A"],
  [0x0392, "B"],
  [0x0395, "E"],
  [0x0397, "H"],
  [0x0399, "I"],
  [0x039a, "K"],
  [0x039c, "M"],
  [0x039d, "N"],
  [0x039f, "O"],
  [0x03a1, "P"],
  [0x03a4, "T"],
  [0x03a7, "X"],
  // Fullwidth & misc.
  [0x0261, "g"],
  [0x00e9, "e"],
  [0x2010, "-"],
  [0x2212, "-"],
]);

/** The UTS #39 skeleton (bounded prototype mapping + case preserved). */
export function confusableSkeleton(identifier: string): string {
  return [...identifier].map((char) => CONFUSABLE_PROTOTYPES.get(char.codePointAt(0)!) ?? char).join("");
}

/** Coarse script classes for restriction levels. */
type Script = "latin" | "cyrillic" | "greek" | "cjk" | "other" | "common";

function scriptOf(codePoint: number): Script {
  if (codePoint <= 0x2ff || (codePoint >= 0x1e00 && codePoint <= 0x1eff)) {
    return /[a-zA-ZÀ-ɏ]/.test(String.fromCodePoint(codePoint)) ? "latin" : "common";
  }
  if (codePoint >= 0x0370 && codePoint <= 0x03ff) return "greek";
  if (codePoint >= 0x0400 && codePoint <= 0x04ff) return "cyrillic";
  if ((codePoint >= 0x2e80 && codePoint <= 0x9fff) || (codePoint >= 0x3040 && codePoint <= 0x30ff)) return "cjk";
  return "other";
}

/** UTS #39 restriction levels (simplified ladder). */
export type RestrictionLevel = "single-script" | "highly-restrictive" | "minimally-restrictive" | "unrestricted";

/** Classifies an identifier's script mixing. */
export function restrictionLevel(identifier: string): RestrictionLevel {
  const scripts = new Set<Script>();
  for (const char of identifier) {
    const script = scriptOf(char.codePointAt(0)!);
    if (script !== "common") scripts.add(script);
  }
  if (scripts.size <= 1) return "single-script";
  // Latin + CJK is the classic highly-restrictive combination.
  if (scripts.size === 2 && scripts.has("latin") && scripts.has("cjk")) return "highly-restrictive";
  if (!scripts.has("cyrillic") && !scripts.has("greek")) return "minimally-restrictive";
  return "unrestricted"; // Latin mixed with Cyrillic/Greek: the risky zone
}

/** One identifier-security warning. */
export interface IdentifierWarning {
  readonly identifier: string;
  readonly kind: "skeleton-collision" | "risky-script-mix";
  readonly detail: string;
  /** For collisions: the previously registered identifier it collides with. */
  readonly collidesWith?: string;
}

/** Guards one registry namespace (files, commands, routes, plugins). */
export class IdentifierSecurityGuard {
  readonly #skeletons = new Map<string, string>();

  /**
   * Checks and records an identifier. Collisions with DIFFERENT existing
   * identifiers and risky script mixes warn; consistent multilingual text
   * passes freely.
   */
  check(identifier: string): readonly IdentifierWarning[] {
    const warnings: IdentifierWarning[] = [];
    const skeleton = confusableSkeleton(identifier);
    const existing = this.#skeletons.get(skeleton);
    if (existing !== undefined && existing !== identifier) {
      warnings.push({
        identifier,
        kind: "skeleton-collision",
        detail: `skeleton "${skeleton}" collides with registered "${existing}"`,
        collidesWith: existing,
      });
    } else if (existing === undefined) {
      this.#skeletons.set(skeleton, identifier);
    }
    if (restrictionLevel(identifier) === "unrestricted") {
      warnings.push({
        identifier,
        kind: "risky-script-mix",
        detail: "mixes Latin with Cyrillic/Greek lookalike scripts",
      });
    }
    return warnings;
  }

  inspect(): { readonly registered: number } {
    return { registered: this.#skeletons.size };
  }
}

/** Creates an identifier-security guard for one registry. */
export function createIdentifierSecurityGuard(): IdentifierSecurityGuard {
  return new IdentifierSecurityGuard();
}
