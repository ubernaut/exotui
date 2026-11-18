// Copyright 2026 ubernaut. MIT license.

import { join } from "node:path";
import { assert, assertEquals, assertStringIncludes } from "./deps.ts";
import {
  EXOMUX_DOCUMENT_WINDOW_ID,
  EXOMUX_FILE_TREE_START,
  EXOMUX_FILES_WINDOW_ID,
  EXOMUX_PREVIEW_MAX_BYTES,
  ExomuxFileExplorer,
} from "../file_explorer.ts";
import { runtimeHost } from "@ubernaut/exotui/runtime";
import { createTestTerminalApp } from "@ubernaut/exotui/testing";
import { POINTER_INPUT_SCHEMA_VERSION, type PointerInputEvent } from "@ubernaut/exotui";
import { createExomuxController } from "../controller.ts";
import {
  createExomuxTerminalOptions,
  type ExomuxAppMountRef,
  exomuxStartMenuItems,
  exomuxStartMenuLayout,
} from "../app.ts";
import { FakeExomuxClient, session } from "./fakes.ts";

async function until(check: () => boolean, tick: () => Promise<unknown> = () => Promise.resolve()): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert(check(), "Expected asynchronous file/view state to settle");
}

Deno.test("Files lists hidden entries and directories first, loads folders lazily, and refreshes", async () => {
  const root = await Deno.makeTempDir();
  const files = new ExomuxFileExplorer(root);
  try {
    await Deno.mkdir(join(root, "folder"));
    await Deno.writeTextFile(join(root, "folder", "nested.md"), "# Nested");
    await Deno.writeTextFile(join(root, "readme.md"), "# Hello");
    await Deno.writeTextFile(join(root, ".hidden"), "hidden");
    await files.ensureLoaded();
    assertEquals(files.tree.visibleRows().map((row) => row.label), ["..", "folder/", ".hidden", "readme.md"]);
    assert(!files.tree.visibleRows().some((row) => row.label === "nested.md"));
    files.tree.setSelectedIndex(1);
    files.tree.expandActive();
    await until(() => files.tree.visibleRows().some((row) => row.label === "nested.md"));
    assertEquals(files.tree.selected()?.label, "folder/");
    files.tree.collapseActive();
    assert(!files.tree.visibleRows().some((row) => row.label === "nested.md"));
    await Deno.writeTextFile(join(root, "new.txt"), "new");
    await files.refresh();
    assert(files.tree.visibleRows().some((row) => row.label === "new.txt"));
    await files.setDirectory(join(root, "folder"));
    await files.parent();
    assertEquals(files.directory.peek(), root);
  } finally {
    files.dispose();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("Files previews formatted Markdown and literal text, rejecting binary and oversized files", async () => {
  const root = await Deno.makeTempDir();
  const files = new ExomuxFileExplorer(root);
  try {
    const source =
      "# Heading\n\nA **strong** word and [link](https://example.com).\n\n- [x] done\n\n| A | B |\n| - | - |\n| 1 | 2 |";
    await Deno.writeTextFile(join(root, "README.MD"), source);
    assert(await files.openFile(join(root, "README.MD")));
    const rendered = files.document.text(60);
    assertStringIncludes(rendered, "Heading");
    assert(!rendered.includes("**strong**"));
    assertEquals(files.document.document.peek().links.length, 1);
    files.document.offset.value = 2;
    await Deno.writeTextFile(join(root, "literal.txt"), "# literal **syntax**\n```\ncontrol\x1b[31m");
    assert(await files.openFile(join(root, "literal.txt")));
    assertStringIncludes(files.document.text(60), "# literal **syntax**");
    assert(!files.document.source.peek().includes("\x1b"));
    assertEquals(files.document.offset.peek(), 0);
    await Deno.writeFile(join(root, "binary"), new Uint8Array([1, 0, 2]));
    assertEquals(await files.openFile(join(root, "binary")), false);
    assertStringIncludes(files.message.peek(), "Binary");
    await Deno.writeFile(join(root, "huge.md"), new Uint8Array(EXOMUX_PREVIEW_MAX_BYTES + 1));
    assertEquals(await files.openFile(join(root, "huge.md")), false);
    assertStringIncludes(files.message.peek(), "512 KiB");
    await Deno.writeFile(join(root, "invalid.txt"), new Uint8Array([255, 254]));
    assertEquals(await files.openFile(join(root, "invalid.txt")), false);
    assertStringIncludes(files.message.peek(), "UTF-8");
    assertEquals(await files.openFile(join(root, "missing.md")), false);
    assertEquals(files.documentPath.peek(), join(root, "literal.txt"));
  } finally {
    files.dispose();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("Files ignores stale directory reads and shows unreadable folders without losing parent navigation", async () => {
  const root = await Deno.makeTempDir();
  const original = runtimeHost.readDir;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => release = resolve);
  runtimeHost.readDir = async function* (path) {
    if (path === join(root, "slow")) {
      await blocked;
      yield { name: "stale", isFile: true, isDirectory: false, isSymlink: false };
    } else if (path === join(root, "denied")) throw new Error("Permission denied");
    else yield* original.call(runtimeHost, path);
  };
  const files = new ExomuxFileExplorer(root);
  try {
    const slow = files.setDirectory(join(root, "slow"));
    await files.setDirectory(root);
    release();
    await slow;
    assertEquals(files.directory.peek(), root);
    assert(!files.tree.visibleRows().some((row) => row.label === "stale"));
    await files.setDirectory(join(root, "denied"));
    assertStringIncludes(files.message.peek(), "Permission denied");
    files.tree.first();
    await files.activate();
    assertEquals(files.directory.peek(), root);
  } finally {
    release();
    runtimeHost.readDir = original;
    files.dispose();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("Files and document windows stay local when clients share desktop appearance and terminal visibility", async () => {
  const root = await Deno.makeTempDir();
  await Deno.writeTextFile(join(root, "guide.md"), "# Local document");
  const client = new FakeExomuxClient([]);
  const first = await createExomuxController({ client, defaultCwd: root });
  const second = await createExomuxController({ client, defaultCwd: root });
  const bounds = { column: 0, row: 1, width: 100, height: 30 };
  try {
    await first.openFiles(bounds);
    first.files.tree.last();
    await first.openSelectedFile(bounds);
    first.setTheme("matrix");
    await until(() => second.themeId.peek() === "matrix");
    for (const id of [EXOMUX_FILES_WINDOW_ID, EXOMUX_DOCUMENT_WINDOW_ID]) {
      assertEquals(second.windowHost.controller.inspect().windows.find((window) => window.id === id)?.state, "closed");
    }
    second.openSessionManager(bounds);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assertEquals(
      first.windowHost.controller.inspect().windows.find((window) => window.id === EXOMUX_DOCUMENT_WINDOW_ID)?.state,
      "normal",
    );
    assertEquals(first.files.documentPath.peek(), join(root, "guide.md"));
    assertEquals(second.files.documentPath.peek(), "");
  } finally {
    await first.dispose();
    await second.dispose();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("Files right-click opens a terminal in the clicked folder, without expanding it", async () => {
  const root = await Deno.makeTempDir();
  const folder = join(root, "folder with spaces");
  await Deno.mkdir(folder);
  await Deno.writeTextFile(join(root, "guide.md"), "# Guide");
  const initial = session("files-shell", "shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial], defaultCwd: root });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...options } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...options, size: { columns: 100, rows: 32 } });
  try {
    const mounted = mount.current!;
    await controller.openFiles(mounted.bodyRect.peek());
    await mounted.whenIdle();
    const rect = mounted.windowProjection.peek().windows.find((window) => window.id === EXOMUX_FILES_WINDOW_ID)!
      .clientRect;
    const x = rect.column + 2;
    const y = rect.row + EXOMUX_FILE_TREE_START;
    await harness.pilot.click(x, y + 2, { button: 2 });
    assertEquals(controller.startMenuVisible.peek(), false, "A file is not a folder context target");
    await harness.pilot.click(x, y + 1, { button: 2 });
    await until(() => harness.pilot.snapshot().includes("Open terminal here"), () => harness.pilot.settle());
    assertEquals(client.spawned.length, 0);
    assert(!controller.files.tree.visibleRows().some((row) => row.label === "Expand to load"));
    await harness.pilot.press("escape");
    await mounted.whenIdle();
    assertEquals(client.spawned.length, 0);
    await harness.pilot.click(x, y + 1, { button: 2 });
    const item = exomuxStartMenuLayout(
      harness.app.tui.rectangle.peek(),
      controller.startMenuAnchor.peek(),
      exomuxStartMenuItems(controller),
    ).items[0]!;
    await harness.pilot.click(item.rect.column + 1, item.rect.row);
    await mounted.whenIdle();
    assertEquals(client.spawned.map((spawn) => spawn.cwd), [folder]);
  } finally {
    harness.destroy();
    await controller.dispose();
    await Deno.remove(root, { recursive: true });
  }
});

for (const size of [{ columns: 100, rows: 32 }, { columns: 36, rows: 18 }]) {
  Deno.test(`Files menu, keyboard, mouse and touch open documents at ${size.columns} columns`, async () => {
    const root = await Deno.makeTempDir();
    await Deno.writeTextFile(
      join(root, "guide.md"),
      "# Styled heading\n\n**Bold** and `code`.\n\n" + "A paragraph.\n\n".repeat(50) + "# Last heading",
    );
    await Deno.writeTextFile(join(root, "plain.txt"), "# Plain text");
    const initial = session("files-shell", "shell", 0);
    const client = new FakeExomuxClient([initial]);
    const controller = await createExomuxController({ client, initialSessions: [initial], defaultCwd: root });
    controller.globalSettings.value = { ...controller.globalSettings.peek(), opacity: 1 };
    const mount: ExomuxAppMountRef = {};
    const { tuiOptions: _tuiOptions, ...options } = createExomuxTerminalOptions(controller, mount);
    const harness = await createTestTerminalApp({ ...options, size });
    try {
      const mounted = mount.current!;
      await harness.pilot.click(1, 0);
      await mounted.whenIdle();
      const menu = exomuxStartMenuLayout(
        harness.app.tui.rectangle.peek(),
        controller.startMenuAnchor.peek(),
        exomuxStartMenuItems(controller),
      );
      const entry = menu.items.find((item) => item.id === "files")!;
      await harness.pilot.click(entry.rect.column + 1, entry.rect.row);
      await mounted.whenIdle();
      assertEquals(controller.windowHost.controller.inspect().activeWindowId, EXOMUX_FILES_WINDOW_ID);
      assertEquals(client.spawned.length, 0);
      await harness.pilot.press("down");
      await harness.pilot.press("return");
      await mounted.whenIdle();
      assertEquals(controller.windowHost.controller.inspect().activeWindowId, EXOMUX_DOCUMENT_WINDOW_ID);
      await until(() => harness.pilot.snapshot().includes("Styled heading"), () => harness.pilot.settle());
      assert(!harness.pilot.snapshot().includes("**Bold**"));
      // Only the real Markdown widget supplies a bold heading, so wait past the plain fallback.
      await until(() => {
        const rect = mounted.windowProjection.peek().windows.find((window) =>
          window.id === EXOMUX_DOCUMENT_WINDOW_ID
        )!.clientRect;
        return harness.canvas.frameBuffer[rect.row + 2]?.slice(rect.column, rect.column + rect.width).some((cell) => {
          const text = typeof cell === "string" ? cell : cell ? new TextDecoder().decode(cell) : "";
          // deno-lint-ignore no-control-regex
          return /\x1b\[[^m]*1(?:;|m)/.test(text) && text.includes("S");
        }) ?? false;
      }, () => harness.pilot.settle());
      await harness.pilot.press("end");
      await mounted.whenIdle();
      assert(controller.files.document.offset.peek() > 0);
      await until(() => harness.pilot.snapshot().includes("Last heading"), () => harness.pilot.settle());
      assert(!harness.pilot.snapshot().includes("Styled heading"));
      assertStringIncludes(harness.pilot.snapshot(), "100%");
      await harness.pilot.press("home");
      await mounted.whenIdle();
      assertEquals(controller.files.document.offset.peek(), 0);
      const doc = mounted.windowProjection.peek().windows.find((window) => window.id === EXOMUX_DOCUMENT_WINDOW_ID)!;
      await harness.pilot.scroll(1, doc.clientRect.column + 1, doc.clientRect.row + 3);
      assert(controller.files.document.offset.peek() > 0);
      await until(() => !harness.pilot.snapshot().includes("Styled heading"), () => harness.pilot.settle());
      await harness.pilot.press("home");
      await mounted.whenIdle();
      for (const [sequence, kind, dy] of [[1, "down", 7], [2, "move", 3], [3, "up", 3]] as const) {
        await mounted.handlePointer({
          schemaVersion: POINTER_INPUT_SCHEMA_VERSION,
          kind,
          pointerId: 70,
          sequence,
          source: "browser",
          trust: "trusted",
          device: "touch",
          primary: true,
          coordinates: { cell: { space: "cell", x: doc.clientRect.column + 2, y: doc.clientRect.row + dy } },
          button: null,
          buttons: kind === "up" ? 0 : 1,
          modifiers: { ctrl: false, meta: false, shift: false, alt: false },
          timestamp: Date.now(),
        });
      }
      assertEquals(controller.files.document.offset.peek(), 4, "A swipe should scroll the document, not drag it");
      await harness.pilot.press("escape");
      await mounted.whenIdle();
      const files = mounted.windowProjection.peek().windows.find((window) => window.id === EXOMUX_FILES_WINDOW_ID)!;
      const plainRow = controller.files.tree.visible(files.clientRect.height - EXOMUX_FILE_TREE_START).findIndex((
        row,
      ) => row.label === "plain.txt");
      const x = files.clientRect.column + 2;
      const y = files.clientRect.row + EXOMUX_FILE_TREE_START + plainRow;
      await harness.pilot.click(x, y);
      await mounted.whenIdle();
      assertEquals(controller.files.documentPath.peek(), join(root, "plain.txt"));
      await until(() => harness.pilot.snapshot().includes("# Plain text"), () => harness.pilot.settle());
      await harness.pilot.press("escape");
      await mounted.whenIdle();
      const pointer = (kind: "down" | "up"): PointerInputEvent => ({
        schemaVersion: POINTER_INPUT_SCHEMA_VERSION,
        kind,
        pointerId: 71,
        sequence: kind === "down" ? 1 : 2,
        source: "browser",
        trust: "trusted",
        device: "touch",
        primary: true,
        coordinates: { cell: { space: "cell", x, y } },
        button: null,
        buttons: kind === "down" ? 1 : 0,
        modifiers: { ctrl: false, meta: false, shift: false, alt: false },
        timestamp: Date.now(),
        pressure: kind === "down" ? 0.5 : 0,
        contact: { width: 18, height: 18 },
      });
      await mounted.handlePointer(pointer("down"));
      await mounted.handlePointer(pointer("up"));
      await mounted.whenIdle();
      assertEquals(controller.windowHost.controller.inspect().activeWindowId, EXOMUX_DOCUMENT_WINDOW_ID);
      await harness.pilot.press("a");
      await mounted.whenIdle();
      assertEquals(client.inputs.length, 0);
      await harness.pilot.press("n", { ctrl: true });
      await harness.pilot.press("e");
      await mounted.whenIdle();
      assertEquals(controller.windowHost.controller.inspect().activeWindowId, EXOMUX_FILES_WINDOW_ID);
    } finally {
      harness.destroy();
      await controller.dispose();
      await Deno.remove(root, { recursive: true });
    }
  });
}
