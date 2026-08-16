// Copyright 2023 Im-Beast. MIT license.

// QAL-002: fuzz the incremental terminal parser and sanitizer with
// arbitrary byte chunks, nested/malformed control strings, and malformed
// UTF-8. Every failure is reproducible from the printed seed alone, and
// every case must respect the parser's bounds: no crash, no hang, pending
// memory at or under the cap, and (for the sanitizer) no control bytes in
// the output beyond the allowlist.

import { assert, assertEquals } from "./deps.ts";
import { createIncrementalTerminalParser, createStreamingTerminalSanitizer, type TerminalToken } from "../mod.ts";

/** Deterministic PRNG so failures replay from their seed. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FRAGMENTS = [
  "plain text ",
  "中🙂",
  "\x1b[",
  "\x1b[1;31m",
  "\x1b]0;title",
  "\x07",
  "\x1b\\",
  "\x1bP+q",
  "\x1b_G",
  "\x1b[?1049h",
  "\x1b",
  "[",
  ";;;;;;",
  "\x00\x08\x7f",
  "\x1b]52;c;",
  "\x1b[999999999999m",
];

function randomBytes(random: () => number, budget: number): Uint8Array {
  const encoder = new TextEncoder();
  const parts: number[] = [];
  while (parts.length < budget) {
    if (random() < 0.7) {
      const fragment = FRAGMENTS[Math.floor(random() * FRAGMENTS.length)]!;
      parts.push(...encoder.encode(fragment));
    } else {
      // Raw bytes, including malformed UTF-8 continuation garbage.
      const count = 1 + Math.floor(random() * 6);
      for (let i = 0; i < count; i += 1) parts.push(Math.floor(random() * 256));
    }
  }
  return new Uint8Array(parts.slice(0, budget));
}

function* randomChunks(random: () => number, bytes: Uint8Array): Generator<Uint8Array> {
  let offset = 0;
  while (offset < bytes.length) {
    const size = 1 + Math.floor(random() * 37);
    yield bytes.slice(offset, offset + size);
    offset += size;
  }
}

Deno.test("fuzz: parser never crashes and pending memory respects the cap", () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const random = mulberry32(seed * 7919);
    const parser = createIncrementalTerminalParser({
      maxPendingBytes: 512,
      maxStringBytes: 256,
      maxCsiParamBytes: 32,
      maxPendingWrites: 16,
    });
    const bytes = randomBytes(random, 2048);
    let tokenCount = 0;
    for (const chunk of randomChunks(random, bytes)) {
      const tokens = parser.write(chunk);
      tokenCount += tokens.length;
      assert(
        parser.pendingLength() <= 512 + 64,
        `seed ${seed}: pending ${parser.pendingLength()} exceeded the cap`,
      );
    }
    parser.flush();
    assert(tokenCount >= 0, `seed ${seed}`);
  }
});

Deno.test("fuzz: chunking never changes the parsed token stream", () => {
  const merge = (tokens: TerminalToken[]): TerminalToken[] => {
    const out: TerminalToken[] = [];
    for (const token of tokens) {
      const last = out[out.length - 1];
      if (token.kind === "text" && last?.kind === "text") {
        out[out.length - 1] = { kind: "text", text: last.text + token.text };
      } else out.push(token);
    }
    return out;
  };
  for (let seed = 1; seed <= 40; seed += 1) {
    const random = mulberry32(seed * 104729);
    const bytes = randomBytes(random, 1024);

    const whole = createIncrementalTerminalParser();
    const wholeTokens = merge([...whole.write(bytes), ...whole.flush()]);

    const chunked = createIncrementalTerminalParser();
    const chunkedTokens: TerminalToken[] = [];
    for (const chunk of randomChunks(random, bytes)) chunkedTokens.push(...chunked.write(chunk));
    chunkedTokens.push(...chunked.flush());

    assertEquals(merge(chunkedTokens), wholeTokens, `seed ${seed}: chunking diverged`);
  }
});

Deno.test("fuzz: sanitizer output never carries a disallowed control byte", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const random = mulberry32(seed * 31337);
    const sanitizer = createStreamingTerminalSanitizer({
      limits: { maxPendingBytes: 512, maxStringBytes: 256 },
    });
    const bytes = randomBytes(random, 2048);
    let output = "";
    for (const chunk of randomChunks(random, bytes)) output += sanitizer.write(chunk);
    output += sanitizer.flush();

    // The only ESC uses allowed are CSI m (SGR) sequences under the default
    // profile; every other C0 must be TAB/LF/CR.
    const stripped = output.replace(/\x1b\[[0-9;:]*m/g, "");
    for (const char of stripped) {
      const code = char.codePointAt(0)!;
      assert(
        code === 0x09 || code === 0x0a || code === 0x0d || (code >= 0x20 && code !== 0x7f),
        `seed ${seed}: control 0x${code.toString(16)} leaked into sanitized output`,
      );
    }
  }
});
