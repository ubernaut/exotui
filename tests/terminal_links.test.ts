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

  const hard = new TerminalScreenController({ columns: 16, rows: 3 });
  hard.write("https://a.test/x\r\ny");
  assertEquals(terminalLinkAt(hard.cellRows(), { row: 0, column: 2 }), "https://a.test/x");
  assertEquals(terminalLinkAt(hard.cellRows(), { row: 1, column: 0 }), undefined);
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
  screen.resize(4, 2);
  assertEquals(screen.cellRows().some((row) => row.some((cell) => cell.softWrapped)), false);
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
