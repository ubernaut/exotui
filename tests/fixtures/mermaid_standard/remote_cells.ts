// Copyright 2023 Im-Beast. MIT license.
import { applyCellFrameDelta, type CellFrame, decodeCellFrame } from "../../../src/remote/frame_codec.ts";
import { createFrameFlowController } from "../../../src/remote/frame_flow.ts";
import { parseAnsiCell } from "../../../src/web/cell_canvas_sink.ts";

/** Source-cell oracle for real disposed Mermaid → Markdown → JSON remote full/delta transport. */
export class MermaidRemoteCells {
  readonly #flow = createFrameFlowController({ windowSize: 1, codecVersion: 2 });
  #client?: CellFrame;
  frames = 0;
  cells = 0;

  roundTrip(rows: readonly (readonly string[])[]): string[][] {
    const columns = rows[0]?.length ?? 0;
    if (!columns || rows.some((row) => row.length !== columns)) throw new Error("invalid remote fixture grid");
    const expected: CellFrame = {
      columns,
      rows: rows.length,
      cells: rows.flatMap((row) =>
        row.map((raw) => {
          const char = parseAnsiCell(raw).text;
          let offset = 0;
          while (raw[offset] === "\x1b" && raw[offset + 1] === "[") {
            const end = raw.indexOf("m", offset + 2);
            if (end === -1 || !/^[0-9:;]*$/.test(raw.slice(offset + 2, end))) break;
            offset = end + 1;
          }
          const prefix = raw.slice(0, offset), suffix = raw.slice(offset + char.length);
          if (prefix + char + suffix !== raw || parseAnsiCell(suffix).text) {
            throw new Error("fixture ANSI cannot be separated without changing source bytes");
          }
          return { char, style: JSON.stringify([prefix, suffix]) };
        })
      ),
    };
    // The first frame is full; the repeated frame verifies an empty delta too.
    // Subsequent source scroll/reflow frames exercise changed spans and resize.
    for (let repeat = 0; repeat < 2; repeat++) {
      const sent = this.#flow.offer(expected)!;
      const payload = JSON.parse(JSON.stringify(sent.payload));
      const result = payload.kind === "full" ? decodeCellFrame(payload) : applyCellFrameDelta(this.#client!, payload);
      if (!result.ok) throw new Error("valid actual Mermaid transport requested resync: " + JSON.stringify(result));
      if (JSON.stringify(result.frame) !== JSON.stringify(expected)) {
        throw new Error("actual Mermaid remote source cells differ");
      }
      this.#client = result.frame;
      this.#flow.ack(sent.sequence);
      this.frames++;
    }
    const reconstructed: string[][] = [];
    for (let row = 0; row < rows.length; row++) {
      reconstructed.push(
        this.#client!.cells.slice(row * columns, (row + 1) * columns).map((cell, column) => {
          const [prefix, suffix] = JSON.parse(cell.style) as [string, string];
          const raw = prefix + cell.char + suffix;
          if (raw !== rows[row]![column]) throw new Error("source ANSI bytes differ after remote transport");
          this.cells++;
          return raw;
        }),
      );
    }
    return reconstructed;
  }
}
