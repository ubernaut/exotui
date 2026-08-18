// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import { Tui } from "../src/tui.ts";
import { Canvas } from "../src/canvas/canvas.ts";
import { MemoryCanvasSink } from "../src/canvas/sink.ts";

// The Tui "destroy" event means "the user interrupted us, shut the process
// down" — `dispatch()` emits it from the signal and Ctrl-C handlers, and its
// own listener answers by calling Deno.exit. It does NOT mean "this Tui has
// been torn down", and `destroy()` deliberately does not emit it: doing so
// would exit the process on every programmatic teardown.
//
// That distinction is easy to miss and expensive when missed. Exomux's session
// switcher waited on this event to learn that a desktop had come down, so a
// switch parked the client on a promise that could never resolve, the event
// loop drained, and the client exited to a black screen instead of reattaching
// to the chosen session.

function createHeadlessTui(): Tui {
  const sink = new MemoryCanvasSink();
  const canvas = new Canvas({ sink, size: { columns: 20, rows: 6 } });
  return new Tui({ canvas });
}

Deno.test("a programmatic Tui.destroy() does not emit the destroy event", () => {
  const tui = createHeadlessTui();
  let emitted = 0;
  tui.on("destroy", () => {
    emitted += 1;
  });

  tui.destroy();

  assertEquals(
    emitted,
    0,
    "destroy() tears down; the destroy EVENT is an interrupt request whose handler exits the process",
  );
});

Deno.test("the destroy event is observable when something does emit it", () => {
  const tui = createHeadlessTui();
  const seen: string[] = [];
  const stop = tui.on("destroy", () => {
    seen.push("first");
  });
  tui.on("destroy", () => {
    seen.push("second");
  });

  // Emitting is how the signal path asks for shutdown; every listener runs.
  tui.emit("destroy");
  assertEquals(seen, ["first", "second"]);

  stop();
  tui.emit("destroy");
  assertEquals(seen, ["first", "second", "second"], "an unsubscribed listener stops hearing it");
  tui.destroy();
});

Deno.test("destroy() is idempotent enough to call after an emitted shutdown", () => {
  const tui = createHeadlessTui();
  tui.emit("destroy");
  // A caller that both hears the event and tears down explicitly must not
  // throw on the second teardown; exomux's switch path does exactly this.
  tui.destroy();
  tui.destroy();
  assert(true, "repeated teardown did not throw");
});
