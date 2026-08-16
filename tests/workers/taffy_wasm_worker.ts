// L2 worker-execution proof: the Taffy WASM adapter inside a worker.
import { createLayoutNode, defaultComputedLayoutStyle } from "../../mod.ts";
import { taffyWasmLayoutSolver } from "../../src/layout/solvers/taffy_wasm.ts";

self.onmessage = () => {
  const style = defaultComputedLayoutStyle();
  style.display = "flex";
  const childStyle = defaultComputedLayoutStyle();
  childStyle.flexGrow = 1;
  const root = createLayoutNode({
    id: "root",
    tag: "window",
    style,
    children: [
      createLayoutNode({ id: "a", tag: "panel", style: childStyle }),
      createLayoutNode({ id: "b", tag: "panel", style: childStyle }),
    ],
  });
  const result = taffyWasmLayoutSolver().solve({ root, bounds: { column: 0, row: 0, width: 40, height: 10 } });
  (self as unknown as { postMessage(value: unknown): void }).postMessage({
    width: result.byId.get("a")!.rect.width,
    boxes: result.boxes.length,
  });
  self.close();
};
