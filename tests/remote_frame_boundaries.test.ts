// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals } from "./deps.ts";
import {
  applyCellFrameDelta,
  type CellFrame,
  createFrameFlowController,
  decodeCellFrame,
  encodeCellFrame,
  encodeCellFrameDelta,
  frameChecksum,
} from "../mod.remote.ts";

const frame = (chars: readonly string[]): CellFrame => ({
  columns: chars.length,
  rows: 1,
  cells: chars.map((char) => ({ char, style: "\x1b[4:2;58;2;0;255;0m" })),
});
const serialized = <T>(value: T): T => JSON.parse(JSON.stringify(value));

Deno.test("remote full frames retain arbitrary explicit cells, complex clusters and empty wide followers", () => {
  const expected = frame(["ạ́́", "क्ष", "क्‍ष", "각", "", "1️⃣", "", "👩‍💻", "", "AB", "", " "]);
  const decoded = decodeCellFrame(serialized(encodeCellFrame(expected)));
  assert(decoded.ok, JSON.stringify(decoded));
  assertEquals(decoded.frame, expected);
  assert(
    JSON.stringify(encodeCellFrame(frame(["AB", ""])).runs) !==
      JSON.stringify(encodeCellFrame(frame(["A", "B"])).runs),
    "Explicit cell boundaries must distinguish identical concatenated text.",
  );
});

Deno.test("remote deltas preserve wide owners/followers and do not report valid complex labels as stale", () => {
  const base = frame(["A", "B", "C", ".", ".", ".", ".", "."]);
  const next = frame(["界", "", "ạ́́", ".", ".", ".", ".", "."]);
  const delta = serialized(encodeCellFrameDelta(base, next));
  assert(delta.kind === "delta");
  const decoded = applyCellFrameDelta(base, delta);
  assert(decoded.ok, JSON.stringify(decoded));
  assertEquals(decoded.frame, next);
});

Deno.test("current remote checksums disambiguate character/style separator bytes", () => {
  const first: CellFrame = { columns: 1, rows: 1, cells: [{ char: "A\0", style: "B" }] };
  const second: CellFrame = { columns: 1, rows: 1, cells: [{ char: "A", style: "\0B" }] };
  assert(frameChecksum(first) !== frameChecksum(second));
});

Deno.test("remote deltas reject out-of-row and negative spans even when the result checksum would match", () => {
  const base = frame(["A", "B", "C", "D"]), delta = encodeCellFrameDelta(base, base);
  assert(delta.kind === "delta");
  for (const [row, column] of [[-1, 0], [0, -1], [1, 0], [0, 4]]) {
    const result = applyCellFrameDelta(base, { ...delta, spans: [{ row, column, runs: [] }] });
    assert(!result.ok, `${row}/${column} accepted invalid span`);
  }
});

Deno.test("remote decoders return resync for malformed payloads rather than throwing or invoking getters", () => {
  for (const value of [null, [], {}, { version: 1, columns: 1, rows: 1, palette: [""], runs: null }]) {
    const result = decodeCellFrame(value as never);
    assert(!result.ok);
  }
  let reads = 0;
  const encoded = encodeCellFrame(frame(["A"]));
  const result = decodeCellFrame({
    ...encoded,
    get runs(): never {
      reads++;
      throw new Error("Getter executed");
    },
  });
  assert(!result.ok);
  assertEquals(reads, 0);
});

Deno.test("remote flow owns offered frames and coalesced snapshots despite caller mutation", () => {
  const flow = createFrameFlowController({ windowSize: 1 });
  const mutable = { columns: 4, rows: 1, cells: ["A", ".", ".", "."].map((char) => ({ char, style: "plain" })) };
  const first = flow.offer(mutable)!;
  assert(first.payload.kind === "full");
  const client = decodeCellFrame(first.payload);
  assert(client.ok);
  mutable.cells[0]!.char = "B";
  flow.ack(first.sequence);
  const next = flow.offer({ ...mutable, cells: mutable.cells.map((cell) => ({ ...cell })) })!;
  assert(next.payload.kind === "delta");
  const applied = applyCellFrameDelta(client.frame, next.payload);
  assert(applied.ok, JSON.stringify(applied));
  assertEquals(applied.frame.cells[0]!.char, "B");
  const pending = { ...mutable, cells: mutable.cells.map((cell) => ({ ...cell, char: "C" })) };
  flow.offer(pending);
  pending.cells[0]!.char = "D";
  const released = flow.ack(next.sequence)!;
  const final = released.payload.kind === "full"
    ? decodeCellFrame(released.payload)
    : applyCellFrameDelta(applied.frame, released.payload);
  assert(final.ok);
  assertEquals(final.frame.cells[0]!.char, "C");
});
