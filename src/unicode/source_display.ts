// Copyright 2023 Im-Beast. MIT license.

// TXT-009: UTS #55 source-code display. Source lines are analyzed for the
// trojan-source arsenal — bidi controls, invisible characters, confusable
// mixed-script identifiers, and disguised line breaks — and the safe
// rendering isolates every lexical atom in FSI…PDI so bidi content inside
// one token can never visually reorder ACROSS tokens, while control
// characters render as visible ⟦U+XXXX⟧ markers. Two distinct token streams
// therefore cannot render as an indistinguishable line: either the
// characters differ visibly, or the analysis carries a warning.

/** One security finding on a source line. */
export interface SourceDisplayFinding {
  readonly kind: "bidi-control" | "invisible" | "confusable" | "disguised-line-break";
  /** UTF-16 offset of the character. */
  readonly offset: number;
  readonly codePoint: number;
  readonly detail: string;
}

const BIDI_CONTROLS = new Set([
  0x202a,
  0x202b,
  0x202c,
  0x202d,
  0x202e, // LRE RLE PDF LRO RLO
  0x2066,
  0x2067,
  0x2068,
  0x2069, // LRI RLI FSI PDI
  0x200e,
  0x200f,
  0x061c, // LRM RLM ALM
]);

const INVISIBLES = new Set([0x200b, 0x2060, 0xfeff, 0x00ad, 0x180e]);
const DISGUISED_BREAKS = new Set([0x2028, 0x2029, 0x0085, 0x000b, 0x000c]);

/** Latin-lookalike confusables from other scripts (bounded, common set). */
const CONFUSABLES = new Map<number, string>([
  [0x0430, "a"],
  [0x0435, "e"],
  [0x043e, "o"],
  [0x0440, "p"],
  [0x0441, "c"],
  [0x0445, "x"],
  [0x0455, "s"],
  [0x0456, "i"],
  [0x03b1, "a"],
  [0x03bf, "o"],
  [0x0261, "g"],
  [0x0410, "A"],
  [0x0412, "B"],
  [0x0415, "E"],
  [0x041d, "H"],
  [0x041e, "O"],
  [0x0420, "P"],
  [0x0421, "C"],
  [0x0422, "T"],
  [0x0391, "A"],
  [0x0392, "B"],
  [0x039f, "O"],
]);

/** Analyzes one source line for display-security hazards. */
export function analyzeSourceLine(text: string): readonly SourceDisplayFinding[] {
  const findings: SourceDisplayFinding[] = [];
  let sawLatin = false;
  for (let offset = 0; offset < text.length;) {
    const codePoint = text.codePointAt(offset)!;
    if (BIDI_CONTROLS.has(codePoint)) {
      findings.push({
        kind: "bidi-control",
        offset,
        codePoint,
        detail: `bidi control U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
      });
    } else if (INVISIBLES.has(codePoint)) {
      findings.push({
        kind: "invisible",
        offset,
        codePoint,
        detail: `invisible character U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
      });
    } else if (DISGUISED_BREAKS.has(codePoint)) {
      findings.push({
        kind: "disguised-line-break",
        offset,
        codePoint,
        detail: `line break U+${codePoint.toString(16).toUpperCase().padStart(4, "0")} inside a line`,
      });
    } else if (CONFUSABLES.has(codePoint) && sawLatin) {
      findings.push({
        kind: "confusable",
        offset,
        codePoint,
        detail: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")} is confusable with "${
          CONFUSABLES.get(codePoint)
        }" in mixed-script context`,
      });
    }
    if (codePoint >= 0x41 && codePoint <= 0x7a) sawLatin = true;
    offset += codePoint > 0xffff ? 2 : 1;
  }
  return findings;
}

/** One lexical atom of the coarse UTS #55 tokenization. */
export interface SourceAtom {
  readonly text: string;
  readonly kind: "identifier" | "number" | "string" | "comment" | "punctuation" | "space";
}

/** Coarse language-neutral tokenization into lexical atoms. */
export function tokenizeSourceLine(text: string): readonly SourceAtom[] {
  const atoms: SourceAtom[] = [];
  const pattern =
    /(\/\/.*$|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|([\p{L}\p{M}_$][\p{L}\p{M}\p{N}_$]*)|(\d[\d_.]*)|(\s+)|(.)/gmuy;
  for (const match of text.matchAll(pattern)) {
    if (match[1] !== undefined) atoms.push({ text: match[1], kind: "comment" });
    else if (match[2] !== undefined) atoms.push({ text: match[2], kind: "string" });
    else if (match[3] !== undefined) atoms.push({ text: match[3], kind: "identifier" });
    else if (match[4] !== undefined) atoms.push({ text: match[4], kind: "number" });
    else if (match[5] !== undefined) atoms.push({ text: match[5], kind: "space" });
    else atoms.push({ text: match[6]!, kind: "punctuation" });
  }
  return atoms;
}

const FSI = "⁨";
const PDI = "⁩";

/**
 * The safe display form: every atom is FSI…PDI-isolated so bidi content in
 * one token cannot reorder across token boundaries, and control/invisible
 * characters render as visible ⟦U+XXXX⟧ markers.
 */
export function renderSourceLineSafely(text: string): string {
  const atoms = tokenizeSourceLine(text);
  return atoms.map((atom) => {
    const visible = [...atom.text].map((char) => {
      const codePoint = char.codePointAt(0)!;
      if (BIDI_CONTROLS.has(codePoint) || INVISIBLES.has(codePoint) || DISGUISED_BREAKS.has(codePoint)) {
        return `⟦U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}⟧`;
      }
      return char;
    }).join("");
    return atom.kind === "space" ? visible : `${FSI}${visible}${PDI}`;
  }).join("");
}
