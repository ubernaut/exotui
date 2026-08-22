#!/usr/bin/env -S deno run -A --unstable-webgpu
// The exotui desktop, in a terminal — the other thin end of plan 045.
//
// This is the zero-additional-code-paths proof: the exact application object
// the browser page runs (`examples/web/desktop_app.ts`, which never touches a
// host API) presented through the console presenter instead. Host-only
// services are simply absent, and the desktop says so honestly — the monitor
// window reports no live sources, the three window reports no overlay host.
//
//   deno task desktop
//
// Ctrl+C leaves the alternate screen and restores the terminal.

import { runShellApp } from "../src/app/shell_presenter.ts";
import { consolePresenter } from "../src/runtime/console_presenter.ts";
import { createDesktopApp } from "./web/desktop_app.ts";

const presenter = consolePresenter();
const handle = runShellApp(presenter, createDesktopApp({}));

// --smoke: paint a few frames and leave — the CI gate that proves the shared
// application object boots and renders on this host.
if (Deno.args.includes("--smoke")) {
  setTimeout(() => {
    handle.stop();
    Deno.exit(0);
  }, 400);
}

const leave = () => {
  handle.stop();
  Deno.exit(0);
};
try {
  Deno.addSignalListener("SIGINT", leave);
  Deno.addSignalListener("SIGTERM", leave);
} catch {
  // Signal listeners are best-effort; Ctrl+C still ends the process.
}
