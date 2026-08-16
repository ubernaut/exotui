// Copyright 2023 Im-Beast. MIT license.

// TXT-004: complete UTS #51 emoji sequences — variation selectors, keycaps,
// flags, tag sequences, skin-tone modifiers, and ZWJ families — resolved as
// one measured cell span per extended grapheme cluster. The per-code-point
// width profiles (TXT-003) sum components, so a three-person ZWJ family would
// measure six cells; this module classifies each cluster and assigns the
// sequence one width instead.

import { BUILTIN_UNICODE_DATA_PACK } from "./builtin.ts";
import { hasEmojiProperty } from "./data_pack.ts";
import { segmentGraphemes } from "./grapheme.ts";
import { UNICODE_NARROW_WIDTH_PROFILE, type UnicodeTerminalWidthProfile } from "./width.ts";

const ZERO_WIDTH_JOINER = 0x200d;
const VARIATION_SELECTOR_TEXT = 0xfe0e;
const VARIATION_SELECTOR_EMOJI = 0xfe0f;
const COMBINING_ENCLOSING_KEYCAP = 0x20e3;
const REGIONAL_INDICATOR_FIRST = 0x1f1e6;
const REGIONAL_INDICATOR_LAST = 0x1f1ff;
const TAG_FIRST = 0xe0020;
const TAG_TERMINATOR = 0xe007f;

/** How one extended grapheme cluster resolved under UTS #51. */
export type EmojiSequenceKind =
  | "zwj-sequence"
  | "flag"
  | "tag-sequence"
  | "keycap"
  | "modified"
  | "emoji-presentation"
  | "text-presentation"
  | "text";

/** One measured span: a cluster, its classification, and its resolved width. */
export interface EmojiSequenceSpan {
  readonly cluster: string;
  /** UTF-16 offsets into the measured text. */
  readonly start: number;
  readonly end: number;
  readonly kind: EmojiSequenceKind;
  readonly cells: number;
}

/** Options for emoji-aware measurement. */
export interface EmojiAwareWidthOptions {
  /** Width profile for non-emoji clusters; defaults to Unicode narrow. */
  readonly profile?: UnicodeTerminalWidthProfile;
  /**
   * Cells one emoji sequence occupies. Terminals almost universally render
   * emoji two cells wide; a host that renders them narrow may configure 1.
   */
  readonly sequenceCells?: 1 | 2;
}

function isRegionalIndicator(codePoint: number): boolean {
  return codePoint >= REGIONAL_INDICATOR_FIRST && codePoint <= REGIONAL_INDICATOR_LAST;
}

function isTag(codePoint: number): boolean {
  return codePoint >= TAG_FIRST && codePoint <= TAG_TERMINATOR;
}

function isKeycapBase(codePoint: number): boolean {
  return codePoint === 0x23 || codePoint === 0x2a || (codePoint >= 0x30 && codePoint <= 0x39);
}

function emoji(property: string, codePoint: number): boolean {
  return hasEmojiProperty(BUILTIN_UNICODE_DATA_PACK, property, codePoint);
}

/** Classifies one extended grapheme cluster under UTS #51. */
export function classifyEmojiSequence(cluster: string): EmojiSequenceKind {
  const codePoints: number[] = [];
  for (const scalar of cluster) codePoints.push(scalar.codePointAt(0)!);
  if (codePoints.length === 0) return "text";

  let pictographic = false;
  let joiner = false;
  let emojiSelector = false;
  let textSelector = false;
  let modifier = false;
  let tagged = false;
  let regionals = 0;
  for (const codePoint of codePoints) {
    if (codePoint === ZERO_WIDTH_JOINER) joiner = true;
    else if (codePoint === VARIATION_SELECTOR_EMOJI) emojiSelector = true;
    else if (codePoint === VARIATION_SELECTOR_TEXT) textSelector = true;
    else if (isTag(codePoint)) tagged = true;
    else if (isRegionalIndicator(codePoint)) regionals += 1;
    else if (emoji("Emoji_Modifier", codePoint)) modifier = true;
    else if (emoji("Extended_Pictographic", codePoint)) pictographic = true;
  }

  if (joiner && pictographic) return "zwj-sequence";
  if (regionals === 2 && codePoints.length === 2) return "flag";
  if (tagged && codePoints.at(-1) === TAG_TERMINATOR) return "tag-sequence";
  if (codePoints.at(-1) === COMBINING_ENCLOSING_KEYCAP && isKeycapBase(codePoints[0]!)) return "keycap";
  if (modifier && pictographic) return "modified";
  if (textSelector && !emojiSelector) return "text-presentation";
  if (emojiSelector && (pictographic || emoji("Emoji", codePoints[0]!))) return "emoji-presentation";
  if (pictographic && emoji("Emoji_Presentation", codePoints[0]!)) return "emoji-presentation";
  return "text";
}

/**
 * Segments text into extended grapheme clusters and resolves each cluster's
 * width as one span: every emoji sequence kind occupies `sequenceCells`
 * (default 2), a text-presentation sequence measures its base through the
 * profile, and everything else keeps the profile's per-code-point sum. The
 * segmentation is UAX #29, so results are identical however the caller's
 * chunks were concatenated.
 */
export function segmentEmojiSequences(
  text: string,
  options: EmojiAwareWidthOptions = {},
): readonly EmojiSequenceSpan[] {
  const profile = options.profile ?? UNICODE_NARROW_WIDTH_PROFILE;
  const sequenceCells = options.sequenceCells ?? 2;
  const spans: EmojiSequenceSpan[] = [];
  for (const cluster of segmentGraphemes(text)) {
    const kind = classifyEmojiSequence(cluster.segment);
    let cells: number;
    if (kind === "text") {
      cells = profile.textWidth(cluster.segment);
    } else if (kind === "text-presentation") {
      const base = String.fromCodePoint(cluster.segment.codePointAt(0)!);
      cells = Math.max(1, profile.textWidth(base));
    } else {
      cells = sequenceCells;
    }
    spans.push({
      cluster: cluster.segment,
      start: cluster.start,
      end: cluster.end,
      kind,
      cells,
    });
  }
  return spans;
}

/** Total cell width of text with UTS #51 sequences measured as single spans. */
export function emojiAwareTextWidth(text: string, options: EmojiAwareWidthOptions = {}): number {
  let cells = 0;
  for (const span of segmentEmojiSequences(text, options)) cells += span.cells;
  return cells;
}
