// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { Tree, TreeController, type TreeNode } from "../src/components/tree.ts";
import { createAnsiStyle } from "../src/theme.ts";
import { WidgetSurface, widgetSurfaceCellData } from "../mod.app.ts";

Deno.test("TreeController dispatches per-node activation over the controller handler", () => {
  const activated: string[] = [];
  const nodes: TreeNode[] = [
    { id: "plain", label: "Plain" },
    {
      id: "custom",
      label: "Custom",
      status: "online",
      meta: { host: "studio" },
      activate: (row) => {
        activated.push(`node:${row.id}`);
      },
    },
    { id: "hint", label: "a note line", note: true },
  ];
  const controller = new TreeController({
    nodes,
    onSelect: (row) => {
      activated.push(`controller:${row.id}`);
    },
  });
  try {
    controller.setSelectedIndex(0);
    controller.selectActive();
    controller.setSelectedIndex(1);
    controller.selectActive();
    assertEquals(activated, ["controller:plain", "node:custom"]);

    // Status, note, and meta ride the rows and their inspection snapshots.
    const inspection = controller.inspect();
    assertEquals(inspection.rows[1]?.status, "online");
    assertEquals(inspection.rows[2]?.note, true);
    assertEquals(controller.visibleRows()[1]?.node.meta?.host, "studio");
  } finally {
    controller.dispose();
  }
});

Deno.test("Tree renders per-row styles and markers through its backing List", async () => {
  const nodes: TreeNode[] = [
    { id: "up", label: "reachable", status: "online" },
    { id: "down", label: "unreachable", status: "offline" },
  ];
  const online = createAnsiStyle({ foreground: [40, 220, 120], background: [10, 12, 20] });
  const offline = createAnsiStyle({ foreground: [120, 120, 130], background: [10, 12, 20] });
  const surface = new WidgetSurface(20, 3);
  try {
    surface.mount((tui) => [
      new Tree({
        parent: tui,
        zIndex: 1,
        rectangle: { column: 0, row: 0, width: 20, height: 3 },
        theme: { base: createAnsiStyle({ foreground: [220, 220, 220], background: [10, 12, 20] }) },
        nodes,
        rowStyle: (row) => (row.node.status === "offline" ? offline : online),
        markerFor: (row, selected) => selected ? ">" : row.node.status === "offline" ? "·" : " ",
      }),
    ]);
    await surface.render();

    const rowGlyphs = (row: number): string => {
      let text = "";
      for (let column = 0; column < 20; column += 1) {
        text += widgetSurfaceCellData(surface.cellAt(row, column))?.glyph ?? " ";
      }
      return text;
    };
    assert(rowGlyphs(0).includes("reachable"));
    assert(rowGlyphs(1).includes("unreachable"));
    assert(rowGlyphs(1).trimStart().startsWith("·"), `offline marker, saw "${rowGlyphs(1)}"`);

    // The style split is per row: online rows are green, offline muted.
    const onlineCell = widgetSurfaceCellData(surface.cellAt(0, 4));
    const offlineCell = widgetSurfaceCellData(surface.cellAt(1, 4));
    assertEquals(onlineCell?.foreground, [40, 220, 120]);
    assertEquals(offlineCell?.foreground, [120, 120, 130]);
  } finally {
    surface.dispose();
  }
});
