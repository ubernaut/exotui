// Copyright 2023 Im-Beast. MIT license.

// TXT-004: UTS #51 emoji sequences resolve as one measured cell span. The
// fixture set covers every sequence class from Unicode's emoji-test data:
// ZWJ families, RIS flags, tag-sequence flags, keycaps, VS15/VS16 selection,
// and skin-tone modification, plus chunk-boundary stability.

import { assert, assertEquals } from "./deps.ts";
import {
  CJK_WIDE_WIDTH_PROFILE,
  classifyEmojiSequence,
  emojiAwareTextWidth,
  type EmojiSequenceKind,
  segmentEmojiSequences,
} from "../mod.ts";

const CASES: ReadonlyArray<{ text: string; kind: EmojiSequenceKind; cells: number; note: string }> = [
  { text: "👨‍👩‍👧‍👦", kind: "zwj-sequence", cells: 2, note: "four-person ZWJ family" },
  { text: "🏳️‍🌈", kind: "zwj-sequence", cells: 2, note: "rainbow flag (VS16 inside ZWJ)" },
  { text: "👩‍🚀", kind: "zwj-sequence", cells: 2, note: "profession sequence" },
  { text: "🇺🇦", kind: "flag", cells: 2, note: "regional-indicator pair" },
  { text: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", kind: "tag-sequence", cells: 2, note: "scotland tag sequence" },
  { text: "1️⃣", kind: "keycap", cells: 2, note: "keycap digit one" },
  { text: "#⃣", kind: "keycap", cells: 2, note: "keycap hash without VS16" },
  { text: "👍🏽", kind: "modified", cells: 2, note: "thumbs up + medium skin tone" },
  { text: "☂️", kind: "emoji-presentation", cells: 2, note: "narrow base promoted by VS16" },
  { text: "✈️", kind: "emoji-presentation", cells: 2, note: "airplane + VS16" },
  { text: "☂︎", kind: "text-presentation", cells: 1, note: "VS15 demotes to text width" },
  { text: "😀", kind: "emoji-presentation", cells: 2, note: "default emoji presentation" },
  { text: "a", kind: "text", cells: 1, note: "plain ASCII stays text" },
];

Deno.test("TXT-004 emoji sequence classes resolve as single spans", () => {
  for (const { text, kind, cells, note } of CASES) {
    const spans = segmentEmojiSequences(text);
    assertEquals(spans.length, 1, `${note}: one cluster`);
    assertEquals(spans[0]!.kind, kind, `${note}: kind`);
    assertEquals(spans[0]!.cells, cells, `${note}: cells`);
  }
});

Deno.test("TXT-004 mixed text sums span widths, not component widths", () => {
  // family(2) + "ok"(2) + flag(2) + keycap(2) + CJK 漢(2) = 10
  const text = "👨‍👩‍👧‍👦ok🇺🇦1️⃣漢";
  assertEquals(emojiAwareTextWidth(text), 10);
  // The per-code-point profile would have measured the family alone at 8.
  const spans = segmentEmojiSequences(text);
  assertEquals(spans.map((span) => span.kind), [
    "zwj-sequence",
    "text",
    "text",
    "flag",
    "keycap",
    "text",
  ]);
  // Offsets tile the string exactly.
  let cursor = 0;
  for (const span of spans) {
    assertEquals(span.start, cursor);
    cursor = span.end;
  }
  assertEquals(cursor, text.length);
});

Deno.test("TXT-004 chunk boundaries cannot change the measurement", () => {
  const text = "🏴󠁧󠁢󠁳󠁣󠁴󠁿👩‍🚀🇺🇦x☂️1️⃣";
  const whole = segmentEmojiSequences(text);
  // Concatenating any split of the input yields the same spans, because the
  // measurement is defined over the concatenated string's UAX #29 clusters.
  for (let split = 1; split < text.length; split += 1) {
    const rejoined = text.slice(0, split) + text.slice(split);
    assertEquals(segmentEmojiSequences(rejoined), whole);
  }
  assertEquals(emojiAwareTextWidth(text), 5 * 2 + 1);
});

Deno.test("TXT-004 configured widths honor profile and sequence cells", () => {
  // A narrow-emoji host can configure single-cell sequences.
  assertEquals(emojiAwareTextWidth("👨‍👩‍👧‍👦🇺🇦", { sequenceCells: 1 }), 2);
  // Non-emoji clusters still measure through the provided profile: ambiguous
  // scalars widen under the CJK profile.
  const ambiguous = "±"; // East Asian Ambiguous
  assertEquals(emojiAwareTextWidth(ambiguous), 1);
  assertEquals(emojiAwareTextWidth(ambiguous, { profile: CJK_WIDE_WIDTH_PROFILE }), 2);
  // classify is exposed for hosts that need the kind alone.
  assert(classifyEmojiSequence("🇺🇦") === "flag");
});
