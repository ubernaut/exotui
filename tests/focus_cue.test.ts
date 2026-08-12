// Copyright 2023 Im-Beast. MIT license.

import { assert } from "./deps.ts";
import { crayon } from "crayon";
import { Button } from "../mod.app.ts";
import { createTestTerminalApp } from "../mod.testing.ts";

const REVERSE_VIDEO = "\x1b[7m";

Deno.test("a focused control gets a default focus cue unless its theme styles focus", async () => {
  let plain: Button | undefined;
  let themed: Button | undefined;
  const harness = await createTestTerminalApp({
    size: { columns: 24, rows: 6 },
    setup(app) {
      // A theme with only a base look — nothing distinguishes focus.
      plain = new Button({
        parent: app.tui,
        zIndex: 1,
        rectangle: { column: 0, row: 0, width: 10, height: 1 },
        label: { text: "plain" },
        theme: { base: crayon.white },
      });
      // A theme that styles focus itself.
      themed = new Button({
        parent: app.tui,
        zIndex: 1,
        rectangle: { column: 0, row: 1, width: 10, height: 1 },
        label: { text: "themed" },
        theme: { base: crayon.white, focused: crayon.bgBlue },
      });
    },
  });

  try {
    assert(plain);
    assert(themed);

    plain.state.value = "base";
    assert(!plain.style.peek()("x").includes(REVERSE_VIDEO), "a base control must not carry the focus cue");

    // Focused (and pressed/active) with a plain theme → default reverse-video cue.
    plain.state.value = "focused";
    assert(plain.style.peek()("x").includes(REVERSE_VIDEO), "a focused plain control must show the focus cue");
    plain.state.value = "active";
    assert(plain.style.peek()("x").includes(REVERSE_VIDEO), "an active plain control must show the focus cue");

    // A theme that styles focus keeps its own look — no default cue layered on.
    themed.state.value = "focused";
    assert(
      !themed.style.peek()("x").includes(REVERSE_VIDEO),
      "a theme that styles focus must not be overridden by the default cue",
    );
  } finally {
    harness.destroy();
  }
});
