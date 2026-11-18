// Copyright 2023 Im-Beast. MIT license.
import {
  type MermaidStandardDiagram,
  type MermaidStandardRenderer,
  renderMermaidNativeFrame,
} from "../../../mod.mermaid.ts";

/** Real upstream authored style/edge cases, shared by browser and private Deno compiler hosts. */
export async function verifyMermaidStrokeFeatures(renderer: Pick<MermaidStandardRenderer, "compile">): Promise<{
  cases: number;
  wideCells: number;
  retained: MermaidStandardDiagram[];
}> {
  const retained: MermaidStandardDiagram[] = [];
  let wideCells = 0;
  for (
    const [cap, join, dash, nonScaling] of [
      ["butt", "miter", "0", false],
      ["round", "round", "24 12", false],
      ["square", "bevel", "0 28", false],
      ["butt", "miter", "0", true],
      ["round", "round", "24 12", true],
      ["square", "bevel", "0 28", true],
    ] as const
  ) {
    const effects = nonScaling ? ",vector-effect:non-scaling-stroke,paint-order:stroke markers fill" : "";
    const source = `flowchart LR
      A["Wide ${cap} start"] --> B{"${join} finish"}
      style A stroke:#2850a0,stroke-width:14px,stroke-linejoin:${join}${effects}
      style B stroke:#2850a0,stroke-width:14px,stroke-linejoin:${join}${effects}
      linkStyle 0 stroke:#2850a0,stroke-width:18px,stroke-linecap:${cap},stroke-linejoin:${join},stroke-dasharray:${dash}${effects}`;
    const diagram = await renderer.compile(source, { trusted: true, config: { flowchart: { curve: "linear" } } });
    const scene = diagram.scene!;
    const styled = scene.items.find((item) =>
      item.kind === "path" && item.paint.strokeWidth === 18 &&
      (!item.paintOrder || item.paintOrder.includes("stroke"))
    );
    if (
      !styled || styled.kind !== "path" || styled.paint.lineCap !== cap || styled.paint.lineJoin !== join ||
      styled.strokeInverse?.length !== 6
    ) throw new Error(`Upstream stroke metrics/style lost: ${cap}/${join}`);
    if (nonScaling && (!styled.strokeDistances || styled.paintOrder?.join(" ") !== "stroke")) {
      throw new Error(`Upstream non-scaling/marker-interleaved style lost: ${cap}/${join}`);
    }
    const frame = renderMermaidNativeFrame(scene);
    const count = frame.cells.flat().filter((cell) => cell.char === "█").length;
    if (count < 5) throw new Error(`Actual upstream wide stroke disappeared: ${cap}/${join}`);
    wideCells += count;
    const copy = JSON.parse(JSON.stringify(diagram)) as MermaidStandardDiagram;
    if (JSON.stringify(renderMermaidNativeFrame(copy.scene!)) !== JSON.stringify(frame)) {
      throw new Error(`Actual upstream wide stroke did not survive JSON: ${cap}/${join}`);
    }
    retained.push(copy);
  }
  return { cases: retained.length, wideCells, retained };
}
