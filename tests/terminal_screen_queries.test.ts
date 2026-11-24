// Copyright 2023 Im-Beast. MIT license.
import { assertEquals } from "./deps.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";

function screenWithReplies(options: ConstructorParameters<typeof TerminalScreenController>[0] = {}) {
  const replies: string[] = [];
  const screen = new TerminalScreenController({
    columns: 40,
    rows: 12,
    onReply: (data) => replies.push(data),
    ...options,
  });
  return { screen, replies };
}

Deno.test("a private or intermediate CSI never runs its unmarked namesake", () => {
  const { screen } = screenWithReplies();
  // Kitty keyboard query, not SCORC: the saved cursor must stay where the program left it.
  screen.write("\x1b[10;5H\x1b7\x1b[H\x1b[?uX");
  assertEquals(screen.textRows()[0]!.startsWith("X"), true);
  assertEquals(screen.cursor, { row: 0, column: 1 });
  // XTSAVE/XTRESTORE are not save-cursor and DECSTBM.
  screen.write("\x1b[3;7H\x1b[?1049s\x1b[H\x1b[u");
  assertEquals(screen.cursor, { row: 9, column: 4 });
  screen.write("\x1b[?2;4r\x1b[12;1H\nY");
  assertEquals(screen.textRows()[11]!.startsWith("Y"), true);
  // An intermediate changes the function too: `CSI 2 SP A` is not cursor-up.
  screen.write("\x1b[6;1H\x1b[2 A");
  assertEquals(screen.cursor.row, 5);
  // DECSCUSR is the intermediate form the model does act on.
  screen.write("\x1b[6 q");
  assertEquals(screen.inspect().cursorStyle, { shape: "bar", blinking: false });
});

Deno.test("the screen answers the queries a program waits on", () => {
  const { screen, replies } = screenWithReplies({
    identity: { name: "exomux", version: "1.2" },
    queryColors: () => ({ foreground: [255, 128, 0], background: [0, 16, 32] }),
  });
  const ask = (query: string): string[] => {
    replies.length = 0;
    screen.write(query);
    return [...replies];
  };
  assertEquals(ask("\x1b[c"), ["\x1b[?62;22c"]);
  assertEquals(ask("\x1b[>c"), ["\x1b[>1;10;0c"]);
  assertEquals(ask("\x1b[>q"), ["\x1bP>|exomux 1.2\x1b\\"]);
  assertEquals(ask("\x1b[5n"), ["\x1b[0n"]);
  assertEquals(ask("\x1b[4;9H\x1b[?6n"), ["\x1b[?4;9R"]);
  assertEquals(ask("\x1b]10;?\x07"), ["\x1b]10;rgb:ffff/8080/0000\x1b\\"]);
  assertEquals(ask("\x1b]11;?\x1b\\"), ["\x1b]11;rgb:0000/1010/2020\x1b\\"]);
  assertEquals(ask("\x1b[?2004$p"), ["\x1b[?2004;2$y"]);
  assertEquals(ask("\x1b[?2004h\x1b[?2004$p"), ["\x1b[?2004;1$y"]);
  assertEquals(ask("\x1b[?25l\x1b[?25$p"), ["\x1b[?25;2$y"]);
  assertEquals(ask("\x1b[?2026$p"), ["\x1b[?2026;2$y"]);
  assertEquals(ask("\x1b[?2026h\x1b[?2026$p"), ["\x1b[?2026;1$y"]);
  assertEquals(ask("\x1b[?2026l\x1b[?2026$p"), ["\x1b[?2026;2$y"]);
  assertEquals(ask("\x1b[?2027$p"), ["\x1b[?2027;3$y"]);
  assertEquals(ask("\x1b[4$p"), ["\x1b[4;2$y"]);
  assertEquals(ask("\x1b[4 q\x1bP$q q\x1b\\"), ["\x1bP1$r4 q\x1b\\"]);
  assertEquals(ask("\x1bP$qm\x1b\\"), ["\x1bP0$r\x1b\\"]);
  assertEquals(ask("\x1bP+q524742\x1b\\"), ["\x1bP0+r\x1b\\"]);
  // None of it reached the grid.
  assertEquals(screen.textRows().every((row) => row.trim() === ""), true);
});

Deno.test("colour queries stay unanswered without colours, and every query is silent without a subscriber", () => {
  const { screen, replies } = screenWithReplies();
  screen.write("\x1b]11;?\x07");
  assertEquals(replies, []);
  const quiet = new TerminalScreenController({ columns: 20, rows: 4 });
  quiet.write("\x1b[c\x1b[>q\x1b[?u\x1b]11;?\x07\x1b[?2026$pok");
  assertEquals(quiet.textRows()[0]!.trim(), "ok");
});

Deno.test("the screen tracks the key reporting a child asks for", () => {
  const { screen, replies } = screenWithReplies();
  assertEquals(screen.keyboardProtocol, { kittyFlags: 0, modifyOtherKeys: 0 });
  screen.write("\x1b[>4;2m\x1b[>5u\x1b[?u");
  assertEquals(screen.keyboardProtocol, { kittyFlags: 5, modifyOtherKeys: 2 });
  assertEquals(replies, ["\x1b[?5u"]);
  screen.write("\x1b[=2;2u");
  assertEquals(screen.keyboardProtocol.kittyFlags, 7);
  screen.write("\x1b[=4;3u");
  assertEquals(screen.keyboardProtocol.kittyFlags, 3);
  screen.write("\x1b[>1u");
  assertEquals(screen.keyboardProtocol.kittyFlags, 1);
  // The alternate screen has a stack of its own.
  screen.write("\x1b[?1049h");
  assertEquals(screen.keyboardProtocol.kittyFlags, 0);
  screen.write("\x1b[>8u\x1b[?1049l");
  assertEquals(screen.keyboardProtocol.kittyFlags, 1);
  screen.write("\x1b[<u");
  assertEquals(screen.keyboardProtocol.kittyFlags, 3);
  screen.write("\x1b[<9u\x1b[>4m");
  assertEquals(screen.keyboardProtocol, { kittyFlags: 0, modifyOtherKeys: 0 });
  replies.length = 0;
  screen.write("\x1b[>4;1m\x1b[?4m");
  assertEquals(replies, ["\x1b[>4;1m"]);
  screen.write("\x1bc");
  assertEquals(screen.keyboardProtocol, { kittyFlags: 0, modifyOtherKeys: 0 });
  // The pushes and pops never touched the cursor or the pen.
  screen.write("\x1b[>4;2m\x1b[>5uZ");
  assertEquals(screen.cellRows()[0]![0], { char: "Z" });
});
