// Copyright 2023 Im-Beast. MIT license.

// TERM-001: every split point of a corpus produces the same token stream
// as one contiguous write.

import { assert, assertEquals } from "./deps.ts";
import { createIncrementalTerminalParser, type TerminalToken } from "../mod.ts";

const encoder = new TextEncoder();

function tokensOf(...chunks: (Uint8Array | string)[]): TerminalToken[] {
  const parser = createIncrementalTerminalParser();
  const tokens: TerminalToken[] = [];
  for (const chunk of chunks) tokens.push(...parser.write(chunk));
  tokens.push(...parser.flush());
  return tokens;
}

// Merge adjacent text tokens: split points may cut printable runs into
// several text tokens, which is the same SCREEN, so normalize before
// comparing.
function normalized(tokens: TerminalToken[]): TerminalToken[] {
  const merged: TerminalToken[] = [];
  for (const token of tokens) {
    const last = merged[merged.length - 1];
    if (token.kind === "text" && last?.kind === "text") {
      merged[merged.length - 1] = { kind: "text", text: last.text + token.text };
    } else {
      merged.push(token);
    }
  }
  return merged;
}

const CORPUS =
  "hi\x1b[1;31mred\x1b[0m\x07\x1b]0;a title\x07中🙂\x1b]8;;https://x\x1b\\\x1bP1$rdata\x1b\\tail\x1b(B\r\n\x1b[?25l\x1b[2J";

Deno.test("contiguous write tokenizes the corpus structurally", () => {
  const tokens = tokensOf(encoder.encode(CORPUS));
  const kinds = tokens.map((token) => token.kind);
  assertEquals(kinds, [
    "text", // hi
    "csi", // 1;31m
    "text", // red
    "csi", // 0m
    "control", // BEL
    "osc", // title
    "text", // 中🙂
    "osc", // hyperlink via ST
    "dcs", // DECRQSS-style
    "text", // tail
    "esc", // charset
    "control", // CR
    "control", // LF
    "csi", // ?25l
    "csi", // 2J
  ]);
  assertEquals(tokens[1], { kind: "csi", prefix: "", params: "1;31", intermediates: "", final: "m" });
  assertEquals(tokens[5], { kind: "osc", data: "0;a title", terminator: "bel" });
  assertEquals(tokens[7], { kind: "osc", data: "8;;https://x", terminator: "st" });
  assertEquals(tokens[8], { kind: "dcs", data: "1$rdata" });
  assertEquals(tokens[10], { kind: "esc", intermediates: "(", final: "B" });
  assertEquals(tokens[13], { kind: "csi", prefix: "?", params: "25", intermediates: "", final: "l" });
});

Deno.test("every byte split point produces the same tokens as one write", () => {
  const bytes = encoder.encode(CORPUS);
  const whole = normalized(tokensOf(bytes));
  for (let split = 1; split < bytes.length; split += 1) {
    const parts = normalized(tokensOf(bytes.slice(0, split), bytes.slice(split)));
    assertEquals(parts, whole, `split at byte ${split} diverged`);
  }
});

Deno.test("three-way splits across an emoji and an OSC stay invariant", () => {
  const bytes = encoder.encode("a\x1b]52;c;SGVsbG8=\x07🙂\x1b[H");
  const whole = normalized(tokensOf(bytes));
  for (let first = 1; first < bytes.length - 1; first += 4) {
    for (let second = first + 1; second < bytes.length; second += 3) {
      const parts = normalized(
        tokensOf(bytes.slice(0, first), bytes.slice(first, second), bytes.slice(second)),
      );
      assertEquals(parts, whole, `splits at ${first},${second} diverged`);
    }
  }
});

Deno.test("flush surfaces an unterminated sequence instead of losing it", () => {
  const parser = createIncrementalTerminalParser();
  assertEquals(parser.write("start\x1b]0;half a titl"), [{ kind: "text", text: "start" }]);
  assert(parser.pendingLength() > 0);
  assertEquals(parser.flush(), [{ kind: "text", text: "\x1b]0;half a titl" }]);
  assertEquals(parser.pendingLength(), 0);
});

// TERM-002: adversarial streams stay linear and recover to ground state
// with a classified diagnostic.

Deno.test("an unterminated OSC flood is bounded and recovers at the terminator", () => {
  const parser = createIncrementalTerminalParser({ maxPendingBytes: 64 });
  const tokens: TerminalToken[] = [];
  tokens.push(...parser.write("\x1b]0;"));
  for (let round = 0; round < 100; round += 1) {
    tokens.push(...parser.write("A".repeat(32)));
    assert(parser.pendingLength() <= 64 + 32, "pending memory must stay bounded");
  }
  const diagnostics = tokens.filter((token) => token.kind === "diagnostic");
  assertEquals(diagnostics.length, 1);
  assertEquals(diagnostics[0]!.reason, "pending-bytes-exceeded");
  // The terminator ends the discard and ground state resumes cleanly.
  const after = parser.write("\x07hello");
  assertEquals(after, [{ kind: "text", text: "hello" }]);
});

Deno.test("overlong OSC inside one write is discarded with a diagnostic", () => {
  const parser = createIncrementalTerminalParser({ maxStringBytes: 16 });
  const tokens = parser.write(`\x1b]0;${"B".repeat(100)}\x07after`);
  assertEquals(tokens[0]!.kind, "diagnostic");
  assert(tokens[0]!.kind === "diagnostic" && tokens[0]!.reason === "string-bytes-exceeded");
  assertEquals(tokens[1], { kind: "text", text: "after" });
});

Deno.test("split ST still ends a discarded sequence", () => {
  const parser = createIncrementalTerminalParser({ maxStringBytes: 8 });
  const first = parser.write(`\x1bP${"C".repeat(50)}`);
  assertEquals(first.map((token) => token.kind), ["diagnostic"]);
  parser.write("more-ignored\x1b"); // chunk ends mid-terminator
  const done = parser.write("\\visible");
  assertEquals(done, [{ kind: "text", text: "visible" }]);
});

Deno.test("CSI parameter floods drop the sequence and continue", () => {
  const parser = createIncrementalTerminalParser({ maxCsiParamBytes: 8 });
  const tokens = parser.write("\x1b[1;2;3;4;5;6;7;8;9;10mok\x1b[0m");
  assertEquals(tokens[0]!.kind, "diagnostic");
  assert(tokens[0]!.kind === "diagnostic" && tokens[0]!.reason === "csi-params-exceeded");
  assertEquals(tokens[1], { kind: "text", text: "mok" }); // final byte of the dropped CSI stays out
  assertEquals(tokens[2], { kind: "csi", prefix: "", params: "0", intermediates: "", final: "m" });
});

Deno.test("incomplete sequences have a bounded lifetime in writes", () => {
  const parser = createIncrementalTerminalParser({ maxPendingWrites: 3 });
  parser.write("\x1bP12"); // incomplete DCS, small enough to carry
  let diagnostics: TerminalToken[] = [];
  for (let round = 0; round < 5; round += 1) {
    diagnostics = diagnostics.concat(parser.write("").filter((token) => token.kind === "diagnostic"));
  }
  assertEquals(diagnostics.length, 1);
  assert(diagnostics[0]!.kind === "diagnostic" && diagnostics[0]!.reason === "pending-writes-exceeded");
  assertEquals(parser.write("clean"), [{ kind: "text", text: "clean" }]);
});
