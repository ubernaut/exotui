// Copyright 2023 Im-Beast. MIT license.

// TERM-009: interleaved replies resolve only their matching request and
// unsolicited input is not consumed.

import { assert, assertEquals } from "./deps.ts";
import { createIncrementalTerminalParser, createTerminalQueryBroker } from "../mod.ts";

function tokensOf(text: string) {
  const parser = createIncrementalTerminalParser();
  return parser.write(text);
}

Deno.test("interleaved replies resolve only their matching requests", async () => {
  const broker = createTerminalQueryBroker();
  const da = broker.request("device-attributes", "", 0);
  const metrics = broker.request("cell-metrics", "", 0);
  assertEquals(da.bytes, "\x1b[c");
  assertEquals(metrics.bytes, "\x1b[16t");

  // Replies arrive in the OPPOSITE order; each resolves its own request.
  for (const token of tokensOf("\x1b[6;20;9t")) assert(broker.consume(token));
  assertEquals(await metrics.reply, "6;20;9");
  for (const token of tokensOf("\x1b[?62;4c")) assert(broker.consume(token));
  assertEquals(await da.reply, "62;4");
  assertEquals(broker.inspect()["device-attributes"], 0);
});

Deno.test("unsolicited input is never consumed", async () => {
  const broker = createTerminalQueryBroker();
  // No outstanding requests at all: nothing is swallowed.
  for (const token of tokensOf("\x1b[?62;4ckeypress\x1b[6;20;9t")) {
    assertEquals(broker.consume(token), false);
  }
  // After a request resolves, a SECOND identical reply is unsolicited.
  const da = broker.request("device-attributes", "", 0);
  const [reply] = tokensOf("\x1b[?1;2c");
  assert(broker.consume(reply!));
  assertEquals(await da.reply, "1;2");
  assertEquals(broker.consume(reply!), false); // ownership was spent
});

Deno.test("FIFO ownership and string-query round-trips", async () => {
  const broker = createTerminalQueryBroker();
  const first = broker.request("decrqss", "m", 0);
  const second = broker.request("decrqss", "r", 0);
  assertEquals(first.bytes, "\x1bP$qm\x1b\\");
  const cap = broker.request("xtgettcap", "544e", 0);
  assertEquals(cap.bytes, "\x1bP+q544e\x1b\\");
  const color = broker.request("osc-color", "10", 0);
  assertEquals(color.bytes, "\x1b]10;?\x07");

  // Replies resolve oldest-first per kind, without cross-kind confusion.
  for (
    const token of tokensOf("\x1bP1$r0m\x1b\\\x1bP1+r544e=1b\x1b\\\x1bP1$r1;24r\x1b\\\x1b]10;rgb:ffff/ffff/ffff\x07")
  ) {
    broker.consume(token);
  }
  assertEquals(await first.reply, "1$r0m");
  assertEquals(await second.reply, "1$r1;24r");
  assertEquals(await cap.reply, "1+r544e=1b");
  assertEquals(await color.reply, "10;rgb:ffff/ffff/ffff");
});

Deno.test("deadlines expire on the caller clock, rejecting only their owner", async () => {
  const broker = createTerminalQueryBroker({ deadlineMs: 100 });
  const stale = broker.request("device-attributes", "", 0);
  const fresh = broker.request("device-attributes", "", 80);
  assertEquals(broker.expire(100), 1); // only the first is due
  let rejected = false;
  try {
    await stale.reply;
  } catch (error) {
    rejected = String(error).includes("deadline");
  }
  assert(rejected);
  // The fresh request still owns the next reply.
  for (const token of tokensOf("\x1b[?6c")) assert(broker.consume(token));
  assertEquals(await fresh.reply, "6");
});
