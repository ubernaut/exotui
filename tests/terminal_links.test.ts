import { assertEquals } from "./deps.ts";
import { normalizeTerminalLink, terminalLinkAt } from "../src/runtime/terminal_links.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";
import { TerminalSelectionController } from "../src/runtime/terminal_selection.ts";

Deno.test("terminal links recognize plain URLs, punctuation, and wide-cell coordinates", () => {
  const screen = new TerminalScreenController({ columns: 100, rows: 4 });
  screen.write(
    "界 e\u0301 (https://example.com/a_(b)). next\r\nhttp://localhost:3000/?a=1&b=2\r\nwww.example.com\r\nmailto:a@example.com",
  );
  const rows = screen.cellRows();
  assertEquals(terminalLinkAt(rows, { row: 0, column: 8 }), "https://example.com/a_(b)");
  assertEquals(terminalLinkAt(rows, { row: 0, column: 1 }), undefined);
  assertEquals(terminalLinkAt(rows, { row: 0, column: 31 }), undefined);
  assertEquals(terminalLinkAt(rows, { row: 1, column: 10 }), "http://localhost:3000/?a=1&b=2");
  assertEquals(terminalLinkAt(rows, { row: 2, column: 2 }), "https://www.example.com/");
  assertEquals(terminalLinkAt(rows, { row: 3, column: 4 }), "mailto:a@example.com");
  assertEquals(terminalLinkAt(rows, { row: -1, column: 0 }), undefined);
  assertEquals(terminalLinkAt(rows, { row: 0, column: NaN }), undefined);
});

Deno.test("terminal links retain OSC 8 targets across wrapped Unicode labels", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 4 });
  screen.write("\x1b]8;;https://example.com/remote\x1b\\界 labeled link\x1b]8;;\x1b\\ normal");
  const rows = screen.cellRows();
  assertEquals(terminalLinkAt(rows, { row: 0, column: 0 }), "https://example.com/remote");
  assertEquals(terminalLinkAt(rows, { row: 0, column: 1 }), "https://example.com/remote");
  assertEquals(terminalLinkAt(rows, { row: 1, column: 1 }), "https://example.com/remote");
  assertEquals(terminalLinkAt(rows, { row: 2, column: 2 }), undefined);
});

Deno.test("terminal links and copying join soft wraps but preserve hard line breaks", () => {
  const screen = new TerminalScreenController({ columns: 16, rows: 5 });
  const url = "https://example.com/long/path?q=yes";
  screen.write(url + "\r\nnext line");
  const rows = screen.cellRows();
  assertEquals(terminalLinkAt(rows, { row: 0, column: 5 }), url);
  assertEquals(terminalLinkAt(rows, { row: 1, column: 5 }), url);
  assertEquals(terminalLinkAt(rows.slice(0, 1), { row: 0, column: 5 }), undefined);
  assertEquals(terminalLinkAt(rows.slice(1), { row: 0, column: 5 }), undefined);
  const selection = new TerminalSelectionController();
  selection.begin(rows, { column: 0, row: 0 });
  selection.extend({ column: 8, row: 3 });
  assertEquals(selection.selectedText(), url + "\nnext line");

  // A URL that stops short of the edge ends at its hard line break.
  const hard = new TerminalScreenController({ columns: 16, rows: 3 });
  hard.write("https://a.test\r\nyes");
  assertEquals(terminalLinkAt(hard.cellRows(), { row: 0, column: 2 }), "https://a.test/");
  assertEquals(terminalLinkAt(hard.cellRows(), { row: 1, column: 0 }), undefined);
});

Deno.test("terminal links follow URLs that applications hard-wrap at the edge", () => {
  // Claude Code's layouts at 60 columns, drawn with cursor addressing as it
  // draws them: the prompt echo breaks one column short of the edge and pads
  // it, tool output breaks at the edge and indents under the URL.
  const url = "https://example.com/a/very/long/path/that/keeps/going/and/going/well/past/the/sixty/column/edge/" +
    "of/this/pane?query=string";
  const screen = new TerminalScreenController({ columns: 60, rows: 8 });
  screen.write(
    "\x1b[1;1H!\u00a0echo https://example.com/a/very/long/path/that/keeps/goin\x1b[48;5;59m \x1b[0m" +
      "\x1b[2;1H  g/and/going/well/past/the/sixty/column/edge/of/this/pane?\x1b[48;5;59m \x1b[0m" +
      "\x1b[3;1H  query=string" +
      "\x1b[4;1H  \u23bf  https://example.com/a/very/long/path/that/keeps/going/a" +
      "\x1b[5;1H     nd/going/well/past/the/sixty/column/edge/of/this/pane?q" +
      "\x1b[6;1H     uery=string and more",
  );
  const rows = screen.cellRows();
  assertEquals(rows.some((row) => row.at(-1)?.softWrapped), false);
  for (const [row, column] of [[0, 7], [0, 58], [1, 2], [1, 58], [2, 13], [3, 5], [3, 59], [4, 5], [5, 15]]) {
    assertEquals(terminalLinkAt(rows, { row: row!, column: column! }), url, `row ${row} column ${column}`);
  }
  // Indentation, edge padding and the words after the URL are not the link.
  for (const [row, column] of [[1, 0], [1, 59], [4, 2], [5, 17], [0, 2]]) {
    assertEquals(terminalLinkAt(rows, { row: row!, column: column! }), undefined, `row ${row} column ${column}`);
  }
});

Deno.test("terminal links keep hard-wrapped prose, new URLs and list rows apart", () => {
  const columns = 24;
  const at = (lines: string[], row: number, column: number) => {
    const screen = new TerminalScreenController({ columns, rows: lines.length });
    screen.write(lines.map((line, index) => `\x1b[${index + 1};1H${line}`).join(""));
    return terminalLinkAt(screen.cellRows(), { row, column });
  };
  // A word at the edge must not glue itself onto a URL opening the next row.
  assertEquals(at(["words that fill the rows", "https://example.com/x"], 1, 3), "https://example.com/x");
  // A URL ending before the edge stays whole even when the next row is text.
  assertEquals(at(["see https://a.test/x", "  continued"], 0, 6), "https://a.test/x");
  // A list or tree marker opening the next row is not URL data.
  assertEquals(at(["- https://example.com/ab", "- next item"], 0, 4), "https://example.com/ab");
  assertEquals(at(["1. https://example.com/a", "2. next item"], 0, 4), "https://example.com/a");
  // Continuation may not be indented past where the URL started.
  assertEquals(at(["https://example.com/abcd", "     efgh"], 0, 3), "https://example.com/abcd");
  assertEquals(at(["https://example.com/abcd", "     efgh"], 1, 6), undefined);
  // Both halves of a URL broken at the edge find the whole URL.
  assertEquals(at(["  https://example.com/ab", "  cd/ef", "next"], 1, 3), "https://example.com/abcd/ef");
});

Deno.test("terminal soft-wrap metadata survives history and handles wide-glyph padding", () => {
  const screen = new TerminalScreenController({ columns: 3, rows: 2 });
  screen.write("ab界cdef");
  const rows = screen.cellRowsRange(0, 20);
  const selection = new TerminalSelectionController();
  selection.begin(rows, { column: 0, row: 0 });
  selection.extend({ column: 2, row: rows.length - 1 });
  assertEquals(selection.selectedText(), "ab界cdef");
  assertEquals(rows[0]!.at(-1)?.wrapPadding, true);
});

Deno.test("terminal soft wraps survive resizes that do not cut the wrapped row", () => {
  const url = "https://example.com/long/path?q=yes";
  const screen = new TerminalScreenController({ columns: 16, rows: 5 });
  screen.write(url + "\r\nnext line");
  const linkFromEveryRow = (width: number) => {
    const rows = screen.cellRows();
    for (let row = 0; row < 3; row++) {
      assertEquals(terminalLinkAt(rows, { row, column: 2 }), url, `width ${width} row ${row}`);
    }
    const selection = new TerminalSelectionController();
    selection.begin(rows, { column: 0, row: 0 });
    selection.extend({ column: 8, row: 3 });
    assertEquals(selection.selectedText(), url + "\nnext line", `width ${width}`);
  };
  // Widening pads the rows without reflowing them, so the gap is wrap padding.
  screen.resize(24, 5);
  assertEquals(screen.cellRows()[0]!.slice(16).every((cell) => cell.wrapPadding), true);
  linkFromEveryRow(24);
  // Narrowing back drops only that padding.
  screen.resize(16, 5);
  linkFromEveryRow(16);
  // Narrowing into the text cuts the URL: the rows stop joining, and neither
  // the cut pieces nor rows that now happen to reach the edge open anything.
  screen.resize(12, 5);
  let rows = screen.cellRows();
  assertEquals(rows.some((row) => row.some((cell) => cell.softWrapped || cell.wrapPadding)), false);
  assertEquals(rows.slice(0, 2).map((row) => row.at(-1)?.clipped), [true, true]);
  for (let row = 0; row < 3; row++) assertEquals(terminalLinkAt(rows, { row, column: 2 }), undefined);
  // Widening again cannot bring the cut text back, so the URL stays unopenable.
  screen.resize(20, 5);
  rows = screen.cellRows();
  assertEquals(terminalLinkAt(rows, { row: 0, column: 2 }), undefined);
  // A row that is written again is whole again.
  screen.write("\x1b[1;1Hhttps://a.test/ok\x1b[K");
  assertEquals(terminalLinkAt(screen.cellRows(), { row: 0, column: 2 }), "https://a.test/ok");
});

Deno.test("terminal links reject executable schemes and control characters", () => {
  for (
    const value of [
      "javascript:alert(1)",
      "data:text/html,x",
      "file:///tmp/x",
      "--help",
      "https://x.test/\narg",
      "https://x.test/\x00",
      "https://x.test/ a",
      "https://x.test/" + "a".repeat(8192),
    ]
  ) {
    assertEquals(normalizeTerminalLink(value), undefined);
    assertEquals(terminalLinkAt([[{ char: "x", hyperlink: value }]], { row: 0, column: 0 }), undefined);
  }
  assertEquals(
    normalizeTerminalLink("https://example.com/?x=$(echo)&a=b;c=d"),
    "https://example.com/?x=$(echo)&a=b;c=d",
  );
});
