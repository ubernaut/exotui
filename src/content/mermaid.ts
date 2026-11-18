// Copyright 2023 Im-Beast. MIT license.
import { OrthogonalRouter, routeCells, routeDirection, type RoutePoint } from "../geometry/orthogonal_routes.ts";
import { circuitChipGlyph } from "../geometry/circuit_glyphs.ts";
import { cropToWidth, getMultiCodePointCharacters, textWidth } from "../utils/strings.ts";

/** Supported flowchart orientation. */
export type MermaidDirection = "TB" | "TD" | "BT" | "LR" | "RL";
/** Supported node shape in the bounded flowchart grammar. */
export type MermaidShape = "rectangle" | "rounded" | "diamond";
/** Safe paint properties accepted from Mermaid class definitions. */
export interface MermaidPaint {
  fill?: string;
  stroke?: string;
  color?: string;
}
/** One flowchart node; labels are always plain text. */
export interface MermaidNode {
  id: string;
  label: string;
  shape: MermaidShape;
  className?: string;
  group?: string;
}
/** Directed or undirected connection; dashed links retain their semantics. */
export interface MermaidEdge {
  from: string;
  to: string;
  label: string;
  style: "solid" | "dotted" | "thick";
  arrow: boolean;
}
/** Parsed flowchart independent of either terminal or browser rendering. */
export interface MermaidGraph {
  direction: MermaidDirection;
  nodes: MermaidNode[];
  edges: MermaidEdge[];
  groups: { id: string; label: string }[];
  classes: Record<string, MermaidPaint>;
}
/** A node placed on the shared cell coordinate system. */
export interface MermaidPlacedNode extends MermaidNode {
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
}
/** A routed edge using the same obstacle-avoiding router as exomux circuits. */
export interface MermaidRoutedEdge extends MermaidEdge {
  path: RoutePoint[];
}
/** Fully measured flowchart that can be drawn as cells or SVG. */
export interface MermaidLayout {
  graph: MermaidGraph;
  width: number;
  height: number;
  nodes: MermaidPlacedNode[];
  edges: MermaidRoutedEdge[];
}

/** Optional viewport width; narrow viewports reflow horizontal graphs top-to-bottom. */
export interface MermaidLayoutOptions {
  maxColumns?: number;
  /** Compact chip packages, centered ranks and separate cross-cutting rails. */
  style?: "plain" | "circuit";
}

const SAFE_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Strict parser for the documented Mermaid flowchart subset; never executes directives. */
export function parseMermaid(source: string): MermaidGraph {
  if (source.length > 128_000) throw new RangeError("Mermaid source is limited to 128,000 characters.");
  const statements = splitStatements(source);
  const first = statements.shift() ?? "";
  const header = /^(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)$/.exec(first);
  if (!header) throw new SyntaxError("Expected 'flowchart TB|TD|BT|LR|RL'. Only flowcharts are supported.");
  const graph: MermaidGraph = {
    direction: header[1] as MermaidDirection,
    nodes: [],
    edges: [],
    groups: [],
    classes: Object.create(null),
  };
  const known = new Map<string, MermaidNode>();
  const groups: string[] = [];
  const add = (node: MermaidNode, explicit: boolean) => {
    const previous = known.get(node.id);
    if (previous) {
      if (explicit) {
        previous.label = node.label;
        previous.shape = node.shape;
      }
      if (node.className) previous.className = node.className;
      return;
    }
    if (known.size >= 256) throw new RangeError("A flowchart may contain at most 256 nodes.");
    node.group = groups.at(-1);
    known.set(node.id, node);
    graph.nodes.push(node);
  };
  for (const statement of statements) {
    if (statement === "end") {
      if (!groups.pop()) throw new SyntaxError("Unexpected subgraph end.");
      continue;
    }
    if (statement.startsWith("subgraph ")) {
      throw new SyntaxError("Subgraphs are not supported; split the diagram into separate labeled flowcharts.");
    }
    const classDef = /^classDef\s+([\w-]+)\s+(.+)$/.exec(statement);
    if (classDef) {
      const paint: MermaidPaint = {};
      for (const property of classDef[2]!.split(",")) {
        const pair = /^(fill|stroke|color):\s*(#[0-9a-f]+)$/i.exec(property.trim());
        if (!pair || !SAFE_COLOR.test(pair[2]!)) throw new SyntaxError(`Unsupported class property: ${property}`);
        paint[pair[1]!.toLowerCase() as keyof MermaidPaint] = pair[2];
      }
      graph.classes[classDef[1]!] = paint;
      continue;
    }
    const classAssignment = /^class\s+([\w,-]+)\s+([\w-]+)$/.exec(statement);
    if (classAssignment) {
      for (const id of classAssignment[1]!.split(",")) {
        add({ id, label: id, shape: "rectangle", className: classAssignment[2] }, false);
      }
      continue;
    }
    let rest = statement;
    const readNode = (): string => {
      rest = rest.trimStart();
      const idMatch = /^[A-Za-z_](?:\w|-(?![-.>]))*/.exec(rest);
      if (!idMatch) throw new SyntaxError(`Expected a node id near: ${rest.slice(0, 60)}`);
      const id = idMatch[0];
      rest = rest.slice(id.length).trimStart();
      let label = id;
      let shape: MermaidShape = "rectangle";
      let explicit = false;
      if (rest[0] && "[({".includes(rest[0])) {
        const open = rest[0];
        const close = open === "[" ? "]" : open === "(" ? ")" : "}";
        shape = open === "[" ? "rectangle" : open === "(" ? "rounded" : "diamond";
        let quoted = false;
        let end = 1;
        for (; end < rest.length; end++) {
          if (rest[end] === '"' && rest[end - 1] !== "\\") quoted = !quoted;
          if (!quoted && rest[end] === close) break;
          if (!quoted && "[({".includes(rest[end]!)) {
            throw new SyntaxError("Nested/advanced node shapes are not supported.");
          }
        }
        if (end === rest.length) throw new SyntaxError(`Unclosed label for ${id}.`);
        label = unquote(rest.slice(1, end)).replace(/<br\s*\/?\s*>/gi, "\n");
        if (label.length > 512) throw new RangeError("Node labels are limited to 512 characters.");
        rest = rest.slice(end + 1).trimStart();
        explicit = true;
      }
      const className = /^:::([\w-]+)/.exec(rest);
      if (className) rest = rest.slice(className[0].length).trimStart();
      add({ id, label, shape, className: className?.[1] }, explicit);
      return id;
    };
    let from = readNode();
    while (rest.trim()) {
      rest = rest.trimStart();
      let label = "";
      let operator = /^(-->|---|-\.->|==>)/.exec(rest)?.[0];
      if (!operator) {
        const labeled = /^--\s+(.+?)\s+-->/.exec(rest);
        if (!labeled) throw new SyntaxError(`Unsupported Mermaid syntax near: ${rest.slice(0, 60)}`);
        label = unquote(labeled[1]!);
        rest = rest.slice(labeled[0].length).trimStart();
        operator = "-->";
      } else {
        rest = rest.slice(operator.length).trimStart();
        if (rest.startsWith("|")) {
          const end = rest.indexOf("|", 1);
          if (end < 0) throw new SyntaxError("Unclosed edge label.");
          label = unquote(rest.slice(1, end));
          rest = rest.slice(end + 1).trimStart();
        }
      }
      if (label.length > 128) throw new RangeError("Edge labels are limited to 128 characters.");
      const to = readNode();
      if (graph.edges.length >= 1024) throw new RangeError("A flowchart may contain at most 1024 edges.");
      graph.edges.push({
        from,
        to,
        label,
        style: operator === "-.->" ? "dotted" : operator === "==>" ? "thick" : "solid",
        arrow: operator !== "---",
      });
      from = to;
    }
  }
  if (groups.length) throw new SyntaxError("Unclosed subgraph.");
  if (!graph.nodes.length) throw new SyntaxError("A flowchart must contain at least one node.");
  return graph;
}

/** Deterministic ranked layout with strongly-connected components for cycles. */
export function layoutMermaid(graph: MermaidGraph, options: MermaidLayoutOptions = {}): MermaidLayout {
  const circuit = options.style === "circuit";
  if (!graph.nodes.length || graph.nodes.length > 256 || graph.edges.length > 1024) {
    throw new RangeError("Invalid flowchart size.");
  }
  if (graph.groups.length) throw new SyntaxError("Subgraph layout is not supported.");
  if (!/^(TB|TD|BT|LR|RL)$/.test(graph.direction)) throw new TypeError("Invalid flowchart direction.");
  const maxColumns = options.maxColumns ?? 2000;
  if (!Number.isInteger(maxColumns) || maxColumns < 12 || maxColumns > 2000) {
    throw new RangeError("Diagram width must be 12–2000 cells.");
  }
  for (const paint of Object.values(graph.classes)) {
    for (const value of Object.values(paint)) {
      if (value !== undefined && !SAFE_COLOR.test(value)) throw new TypeError("Unsafe flowchart paint.");
    }
  }
  if (new Set(graph.nodes.map((n) => n.id)).size !== graph.nodes.length) {
    throw new TypeError("Duplicate flowchart node id.");
  }
  const nodes = graph.nodes.map((node): MermaidPlacedNode => {
    // Control-byte rejection is intentional; keep newline/tab available in node labels.
    // deno-lint-ignore no-control-regex
    if (node.label.length > 512 || /[\x00-\x08\x0b-\x1f\x7f]/.test(node.label)) {
      throw new TypeError("Invalid flowchart label.");
    }
    const lines = wrapLabel(node.label, Math.min(26, maxColumns - 10));
    return {
      ...node,
      lines,
      x: 0,
      y: 0,
      width: Math.max(Math.min(12, maxColumns - 6), ...lines.map((line) => textWidth(line) + 4)),
      height: Math.max(
        circuit && !graph.edges.some((edge) => edge.from === node.id && edge.to === node.id) ? 3 : 5,
        lines.length + 2,
      ),
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) throw new SyntaxError("An edge references a missing node.");
  }
  // Optional-only diagrams still have a directed topology. Do not flatten a
  // scientific/integration chain simply because none of its links is required.
  const solid = graph.edges.filter((edge) => edge.style !== "dotted");
  const structural = circuit && solid.length ? { ...graph, edges: solid } : graph;
  const rank = ranks(structural);
  const connected = new Set(structural.edges.flatMap((edge) => [edge.from, edge.to]));
  const rails = circuit
    ? nodes.filter((node) =>
      !connected.has(node.id) && graph.edges.some((edge) => edge.from === node.id || edge.to === node.id)
    )
    : [];
  const islands = circuit ? nodes.filter((node) => !connected.has(node.id) && !rails.includes(node)) : [];
  const lastRank = Math.max(0, ...rank.values());
  for (const node of islands) rank.set(node.id, lastRank + 1);
  const rankWidths = new Map<number, number>();
  for (const node of nodes) {
    if (!rails.includes(node)) {
      const at = rank.get(node.id)!;
      rankWidths.set(at, (rankWidths.get(at) ?? 0) + node.width + 5);
    }
  }
  const mainWidth = Math.max(...rankWidths.values(), 0);
  const railWidth = rails.reduce((sum, node) => sum + node.width + 4, 0);
  const sideRails = circuit && graph.direction !== "LR" && graph.direction !== "RL" && mainWidth > 0 &&
    rails.length > 0 && rails.length <= 2 &&
    mainWidth + railWidth + 3 <= maxColumns;
  const requestedHorizontal = !sideRails && (graph.direction === "LR" || graph.direction === "RL");
  const levels = new Map<number, MermaidPlacedNode[]>();
  for (const node of nodes) {
    if (sideRails && rails.includes(node)) continue;
    if (circuit && requestedHorizontal && islands.includes(node)) continue;
    if (circuit && rails.includes(node)) rank.set(node.id, lastRank + 2);
    const value = rank.get(node.id)!;
    const group = levels.get(value) ?? [];
    group.push(node);
    levels.set(value, group);
  }
  const levelGap = circuit ? (structural.edges.some((edge) => edge.label) ? 3 : 2) : 6;
  const horizontalGap = circuit ? 5 : 14;
  const estimatedWidth = [...levels.values()].reduce(
    (sum, level) => sum + Math.max(...level.map((n) => n.width)),
    circuit ? 3 + Math.max(0, levels.size - 1) * horizontalGap : 5 + levels.size * horizontalGap,
  );
  const horizontal = requestedHorizontal && estimatedWidth <= maxColumns;
  if (circuit && requestedHorizontal && !horizontal && islands.length) levels.set(lastRank + 1, islands);
  let along = circuit ? 1 : 3;
  let acrossMax = 0;
  for (const [, level] of [...levels].sort((a, b) => a[0] - b[0])) {
    let across = circuit && horizontal ? 1 : 3;
    let depth = Math.max(...level.map((n) => horizontal ? n.width : n.height));
    let rowAlong = along;
    let rowDepth = 0;
    for (const node of level) {
      if (!horizontal && across > 3 && across + node.width + 3 > maxColumns) {
        acrossMax = Math.max(acrossMax, across);
        rowAlong += rowDepth + levelGap;
        across = 3;
        rowDepth = 0;
      }
      node.x = horizontal ? along : across;
      node.y = horizontal ? across : rowAlong;
      rowDepth = Math.max(rowDepth, node.height);
      across += (horizontal ? node.height : node.width) + 5;
    }
    if (!horizontal) depth = rowAlong - along + rowDepth;
    acrossMax = Math.max(acrossMax, across);
    along += depth + (horizontal ? horizontalGap : levelGap);
  }
  let width = horizontal ? along + 2 : Math.min(maxColumns, acrossMax);
  let height = horizontal ? acrossMax + 2 : along + (circuit ? 0 : 2);
  if (circuit && horizontal) {
    // Remove the unused final channel. Independent services belong below the
    // connected graph, never as an extra step in the left-to-right request path.
    width -= horizontalGap;
    height = Math.max(1, ...[...levels.values()].flat().map((node) => node.y + node.height)) + 2;
    let x = 3;
    let y = height + 2;
    let rowHeight = 0;
    for (const node of islands) {
      if (x > 3 && x + node.width + 3 > maxColumns) {
        y += rowHeight + 2;
        x = 3;
        rowHeight = 0;
      }
      node.x = x;
      node.y = y;
      x += node.width + 5;
      rowHeight = Math.max(rowHeight, node.height);
      width = Math.max(width, x - 2);
      height = Math.max(height, y + rowHeight + 2);
    }
    // Center each independent-service row in the board's final width.
    for (const y of new Set(islands.map((node) => node.y))) {
      const row = islands.filter((other) => other.y === y);
      const right = Math.max(...row.map((other) => other.x + other.width));
      const shift = Math.floor((width - right - 3) / 2);
      for (const other of row) other.x += shift;
    }
  }
  if (sideRails) height = Math.max(height, ...rails.map((node) => node.height + 2));
  if (circuit && !horizontal) {
    // Center each wrapped rank; the terminal board should not lean into its left gutter.
    const rows = new Map<number, MermaidPlacedNode[]>();
    for (const node of nodes) {
      if (sideRails && rails.includes(node)) continue;
      const row = rows.get(node.y) ?? [];
      row.push(node);
      rows.set(node.y, row);
    }
    for (const row of rows.values()) {
      if (row.length === 1) {
        row[0]!.x = Math.floor(width / 2) - Math.floor(row[0]!.width / 2);
        continue;
      }
      const right = Math.max(...row.map((node) => node.x + node.width));
      const shift = Math.floor((width - right - 3) / 2);
      for (const node of row) node.x += shift;
    }
    if (sideRails) {
      const before = rails[0]!.width + 4;
      for (const node of nodes) if (!rails.includes(node)) node.x += before;
      rails[0]!.x = 2;
      rails[0]!.y = Math.max(
        1,
        Math.min(height - rails[0]!.height - 1, Math.floor(height / 3) - Math.floor(rails[0]!.height / 2)),
      );
      if (rails[1]) {
        rails[1].x = before + width + 1;
        rails[1].y = Math.max(
          1,
          Math.min(height - rails[1].height - 1, Math.floor(height * 2 / 3) - Math.floor(rails[1].height / 2)),
        );
      }
      // Align a support package with its actual consumer, not an arbitrary
      // fraction of board height. This avoids long return loops on side rails.
      for (const rail of rails) {
        const link = graph.edges.find((edge) => edge.from === rail.id || edge.to === rail.id)!;
        const peer = byId.get(link.from === rail.id ? link.to : link.from)!;
        rail.y = Math.max(1, Math.min(height - rail.height - 1, peer.y + Math.floor((peer.height - rail.height) / 2)));
      }
      width += railWidth;
    }
  }
  if (width * height > 250_000) throw new RangeError("Flowchart layout exceeds 250,000 cells; split the diagram.");
  if (horizontal && graph.direction === "RL") { for (const n of nodes) n.x = width - n.x - n.width; }
  if (graph.direction === "BT") { for (const n of nodes) n.y = height - n.y - n.height; }
  const walls = new Uint8Array(width * height);
  for (const node of nodes) {
    for (let y = node.y; y < node.y + node.height; y++) {
      walls.fill(1, y * width + node.x, y * width + node.x + node.width);
    }
  }
  const router = new OrthogonalRouter();
  const ports = new Map<string, number>();
  const port = (
    node: MermaidPlacedNode,
    peer: MermaidPlacedNode,
    outgoing: boolean,
    self: boolean,
    dotted: boolean,
  ): RoutePoint => {
    const key = `${node.id}:${outgoing}`;
    const ordinal = ports.get(key) ?? 0;
    ports.set(key, ordinal + 1);
    if (self) return { x: node.x + node.width - 1, y: node.y + (outgoing ? 1 : node.height - 2) };
    const reverse = (horizontal && graph.direction === "RL") || graph.direction === "BT";
    const far = outgoing !== reverse;
    if (sideRails && rails.includes(node)) {
      return { x: node.x + (node === rails[0] ? node.width - 1 : 0), y: node.y + Math.floor(node.height / 2) };
    }
    if (sideRails && rails.includes(peer)) {
      return { x: node.x + (peer === rails[0] ? 0 : node.width - 1), y: node.y + Math.floor(node.height / 2) };
    }
    if (circuit && dotted && !horizontal && peer.y + peer.height <= node.y) {
      return { x: node.x + Math.floor(node.width / 2), y: node.y };
    }
    if (circuit && dotted && !horizontal && peer.y >= node.y + node.height) {
      return { x: node.x + Math.floor(node.width / 2), y: node.y + node.height - 1 };
    }
    if (horizontal) return { x: node.x + (far ? node.width - 1 : 0), y: node.y + 1 + ordinal % (node.height - 2) };
    return {
      x: node.x + (circuit ? Math.floor(node.width / 2) + ordinal % 2 : 2 + ordinal % (node.width - 4)),
      y: node.y + (far ? node.height - 1 : 0),
    };
  };
  const edges = graph.edges.map((edge): MermaidRoutedEdge => {
    // deno-lint-ignore no-control-regex -- Edge labels must not emit terminal controls.
    if (edge.label.length > 128 || /[\x00-\x1f\x7f]/.test(edge.label)) throw new TypeError("Invalid edge label.");
    const fromNode = byId.get(edge.from)!, toNode = byId.get(edge.to)!;
    const source = port(fromNode, toNode, true, edge.from === edge.to, edge.style === "dotted");
    const sink = port(toNode, fromNode, false, edge.from === edge.to, edge.style === "dotted");
    const from = source.y * width + source.x;
    const to = sink.y * width + sink.x;
    const path = router.route(
      width,
      height,
      source,
      sink,
      (index) => index === from || index === to || walls[index] === 0,
      horizontal ? 1 : 2,
    );
    if (!path) throw new Error(`Could not route ${edge.from} → ${edge.to}; split or simplify the diagram.`);
    return { ...edge, path };
  });
  return { graph, width, height, nodes, edges };
}

/** Semantic chip/trace cell for theme-aware terminal composition. */
export interface MermaidFrameCell {
  char: string;
  role: "diagram-node" | "diagram-trace" | "diagram-integration" | "diagram-label" | "diagram-grid";
}

/**
 * Circuit-board presentation using the live background's chip painter and route
 * glyphs. Colors remain semantic: themes, not author-supplied RGB, own the cells.
 */
export function renderMermaidFrame(layout: MermaidLayout): MermaidFrameCell[][] {
  validateLayout(layout);
  const cells: MermaidFrameCell[][] = Array.from(
    { length: layout.height },
    (_, y) =>
      Array.from(
        { length: layout.width },
        (_, x) => ({ char: x % 8 === 0 && y % 4 === 0 ? "·" : " ", role: "diagram-grid" }),
      ),
  );
  const put = (x: number, y: number, text: string, role: MermaidFrameCell["role"]) => {
    for (const char of getMultiCodePointCharacters(text)) {
      if (cells[y]?.[x]) cells[y]![x] = { char, role };
      for (let offset = 1; offset < textWidth(char); offset++) {
        if (cells[y]?.[x + offset]) cells[y]![x + offset] = { char: "", role };
      }
      x += textWidth(char);
    }
  };
  const traceOwner = new Uint16Array(layout.width * layout.height);
  for (const [index, edge] of layout.edges.entries()) {
    const role = edge.style === "dotted" ? "diagram-integration" : "diagram-trace";
    for (const cell of routeCells(edge.path, "○")) {
      const at = cell.y * layout.width + cell.x;
      traceOwner[at] = traceOwner[at] && traceOwner[at] !== index + 1 ? 0xffff : index + 1;
      put(
        cell.x,
        cell.y,
        edge.style === "dotted" && cell.glyph === "─"
          ? "┄"
          : edge.style === "dotted" && cell.glyph === "│"
          ? "┆"
          : cell.glyph,
        role,
      );
    }
    if (edge.arrow && edge.path.length > 1) {
      const before = edge.path.at(-2)!;
      put(before.x, before.y, ["▲", "▶", "▼", "◀"][routeDirection(before, edge.path.at(-1)!)]!, role);
    }
  }
  for (const node of layout.nodes) {
    for (let y = 0; y < node.height; y++) {
      for (let x = 0; x < node.width; x++) {
        put(node.x + x, node.y + y, circuitChipGlyph(x, y, node.width, node.height, " "), "diagram-node");
      }
    }
    node.lines.forEach((line, row) =>
      put(node.x + Math.floor((node.width - textWidth(line)) / 2), node.y + 1 + row, line, "diagram-label")
    );
    if (node.shape === "diamond") {
      put(node.x, node.y, "◇", "diagram-node");
      put(node.x + node.width - 1, node.y + node.height - 1, "◇", "diagram-node");
    }
  }
  // Paint connected pins after the packages, so traces visibly terminate on them.
  for (const edge of layout.edges) {
    for (const [point, neighbor] of [[edge.path[0]!, edge.path[1]], [edge.path.at(-1)!, edge.path.at(-2)]] as const) {
      if (!neighbor) {
        continue;
      }
      const dir = routeDirection(point, neighbor);
      put(
        point.x,
        point.y,
        ["╨", "╟", "╥", "╢"][dir]!,
        edge.style === "dotted" ? "diagram-integration" : "diagram-trace",
      );
    }
  }
  const reserved = new Set<number>();
  for (const edge of layout.edges) {
    for (const point of [edge.path[0], edge.path[1], edge.path.at(-1), edge.path.at(-2)]) {
      if (point) reserved.add(point.y * layout.width + point.x);
    }
  }
  const legend: { text: string; role: MermaidFrameCell["role"] }[] = [];
  for (const [edgeIndex, edge] of layout.edges.entries()) {
    if (!edge.label) continue;
    const label = ` ${edge.label} `;
    const size = textWidth(label);
    const middle = Math.floor(edge.path.length / 2);
    let placed = false;
    // Prefer inline, then adjacent to a horizontal channel. Keep captions near
    // their connection without widening packages or obscuring other traces.
    for (const offset of [0, -1, 1, -2, 2, -3, 3]) {
      for (let index = 0; index < edge.path.length; index++) {
        const at = index % 2 === 0 ? middle + index / 2 : middle - (index + 1) / 2;
        const point = edge.path[at];
        if (!point) continue;
        if (offset && edge.path[at - 1]?.y !== point.y && edge.path[at + 1]?.y !== point.y) continue;
        const y = point.y + offset;
        if (y < 0 || y >= layout.height) continue;
        const x = Math.max(0, Math.min(layout.width - size, point.x - Math.floor(size / 2)));
        if (size > layout.width) break;
        if (
          layout.nodes.some((node) =>
            y >= node.y && y < node.y + node.height && x < node.x + node.width && x + size > node.x
          )
        ) continue;
        if (Array.from({ length: size }, (_, i) => reserved.has(y * layout.width + x + i)).some(Boolean)) continue;
        // A caption may interrupt its own trace, never another edge or junction.
        if (
          Array.from({ length: size }, (_, i) => traceOwner[y * layout.width + x + i])
            .some((owner) => owner !== 0 && owner !== edgeIndex + 1)
        ) continue;
        put(x, y, label, edge.style === "dotted" ? "diagram-integration" : "diagram-label");
        for (let i = 0; i < size; i++) reserved.add(y * layout.width + x + i);
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) {
      legend.push({
        text: `${layout.nodes.find((node) => node.id === edge.from)!.label.split("\n")[0]} → ${
          layout.nodes.find((node) => node.id === edge.to)!.label.split("\n")[0]
        }: ${edge.label}`,
        role: edge.style === "dotted" ? "diagram-integration" : "diagram-label",
      });
    }
  }
  if (legend.length) cells.push(Array.from({ length: layout.width }, () => ({ char: " ", role: "diagram-grid" })));
  for (const item of legend) {
    for (const line of wrapLabel(item.text, layout.width)) {
      const row = Array.from({ length: layout.width }, () => ({ char: " ", role: item.role }));
      cells.push(row);
      put(0, cells.length - 1, line, item.role);
    }
  }
  return cells;
}

/** Draws a Mermaid layout as terminal cells, preserving labels and arrow direction. */
export function renderMermaidCells(layout: MermaidLayout): string[] {
  validateLayout(layout);
  const cells = Array.from({ length: layout.height }, () => new Array<string>(layout.width).fill(" "));
  const put = (x: number, y: number, text: string) => {
    for (const char of getMultiCodePointCharacters(text)) {
      if (cells[y]?.[x] !== undefined) cells[y]![x] = char;
      const size = textWidth(char);
      for (let offset = 1; offset < size; offset++) {
        if (cells[y]?.[x + offset] !== undefined) cells[y]![x + offset] = "";
      }
      x += size;
    }
  };
  for (const edge of layout.edges) {
    for (const cell of routeCells(edge.path)) {
      const glyph = edge.style === "dotted"
        ? "·"
        : edge.style === "thick"
        ? ({ "─": "═", "│": "║", "┌": "╔", "┐": "╗", "└": "╚", "┘": "╝" } as Record<string, string>)[cell.glyph] ??
          cell.glyph
        : cell.glyph;
      put(cell.x, cell.y, glyph);
    }
    if (edge.arrow && edge.path.length > 1) {
      const before = edge.path.at(-2)!;
      put(before.x, before.y, ["▲", "▶", "▼", "◀"][routeDirection(before, edge.path.at(-1)!)]!);
    }
    if (edge.label) {
      const mid = edge.path[Math.floor(edge.path.length / 2)]!;
      put(mid.x + 1, mid.y, cropToWidth(edge.label, layout.width - mid.x - 1));
    }
  }
  for (const node of layout.nodes) {
    const rounded = node.shape === "rounded";
    put(node.x, node.y, `${rounded ? "╭" : "┌"}${"─".repeat(node.width - 2)}${rounded ? "╮" : "┐"}`);
    for (let row = 1; row < node.height - 1; row++) {
      put(node.x, node.y + row, `│${" ".repeat(node.width - 2)}│`);
    }
    put(node.x, node.y + node.height - 1, `${rounded ? "╰" : "└"}${"─".repeat(node.width - 2)}${rounded ? "╯" : "┘"}`);
    node.lines.forEach((line, row) => put(node.x + 2, node.y + 1 + row, line));
    if (node.shape === "diamond") {
      put(node.x, node.y, "◇");
      put(node.x + node.width - 1, node.y + node.height - 1, "◇");
    }
  }
  return cells.map((row) => row.join("").trimEnd());
}

/** Safe standalone SVG using the shared cell layout and routed circuit traces. */
export function renderMermaidSvg(layout: MermaidLayout, title = "Flowchart"): string {
  validateLayout(layout);
  for (const paint of Object.values(layout.graph.classes)) {
    for (const value of Object.values(paint)) {
      if (value !== undefined && !SAFE_COLOR.test(value)) throw new TypeError("Unsafe flowchart paint.");
    }
  }
  const cw = 9;
  const ch = 18;
  const id = `exotui-arrow-${hash(JSON.stringify(layout.graph))}`;
  const edges = layout.edges.map((edge) => {
    const points = edge.path.filter((point, i, path) =>
      !i || i === path.length - 1 || routeDirection(path[i - 1]!, point) !== routeDirection(point, path[i + 1]!)
    );
    const mid = edge.path[Math.floor(edge.path.length / 2)]!;
    const label = edge.label
      ? `<text x="${mid.x * cw + 8}" y="${
        mid.y * ch - 6
      }" font-size="12" paint-order="stroke" stroke="#eef5f6" stroke-width="5" stroke-linejoin="round" fill="#315161">${
        escape(edge.label)
      }</text>`
      : "";
    return `<polyline points="${
      points.map((p) => `${p.x * cw},${p.y * ch}`).join(" ")
    }" fill="none" stroke="#537586" stroke-width="${edge.style === "thick" ? 3.5 : 2}"${
      edge.style === "dotted" ? ' stroke-dasharray="5 5"' : ""
    }${edge.arrow ? ` marker-end="url(#${id})"` : ""}/>${label}`;
  }).join("\n");
  const nodes = layout.nodes.map((node) => {
    const paint = node.className ? layout.graph.classes[node.className] ?? {} : {};
    const fill = paint.fill ?? "#ffffff";
    const stroke = paint.stroke ?? "#12a89d";
    const color = paint.color ?? "#10283a";
    const x = (node.x - 0.4) * cw;
    const y = (node.y - 0.4) * ch;
    const w = (node.width - 0.2) * cw;
    const h = (node.height - 0.2) * ch;
    const shape = node.shape === "diamond"
      ? `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${
        y + h / 2
      }" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
      : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${
        node.shape === "rounded" ? 18 : 8
      }" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
    const text = node.lines.map((line, row) =>
      `<tspan x="${x + w / 2}" y="${y + h / 2 + (row - (node.lines.length - 1) / 2) * 17 + 5}">${escape(line)}</tspan>`
    ).join("");
    return `<g data-node="${
      escape(node.id)
    }">${shape}<text text-anchor="middle" font-size="13" font-weight="650" fill="${color}">${text}</text></g>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width * cw} ${
    layout.height * ch
  }" role="img" aria-label="${escape(title)}" class="exotui-mermaid"><title>${
    escape(title)
  }</title><defs><marker id="${id}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5 0 7Z" fill="#537586"/></marker></defs><rect width="100%" height="100%" rx="18" fill="#eef5f6"/><g font-family="ui-monospace,monospace">${edges}${nodes}</g></svg>`;
}

function splitStatements(source: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote = false;
  let depth = 0;
  let comment = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (comment && char !== "\n") continue;
    if (comment) comment = false;
    if (!quote && char === "%" && source[i + 1] === "%") {
      comment = true;
      continue;
    }
    if (char === '"' && source[i - 1] !== "\\") quote = !quote;
    if (!quote) {
      if ("[({".includes(char)) depth++;
      if ("])}".includes(char)) depth--;
    }
    if (!quote && depth === 0 && (char === ";" || char === "\n")) {
      if (current.trim()) result.push(current.trim());
      current = "";
    } else current += char;
  }
  if (quote || depth !== 0) throw new SyntaxError("Unclosed quote or node shape.");
  if (current.trim()) result.push(current.trim());
  return result;
}

function validateLayout(layout: MermaidLayout): void {
  if (
    !Number.isSafeInteger(layout.width) || !Number.isSafeInteger(layout.height) || layout.width < 1 ||
    layout.height < 1 || layout.width > 2000 || layout.width * layout.height > 250_000
  ) {
    throw new RangeError("Invalid flowchart layout bounds.");
  }
  if (layout.nodes.length > 256 || layout.edges.length > 1024) throw new RangeError("Invalid flowchart layout size.");
  const inside = (x: number, y: number) =>
    Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < layout.width && y < layout.height;
  for (const node of layout.nodes) {
    if (
      !inside(node.x, node.y) || !Number.isInteger(node.width) || !Number.isInteger(node.height) || node.width < 4 ||
      node.height < 3 || !inside(node.x + node.width - 1, node.y + node.height - 1)
    ) throw new TypeError("Invalid flowchart node bounds.");
  }
  for (const edge of layout.edges) {
    if (
      !edge.path.length || edge.path.length > layout.width * layout.height ||
      edge.path.some((point) => !inside(point.x, point.y))
    ) throw new TypeError("Invalid flowchart route.");
  }
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1).replaceAll('\\"', '"') : trimmed;
}

function wrapLabel(label: string, width: number): string[] {
  const result: string[] = [];
  for (const paragraph of label.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (textWidth(line ? `${line} ${word}` : word) > width) {
        if (line) result.push(line);
        line = "";
      }
      let remaining = word;
      while (textWidth(remaining) > width) {
        const piece = cropToWidth(remaining, width);
        result.push(piece);
        remaining = remaining.slice(piece.length);
      }
      line = line ? `${line} ${remaining}` : remaining;
    }
    result.push(line);
  }
  return result;
}

function ranks(graph: MermaidGraph): Map<string, number> {
  const adjacent = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) adjacent.get(edge.from)!.push(edge.to);
  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const component = new Map<string, number>();
  let count = 0;
  const visit = (id: string) => {
    indices.set(id, index);
    low.set(id, index++);
    stack.push(id);
    onStack.add(id);
    for (const next of adjacent.get(id)!) {
      if (!indices.has(next)) {
        visit(next);
        low.set(id, Math.min(low.get(id)!, low.get(next)!));
      } else if (onStack.has(next)) low.set(id, Math.min(low.get(id)!, indices.get(next)!));
    }
    if (low.get(id) === indices.get(id)) {
      let next: string;
      do {
        next = stack.pop()!;
        onStack.delete(next);
        component.set(next, count);
      } while (next !== id);
      count++;
    }
  };
  for (const node of graph.nodes) if (!indices.has(node.id)) visit(node.id);
  const values = new Array<number>(count).fill(0);
  for (let step = 0; step < count; step++) {
    for (const edge of graph.edges) {
      const from = component.get(edge.from)!;
      const to = component.get(edge.to)!;
      if (from !== to) values[to] = Math.max(values[to]!, values[from]! + 1);
    }
  }
  return new Map(graph.nodes.map((node) => [node.id, values[component.get(node.id)!]!]));
}

function escape(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function hash(text: string): string {
  let value = 2166136261;
  for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619);
  return (value >>> 0).toString(36);
}
