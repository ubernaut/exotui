// Copyright 2023 Im-Beast. MIT license.

// The kitty graphics relay: remapping, chunking, deletes, queries, release.

import { assert, assertEquals } from "./deps.ts";
import {
  KittyPassthroughRelay,
  parseKittyGraphicsData,
  serializeKittyGraphicsData,
} from "../src/runtime/kitty_passthrough.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";

const CURSOR = { row: 3, column: 7 };

function control(data: string): Map<string, string> {
  const parsed = parseKittyGraphicsData(data)!;
  return new Map(parsed.control as [string, string][]);
}

Deno.test("parse and serialize round-trip, preserving key order and payload", () => {
  const data = "Ga=T,f=100,i=31,m=0;QUJD";
  assertEquals(serializeKittyGraphicsData(parseKittyGraphicsData(data)!), data);
  assertEquals(parseKittyGraphicsData("not-graphics"), undefined);
  assertEquals(parseKittyGraphicsData("Gm=0;")!.payload, "");
});

Deno.test("two sessions using the same image id cannot collide at the host", () => {
  const first = new KittyPassthroughRelay({ imageIdBase: 1000 });
  const second = new KittyPassthroughRelay({ imageIdBase: 2000 });
  const a = first.ingest("Ga=T,f=100,i=1;AAAA", CURSOR)[0]!;
  const b = second.ingest("Ga=T,f=100,i=1;AAAA", CURSOR)[0]!;
  assertEquals(control(a.data).get("i"), "1000");
  assertEquals(control(b.data).get("i"), "2000");
});

Deno.test("a display command carries the cursor cell; a bare transmit does not", () => {
  const relay = new KittyPassthroughRelay({ imageIdBase: 100 });
  const display = relay.ingest("Ga=T,f=100,i=1;AAAA", CURSOR)[0]!;
  assertEquals(display.cell, CURSOR);
  const transmit = relay.ingest("Ga=t,f=100,i=2;AAAA", CURSOR)[0]!;
  assertEquals(transmit.cell, undefined);
});

Deno.test("continuation chunks are relayed untouched and position-free", () => {
  // tode's exact shape: a chunked transmit, control keys on the first chunk
  // only. Rewriting a continuation would corrupt the payload.
  const relay = new KittyPassthroughRelay({ imageIdBase: 100 });
  const first = relay.ingest("Ga=T,f=100,r=1,c=2,C=1,i=9,m=1;CHUNK1", CURSOR)[0]!;
  const middle = relay.ingest("Gm=1;CHUNK2", CURSOR)[0]!;
  const last = relay.ingest("Gm=0;CHUNK3", CURSOR)[0]!;
  assertEquals(control(first.data).get("i"), "100");
  assertEquals(middle.data, "Gm=1;CHUNK2");
  assertEquals(middle.cell, undefined);
  assertEquals(last.data, "Gm=0;CHUNK3");
  // The chain is closed: the next command is parsed as its own again.
  const next = relay.ingest("Ga=T,f=100,i=9;MORE", CURSOR)[0]!;
  assertEquals(control(next.data).get("i"), "100", "same child id maps to the same host id");
});

Deno.test("responses are quieted unless the child asked for them", () => {
  const relay = new KittyPassthroughRelay({ imageIdBase: 100 });
  const quieted = relay.ingest("Ga=T,f=100,i=1;AAAA", CURSOR)[0]!;
  assertEquals(control(quieted.data).get("q"), "2", "an OK per frame would land with nobody waiting");
  const explicit = relay.ingest("Ga=T,f=100,i=2,q=1;AAAA", CURSOR)[0]!;
  assertEquals(control(explicit.data).get("q"), "1");
});

Deno.test("delete-all from a child deletes only that child's images", () => {
  const relay = new KittyPassthroughRelay({ imageIdBase: 100 });
  relay.ingest("Ga=T,f=100,i=1;AAAA", CURSOR);
  relay.ingest("Ga=T,f=100,i=2;BBBB", CURSOR);
  const deletes = relay.ingest("Ga=d,d=A;", CURSOR);
  assertEquals(deletes.length, 2, "expanded to one delete per owned image");
  for (const emission of deletes) {
    const keys = control(emission.data);
    assertEquals(keys.get("a"), "d");
    assertEquals(keys.get("d"), "I");
    assert(keys.get("i") === "100" || keys.get("i") === "101");
  }
  assertEquals(relay.liveImages, 0);
});

Deno.test("a query is remapped out and its reply is translated back", () => {
  // tode's probe: ESC _ G i=4207,a=q,t=d,f=24,s=1,v=1 ; AAAA ESC \
  const relay = new KittyPassthroughRelay({ imageIdBase: 500 });
  const query = relay.ingest("Gi=4207,a=q,t=d,f=24,s=1,v=1;AAAA", CURSOR)[0]!;
  assertEquals(control(query.data).get("i"), "500");
  assertEquals(query.cell, undefined);
  // Ghostty's answer names the host id; the child must see its own.
  assertEquals(relay.routeReply("Gi=500;OK"), "Gi=4207;OK");
  // Answered once: a duplicate reply belongs to nobody.
  assertEquals(relay.routeReply("Gi=500;OK"), null);
  // Another relay's reply is not claimed.
  assertEquals(relay.routeReply("Gi=9999;OK"), null);
});

Deno.test("release deletes everything live and is safe to repeat", () => {
  const relay = new KittyPassthroughRelay({ imageIdBase: 100 });
  relay.ingest("Ga=T,f=100,i=1;AAAA", CURSOR);
  relay.ingest("Ga=T,f=100,i=2,m=1;PART", CURSOR);
  const released = relay.release();
  assertEquals(released.length, 2);
  assertEquals(relay.release().length, 0);
  // The open chain died with the release; a fresh command parses cleanly.
  const next = relay.ingest("Ga=T,f=100,i=3;CCCC", CURSOR)[0]!;
  assertEquals(control(next.data).get("a"), "T");
});

Deno.test("the screen model hands captured graphics to the relay with the cursor", () => {
  const captured: { data: string; cursor: { row: number; column: number } }[] = [];
  const screen = new TerminalScreenController({
    columns: 40,
    rows: 10,
    onKittyGraphics: (data, cursor) => captured.push({ data, cursor }),
  });
  // Move the cursor, then transmit — the capture must carry that position,
  // because it is the cell kitty anchors the image to.
  screen.write("\x1b[5;9H");
  screen.write(`\x1b_Ga=T,f=100,i=7;${btoa("img")}\x1b\\`);
  assertEquals(captured.length, 1);
  assertEquals(captured[0]!.cursor, { row: 4, column: 8 });
  assert(captured[0]!.data.startsWith("Ga=T"));
  // And the screen still shows no trace of it.
  screen.write("ok");
  const text = screen.cellRows().map((row) => row.map((cell) => cell.char ?? " ").join("")).join("");
  assert(!text.includes("img"));
});

Deno.test("stdin APC replies decode as terminalApc events, not as keystrokes", async () => {
  // Ghostty answers a relayed query with `ESC _ G i=…;OK ESC \` on stdin. The
  // input reader used to split it at the interior ESC of its own terminator
  // and decode the halves as an alt-chord.
  const { decodeBuffer } = await import("../src/input_reader/mod.ts");
  const bytes = new TextEncoder().encode("\x1b_Gi=500;OK\x1b\\q");
  const events = [...decodeBuffer(bytes, true)];
  assertEquals(events.length, 2);
  assertEquals(events[0]!.key, "apc");
  assertEquals((events[0] as { data: string }).data, "Gi=500;OK");
  assertEquals(events[1]!.key, "q", "the byte after ST is an ordinary keystroke");
});

Deno.test("XTWINOPS size queries reach the subscriber; other window ops are consumed", () => {
  const asked: number[] = [];
  const screen = new TerminalScreenController({
    columns: 40,
    rows: 10,
    onWindowSizeQuery: (kind) => asked.push(kind),
  });
  screen.write("\x1b[14t\x1b[16t\x1b[18t");
  assertEquals(asked, [14, 16, 18]);
  // Resize/move requests from a child are consumed, not honoured and not
  // printed: a child does not reshape the window a compositor gave it.
  screen.write("\x1b[8;50;200t\x1b[3;0;0t");
  assertEquals(asked.length, 3);
  screen.write("done");
  const text = screen.cellRows().map((row) => row.map((cell) => cell.char ?? " ").join("")).join("").trim();
  assertEquals(text, "done");
});
