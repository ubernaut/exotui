import { assert, assertEquals, assertStringIncludes } from "./deps.ts";
import { layoutMermaid, parseMermaid, renderMermaidFrame } from "../mod.document.ts";
import { textWidth } from "../src/utils/strings.ts";

Deno.test("optional-only circuit chains retain direction, reflow and an independent service", () => {
  for (const direction of ["TB", "BT", "LR", "RL"] as const) {
    const graph = parseMermaid(
      `flowchart ${direction}\nA[Language] -.->|optional operators| B[Geometry]\n` +
        "B -.->|C ABI probe| C[Simulation]\nC -.->|optional backend| D[Compiler]\nS[Independent service]",
    );
    for (const maxColumns of [12, 24, 48, 76, 120]) {
      const layout = layoutMermaid(graph, { maxColumns, style: "circuit" });
      assertEquals(layout, layoutMermaid(graph, { maxColumns, style: "circuit" }));
      const node = (id: string) => layout.nodes.find((n) => n.id === id)!;
      const chain = [node("A"), node("B"), node("C"), node("D")];
      const horizontal = chain[0]!.y === chain[1]!.y;
      for (let i = 1; i < chain.length; i++) {
        assert(
          horizontal
            ? direction === "RL" ? chain[i]!.x < chain[i - 1]!.x : chain[i]!.x > chain[i - 1]!.x
            : direction === "BT"
            ? chain[i]!.y < chain[i - 1]!.y
            : chain[i]!.y > chain[i - 1]!.y,
        );
      }
      if (horizontal) assert(node("S").y >= Math.max(...chain.map((n) => n.y + n.height)) + 2);
      const frame = renderMermaidFrame(layout);
      assert(layout.width <= maxColumns);
      assert(frame.every((row) => textWidth(row.map((cell) => cell.char).join("")) <= maxColumns));
      assert(layout.edges.every((edge) => edge.style === "dotted"));
      assert(frame.flat().some((cell) => cell.role === "diagram-integration" && "▲▶▼◀".includes(cell.char)));
    }
  }
});

Deno.test("circuit side rails align with consumers and use direct side-facing pins", () => {
  const graph = parseMermaid(
    "flowchart TB\nA[Experience] ==> B[Cognition]\nB ==> C[Models]\nC ==> D[Compute]\n" +
      "ICC[Evidence] -.->|evidence| A\nmesh[Operations] -.->|placement| C",
  );
  const layout = layoutMermaid(graph, { maxColumns: 120, style: "circuit" });
  for (const edge of layout.edges.filter((edge) => edge.style === "dotted")) {
    assert(edge.path.every((point) => point.y === edge.path[0]!.y), "side rails must not loop around other ranks");
    assertEquals(edge.path.length, Math.abs(edge.path[0]!.x - edge.path.at(-1)!.x) + 1);
  }
  const core = layout.edges.filter((edge) => edge.style !== "dotted");
  assert(
    core.every((edge) => edge.path.every((point) => point.x === edge.path[0]!.x)),
    "single core ranks share an axis",
  );
});

Deno.test("circuit captions preserve other traces and every full relationship label", () => {
  const graph = parseMermaid(
    "flowchart TB\nA[Input] -->|this caption must not erase connections| B[Left]\n" +
      "A --> C[Right]\nC --> D[Final]",
  );
  const layout = layoutMermaid(graph, { maxColumns: 100, style: "circuit" });
  const frame = renderMermaidFrame(layout);
  for (const edge of layout.edges.filter((edge) => !edge.label)) {
    for (const point of edge.path.slice(1, -1)) {
      assertEquals(frame[point.y]![point.x]!.role, "diagram-trace", "another edge's caption must not erase this trace");
    }
  }
  assertStringIncludes(
    frame.map((row) => row.map((cell) => cell.char).join("").trim()).join(" "),
    graph.edges[0]!.label,
  );
  const horizontal = layoutMermaid(
    parseMermaid(
      "flowchart LR\nA[Language] -.->|optional operators| B[Geometry]\nB -.->|C ABI probe| C[Simulation]",
    ),
    { maxColumns: 100, style: "circuit" },
  );
  const adjacent = renderMermaidFrame(horizontal);
  assertEquals(
    adjacent.length,
    horizontal.height,
    "short horizontal channels keep nearby captions, not a detached legend",
  );
  for (const edge of horizontal.edges) {
    assertStringIncludes(adjacent.map((row) => row.map((cell) => cell.char).join("")).join("\n"), edge.label);
  }
});

Deno.test("horizontal circuits bound and center wrapped independent-service rows", () => {
  const graph = parseMermaid(
    "flowchart LR\nA[Input] --> B[Output]\nS[Independent service]\nT[Another independent service]\nU[Third service]",
  );
  for (const maxColumns of [12, 24, 48, 60, 100]) {
    const layout = layoutMermaid(graph, { maxColumns, style: "circuit" });
    assert(layout.width <= maxColumns);
    for (const node of layout.nodes) {
      assert(node.x >= 0 && node.x + node.width <= layout.width && node.y + node.height <= layout.height);
      assert(
        !layout.nodes.some((other) =>
          other !== node && node.x < other.x + other.width &&
          node.x + node.width > other.x && node.y < other.y + other.height && node.y + node.height > other.y
        ),
      );
    }
    const frame = renderMermaidFrame(layout);
    for (const node of layout.nodes) {
      node.lines.forEach((line, row) => {
        const x = node.x + Math.floor((node.width - textWidth(line)) / 2);
        assertEquals(frame[node.y + row + 1]!.slice(x, x + textWidth(line)).map((cell) => cell.char).join(""), line);
      });
    }
  }
  const unconnected = layoutMermaid(parseMermaid("flowchart LR\nA[One]\nB[Two]"), { maxColumns: 12, style: "circuit" });
  assert(unconnected.width <= 12);
  assert(renderMermaidFrame(unconnected).length > 0);
});
