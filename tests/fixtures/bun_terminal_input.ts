// Copyright 2026 ubernaut. MIT license.
import { runtimeHost } from "../../src/runtime/host.ts";
import { Tui } from "../../src/tui.ts";
import { emitInputEvents } from "../../src/input_reader/mod.ts";
const mode = async () =>
  new TextDecoder().decode(
    (await new runtimeHost.Command("stty", {
      args: ["-g"],
      stdin: "inherit",
    }).output()).stdout,
  ).trim();
const before = await mode();
const tui = new Tui({ enableMouse: true, enableFocusEvents: true, enableBracketedPaste: true });
const controller = new AbortController();
const events: { key: string; text?: string; focused?: boolean }[] = [];
tui.on("inputEvent", (event) => {
  events.push({
    key: event.key,
    ...("text" in event ? { text: event.text } : {}),
    ...("focused" in event ? { focused: event.focused } : {}),
  });
  if (event.key === "q") {
    controller.abort();
    tui.destroy();
  }
});
tui.run();
const input = emitInputEvents(tui.stdin, tui, 0, { signal: controller.signal, cbreak: false });
console.log("__READY__");
await input;
console.log(`__RESULT__${JSON.stringify({ events, size: tui.canvas.size.peek(), restored: before === await mode() })}`);
