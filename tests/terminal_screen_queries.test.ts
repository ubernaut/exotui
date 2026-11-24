// Copyright 2023 Im-Beast. MIT license.
import { assertEquals } from "./deps.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";
import {
  parseTerminalClipboardWrite,
  terminalClipboardSequence,
  type TerminalClipboardWrite,
} from "../src/runtime/terminal_services.ts";

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
  assertEquals(ask("\x1bP$qm\x1b\\"), ["\x1bP1$r0m\x1b\\"]);
  assertEquals(ask("\x1b[1;31m\x1bP$qm\x1b\\\x1b[0m"), ["\x1bP1$r0;1;31m\x1b\\"]);
  assertEquals(ask('\x1bP$q"p\x1b\\'), ["\x1bP0$r\x1b\\"]);
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

Deno.test("OSC 52 clipboard writes decode safely, stay write-only, and enforce byte bounds", () => {
  const writes: TerminalClipboardWrite[] = [];
  const screen = new TerminalScreenController({
    columns: 20,
    rows: 4,
    maxClipboardBytes: 32,
    onClipboardWrite: (write) => writes.push(write),
  });
  // Standard UTF-8 write via ST and primary selection via BEL.
  screen.write(terminalClipboardSequence("hello 世界"));
  screen.write(terminalClipboardSequence("primary", { selection: "primary", terminator: "bel" }));
  // Read query (`?`), malformed base64, invalid UTF-8 (`//8=`), bad selection, and oversized writes are ignored.
  screen.write("\x1b]52;c;?\x07");
  screen.write("\x1b]52;c;!!!not-base64!!!\x1b\\");
  screen.write("\x1b]52;c;//8=\x1b\\");
  screen.write("\x1b]52;evil;aGk=\x1b\\");
  screen.write(terminalClipboardSequence("x".repeat(40)));
  // Split chunk across ST terminator still decodes cleanly.
  const split = terminalClipboardSequence("chunked");
  screen.write(split.slice(0, 10));
  screen.write(split.slice(10));
  assertEquals(writes, [
    { text: "hello 世界", selection: "clipboard" },
    { text: "primary", selection: "primary" },
    { text: "chunked", selection: "clipboard" },
  ]);
  assertEquals(parseTerminalClipboardWrite("c;?"), undefined);
  assertEquals(parseTerminalClipboardWrite(";aGk="), { text: "hi", selection: "clipboard" });
  assertEquals(screen.textRows().every((row) => row.trim() === ""), true);
});

Deno.test("OSC 4 answers ANSI palette queries, tracks dynamic overrides, and resets via OSC 104 or RIS", () => {
  const { screen, replies } = screenWithReplies({
    queryColors: () => ({
      palette: (index) => index === 2 ? [10, 20, 30] : undefined,
    }),
  });
  const ask = (seq: string): string[] => {
    replies.length = 0;
    screen.write(seq);
    return [...replies];
  };
  // Default xterm slot 1 = [205, 49, 49] (cd/31/31); slot 2 comes from queryColors.palette.
  assertEquals(ask("\x1b]4;1;?;2;?\x07"), [
    "\x1b]4;1;rgb:cdcd/3131/3131\x1b\\",
    "\x1b]4;2;rgb:0a0a/1414/1e1e\x1b\\",
  ]);
  // Dynamic overrides via rgb: and #hex take precedence over defaults and queryColors.
  assertEquals(ask("\x1b]4;1;rgb:11/22/33;2;#445566;1;?;2;?\x1b\\"), [
    "\x1b]4;1;rgb:1111/2222/3333\x1b\\",
    "\x1b]4;2;rgb:4444/5555/6666\x1b\\",
  ]);
  assertEquals(screen.paletteOverrides().get(1), [0x11, 0x22, 0x33]);
  assertEquals(screen.paletteOverrides().get(2), [0x44, 0x55, 0x66]);

  // Selective OSC 104 resets slot 1 only.
  assertEquals(ask("\x1b]104;1\x07\x1b]4;1;?;2;?\x07"), [
    "\x1b]4;1;rgb:cdcd/3131/3131\x1b\\",
    "\x1b]4;2;rgb:4444/5555/6666\x1b\\",
  ]);
  assertEquals(screen.paletteOverrides().has(1), false);
  assertEquals(screen.paletteOverrides().has(2), true);

  // Bare OSC 104 clears all remaining overrides.
  screen.write("\x1b]104\x1b\\");
  assertEquals(screen.paletteOverrides().size, 0);

  // RIS clears overrides too.
  screen.write("\x1b]4;5;#abc\x07");
  assertEquals(screen.paletteOverrides().get(5), [0xaa, 0xbb, 0xcc]);
  screen.write("\x1bc");
  assertEquals(screen.paletteOverrides().size, 0);
});
