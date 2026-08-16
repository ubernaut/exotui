// Copyright 2023 Im-Beast. MIT license.

// INP-004: terminal preedit provider boundary — support is claimed only
// while a provider is attached, and disposal clears active preedit state.

import { assert, assertEquals } from "./deps.ts";
import { createCompositionController, createTerminalPreeditBridge, type TerminalPreeditEvent } from "../mod.ts";

function fakeProvider(id = "kitty-ime") {
  let listener: ((event: TerminalPreeditEvent) => void) | undefined;
  let unsubscribed = false;
  return {
    provider: {
      id,
      observe(callback: (event: TerminalPreeditEvent) => void) {
        listener = callback;
        return () => {
          unsubscribed = true;
          listener = undefined;
        };
      },
    },
    emit: (event: TerminalPreeditEvent) => listener?.(event),
    get unsubscribed() {
      return unsubscribed;
    },
  };
}

Deno.test("support is never claimed without a provider and events route through", () => {
  const controller = createCompositionController({ value: "abc" });
  const bridge = createTerminalPreeditBridge(controller);
  assertEquals(bridge.inspect(), { supported: false, providerId: undefined });

  const fake = fakeProvider();
  bridge.attach(fake.provider);
  assertEquals(bridge.inspect(), { supported: true, providerId: "kitty-ime" });

  fake.emit({ type: "start", at: 3 });
  fake.emit({ type: "update", preedit: "か" });
  assertEquals(controller.state.display, "abcか");
  fake.emit({ type: "commit", text: "漢" });
  assertEquals(controller.state.committed, "abc漢");
});

Deno.test("detaching cancels active preedit and stale events are ignored", () => {
  const controller = createCompositionController({ value: "x" });
  const bridge = createTerminalPreeditBridge(controller);
  const fake = fakeProvider();
  const detach = bridge.attach(fake.provider);

  fake.emit({ type: "start" });
  fake.emit({ type: "update", preedit: "ai" });
  assert(controller.state.active);

  detach();
  assertEquals(bridge.supported, false);
  assert(fake.unsubscribed);
  assertEquals(controller.state.active, false); // preedit cleared
  assertEquals(controller.state.committed, "x"); // nothing committed
  assertEquals(controller.transactions().at(-1)?.kind, "cancel");

  // A replacement provider displaces the old one; the old detacher is inert.
  const second = fakeProvider("wezterm-ime");
  bridge.attach(second.provider);
  detach();
  assertEquals(bridge.inspect().providerId, "wezterm-ime");
});
