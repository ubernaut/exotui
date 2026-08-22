// Plan 045's acceptance, as tests: the desktop application module is
// host-neutral, runs against any presenter, and persists through whichever
// store the presenter supplies. The fake presenter here is the third host —
// after the browser and the console — and the cheapest to interrogate.

import { assert, assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import type { ShellPresentedFrame, ShellPresenter, ShellPresenterSize } from "../src/app/shell_presenter.ts";
import { runShellApp, shellCellsToAnsiRow } from "../src/app/shell_presenter.ts";
import { MemoryStore } from "../src/runtime/storage.ts";
import { createDesktopApp } from "../examples/web/desktop_app.ts";
import { SHELL_THEMES } from "../src/app/shell_theme.ts";

function fakePresenter(store: MemoryStore<unknown>): {
  presenter: ShellPresenter;
  frames: ShellPresentedFrame[];
  fire: (now: number) => void;
} {
  const frames: ShellPresentedFrame[] = [];
  let pending: ((now: number) => void) | undefined;
  const size: ShellPresenterSize = { columns: 90, rows: 28 };
  const presenter: ShellPresenter = {
    capabilities: { gpu: false, audioInput: false },
    size: () => size,
    onResize: () => () => {},
    onKey: () => () => {},
    onPointer: () => () => {},
    onWheel: () => () => {},
    present: (frame) => frames.push(frame),
    requestFrame: (callback) => {
      pending = callback;
    },
    store: <T>() => store as unknown as import("../src/runtime/storage.ts").AsyncStore<T>,
    now: () => 1000,
    dispose: () => {},
  };
  return {
    presenter,
    frames,
    fire: (now) => {
      const callback = pending;
      pending = undefined;
      callback?.(now);
    },
  };
}

function frameText(frame: ShellPresentedFrame): string {
  return frame.map((row) => row.map((cell) => cell.char).join("")).join("\n");
}

Deno.test("the application module never touches a host API", async () => {
  // The grep half of the dual oracle; the docs build probe-bundles the other.
  const source = await Deno.readTextFile("examples/web/desktop_app.ts");
  for (const forbidden of ["Deno.", "document.", "navigator.", "requestAnimationFrame", "localStorage"]) {
    assertEquals(source.includes(forbidden), false, `desktop_app.ts must not mention ${forbidden}`);
  }
});

Deno.test("the desktop boots and paints its furniture on a fake presenter", async () => {
  const { presenter, frames, fire } = fakePresenter(new MemoryStore());
  const handle = runShellApp(presenter, createDesktopApp({}));
  // init is async; give the microtask queue one turn, then drive two frames.
  await new Promise((resolve) => setTimeout(resolve, 10));
  fire(1000);
  fire(1033);
  assert(frames.length >= 2, "two frames should have been presented");
  const text = frameText(frames.at(-1)!);
  assert(text.includes("⏻ exowebtui"), "the bar's start button paints");
  assert(text.includes("welcome"), "the welcome window paints");
  assert(text.includes("│"), "window borders paint");
  handle.stop();
});

Deno.test("a persisted theme is loaded through the presenter's store", async () => {
  const store = new MemoryStore<unknown>();
  await store.set("settings", { themeId: "nosferatu", wallpaper: "plain" });
  const { presenter, frames, fire } = fakePresenter(store);
  const handle = runShellApp(presenter, createDesktopApp({}));
  await new Promise((resolve) => setTimeout(resolve, 10));
  fire(1000);
  const nosferatu = SHELL_THEMES.find((theme) => theme.id === "nosferatu")!;
  const rendered = frames.at(-1)!;
  // The bar row is painted on the theme's surface — Dracula's, if the store
  // was honoured.
  const barRow = shellCellsToAnsiRow(rendered[0]!);
  assert(
    barRow.includes(`48;2;${nosferatu.surface.join(";")}`),
    "the bar paints on Nosferatu's surface colour",
  );
  handle.stop();
});
