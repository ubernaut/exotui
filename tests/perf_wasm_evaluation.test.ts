// Copyright 2023 Im-Beast. MIT license.

// PER-009 (evaluation): WASM kernels are adoptable only under corpus
// equality (the QAL-003 gates), browser/Deno portability, and an
// end-to-end win AFTER boundary overhead. This suite instantiates a
// minimal hand-encoded WASM module through the standard WebAssembly API
// (the identical API browsers expose — portability evidence), verifies
// correctness, and MEASURES the JS→WASM call boundary against the same
// operation in TypeScript. The recorded verdict: per-call boundary cost
// makes character-at-a-time Unicode kernels a loss; only whole-buffer
// batch kernels could clear the bar, and any future candidate must pass
// the QAL-003 conformance gates for corpus equality first.

import { assert, assertEquals } from "./deps.ts";

// (module (func (export "add") (param i32 i32) (result i32)
//   local.get 0 local.get 1 i32.add))
const MINIMAL_ADD_WASM = new Uint8Array([
  0x00,
  0x61,
  0x73,
  0x6d, // \0asm
  0x01,
  0x00,
  0x00,
  0x00, // version 1
  0x01,
  0x07,
  0x01,
  0x60,
  0x02,
  0x7f,
  0x7f,
  0x01,
  0x7f, // type (i32,i32)->i32
  0x03,
  0x02,
  0x01,
  0x00, // one function of type 0
  0x07,
  0x07,
  0x01,
  0x03,
  0x61,
  0x64,
  0x64,
  0x00,
  0x00, // export "add"
  0x0a,
  0x09,
  0x01,
  0x07,
  0x00,
  0x20,
  0x00,
  0x20,
  0x01,
  0x6a,
  0x0b, // body
]);

Deno.test("the standard WebAssembly API instantiates and computes (portability)", async () => {
  const { instance } = await WebAssembly.instantiate(MINIMAL_ADD_WASM);
  const add = instance.exports["add"] as (a: number, b: number) => number;
  assertEquals(add(2, 3), 5);
  assertEquals(add(-1, 1), 0);
  // The identical WebAssembly.instantiate contract exists in browsers;
  // no Deno-specific API is involved anywhere in this evaluation.
});

Deno.test("measured boundary overhead: per-call kernels lose, batching is the only path", async () => {
  const { instance } = await WebAssembly.instantiate(MINIMAL_ADD_WASM);
  const wasmAdd = instance.exports["add"] as (a: number, b: number) => number;
  const tsAdd = (a: number, b: number) => (a + b) | 0;

  const ITERATIONS = 2_000_000;
  let accumulator = 0;

  const wasmStart = performance.now();
  for (let index = 0; index < ITERATIONS; index += 1) accumulator = wasmAdd(accumulator, 1);
  const wasmMs = performance.now() - wasmStart;

  let tsAccumulator = 0;
  const tsStart = performance.now();
  for (let index = 0; index < ITERATIONS; index += 1) tsAccumulator = tsAdd(tsAccumulator, 1);
  const tsMs = performance.now() - tsStart;

  assertEquals(accumulator, ITERATIONS);
  assertEquals(tsAccumulator, ITERATIONS);

  const wasmNsPerCall = (wasmMs * 1e6) / ITERATIONS;
  const tsNsPerCall = (tsMs * 1e6) / ITERATIONS;
  // The evaluation's core finding: the JS->WASM boundary costs real
  // nanoseconds per call while the TS operation JITs to near-zero. A
  // per-codepoint Unicode scan (one boundary crossing per character)
  // therefore CANNOT win; only batch kernels processing whole buffers
  // per crossing remain candidates.
  assert(
    wasmNsPerCall > tsNsPerCall,
    `expected boundary overhead: wasm ${wasmNsPerCall.toFixed(1)}ns/call vs ts ${tsNsPerCall.toFixed(1)}ns/call`,
  );
  // Sanity ceiling so a pathological environment still fails loudly.
  assert(wasmMs < 10_000 && tsMs < 10_000);
});
