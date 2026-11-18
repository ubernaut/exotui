// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertThrows } from "./deps.ts";
import {
  applyCellFrameDelta,
  type CellFrame,
  createFrameFlowController,
  decodeCellFrame,
  encodeCellFrame,
  encodeCellFrameDelta,
  FRAME_CODEC_CAPABILITY,
  FRAME_CODEC_LIMITS,
  FRAME_CODEC_VERSION,
  frameChecksum,
  FrameCodecError,
  negotiatedFrameCodecVersion,
  RemoteCapabilityHandshake,
  snapshotCellFrame,
} from "../mod.remote.ts";

const frame = (chars: readonly string[], columns = chars.length): CellFrame => ({
  columns,
  rows: chars.length / columns,
  cells: chars.map((char, index) => ({ char, style: index % 2 ? "plain" : "\x1b[4:3;58;2;0;255;0m" })),
});
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));

Deno.test("remote v2 stores UTF-16 boundaries explicitly without interpreting or normalizing cells", () => {
  const source = frame(["", "\ud800", "\udc00", "\0", "\x1b[31mAB", "e\u0301", "ẹ́́", "क्ष", "각", "1️⃣", "👩‍💻", " "]);
  const encoded = json(encodeCellFrame(source));
  assertEquals(FRAME_CODEC_VERSION, 2);
  assertEquals(encoded.version, 2);
  assertEquals(encoded.runs.flatMap((run) => run.lengths!), source.cells.map((cell) => cell.char.length));
  const result = decodeCellFrame(encoded);
  assert(result.ok);
  assertEquals(result.frame, source);
});

Deno.test("remote legacy full and delta use the exact v1 shape and reject unrepresentable cells before encoding", () => {
  const base = frame(["A", "🌈", "C", "\ud800"]);
  const full = json(encodeCellFrame(base, { version: 1 }));
  assertEquals(full.version, 1);
  assert(full.runs.every((run) => !Object.hasOwn(run, "lengths")));
  const decoded = decodeCellFrame(full);
  assert(decoded.ok);
  assertEquals(decoded.frame, base);
  assertEquals(full.checksum, frameChecksum(base, { version: 1 }));
  const next = frame(["B", "🌈", "C", "\ud800"]), delta = json(encodeCellFrameDelta(base, next, { version: 1 }));
  assert(delta.kind === "delta");
  assert(!Object.hasOwn(delta, "baseChecksum"));
  const result = applyCellFrameDelta(base, delta);
  assert(result.ok);
  assertEquals(result.frame, next);
  for (const char of ["", "AB", "é", "👩‍💻", "1️⃣"]) {
    assertEquals(
      assertThrows(() => encodeCellFrame(frame([char]), { version: 1 }), FrameCodecError).code,
      "legacy-cell",
    );
    assertEquals(
      assertThrows(() => encodeCellFrameDelta(frame([char]), base, { version: 1 }), FrameCodecError).code,
      "legacy-cell",
    );
  }
});

Deno.test("remote legacy runs keep adjacent unpaired surrogates in separate explicit cells", () => {
  const source: CellFrame = {
    columns: 3,
    rows: 2,
    cells: ["\ud800", "\udc00", "\ud801", "\udc01", "A", "B"].map((char) => ({ char, style: "same" })),
  };
  const full = encodeCellFrame(source, { version: 1 });
  const decoded = decodeCellFrame(json(full));
  assert(decoded.ok, JSON.stringify(decoded));
  assertEquals(decoded.frame, source);
  assertEquals(full.runs.map((run) => run.text), ["\ud800", "\udc00\ud801", "\udc01AB"]);
  const next = {
    ...source,
    cells: source.cells.map((cell, index) => index < 2 ? { ...cell, char: index ? "\udc02" : "\ud802" } : cell),
  };
  const delta = encodeCellFrameDelta(source, next, { version: 1 });
  assert(delta.kind === "delta");
  const applied = applyCellFrameDelta(decoded.frame, json(delta));
  assert(applied.ok, JSON.stringify(applied));
  assertEquals(applied.frame, next);
});

Deno.test("remote codec version comes from the ready handshake intersection, never one peer's advertisement", () => {
  for (const [hostV2, clientV2] of [[false, false], [true, false], [false, true], [true, true]]) {
    const manifest = (supported: boolean) => ({
      protocol: { major: 1, minor: 0 },
      mandatory: ["cell-frame"],
      optional: supported ? [FRAME_CODEC_CAPABILITY] : [],
    });
    const host = new RemoteCapabilityHandshake({ role: "acceptor", manifest: manifest(hostV2!) });
    const client = new RemoteCapabilityHandshake({ role: "initiator", manifest: manifest(clientV2!) });
    const accepted = host.receive(json(client.start()));
    assert(accepted.state === "ready" && accepted.negotiated && accepted.response);
    const ready = client.receive(json(accepted.response));
    assert(ready.state === "ready" && ready.negotiated);
    assertEquals(negotiatedFrameCodecVersion(accepted.negotiated), hostV2 && clientV2 ? 2 : 1);
    assertEquals(negotiatedFrameCodecVersion(ready.negotiated), hostV2 && clientV2 ? 2 : 1);
  }
  assertThrows(
    () => negotiatedFrameCodecVersion({ protocol: { major: 2, minor: 0 }, capabilities: [] }),
    FrameCodecError,
  );
  assertThrows(() => encodeCellFrame(frame(["A"]), { version: 3 as never }), FrameCodecError);
});

Deno.test("remote v2 detects stale bases separately from corrupt result checksums, with no base mutation", () => {
  const base = frame(["A", "B", "C", "D"]),
    next = frame(["X", "B", "C", "D"]),
    delta = encodeCellFrameDelta(base, next);
  assert(delta.kind === "delta" && typeof delta.baseChecksum === "number");
  const before = json(base), stale = applyCellFrameDelta(frame(["A", "B", "Y", "D"]), delta);
  assert(!stale.ok && stale.resync.includes("stale"));
  const corrupted = applyCellFrameDelta(base, { ...delta, checksum: (delta.checksum ^ 1) >>> 0 });
  assert(!corrupted.ok && corrupted.resync.includes("result") && !corrupted.resync.includes("stale"));
  assertEquals(base, before);
  assert(!applyCellFrameDelta(base, { ...delta, baseChecksum: undefined }).ok);
  assert(!applyCellFrameDelta(base, { ...delta, version: 1 }).ok);
});

Deno.test("remote full decoders reject malformed lengths, palettes, dimensions and sparse/accessor data", () => {
  const valid = encodeCellFrame(frame(["AB", ""]));
  const oneRun = { styleIndex: 0, text: "AB", lengths: [2, 0] };
  for (
    const runs of [
      [{ ...oneRun, lengths: undefined }],
      [{ ...oneRun, lengths: [] }],
      [{ ...oneRun, lengths: [1, 0] }],
      [{ ...oneRun, lengths: [3, 0] }],
      [{ ...oneRun, lengths: [-1, 3] }],
      [{ ...oneRun, lengths: [1.5, .5] }],
      [{ ...oneRun, lengths: [2, 0, 0] }],
      [{ ...oneRun, styleIndex: -1 }],
      [{ ...oneRun, styleIndex: 2 }],
      new Array(2),
      [{ ...oneRun, extra: true }],
    ]
  ) assert(!decodeCellFrame({ ...valid, runs }).ok, JSON.stringify(runs));
  for (
    const patch of [
      { columns: 0 },
      { columns: 1.5 },
      { rows: NaN },
      { columns: Infinity },
      { columns: 1_001, rows: 1_001 },
      { checksum: -1 },
      { checksum: 0x1_0000_0000 },
      { palette: new Array(1) },
      { palette: ["x".repeat(FRAME_CODEC_LIMITS.maxStyleUtf16Units + 1)] },
      { extra: true },
      { runs: null },
      { version: 9 },
    ]
  ) assert(!decodeCellFrame({ ...valid, ...patch }).ok);
  let reads = 0;
  const accessor = [oneRun];
  Object.defineProperty(accessor, 0, {
    get() {
      reads++;
      return oneRun;
    },
  });
  assert(!decodeCellFrame({ ...valid, runs: accessor }).ok);
  assertEquals(reads, 0);
  assert(
    !decodeCellFrame(
      new Proxy(valid, {
        ownKeys() {
          throw new Error("trap");
        },
      }),
    ).ok,
  );
});

Deno.test("remote deltas reject row crossing, overlap, unsorted/empty spans and malformed bases transactionally", () => {
  const base = frame(["A", "B", "C", "D", "E", "F"], 3), delta = encodeCellFrameDelta(base, base);
  assert(delta.kind === "delta");
  const one = { styleIndex: 0, text: "A", lengths: [1] };
  for (
    const spans of [
      [{ row: 0, column: 2, runs: [{ ...one, text: "AA", lengths: [1, 1] }] }],
      [{ row: 1, column: 0, runs: [one] }, { row: 0, column: 0, runs: [one] }],
      [{ row: 0, column: 0, runs: [one] }, { row: 0, column: 0, runs: [one] }],
      [{ row: 0, column: 0, runs: [] }],
      [{ row: NaN, column: 0, runs: [one] }],
    ]
  ) assert(!applyCellFrameDelta(base, { ...delta, palette: ["plain"], spans }).ok);
  assert(!applyCellFrameDelta({ ...base, cells: [] }, delta).ok);
  assertEquals(base, frame(["A", "B", "C", "D", "E", "F"], 3));
});

Deno.test("remote frame bounds apply to cells, UTF-16 text, styles and aggregate delta results", () => {
  const limit = FRAME_CODEC_LIMITS;
  for (
    const source of [
      frame(["x".repeat(limit.maxCellUtf16Units + 1)]),
      { columns: 1_001, rows: 1_001, cells: [] },
      frame(["A".repeat(limit.maxCellUtf16Units)], 0),
    ]
  ) assertThrows(() => encodeCellFrame(source), FrameCodecError);
  const largeText = "a".repeat(limit.maxCellUtf16Units), count = limit.maxTextUtf16Units / largeText.length;
  const base = frame([...Array<string>(count).fill(largeText), "", ""]);
  assert(decodeCellFrame(encodeCellFrame(base)).ok);
  const delta = encodeCellFrameDelta(base, base);
  assert(delta.kind === "delta");
  const malicious = {
    ...delta,
    palette: ["plain"],
    spans: [{ row: 0, column: count, runs: [{ styleIndex: 0, text: "X", lengths: [1] }] }],
  };
  const result = applyCellFrameDelta(base, malicious);
  assert(!result.ok && result.resync.includes("limit"), JSON.stringify(result));
  assertThrows(() => encodeCellFrame(frame([...Array<string>(count + 1).fill(largeText)])), FrameCodecError);
});

Deno.test("remote flow rejects invalid windows/acks/queued legacy cells and discards pending state on resync", () => {
  for (const windowSize of [0, -1, NaN, Infinity, 1.5, 65]) {
    assertThrows(() => createFrameFlowController({ windowSize }), RangeError);
  }
  const flow = createFrameFlowController({ windowSize: 1, codecVersion: 1 });
  const first = flow.offer(frame(["A", "B"]))!;
  flow.offer(frame(["B", "B"]));
  const before = flow.inspect();
  for (const sequence of [-1, NaN, Infinity, 1.5, 2]) assertThrows(() => flow.ack(sequence), RangeError);
  assertThrows(() => flow.offer(frame(["", "B"])), FrameCodecError);
  assertEquals(flow.inspect(), before);
  flow.resync();
  assertEquals(flow.inspect().pending, false);
  const fresh = flow.offer(frame(["Z", "Z"]))!;
  assertEquals(fresh.payload.kind, "full");
  assertEquals(fresh.payload.version, 1);
  assertEquals(flow.ack(first.sequence), undefined);
  assertEquals(flow.ack(fresh.sequence), undefined);
});

Deno.test("remote snapshots are detached and deeply frozen, without freezing the caller", () => {
  const source = { columns: 1, rows: 1, cells: [{ char: "A", style: "plain" }] };
  const snapshot = snapshotCellFrame(source);
  source.cells[0]!.char = "B";
  assertEquals(snapshot.cells[0]!.char, "A");
  assert(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.cells) && Object.isFrozen(snapshot.cells[0]));
  assert(!Object.isFrozen(source) && !Object.isFrozen(source.cells) && !Object.isFrozen(source.cells[0]));
});

Deno.test("remote arbitrary-cell randomized full/delta JSON chains preserve every field and boundary", () => {
  const glyphs = ["", " ", "AB", "ẹ́́", "क्ष", "각", "1️⃣", "👩‍💻", "界", "\ud800", "\0", "\x1b[31m"];
  let seed = 0x512a1337;
  const pick = (count: number): number => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % count;
  };
  let source = frame(Array.from({ length: 120 }, () => glyphs[pick(glyphs.length)]!), 12);
  const first = decodeCellFrame(json(encodeCellFrame(source)));
  assert(first.ok);
  let client = first.frame;
  for (let index = 0; index < 120; index++) {
    const next: CellFrame = {
      ...source,
      cells: source.cells.map((cell) =>
        pick(5) ? cell : { char: glyphs[pick(glyphs.length)]!, style: "style" + pick(7) }
      ),
    };
    const payload = json(encodeCellFrameDelta(source, next));
    const result = payload.kind === "full" ? decodeCellFrame(payload) : applyCellFrameDelta(client, payload);
    assert(result.ok, JSON.stringify(result));
    assertEquals(result.frame, next);
    source = next;
    client = result.frame;
  }
});
