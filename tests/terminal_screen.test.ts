import { assertEquals } from "./deps.ts";
import { textWidth } from "../src/utils/strings.ts";
import { commandDisabledBoolean as commandDisabled } from "./test_commands.ts";
import { CommandRegistry } from "../src/app/commands.ts";
import {
  bindTerminalScrollbackCommands,
  type TerminalScrollbackCommandAction,
  terminalScrollbackCommands,
} from "../src/app/terminal_commands.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";
import { TerminalScrollbackController } from "../src/runtime/terminal_scrollback.ts";
import { parseTerminalControlSequence, parseTerminalParams } from "../src/runtime/terminal_sequences.ts";
import {
  decodeTerminalColor,
  encodeTerminalIndexedColor,
  encodeTerminalRgbColor,
} from "../src/runtime/terminal_color.ts";

Deno.test("terminal sequence parser parses private CSI sequences", () => {
  assertEquals(parseTerminalControlSequence("\x1b[?1000;1006hrest"), {
    kind: "csi",
    private: true,
    prefix: "?",
    params: "1000;1006",
    intermediates: "",
    command: "h",
    length: 13,
  });
});

Deno.test("terminal sequence parser preserves CSI intermediates", () => {
  assertEquals(parseTerminalControlSequence("\x1b[6 q"), {
    kind: "csi",
    private: false,
    prefix: "",
    params: "6",
    intermediates: " ",
    command: "q",
    length: 5,
  });
});

Deno.test("terminal sequence parser supports OSC BEL and ST terminators", () => {
  assertEquals(parseTerminalControlSequence("\x1b]0;title\x07after"), {
    kind: "osc",
    private: false,
    prefix: "",
    params: "0;title",
    intermediates: "",
    command: "]",
    length: 10,
  });
  assertEquals(parseTerminalControlSequence("\x1b]2;editor\x1b\\after"), {
    kind: "osc",
    private: false,
    prefix: "",
    params: "2;editor",
    intermediates: "",
    command: "]",
    length: 12,
  });
});

Deno.test("terminal sequence parser supports single-character ESC controls", () => {
  for (const command of ["7", "8", "M", "H", "D", "E", "c"]) {
    assertEquals(parseTerminalControlSequence(`\x1b${command}rest`), {
      kind: "esc",
      private: false,
      prefix: "",
      params: "",
      intermediates: "",
      command,
      length: 2,
    });
  }
});

Deno.test("terminal sequence parser parses controls at an offset without slicing", () => {
  assertEquals(parseTerminalControlSequence("xx\x1b[?25l", 2), {
    kind: "csi",
    private: true,
    prefix: "?",
    params: "25",
    intermediates: "",
    command: "l",
    length: 6,
  });
  assertEquals(parseTerminalControlSequence("xx\x1b]0;title\x07after", 2), {
    kind: "osc",
    private: false,
    prefix: "",
    params: "0;title",
    intermediates: "",
    command: "]",
    length: 10,
  });
  assertEquals(parseTerminalControlSequence("xx\x1bMrest", 2), {
    kind: "esc",
    private: false,
    prefix: "",
    params: "",
    intermediates: "",
    command: "M",
    length: 2,
  });
  assertEquals(parseTerminalControlSequence("\x1b[31mxx", 5), undefined);
});

Deno.test("terminal parameter parser handles semicolon colon and empty slots", () => {
  assertEquals(parseTerminalParams("1;2:3;;5"), [1, 2, 3, 0, 5]);
  assertEquals(parseTerminalParams(""), []);
});

Deno.test("TerminalScreenController writes text and keeps clone-safe styled scrollback", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 2, scrollbackLimit: 2 });

  screen.write("\x1b[31mhello\x1b[0m\r\nworld\r\nagain");

  assertEquals(screen.scrollbackTextRows(), ["hello"]);
  const styled = screen.scrollbackCellRows();
  assertEquals(styled[0]?.[0], { char: "h", foreground: 31 });
  styled[0]![0]!.char = "x";
  assertEquals(screen.scrollbackCellRows()[0]?.[0], { char: "h", foreground: 31 });
  const range = screen.cellRowsRange(0, 2);
  assertEquals(range.map((row) => row[0]?.char), ["h", "w"]);
  range[1]![0]!.char = "x";
  assertEquals(screen.cellRowsRange(1, 1)[0]?.[0], { char: "w" });
  assertEquals(screen.cellRowsRange(99, 4), []);
  assertEquals(screen.cellRowsRange(0, 0), []);
  assertEquals(screen.textRows(), ["world", "again"]);
  assertEquals(screen.inspect().cursor, { column: 5, row: 1 });
});

Deno.test("TerminalScreenController tracks SGR styles per cell", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 2 });

  screen.write("\x1b[1;31mR\x1b[0mN");

  const [row] = screen.cellRows();
  assertEquals(row![0], { char: "R", bold: true, foreground: 31 });
  assertEquals(row![1], { char: "N" });
});

Deno.test("TerminalScreenController writes unicode graphics without splitting surrogate pairs", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 2 });

  screen.write("界🙂x");

  assertEquals(screen.textRows()[0], "界 🙂 x");
  const [row] = screen.cellRows();
  assertEquals(row![0], { char: "界" });
  assertEquals(row![2], { char: "🙂" });
  assertEquals(row![4], { char: "x" });
  assertEquals(screen.inspect().cursor, { column: 5, row: 0 });
});

Deno.test("TerminalScreenController preserves split UTF-8 and control sequences across writes", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });
  const emoji = new TextEncoder().encode("🙂");

  screen.write(emoji.slice(0, 2));
  assertEquals(screen.textRows()[0], "");
  screen.write(emoji.slice(2));
  screen.write("\x1b[38;2;12");
  assertEquals(screen.textRows()[0], "🙂");
  screen.write(";34;56mX\x1b]2;split");
  assertEquals(screen.inspect().title, undefined);
  screen.write(" title\x1b\\");

  assertEquals(screen.cellRows()[0]![0], { char: "🙂" });
  assertEquals(screen.cellRows()[0]![2], { char: "X", foreground: encodeTerminalRgbColor(12, 34, 56) });
  assertEquals(screen.inspect().title, "split title");
});

Deno.test("TerminalScreenController tracks the OSC 7 working directory", () => {
  const screen = new TerminalScreenController({ columns: 20, rows: 2 });
  assertEquals(screen.inspect().workingDirectory, undefined);

  screen.write("\x1b]7;file://host/home/cos/projects\x07");
  assertEquals(screen.inspect().workingDirectory, "/home/cos/projects");

  // Percent-encoded paths decode; the host part is irrelevant.
  screen.write("\x1b]7;file:///tmp/with%20space\x1b\\");
  assertEquals(screen.inspect().workingDirectory, "/tmp/with space");

  // Malformed or foreign payloads never clear the last good report.
  screen.write("\x1b]7;http://evil.example/\x07");
  screen.write("\x1b]7;file:\x07");
  screen.write("\x1b]7;\x07");
  assertEquals(screen.inspect().workingDirectory, "/tmp/with space");

  // A full reset clears it with the rest of the retained state.
  screen.write("\x1bc");
  assertEquals(screen.inspect().workingDirectory, undefined);
});

Deno.test("TerminalScreenController tracks 256-color truecolor and bright SGR styles", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 2 });

  screen.write("\x1b[38;5;196mA\x1b[48;5;17mB\x1b[38;2;12;34;56mC\x1b[48;2;200;210;220mD");
  screen.write("\x1b[93;104mE\x1b[39;49mF");

  const [row] = screen.cellRows();
  assertEquals(row![0], { char: "A", foreground: encodeTerminalIndexedColor(196) });
  assertEquals(row![1], {
    char: "B",
    foreground: encodeTerminalIndexedColor(196),
    background: encodeTerminalIndexedColor(17),
  });
  assertEquals(row![2], {
    char: "C",
    foreground: encodeTerminalRgbColor(12, 34, 56),
    background: encodeTerminalIndexedColor(17),
  });
  assertEquals(row![3], {
    char: "D",
    foreground: encodeTerminalRgbColor(12, 34, 56),
    background: encodeTerminalRgbColor(200, 210, 220),
  });
  assertEquals(row![4], { char: "E", foreground: 93, background: 104 });
  assertEquals(row![5], { char: "F" });
});

Deno.test("TerminalScreenController keeps basic indexed and truecolor numeric collisions distinct", () => {
  const screen = new TerminalScreenController({ columns: 6, rows: 1 });

  screen.write("\x1b[30mB\x1b[38;5;30mI\x1b[38;2;0;0;30mT");

  const [row] = screen.cellRows();
  assertEquals(row![0], { char: "B", foreground: 30 });
  assertEquals(row![1], { char: "I", foreground: encodeTerminalIndexedColor(30) });
  assertEquals(row![2], { char: "T", foreground: encodeTerminalRgbColor(0, 0, 30) });
  assertEquals(decodeTerminalColor(row![0]!.foreground!, false), { kind: "ansi", code: 30, index: 0 });
  assertEquals(decodeTerminalColor(row![1]!.foreground!, false), { kind: "indexed", index: 30 });
  assertEquals(decodeTerminalColor(row![2]!.foreground!, false), {
    kind: "rgb",
    red: 0,
    green: 0,
    blue: 30,
  });
});

Deno.test("TerminalScreenController applies cursor movement and erase sequences", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 2 });

  screen.write("abcdef\x1b[1;3HZZ\x1b[K");

  assertEquals(screen.textRows()[0], "abZZ");
  assertEquals(screen.inspect().cursor, { column: 4, row: 0 });
});

Deno.test("TerminalScreenController supports common absolute and line cursor controls", () => {
  const screen = new TerminalScreenController({ columns: 10, rows: 4 });

  screen.write("aa\x1b[2Ebb\x1b[5GZ\x1b[1Fcc\x1b[3dD");

  assertEquals(screen.textRows(), ["aa", "cc", "bbD Z", ""]);
  assertEquals(screen.inspect().cursor, { column: 3, row: 2 });
});

Deno.test("TerminalScreenController supports common xterm cursor aliases", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 4 });

  screen.write("A\x1b[5`B\x1b[2aC\x1b[2eD");

  assertEquals(screen.textRows(), ["A   B  C", "", "        D", ""]);
  assertEquals(screen.inspect().cursor, { column: 9, row: 2 });
});

Deno.test("TerminalScreenController applies erase-before and erase-character controls", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 3 });

  screen.write("abcdef\x1b[2;1H123456\x1b[2;4H\x1b[1K");
  assertEquals(screen.textRows(), ["abcdef", "    56", ""]);

  screen.write("\x1b[1;4H\x1b[1J");
  assertEquals(screen.textRows(), ["    ef", "    56", ""]);

  screen.write("\x1b[1;5HXYZZY\x1b[1;5H\x1b[3X");
  assertEquals(screen.textRows()[0], "       Z");

  screen.write("\x1b[2;6H\x1b[2K");
  assertEquals(screen.textRows()[1], "");
});

Deno.test("TerminalScreenController supports set and clear tab stops", () => {
  const screen = new TerminalScreenController({ columns: 16, rows: 3 });

  screen.write("a\tb");
  assertEquals(screen.textRows()[0], "a       b");

  screen.write("\x1b[2;1H\x1b[4G\x1bH\x1b[1Gx\ty");
  assertEquals(screen.textRows()[1], "x  y");

  screen.write("\x1b[3;1H\x1b[4G\x1b[g\x1b[1Gx\ty");
  assertEquals(screen.textRows()[2], "x       y");
});

Deno.test("TerminalScreenController supports clearing all tab stops", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });

  screen.write("\x1b[3gA\tB");
  assertEquals(screen.textRows()[0], "A          B");

  screen.write("\x1b[2;5H\x1bH\x1b[2;1HC\tD");
  assertEquals(screen.textRows()[1], "C   D");
});

Deno.test("TerminalScreenController supports forward and backward tab controls", () => {
  const screen = new TerminalScreenController({ columns: 20, rows: 2 });

  screen.write("\x1b[3g\x1b[6G\x1bH\x1b[11G\x1bH\x1b[1G\x1b[2IAB\x1b[1ZC");

  assertEquals(screen.textRows()[0], "          CB");
  assertEquals(screen.inspect().cursor, { column: 11, row: 0 });
});

Deno.test("TerminalScreenController preserves in-range tab stops after resize", () => {
  const screen = new TerminalScreenController({ columns: 16, rows: 2 });

  screen.write("\x1b[12G\x1bH");
  screen.resize(10, 2);
  screen.write("\x1b[1Gx\ty");

  assertEquals(screen.textRows()[0], "x       y");
});

Deno.test("TerminalScreenController supports save and restore cursor sequences", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 3 });

  screen.write("ab\x1b[s\r\ncd\x1b[uZ");
  assertEquals(screen.textRows()[0], "abZ");
  assertEquals(screen.inspect().cursor, { column: 3, row: 0 });

  screen.write("\x1b[3;7H\x1b7x\x1b[1;1Hy\x1b8Z");
  assertEquals(screen.textRows(), ["ybZ", "cd", "      Z"]);
  assertEquals(screen.inspect().cursor, { column: 7, row: 2 });
});

Deno.test("TerminalScreenController tracks OSC title sequences", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });

  screen.write("prompt\x1b]0;build shell\x07>");
  assertEquals(screen.textRows()[0], "prompt>");
  assertEquals(screen.inspect().title, "build shell");

  screen.write("\x1b]2;editor\x1b\\");
  assertEquals(screen.textRows()[0], "prompt>");
  assertEquals(screen.inspect().title, "editor");
});

Deno.test("TerminalScreenController tracks DEC private modes", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 2 });

  assertEquals(screen.inspect().cursorVisible, true);
  assertEquals(screen.inspect().cursorStyle, { shape: "block", blinking: true });
  assertEquals(screen.inspect().privateModes, []);

  screen.write("\x1b[?25l\x1b[?1000;1006h");
  assertEquals(screen.inspect().cursorVisible, false);
  assertEquals(screen.inspect().privateModes, [1000, 1006]);

  screen.write("\x1b[?25h\x1b[?1000l");
  assertEquals(screen.inspect().cursorVisible, true);
  assertEquals(screen.inspect().privateModes, [1006]);
});

Deno.test("TerminalScreenController supports DEC autowrap mode", () => {
  const screen = new TerminalScreenController({ columns: 4, rows: 2 });

  screen.write("\x1b[?7labcdE");
  assertEquals(screen.textRows(), ["abcE", ""]);
  assertEquals(screen.inspect().cursor, { column: 3, row: 0 });
  assertEquals(screen.inspect().privateModes, []);

  screen.write("\x1b[?7hF");
  assertEquals(screen.textRows(), ["abcF", ""]);
  // Deferred wrap (VT100 pending-wrap latch): filling the last column parks the
  // cursor there instead of moving to the next row.
  assertEquals(screen.inspect().cursor, { column: 3, row: 0 });
  assertEquals(screen.inspect().privateModes, [7]);

  // The next printable character consumes the pending wrap and advances to row 1.
  screen.write("G");
  assertEquals(screen.textRows(), ["abcF", "G"]);
  assertEquals(screen.inspect().cursor, { column: 1, row: 1 });
});

Deno.test("TerminalScreenController supports insert and replace character modes", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 2 });

  screen.write("abcdef\x1b[1;3H\x1b[4hXY");
  assertEquals(screen.textRows()[0], "abXYcdef");

  screen.write("\x1b[4l\x1b[1;3HZZ");
  assertEquals(screen.textRows()[0], "abZZcdef");
});

Deno.test("TerminalScreenController supports repeat preceding graphic character", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 2 });

  screen.write("\x1b[31mX\x1b[3b\x1b[0mY");

  assertEquals(screen.textRows()[0], "XXXXY");
  const [row] = screen.cellRows();
  assertEquals(row![0], { char: "X", foreground: 31 });
  assertEquals(row![3], { char: "X", foreground: 31 });
  assertEquals(row![4], { char: "Y" });
});

Deno.test("TerminalScreenController keeps double-width glyphs paired with their continuation", () => {
  // Regression: a wide glyph owns two columns, and the model marks the second so
  // renderers can skip it. Breaking one half and leaving the other behind made a
  // renderer that trusts the pairing skip a real character — it simply vanished.
  const cells = (screen: TerminalScreenController): string[] =>
    screen.cellRows()[0]!.slice(0, 6).map((cell) => (cell.continuation ? "<cont>" : cell.char));

  const baseline = new TerminalScreenController({ columns: 12, rows: 2 });
  baseline.write("日本AB");
  assertEquals(cells(baseline), ["日", "<cont>", "本", "<cont>", "A", "B"]);

  // Writing over the right half erases the glyph that owned it.
  const rightHalf = new TerminalScreenController({ columns: 12, rows: 2 });
  rightHalf.write("日本AB\x1b[1;2HX");
  assertEquals(cells(rightHalf), [" ", "X", "本", "<cont>", "A", "B"]);

  // Writing over the left half retires the orphaned continuation.
  const leftHalf = new TerminalScreenController({ columns: 12, rows: 2 });
  leftHalf.write("日本AB\x1b[1;1HX");
  assertEquals(cells(leftHalf), ["X", " ", "本", "<cont>", "A", "B"]);

  // Deleting a character through a pair takes the whole pair with it.
  const deleted = new TerminalScreenController({ columns: 12, rows: 2 });
  deleted.write("日本AB\x1b[1;2H\x1b[P");
  assertEquals(cells(deleted), [" ", "本", "<cont>", "A", "B", " "]);

  // As does inserting one into the middle of it.
  const inserted = new TerminalScreenController({ columns: 12, rows: 2 });
  inserted.write("日本AB\x1b[1;2H\x1b[@");
  assertEquals(cells(inserted), [" ", " ", " ", "本", "<cont>", "A"]);

  // Erasing either half erases both.
  const erased = new TerminalScreenController({ columns: 12, rows: 2 });
  erased.write("日本AB\x1b[1;4H\x1b[X");
  assertEquals(cells(erased), ["日", "<cont>", " ", " ", "A", "B"]);

  // Narrowing the screen through a pair drops it rather than leaving a half.
  const narrowed = new TerminalScreenController({ columns: 6, rows: 2 });
  narrowed.write("ab日cd");
  narrowed.resize(3, 2);
  assertEquals(narrowed.cellRows()[0]!.map((cell) => cell.char), ["a", "b", " "]);

  // Whatever was done to the row, the invariant holds both ways: every wide
  // glyph is followed by a continuation, and every continuation follows one.
  for (const screen of [baseline, rightHalf, leftHalf, deleted, inserted, erased, narrowed]) {
    for (const row of screen.cellRows()) {
      for (let column = 0; column < row.length; column += 1) {
        const wide = textWidth(row[column]!.char) > 1;
        assertEquals(
          wide,
          row[column + 1]?.continuation === true,
          `a wide glyph at column ${column} must own the column after it`,
        );
        if (!row[column]!.continuation) continue;
        assertEquals(
          column > 0 && textWidth(row[column - 1]!.char) > 1,
          true,
          `the continuation at column ${column} has no glyph in front of it`,
        );
      }
    }
  }
});

Deno.test("TerminalScreenController indexes on a bare line feed without returning to column 0", () => {
  // Regression: LF is an index, not a newline. Full-screen apps run the tty raw,
  // so no ONLCR rewrites it, and ncurses/tmux move down a row with terminfo
  // `cud1` — a bare LF — expecting to keep the column. Treating it as a newline
  // dragged every one of those moves to the left edge, corrupting whatever the
  // app was drawing there.
  const screen = new TerminalScreenController({ columns: 20, rows: 4 });
  screen.write("\x1b[1;6Habc\ndef");
  assertEquals(screen.textRows(), ["     abc", "        def", "", ""]);
  assertEquals(screen.inspect().cursor, { column: 11, row: 1 });

  // ESC D is the same operation spelled differently, so it must agree exactly.
  const index = new TerminalScreenController({ columns: 20, rows: 4 });
  index.write("\x1b[1;6Habc\x1bDdef");
  assertEquals(index.textRows(), screen.textRows());

  // VT and FF index too, rather than being swallowed as unknown controls.
  const vertical = new TerminalScreenController({ columns: 20, rows: 4 });
  vertical.write("\x1b[1;6Habc\vd\fe");
  assertEquals(vertical.textRows(), ["     abc", "        d", "         e", ""]);

  // Scrolling a region at its bottom row keeps the column as well, which is what
  // tmux does when a pane scrolls under its status line.
  const region = new TerminalScreenController({ columns: 20, rows: 5 });
  region.write("\x1b[1;4r\x1b[4;1Hrow4\x1b[4;6Htail\nmore");
  assertEquals(region.textRows(), ["", "", "row4 tail", "         more", ""]);

  // LNM (ANSI mode 20) is the one case where LF also returns to column 0.
  const newlineMode = new TerminalScreenController({ columns: 20, rows: 4 });
  newlineMode.write("\x1b[20h\x1b[1;6Habc\ndef");
  assertEquals(newlineMode.textRows(), ["     abc", "def", "", ""]);
  // Clearing it puts LF back to indexing: `z` keeps the column `xy` left it on,
  // landing past the `def` already on that row rather than over it.
  newlineMode.write("\x1b[20l\x1b[1;6Hxy\nz");
  assertEquals(newlineMode.textRows()[1], "def    z");
});

Deno.test("TerminalScreenController supports ESC index and next-line controls", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 3, scrollbackLimit: 2 });

  screen.write("ab\x1bDcd\x1bEef");
  assertEquals(screen.textRows(), ["ab", "  cd", "ef"]);
  assertEquals(screen.inspect().cursor, { column: 2, row: 2 });

  screen.write("\x1b[3;1Hbottom\x1bD\rnext");
  assertEquals(screen.scrollbackTextRows(), ["ab"]);
  assertEquals(screen.textRows(), ["  cd", "bottom", "next"]);
});

Deno.test("TerminalScreenController supports ESC c reset", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 2, scrollbackLimit: 2 });

  screen.write("\x1b]0;session\x07\x1b[?25l\x1b[?1049h\x1b[1;31mred\nline");
  screen.write("\x1bcplain");

  assertEquals(screen.inspect(), {
    columns: 8,
    rows: 2,
    cursor: { column: 5, row: 0 },
    cursorVisible: true,
    cursorStyle: { shape: "block", blinking: true },
    privateModes: [],
    scrollbackRows: 0,
    alternate: false,
    title: undefined,
    workingDirectory: undefined,
  });
  assertEquals(screen.cellRows()[0]![0], { char: "p" });
  assertEquals(screen.textRows(), ["plain", ""]);
});

Deno.test("TerminalScreenController clips insert mode at the row edge", () => {
  const screen = new TerminalScreenController({ columns: 6, rows: 2 });

  screen.write("abcdef\x1b[1;5H\x1b[4hXY");
  assertEquals(screen.textRows(), ["abcdXY", ""]);
  // Deferred wrap: the final inserted glyph parks at the last column rather than
  // wrapping to the next row.
  assertEquals(screen.inspect().cursor, { column: 5, row: 0 });
});

Deno.test("TerminalScreenController does not scroll when a full-screen paint fills the last row edge-to-edge", () => {
  // Reproduces the nested-Exomux symptom: a full-screen TUI cursor-addresses
  // the bottom row and paints it to the final column every frame. With immediate
  // autowrap this scrolled the whole screen up on each frame; deferred wrap keeps
  // the addressed content stable.
  const screen = new TerminalScreenController({ columns: 20, rows: 5 });
  screen.write("\x1b[1;1HTOP-ROW-STAYS-HERE!!");
  for (let frame = 0; frame < 10; frame += 1) {
    screen.write("\x1b[5;1H" + "B".repeat(20));
  }
  const rows = screen.textRows();
  assertEquals(rows[0], "TOP-ROW-STAYS-HERE!!");
  assertEquals(rows[4], "B".repeat(20));
  assertEquals(screen.scrollbackRows, 0);
  assertEquals(screen.inspect().cursor, { column: 19, row: 4 });
});

Deno.test("terminal sequence parser accepts every ECMA-48 private prefix", () => {
  // tmux emits `ESC [ > c` (secondary DA) and `ESC [ > q` (XTVERSION) on attach.
  for (const prefix of ["<", "=", ">", "?"]) {
    const parsed = parseTerminalControlSequence(`\x1b[${prefix}1c`);
    assertEquals(parsed?.kind, "csi");
    assertEquals(parsed?.prefix, prefix);
    assertEquals(parsed?.params, "1");
    assertEquals(parsed?.command, "c");
    assertEquals(parsed?.length, 5);
  }
});

Deno.test("TerminalScreenController keeps rendering after xterm private-prefix queries", () => {
  // Regression: an unparsed `ESC [ > c` used to buffer the rest of the stream
  // forever, so a tmux attach froze the window until 64KB accumulated.
  const screen = new TerminalScreenController({ columns: 20, rows: 3 });
  screen.write("BEFORE\r\n");
  screen.write("\x1b[>c");
  screen.write("AFTER\r\n");
  assertEquals(screen.textRows(), ["BEFORE", "AFTER", ""]);

  // The parameters of an ignored extension must not leak into SGR state either.
  const styled = new TerminalScreenController({ columns: 20, rows: 2 });
  styled.write("\x1b[>4;2mX");
  assertEquals(styled.textRows()[0], "X");
  assertEquals(styled.cellRows()[0]![0], { char: "X" });
});

Deno.test("TerminalScreenController recovers from a malformed CSI instead of stalling", () => {
  // The sequence is unrecoverable, so some of its bytes may surface as text; what
  // matters is that the writer resynchronises instead of buffering the rest of
  // the stream forever waiting for a final byte that never arrives.
  const screen = new TerminalScreenController({ columns: 20, rows: 2 });
  screen.write("\x1b[\x07VISIBLE");
  assertEquals(screen.textRows()[0]?.endsWith("VISIBLE"), true);

  screen.write("\r\nMORE");
  assertEquals(screen.textRows()[1], "MORE");
});

Deno.test("TerminalScreenController erases the display without moving the cursor or resetting state", () => {
  // Regression: ED 2 ran a full reset, so apps that erase and keep drawing
  // (tmux, Claude Code) had their next writes land at the top-left corner.
  const screen = new TerminalScreenController({ columns: 20, rows: 6 });
  screen.write("\x1b[2;5r"); // scroll region rows 2..5
  screen.write("\x1b[4;7H"); // park the cursor mid-screen
  screen.write("\x1b[2J");
  assertEquals(screen.inspect().cursor, { column: 6, row: 3 });
  screen.write("THINKING");
  assertEquals(screen.textRows()[3], "      THINKING");
  assertEquals(screen.textRows()[0], "");

  // The scroll region survived the erase, so a linefeed at its bottom scrolls
  // only the region rather than the whole screen.
  screen.write("\x1b[5;1Hbottom\n");
  assertEquals(screen.textRows()[0], "");

  // ED 3 additionally drops saved lines.
  const scrolled = new TerminalScreenController({ columns: 8, rows: 2, scrollbackLimit: 10 });
  scrolled.write("a\nb\nc\nd");
  assertEquals(scrolled.scrollbackRows > 0, true);
  scrolled.write("\x1b[3J");
  assertEquals(scrolled.scrollbackRows, 0);
});

Deno.test("TerminalScreenController does not scroll on a linefeed below the scroll region", () => {
  // tmux keeps its status line outside the scroll region; a linefeed there used
  // to scroll every row of the screen.
  const screen = new TerminalScreenController({ columns: 20, rows: 4 });
  screen.write("\x1b[1;1HROW0\x1b[2;1HROW1\x1b[3;1HROW2\x1b[4;1HSTATUS");
  screen.write("\x1b[1;3r"); // region = rows 0..2, status row excluded
  screen.write("\x1b[4;7H"); // cursor on the status row, below the region
  screen.write("\n");
  assertEquals(screen.textRows(), ["ROW0", "ROW1", "ROW2", "STATUS"]);
  assertEquals(screen.scrollbackRows, 0);
});

Deno.test("TerminalScreenController fills erased and scrolled cells with the active background", () => {
  // Background-colour erase: clearing or scrolling inside a coloured pane must
  // not leave default-coloured gaps.
  const screen = new TerminalScreenController({ columns: 6, rows: 3 });
  screen.write("\x1b[44m"); // blue background
  screen.write("\x1b[1;1Hab\x1b[K"); // erase to end of line
  const firstRow = screen.cellRows()[0]!;
  assertEquals(firstRow[2]!.background, 44);
  assertEquals(firstRow[2]!.char, " ");
  // Foreground/attributes are not carried by the erase.
  assertEquals(firstRow[2]!.foreground, undefined);

  // Lines scrolled into the region take the same background.
  screen.write("\x1b[3;1H\n");
  assertEquals(screen.cellRows()[2]![0]!.background, 44);

  // With no background set the shared blank cell is still used.
  const plain = new TerminalScreenController({ columns: 4, rows: 2 });
  plain.write("xy\x1b[K");
  assertEquals(plain.cellRows()[0]![2], { char: " " });
});

Deno.test("TerminalScreenController tracks cursor style sequences", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 2 });

  screen.write("\x1b[6 q");
  assertEquals(screen.inspect().cursorStyle, { shape: "bar", blinking: false });

  screen.write("\x1b[3 q");
  assertEquals(screen.inspect().cursorStyle, { shape: "underline", blinking: true });

  screen.write("\x1b[2 q");
  assertEquals(screen.inspect().cursorStyle, { shape: "block", blinking: false });

  screen.write("\x1b[0 q");
  assertEquals(screen.inspect().cursorStyle, { shape: "block", blinking: true });
});

Deno.test("TerminalScreenController tracks OSC 8 hyperlinks per cell", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });

  screen.write("a\x1b]8;id=docs;https://example.test/docs\x1b\\bc\x1b]8;;\x1b\\d");

  const [row] = screen.cellRows();
  assertEquals(row![0], { char: "a" });
  assertEquals(row![1], { char: "b", hyperlink: "https://example.test/docs" });
  assertEquals(row![2], { char: "c", hyperlink: "https://example.test/docs" });
  assertEquals(row![3], { char: "d" });
});

Deno.test("TerminalScreenController replays a realistic colored shell transcript", () => {
  const screen = new TerminalScreenController({ columns: 72, rows: 6, scrollbackLimit: 4 });

  screen.write("\x1b]0;cos@old-donkey:~/projects/deno_tui\x07");
  screen.write("\x1b[?25l");
  screen.write("cos@old-donkey:~/projects/deno_tui$ deno task test\r\n");
  screen.write("\x1b[38;5;34mTask\x1b[0m test deno test ./tests/terminal_screen.test.ts\r\n");
  screen.write("running 2 tests\r\n");
  screen.write("terminal parser fixture ... \x1b[32mok\x1b[0m (12ms)\r\n");
  screen.write("\x1b[38;2;120;200;255mok\x1b[0m | 2 passed | 0 failed\r\n");
  screen.write("\x1b[?25h");

  assertEquals(screen.inspect().title, "cos@old-donkey:~/projects/deno_tui");
  assertEquals(screen.inspect().cursorVisible, true);
  assertEquals(screen.textRows(), [
    "cos@old-donkey:~/projects/deno_tui$ deno task test",
    "Task test deno test ./tests/terminal_screen.test.ts",
    "running 2 tests",
    "terminal parser fixture ... ok (12ms)",
    "ok | 2 passed | 0 failed",
    "",
  ]);

  const rows = screen.cellRows();
  assertEquals(rows[1]![0], { char: "T", foreground: encodeTerminalIndexedColor(34) });
  assertEquals(rows[3]![28], { char: "o", foreground: 32 });
  assertEquals(rows[4]![0], { char: "o", foreground: encodeTerminalRgbColor(120, 200, 255) });
});

Deno.test("TerminalScreenController inserts and deletes characters", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 2 });

  screen.write("abcdef\x1b[1;3H\x1b[2@XY\x1b[1;5H\x1b[2P");

  assertEquals(screen.textRows()[0], "abXYef");
  assertEquals(screen.inspect().cursor, { column: 4, row: 0 });
});

Deno.test("TerminalScreenController inserts and deletes lines", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 4 });

  screen.write("row1\r\nrow2\r\nrow3\r\nrow4");
  screen.write("\x1b[2;1H\x1b[1Lnew");
  assertEquals(screen.textRows(), ["row1", "new", "row2", "row3"]);

  screen.write("\x1b[3;1H\x1b[1M");
  assertEquals(screen.textRows(), ["row1", "new", "row3", ""]);
});

Deno.test("TerminalScreenController scrolls inside configured scroll regions", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 4 });

  screen.write("aaaa\x1b[2;1Hbbbb\x1b[3;1Hcccc\x1b[4;1Hdddd");
  screen.write("\x1b[2;3r\x1b[3;1Hxx\r\nYY");

  assertEquals(screen.textRows(), ["aaaa", "xxcc", "YY", "dddd"]);
  assertEquals(screen.scrollbackTextRows(), []);
  assertEquals(screen.inspect().cursor, { column: 2, row: 2 });
});

Deno.test("TerminalScreenController resets scroll regions", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 3, scrollbackLimit: 4 });

  screen.write("one\x1b[2;1Htwo\x1b[3;1Hthree");
  screen.write("\x1b[2;3r\x1b[r\x1b[3;1Hbottom\r\nnext");

  assertEquals(screen.scrollbackTextRows(), ["one"]);
  assertEquals(screen.textRows(), ["two", "bottom", "next"]);
});

Deno.test("TerminalScreenController applies line edits inside scroll regions", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 4 });

  screen.write("row1\x1b[2;1Hrow2\x1b[3;1Hrow3\x1b[4;1Hrow4");
  screen.write("\x1b[2;4r\x1b[3;1H\x1b[1Lnew");
  assertEquals(screen.textRows(), ["row1", "row2", "new", "row3"]);

  screen.write("\x1b[2;1H\x1b[1M");
  assertEquals(screen.textRows(), ["row1", "new", "row3", ""]);
});

Deno.test("TerminalScreenController supports reverse index inside scroll regions", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 4 });

  screen.write("row1\x1b[2;1Hrow2\x1b[3;1Hrow3\x1b[4;1Hrow4");
  screen.write("\x1b[2;4r\x1b[2;1H\x1bMnew");

  assertEquals(screen.textRows(), ["row1", "new", "row2", "row3"]);
  assertEquals(screen.inspect().cursor, { column: 3, row: 1 });
});

Deno.test("TerminalScreenController supports explicit scroll up and down controls", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 4 });

  screen.write("row1\x1b[2;1Hrow2\x1b[3;1Hrow3\x1b[4;1Hrow4");
  screen.write("\x1b[2;4r\x1b[1S");
  assertEquals(screen.textRows(), ["row1", "row3", "row4", ""]);

  screen.write("\x1b[2T");
  assertEquals(screen.textRows(), ["row1", "", "", "row3"]);
});

Deno.test("TerminalScreenController applies DEC origin mode relative to scroll regions", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 5 });

  screen.write("\x1b[2;4r\x1b[?6h\x1b[1;1Htop\x1b[3;5Hbot");
  assertEquals(screen.textRows(), ["", "top", "", "    bot", ""]);
  assertEquals(screen.inspect().cursor, { column: 7, row: 3 });
  assertEquals(screen.inspect().privateModes, [6]);

  screen.write("\x1b[?6l\x1b[1;1Hroot");
  assertEquals(screen.textRows(), ["root", "top", "", "    bot", ""]);
  assertEquals(screen.inspect().cursor, { column: 4, row: 0 });
  assertEquals(screen.inspect().privateModes, []);
});

Deno.test("TerminalScreenController clamps insert and delete edits to screen bounds", () => {
  const screen = new TerminalScreenController({ columns: 6, rows: 3 });

  screen.write("abcdef\x1b[1;5H\x1b[9@Z");
  assertEquals(screen.textRows()[0], "abcdZ");

  screen.write("\x1b[1;5H\x1b[9P");
  assertEquals(screen.textRows()[0], "abcd");

  screen.write("\x1b[3;1H\x1b[5Lbot");
  assertEquals(screen.textRows(), ["abcd", "", "bot"]);
});

Deno.test("TerminalScreenController clamps restored cursor after resize", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 3 });

  screen.write("\x1b[3;3H\x1b[s");
  screen.resize(4, 2);
  screen.write("\x1b[uX");

  assertEquals(screen.textRows(), ["", "  X"]);
  assertEquals(screen.inspect().cursor, { column: 3, row: 1 });
});

Deno.test("TerminalScreenController resizes and clamps cursor", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 3 });

  screen.write("abcdef\r\n123456\r\nxyz");
  screen.resize(4, 2);

  assertEquals(screen.textRows(), ["abcd", "1234"]);
  assertEquals(screen.inspect().columns, 4);
  assertEquals(screen.inspect().rows, 2);
  assertEquals(screen.inspect().cursor, { column: 3, row: 1 });
});

Deno.test("TerminalScreenController supports alternate screen switching", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 2 });

  screen.write("main");
  screen.write("\x1b[?1049h");
  screen.write("alt");
  assertEquals(screen.inspect().alternate, true);
  assertEquals(screen.textRows()[0], "alt");

  screen.write("\x1b[?1049l");
  assertEquals(screen.inspect().alternate, false);
  assertEquals(screen.textRows()[0], "main");
});

Deno.test("TerminalScreenController supports legacy alternate screen private modes", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 2 });

  screen.write("main\x1b[?47halt");
  assertEquals(screen.inspect().alternate, true);
  assertEquals(screen.textRows()[0], "alt");
  assertEquals(screen.inspect().privateModes, [47]);

  screen.write("\x1b[?47l");
  assertEquals(screen.inspect().alternate, false);
  assertEquals(screen.textRows()[0], "main");
  assertEquals(screen.inspect().privateModes, []);

  screen.write("\x1b[?1047hfull\x1b[?1047l");
  assertEquals(screen.inspect().alternate, false);
  assertEquals(screen.textRows()[0], "main");
});

Deno.test("TerminalScreenController supports DEC private cursor save restore mode", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 3 });

  screen.write("ab\x1b[?1048h\x1b[3;6Hxy\x1b[?1048lZ");
  assertEquals(screen.textRows(), ["abZ", "", "     xy"]);
  assertEquals(screen.inspect().cursor, { column: 3, row: 0 });

  screen.write("\x1b[3;7H\x1b[?1049hALT\x1b[?1049lR");
  assertEquals(screen.inspect().alternate, false);
  assertEquals(screen.textRows(), ["abZ", "", "     xR"]);
  assertEquals(screen.inspect().cursor, { column: 7, row: 2 });
});

Deno.test("TerminalScreenController replays a full-screen curses-style transcript", () => {
  const screen = new TerminalScreenController({ columns: 24, rows: 5, scrollbackLimit: 4 });

  screen.write("shell prompt");
  screen.write("\x1b[?1049h\x1b[?25l\x1b]2;process viewer\x07");
  screen.write("\x1b[1;1H\x1b[1;37;44m PID  CPU  COMMAND      \x1b[0m");
  screen.write("\x1b[2;5r");
  screen.write("\x1b[2;1H 100  12%  deno");
  screen.write("\x1b[3;1H 101   8%  bash");
  screen.write("\x1b[4;1H 102   4%  vim");
  screen.write("\x1b[5;1Hstatus: running");
  screen.write("\x1b[5;1H\x1b[32mstatus: ok\x1b[0m");

  assertEquals(screen.inspect().alternate, true);
  assertEquals(screen.inspect().cursorVisible, false);
  assertEquals(screen.inspect().title, "process viewer");
  assertEquals(screen.scrollbackTextRows(), []);
  assertEquals(screen.textRows(), [
    " PID  CPU  COMMAND",
    " 100  12%  deno",
    " 101   8%  bash",
    " 102   4%  vim",
    "status: oknning",
  ]);
  assertEquals(screen.cellRows()[0]![1], { char: "P", bold: true, foreground: 37, background: 44 });
  assertEquals(screen.cellRows()[4]![0], { char: "s", foreground: 32 });

  screen.write("\x1b[?25h\x1b[?1049l");
  assertEquals(screen.inspect().alternate, false);
  assertEquals(screen.inspect().cursorVisible, true);
  assertEquals(screen.textRows()[0], "shell prompt");
});

Deno.test("TerminalScrollbackController snaps to live and hides main scrollback in the alternate screen", () => {
  // Regression: scrolling up at a shell prompt and then attaching a full-screen
  // app (tmux) left the window in copy mode, painting stale pre-attach history
  // over the app and letting the wheel scroll through it.
  const screen = new TerminalScreenController({ columns: 12, rows: 3, scrollbackLimit: 20 });
  screen.write("one\r\ntwo\r\nthree\r\nfour\r\nfive");
  const scrollback = new TerminalScrollbackController({ screen, viewportRows: 3 });

  scrollback.scrollLines(-2);
  assertEquals(scrollback.mode, "copy");

  // A full-screen app takes over: copy mode must not survive into it.
  screen.write("\x1b[?1049h");
  screen.write("APP");
  assertEquals(scrollback.mode, "live");
  assertEquals(scrollback.offset, 0);

  // The alternate screen exposes only its own rows, so there is nothing to scroll.
  const viewport = scrollback.inspectViewport();
  assertEquals(viewport.totalRows, 3);
  assertEquals(viewport.maxOffset, 0);
  assertEquals(scrollback.inspect().visibleRows, ["APP", "", ""]);

  // Scrolling while the app is attached stays a no-op rather than entering copy mode.
  scrollback.scrollLines(-5);
  assertEquals(scrollback.mode, "live");
  assertEquals(scrollback.inspect().visibleRows, ["APP", "", ""]);

  // Leaving the alternate screen restores the main buffer's scrollback.
  screen.write("\x1b[?1049l");
  assertEquals(scrollback.mode, "live");
  assertEquals(scrollback.inspectViewport().totalRows, 5);
});

Deno.test("TerminalScrollbackController follows live output and enters copy mode on scroll", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 3, scrollbackLimit: 5 });
  screen.write("one\r\ntwo\r\nthree\r\nfour\r\nfive");
  const scrollback = new TerminalScrollbackController({ screen, viewportRows: 3 });

  assertEquals(scrollback.inspect(), {
    mode: "live",
    offset: 2,
    maxOffset: 2,
    viewportRows: 3,
    totalRows: 5,
    scrollbackRows: 2,
    liveRows: 3,
    visibleRows: ["three", "four", "five"],
    matches: [],
  });
  assertEquals(scrollback.inspectViewport(), {
    mode: "live",
    offset: 2,
    maxOffset: 2,
    viewportRows: 3,
    totalRows: 5,
    scrollbackRows: 2,
    liveRows: 3,
  });

  assertEquals(scrollback.scrollLines(-1), 1);
  assertEquals(scrollback.inspect().mode, "copy");
  assertEquals(scrollback.inspectViewport().offset, 1);
  assertEquals(scrollback.inspect().visibleRows, ["two", "three", "four"]);

  screen.write("\r\nsix");
  assertEquals(scrollback.inspect().mode, "copy");
  assertEquals(scrollback.inspect().visibleRows, ["two", "three", "four"]);

  scrollback.exitCopyMode();
  assertEquals(scrollback.inspect().visibleRows, ["four", "five", "six"]);
});

Deno.test("TerminalScrollbackController pages clamps and searches", () => {
  const screen = new TerminalScreenController({ columns: 16, rows: 2, scrollbackLimit: 10 });
  screen.write("alpha\r\nbeta\r\ngamma\r\nalphabet\r\nomega");
  const scrollback = new TerminalScrollbackController({ screen, viewportRows: 2 });

  assertEquals(scrollback.toTop(), 0);
  assertEquals(scrollback.page(1), 2);
  assertEquals(scrollback.inspect().visibleRows, ["gamma", "alphabet"]);
  assertEquals(scrollback.page(10), 3);

  assertEquals(scrollback.search("alpha"), [0, 3]);
  assertEquals(scrollback.inspect().offset, 0);
  assertEquals(scrollback.inspect().activeMatch, 0);
  assertEquals(scrollback.nextMatch(), 3);
  assertEquals(scrollback.inspect().visibleRows, ["alphabet", "omega"]);
  assertEquals(scrollback.nextMatch(), 0);
});

Deno.test("TerminalScrollbackController selects and copies line ranges", () => {
  const screen = new TerminalScreenController({ columns: 10, rows: 2, scrollbackLimit: 10 });
  screen.write("first\r\nsecond\r\nthird\r\nfourth");
  const scrollback = new TerminalScrollbackController({ screen, viewportRows: 2 });

  assertEquals(scrollback.setSelection(1, 3), { anchor: 1, focus: 3 });
  assertEquals(scrollback.copySelection(), "second\nthird\nfourth");
  assertEquals(scrollback.inspect().selectedText, "second\nthird\nfourth");
  assertEquals(scrollback.inspect().visibleRows, ["second", "third"]);

  assertEquals(scrollback.setSelection(99, -10), { anchor: 3, focus: 0 });
  assertEquals(scrollback.copySelection(), "first\nsecond\nthird\nfourth");
  scrollback.clearSelection();
  assertEquals(scrollback.inspect().selection, undefined);
});

Deno.test("TerminalScrollbackController supports interactive visible-row selection", () => {
  const screen = new TerminalScreenController({ columns: 10, rows: 2, scrollbackLimit: 10 });
  screen.write("first\r\nsecond\r\nthird\r\nfourth\r\nfifth");
  const scrollback = new TerminalScrollbackController({ screen, viewportRows: 2 });

  scrollback.toTop();
  assertEquals(scrollback.selectVisibleRow(1), { anchor: 1, focus: 1 });
  assertEquals(scrollback.copySelection(), "second");
  assertEquals(scrollback.moveSelection(2), { anchor: 1, focus: 3 });
  assertEquals(scrollback.inspect().visibleRows, ["third", "fourth"]);
  assertEquals(scrollback.copySelection(), "second\nthird\nfourth");
  assertEquals(scrollback.moveSelection(-1, false), { anchor: 2, focus: 2 });
  assertEquals(scrollback.copySelection(), "third");
});

Deno.test("terminal scrollback commands drive copy mode search and selection", async () => {
  const screen = new TerminalScreenController({ columns: 10, rows: 2, scrollbackLimit: 10 });
  screen.write("alpha\r\nbeta\r\ngamma\r\nalphabet");
  const scrollback = new TerminalScrollbackController({ screen, viewportRows: 2 });
  let query = "alpha";
  const registry = new CommandRegistry<TerminalScrollbackCommandAction>();
  const actions: TerminalScrollbackCommandAction[] = [];
  const dispose = bindTerminalScrollbackCommands(registry, scrollback, {
    id: "shell",
    idPrefix: "shell.scrollback",
    searchQuery: () => query,
  });

  assertEquals(
    terminalScrollbackCommands(scrollback, { searchQuery: () => query }).map((command) => [
      command.id,
      commandDisabled(command),
    ]),
    [
      ["terminalScrollback.toggleCopyMode", false],
      ["terminalScrollback.exitCopyMode", true],
      ["terminalScrollback.lineUp", false],
      ["terminalScrollback.lineDown", false],
      ["terminalScrollback.pageUp", false],
      ["terminalScrollback.pageDown", false],
      ["terminalScrollback.top", false],
      ["terminalScrollback.bottom", false],
      ["terminalScrollback.search", false],
      ["terminalScrollback.nextMatch", true],
      ["terminalScrollback.previousMatch", true],
      ["terminalScrollback.clearSelection", true],
      ["terminalScrollback.copySelection", true],
    ],
  );

  assertEquals(await registry.execute("shell.scrollback.search", (action) => void actions.push(action)), true);
  assertEquals(actions[0]?.type, "terminalScrollback.searched");
  assertEquals(actions[0]!.payload!.scrollback.matches, [0, 3]);

  assertEquals(await registry.execute("shell.scrollback.nextMatch", (action) => void actions.push(action)), true);
  assertEquals(actions[1]?.type, "terminalScrollback.matchChanged");
  assertEquals(actions[1]!.payload!.scrollback.offset, 2);

  assertEquals(await registry.execute("shell.scrollback.lineUp", (action) => void actions.push(action)), true);
  assertEquals(actions[2]?.type, "terminalScrollback.scrolled");
  assertEquals(actions[2]!.payload!.scrollback.offset, 1);

  scrollback.setSelection(1, 2);
  assertEquals(await registry.execute("shell.scrollback.copySelection", (action) => void actions.push(action)), true);
  assertEquals(actions[3]?.type, "terminalScrollback.selectionCopied");
  const copied = actions[3];
  if (copied?.type !== "terminalScrollback.selectionCopied") throw new Error("expected selection copied action");
  assertEquals(copied.payload!.text, "beta\ngamma");

  query = "";
  const searchCommand = registry.get("shell.scrollback.search")!;
  assertEquals(commandDisabled(searchCommand), true);
  dispose();
  assertEquals(registry.list("terminal"), []);
});

Deno.test("TerminalScreen consumes charset designations without printing artifacts", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });
  // ncurses sgr0 is `ESC ( B ESC [ m`; enacs designates G1 as DEC graphics.
  screen.write("a\x1b(Bb\x1b)0c\x1b(Bd");
  assertEquals(screen.textRows()[0], "abcd");
  assertEquals(screen.cursor.column, 4);
});

Deno.test("TerminalScreen renders DEC Special Graphics through SO/SI shifts", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });
  screen.write("\x1b(B\x1b)0A\x0eqqlk\x0fB");
  assertEquals(screen.textRows()[0], "A──┌┐B");
});

Deno.test("TerminalScreen supports G0 DEC graphics designation directly", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });
  screen.write("\x1b(0xjm\x1b(Bxq");
  assertEquals(screen.textRows()[0], "│┘└xq");
});

Deno.test("TerminalScreen holds back charset sequences split across writes", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });
  screen.write("a\x1b(");
  screen.write("Bb");
  assertEquals(screen.textRows()[0], "ab");
});

Deno.test("TerminalScreen consumes keypad mode selections silently", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });
  screen.write("a\x1b=b\x1b>c");
  assertEquals(screen.textRows()[0], "abc");
});

Deno.test("TerminalScreen clear resets charset shift state", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });
  screen.write("\x1b)0\x0e");
  screen.clear();
  screen.write("qx");
  assertEquals(screen.textRows()[0], "qx");
});
