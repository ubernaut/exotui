import { assert, assertEquals, assertStringIncludes } from "./deps.ts";
import { BoxObject } from "../src/canvas/box.ts";
import { TextObject } from "../src/canvas/text.ts";
import {
  AnsiCanvasSink,
  Canvas,
  type CanvasCellUpdate,
  type CanvasRenderStats,
  coalesceCanvasRowRanges,
  MemoryCanvasSink,
} from "../src/canvas/mod.ts";
import { Signal } from "../src/signals/mod.ts";

Deno.test("canvas flushes dirty cells through a pluggable sink", () => {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({
    sink,
    size: { columns: 4, rows: 2 },
  });
  const box = new BoxObject({
    canvas,
    rectangle: { column: 1, row: 0, width: 2, height: 2 },
    filler: "x",
    style: (text) => text,
    zIndex: 1,
  });

  box.draw();
  canvas.render();

  assertEquals(sink.updates, [
    { row: 0, column: 1, value: "x" },
    { row: 0, column: 2, value: "x" },
    { row: 1, column: 1, value: "x" },
    { row: 1, column: 2, value: "x" },
  ]);
  assertEquals(sink.lastStats?.flushedCells, 4);
  assertEquals(sink.lastStats?.dirtyRowRanges, 2);
  assertEquals(sink.rowRanges, [
    { row: 0, startColumn: 1, values: ["x", "x"] },
    { row: 1, startColumn: 1, values: ["x", "x"] },
  ]);
});

Deno.test("canvas can flush contiguous row ranges through optional sinks", () => {
  const sink = new RangeOnlySink();
  const canvas = new Canvas({
    sink,
    size: { columns: 5, rows: 2 },
  });
  const box = new BoxObject({
    canvas,
    rectangle: { column: 1, row: 0, width: 3, height: 1 },
    filler: "z",
    style: (text) => text,
    zIndex: 1,
  });

  box.draw();
  canvas.render();

  assertEquals(sink.flushCalls, 0);
  assertEquals(sink.ranges, [{ row: 0, startColumn: 1, values: ["z", "z", "z"] }]);
  assertEquals(sink.updates.length, 3);
  assertEquals(sink.stats?.dirtyRowRanges, 1);
});

Deno.test("box renderer styles solid filler once per render pass", () => {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({
    sink,
    size: { columns: 6, rows: 3 },
  });
  let styleCalls = 0;
  const box = new BoxObject({
    canvas,
    rectangle: { column: 1, row: 1, width: 4, height: 2 },
    filler: "x",
    style: (text) => {
      styleCalls += 1;
      return text.toUpperCase();
    },
    zIndex: 1,
  });

  box.draw();
  canvas.render();

  assertEquals(styleCalls, 1);
  assertEquals(sink.updates.length, 8);
  assertEquals(sink.updates.every((update) => update.value === "X"), true);
});

Deno.test("box renderer flushes queued row ranges as contiguous updates", () => {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({
    sink,
    size: { columns: 8, rows: 2 },
  });
  const box = new BoxObject({
    canvas,
    rectangle: { column: 1, row: 0, width: 6, height: 2 },
    filler: "q",
    style: (text) => text,
    zIndex: 1,
  });

  box.draw();
  canvas.render();
  sink.clear();

  box.queueRerenderRange(0, 2, 6);
  box.updated = false;
  canvas.updateObjects.push(box);
  canvas.render();

  assertEquals(sink.updates, [
    { row: 0, column: 2, value: "q" },
    { row: 0, column: 3, value: "q" },
    { row: 0, column: 4, value: "q" },
    { row: 0, column: 5, value: "q" },
  ]);
  assertEquals(sink.rowRanges, [{ row: 0, startColumn: 2, values: ["q", "q", "q", "q"] }]);
  assertEquals(sink.lastStats?.flushedCells, 4);
});

Deno.test("text renderer flushes changed overwrite spans as contiguous ranges", () => {
  const sink = new DirectRangeSink();
  const canvas = new Canvas({
    sink,
    size: { columns: 8, rows: 2 },
  });
  const value = new Signal("alpha   ");
  const text = new TextObject({
    canvas,
    rectangle: { column: 0, row: 0, width: 8 },
    value,
    overwriteRectangle: true,
    style: (text) => text,
    zIndex: 1,
  });

  text.draw();
  canvas.render();
  sink.clear();

  value.value = "beta    ";
  canvas.render();

  assertEquals(sink.flushCalls, 0);
  assertEquals(sink.ranges, [{ row: 0, startColumn: 0, values: ["b", "e", "t", "a", " "] }]);
  assertEquals(sink.updates.length, 0);
  assertEquals(canvas.rerenderQueue[0], undefined);
  assertEquals(sink.stats?.dirtyRowRanges, 1);
});

Deno.test("text renderer avoids full-row flushes for sparse overwrite changes", () => {
  const sink = new DirectRangeSink();
  const canvas = new Canvas({
    sink,
    size: { columns: 12, rows: 1 },
  });
  const value = new Signal("left middle ");
  const text = new TextObject({
    canvas,
    rectangle: { column: 0, row: 0, width: 12 },
    value,
    overwriteRectangle: true,
    style: (text) => text,
    zIndex: 1,
  });

  text.draw();
  canvas.render();
  sink.clear();

  value.value = "left mIddle ";
  canvas.render();

  assertEquals(sink.flushCalls, 0);
  assertEquals(sink.ranges, [{ row: 0, startColumn: 6, values: ["I"] }]);
  assertEquals(sink.stats?.flushedCells, 1);
});

Deno.test("canvas notifies sinks when size changes", () => {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({
    sink,
    size: { columns: 4, rows: 2 },
  });

  assertEquals({ columns: sink.columns, rows: sink.rows }, { columns: 4, rows: 2 });

  const size = canvas.size.peek();
  size.columns = 7;
  size.rows = 5;

  assertEquals({ columns: sink.columns, rows: sink.rows }, { columns: 7, rows: 5 });
});

Deno.test("canvas resize clears retained buffers and redraws only the new screen", () => {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({
    sink,
    size: { columns: 8, rows: 4 },
  });
  const box = new BoxObject({
    canvas,
    rectangle: { column: 0, row: 0, width: 8, height: 4 },
    filler: "x",
    style: (text) => text,
    zIndex: 1,
  });

  box.draw();
  canvas.render();
  sink.clear();

  box.queueRerenderRange(3, 6, 8);
  canvas.rerenderRanges[3] = [{ row: 3, startColumn: 6, endColumn: 8 }];
  canvas.frameBuffer[3] = ["s", "t", "a", "l", "e", " ", "x", "x"];

  canvas.size.value = { columns: 3, rows: 1 };
  canvas.render();

  assertEquals(canvas.frameBuffer, [["x", "x", "x"]]);
  assertEquals(canvas.rerenderRanges[0], []);
  assertEquals(canvas.rerenderRanges[3], undefined);
  assertEquals(canvas.rerenderQueue.length, 0);
  assertEquals(box.rerenderRanges[0], []);
  assertEquals(box.rerenderRanges[3], undefined);
  assertEquals(sink.rowRanges, [{ row: 0, startColumn: 0, values: ["x", "x", "x"] }]);
  assertEquals(sink.updates, [
    { row: 0, column: 0, value: "x" },
    { row: 0, column: 1, value: "x" },
    { row: 0, column: 2, value: "x" },
  ]);
});

Deno.test("ansi canvas sink preserves stdout terminal output path", () => {
  const chunks: Uint8Array[] = [];
  const sink = new AnsiCanvasSink({
    stdout: {
      writeSync(data) {
        chunks.push(data);
        return data.length;
      },
    },
  });

  sink.flush([
    { row: 0, column: 0, value: "A" },
    { row: 0, column: 1, value: "B" },
    { row: 1, column: 0, value: "C" },
  ], {
    updatedObjects: 0,
    renderedObjects: 0,
    rerenderedObjects: 0,
    intersectionUpdates: 0,
    intersectionCandidateChecks: 0,
    intersectionsDirty: false,
    dirtyRectangles: 0,
    dirtyRowRanges: 2,
    dirtyRows: 0,
    dirtyCells: 3,
    fullRedraws: 0,
    flushedCells: 3,
  });

  const output = new TextDecoder().decode(chunks[0]);
  assertStringIncludes(output, "\x1b[1;1HAB");
  assertStringIncludes(output, "\x1b[2;1HC");
});

Deno.test("ansi canvas sink compacts styled row ranges before terminal writes", () => {
  const chunks: Uint8Array[] = [];
  const sink = new AnsiCanvasSink({
    stdout: {
      writeSync(data) {
        chunks.push(data);
        return data.length;
      },
    },
  });

  sink.flushRanges([
    {
      row: 0,
      startColumn: 0,
      values: [
        "\x1b[48;2;1;2;3m \x1b[0m",
        "\x1b[48;2;1;2;3m \x1b[0m",
        "\x1b[38;2;255;0;0mA\x1b[0m\x1b[0m",
        "\x1b[38;2;255;0;0mB\x1b[0m\x1b[0m",
      ],
    },
  ], {
    updatedObjects: 0,
    renderedObjects: 0,
    rerenderedObjects: 0,
    intersectionUpdates: 0,
    intersectionCandidateChecks: 0,
    intersectionsDirty: false,
    dirtyRectangles: 0,
    dirtyRowRanges: 1,
    dirtyRows: 1,
    dirtyCells: 4,
    fullRedraws: 0,
    flushedCells: 4,
  });

  const output = new TextDecoder().decode(chunks[0]);
  assertStringIncludes(output, "\x1b[48;2;1;2;3m  \x1b[0m");
  assertStringIncludes(output, "\x1b[38;2;255;0;0mAB\x1b[0m");
  assertEquals(output.includes("\x1b[48;2;1;2;3m \x1b[0m\x1b[48;2;1;2;3m \x1b[0m"), false);
  assertEquals(
    output.includes("\x1b[38;2;255;0;0mA\x1b[0m\x1b[0m\x1b[38;2;255;0;0mB\x1b[0m\x1b[0m"),
    false,
  );
});

Deno.test("ansi canvas sink avoids per-cell resets for complete truecolor background runs", () => {
  const chunks: Uint8Array[] = [];
  const sink = new AnsiCanvasSink({
    stdout: {
      writeSync(data) {
        chunks.push(data);
        return data.length;
      },
    },
  });

  sink.flushRanges([
    {
      row: 0,
      startColumn: 0,
      values: [
        "\x1b[48;2;1;2;3m \x1b[0m",
        "\x1b[48;2;4;5;6m \x1b[0m",
        "\x1b[48;2;7;8;9m \x1b[0m",
      ],
    },
  ], emptyCanvasRenderStats({ dirtyCells: 3, dirtyRowRanges: 1, dirtyRows: 1, flushedCells: 3 }));

  const output = new TextDecoder().decode(chunks[0]);
  assertStringIncludes(output, "\x1b[48;2;1;2;3m \x1b[48;2;4;5;6m \x1b[48;2;7;8;9m \x1b[0m");
  assertEquals(output.split("\x1b[0m").length - 1, 1);
});

Deno.test("coalesceCanvasRowRanges groups sorted adjacent cells only", () => {
  const updates = [
    { row: 0, column: 0, value: "A" },
    { row: 0, column: 1, value: "B" },
    { row: 0, column: 3, value: "C" },
    { row: 1, column: 0, value: "D" },
  ];
  assertEquals(
    coalesceCanvasRowRanges(updates),
    [
      { row: 0, startColumn: 0, values: ["A", "B"] },
      { row: 0, startColumn: 3, values: ["C"] },
      { row: 1, startColumn: 0, values: ["D"] },
    ],
  );
  const target = [{ row: 9, startColumn: 9, values: ["stale"] }];
  const retainedRange = target[0];
  const retainedValues = target[0]!.values;
  assertEquals(coalesceCanvasRowRanges(updates, target), target);
  assertEquals(target.length, 3);
  assertEquals(target[0], retainedRange);
  assertEquals(target[0]!.values, retainedValues);
  assertEquals(target[0]!.values, ["A", "B"]);
  assertEquals(coalesceCanvasRowRanges([], target), target);
  assertEquals(target, []);

  const frozenValues = Object.freeze(["frozen"]);
  const frozenTarget = [{ row: 9, startColumn: 9, values: frozenValues }];
  assertEquals(coalesceCanvasRowRanges(updates.slice(0, 2), frozenTarget), frozenTarget);
  assertEquals(frozenTarget[0]!.values, ["A", "B"]);
  assertEquals(frozenTarget[0]!.values === frozenValues, false);
});

function emptyCanvasRenderStats(patch: Partial<CanvasRenderStats> = {}): CanvasRenderStats {
  return {
    updatedObjects: 0,
    renderedObjects: 0,
    rerenderedObjects: 0,
    intersectionUpdates: 0,
    intersectionCandidateChecks: 0,
    intersectionsDirty: false,
    dirtyRectangles: 0,
    dirtyRowRanges: 0,
    dirtyRows: 0,
    dirtyCells: 0,
    fullRedraws: 0,
    flushedCells: 0,
    ...patch,
  };
}

class RangeOnlySink {
  readonly ranges: Array<{ row: number; startColumn: number; values: readonly (string | Uint8Array)[] }> = [];
  readonly updates: CanvasCellUpdate[] = [];
  stats?: CanvasRenderStats;
  flushCalls = 0;

  flush(updates: readonly CanvasCellUpdate[], stats: CanvasRenderStats): void {
    this.flushCalls += 1;
    this.updates.push(...updates.map((update) => ({ ...update })));
    this.stats = { ...stats };
  }

  flushRanges(
    ranges: readonly { row: number; startColumn: number; values: readonly (string | Uint8Array)[] }[],
    stats: CanvasRenderStats,
    updates: readonly CanvasCellUpdate[],
  ): void {
    this.ranges.push(...ranges.map((range) => ({ ...range, values: [...range.values] })));
    this.updates.push(...updates.map((update) => ({ ...update })));
    this.stats = { ...stats };
  }

  clear(): void {
    this.ranges.length = 0;
    this.updates.length = 0;
    this.stats = undefined;
    this.flushCalls = 0;
  }
}

class DirectRangeSink extends RangeOnlySink {
  readonly requiresCellUpdates = false;
}

Deno.test("ansi sink survives short writes and WouldBlock without dropping bytes", () => {
  // A real tty accepts fewer bytes than offered under pressure, and raw-mode
  // stdin shares the tty's non-blocking flag, so writeSync can also throw
  // WouldBlock. Both used to silently drop the rest of the frame — the ghost
  // cells the diff renderer then never repainted.
  const received: number[] = [];
  let calls = 0;
  const throttled = {
    writeSync(data: Uint8Array): number {
      calls += 1;
      if (calls % 3 === 0) {
        const error = new Error("would block");
        error.name = "WouldBlock";
        throw error;
      }
      const take = Math.min(7, data.length);
      for (let index = 0; index < take; index += 1) received.push(data[index]!);
      return take;
    },
  };
  const sink = new AnsiCanvasSink({ stdout: throttled, flushLimit: 64 });
  const updates: CanvasCellUpdate[] = Array.from({ length: 30 }, (_, index) => ({
    row: Math.floor(index / 10),
    column: index % 10,
    value: String.fromCharCode(65 + (index % 26)),
  }));
  sink.flush(updates, {} as CanvasRenderStats);
  assertEquals(sink.takeFlushDegraded(), false);

  // Reference: the same flush against an unconstrained stdout.
  const reference: number[] = [];
  const open = {
    writeSync(data: Uint8Array): number {
      for (const byte of data) reference.push(byte);
      return data.length;
    },
  };
  const referenceSink = new AnsiCanvasSink({ stdout: open, flushLimit: 64 });
  referenceSink.flush(updates, {} as CanvasRenderStats);
  assertEquals(received, reference, "every byte must arrive, in order");
});

Deno.test("a permanently saturated terminal degrades the flush and forces a full repaint", () => {
  // The stdout accepts a little, then refuses forever (flow-controlled tty).
  let budget = 10;
  const stuck = {
    writeSync(data: Uint8Array): number {
      const take = Math.min(budget, data.length);
      budget -= take;
      return take;
    },
  };
  const sink = new AnsiCanvasSink({ stdout: stuck });
  const canvas = new Canvas({ sink, size: { columns: 6, rows: 2 } });
  const text = new TextObject({
    canvas,
    rectangle: new Signal({ column: 0, row: 0 }),
    value: new Signal("ABCDEF"),
    style: new Signal((value: string) => value),
    zIndex: new Signal(1),
  });
  text.draw();
  canvas.render();
  // The stall budget was exhausted mid-frame: the canvas must have scheduled a
  // clean full repaint so nothing ghosts. Open the tap and render again — the
  // whole frame is re-emitted.
  const reopened: number[] = [];
  budget = 0;
  (stuck as { writeSync(data: Uint8Array): number }).writeSync = (data: Uint8Array) => {
    for (const byte of data) reopened.push(byte);
    return data.length;
  };
  canvas.render();
  const emitted = new TextDecoder().decode(new Uint8Array(reopened));
  assertStringIncludes(emitted, "ABCDEF", "the truncated frame heals with a full repaint");
});

Deno.test("ansi sink telemetry counts bytes, stalls, and degraded flushes", () => {
  // A tty that short-writes and intermittently WouldBlocks: every byte still
  // arrives (the survival test above proves it), and the telemetry must record
  // how hard the write path worked to get them there — that effort is wait,
  // not compute, so it is invisible everywhere else.
  let calls = 0;
  const throttled = {
    writeSync(data: Uint8Array): number {
      calls += 1;
      if (calls % 3 === 0) {
        const error = new Error("would block");
        error.name = "WouldBlock";
        throw error;
      }
      return Math.min(7, data.length);
    },
  };
  const sink = new AnsiCanvasSink({ stdout: throttled, flushLimit: 64 });
  const updates: CanvasCellUpdate[] = Array.from({ length: 30 }, (_, index) => ({
    row: Math.floor(index / 10),
    column: index % 10,
    value: String.fromCharCode(65 + (index % 26)),
  }));
  sink.flush(updates, {} as CanvasRenderStats);

  const telemetry = sink.takeFlushTelemetry();
  assertEquals(telemetry.frames, 1);
  assert(telemetry.bytes > 0, "the frame's bytes are counted");
  assert(telemetry.writes > 1, "short writes force extra writeSync calls");
  assert(telemetry.wouldBlocks > 0, "buffer-full refusals are counted");
  assert(telemetry.shortWrites > 0, "partial deliveries are counted");
  assert(telemetry.stallMs > 0, "time waiting on WouldBlock is stall time");
  assert(telemetry.maxStallMs > 0);
  assert(telemetry.maxStallMs <= telemetry.stallMs + 0.001);
  assertEquals(telemetry.degradedFlushes, 0);
  assertEquals(telemetry.droppedBytes, 0);

  // Draining resets the window.
  const drained = sink.takeFlushTelemetry();
  assertEquals(drained.frames, 0);
  assertEquals(drained.bytes, 0);
  assertEquals(drained.writes, 0);
  assertEquals(drained.stallMs, 0);
});

Deno.test("ansi sink telemetry records degraded flushes and dropped bytes", () => {
  // The stdout accepts a little, then refuses forever (flow-controlled tty):
  // the flush degrades past the stall budget and the telemetry must show the
  // abandoned tail — this is the ground truth for stutter-with-idle-CPU.
  let budget = 10;
  const stuck = {
    writeSync(data: Uint8Array): number {
      const take = Math.min(budget, data.length);
      budget -= take;
      return take;
    },
  };
  const sink = new AnsiCanvasSink({ stdout: stuck });
  const updates: CanvasCellUpdate[] = Array.from({ length: 40 }, (_, index) => ({
    row: 0,
    column: index,
    value: "#",
  }));
  sink.flush(updates, {} as CanvasRenderStats);
  assertEquals(sink.takeFlushDegraded(), true);

  const telemetry = sink.takeFlushTelemetry();
  assertEquals(telemetry.frames, 1);
  assertEquals(telemetry.degradedFlushes, 1);
  assert(telemetry.droppedBytes > 0, "the abandoned tail is measured");
  assert(telemetry.bytes >= telemetry.droppedBytes);
  assert(telemetry.maxStallMs > 30, "the stall budget was exhausted before dropping");
});
