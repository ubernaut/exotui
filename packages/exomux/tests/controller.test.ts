// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertStringIncludes, assertThrows } from "./deps.ts";
import { MemoryStore } from "@ubernaut/exotui";
import { grWizardThemePalettes } from "@ubernaut/exotui";
import { createTestMousePress } from "@ubernaut/exotui/testing";
import { createExomuxController } from "../controller.ts";
import {
  EXOMUX_T2_SWATCHES,
  EXOMUX_THEMES,
  type ExomuxAttachResult,
  type ExomuxClientPort,
  type ExomuxOutputFrame,
  type ExomuxSessionSummary,
  type ExomuxSpawnOptions,
  exomuxTheme,
  exomuxWindowId,
  normalizeExomuxWorkspaceState,
} from "../model.ts";
import { launchInitialExomuxTerminalIfEmpty, parseExomuxShowcaseArgs } from "../main.ts";
import { exomuxTerminalForegroundRgb, exomuxTerminalRgb } from "../terminal_palette.ts";
import { encodeTerminalIndexedColor, encodeTerminalRgbColor } from "@ubernaut/exotui/terminal";

const BOUNDS = { column: 0, row: 2, width: 120, height: 34 } as const;
const THEME_RGB_FIELDS = [
  "background",
  "surface",
  "surfaceStrong",
  "border",
  "text",
  "muted",
  "accent",
  "success",
  "warning",
  "danger",
] as const;

Deno.test("Exomux includes every Workbench theme and its six-family T2 palette", () => {
  assertEquals(EXOMUX_THEMES.map((theme) => theme.id), [
    "midnight",
    "amber",
    "matrix",
    "paper",
    ...grWizardThemePalettes.map((palette) => palette.name),
    "t2",
    "templeos",
    "miami",
  ]);
  assertEquals(new Set(EXOMUX_THEMES.map((theme) => theme.id)).size, EXOMUX_THEMES.length);

  const workbenchMappings = [
    ["background", "bg"],
    ["surface", "surface"],
    ["surfaceStrong", "panelAlt"],
    ["border", "borderStrong"],
    ["text", "text"],
    ["muted", "textMuted"],
    ["accent", "accent"],
    ["success", "success"],
    ["warning", "warning"],
    ["danger", "danger"],
  ] as const;
  for (const palette of grWizardThemePalettes) {
    const theme = exomuxTheme(palette.name);
    assertEquals(theme.label, palette.label);
    for (const [themeField, workbenchField] of workbenchMappings) {
      assertEquals(theme[themeField], testHexRgb(palette[workbenchField]));
    }
  }

  assertEquals(exomuxTheme("t2"), {
    id: "t2",
    label: "T2 Neural Steel",
    background: [3, 4, 8],
    surface: [24, 26, 34],
    surfaceStrong: [30, 58, 112],
    border: [155, 115, 220],
    text: [205, 234, 255],
    muted: [220, 168, 255],
    accent: [255, 105, 180],
    success: [205, 234, 255],
    warning: [155, 115, 220],
    danger: [220, 168, 255],
  });
  const t2 = exomuxTheme("t2");
  const t2Swatches = new Set(Object.values(EXOMUX_T2_SWATCHES).map((rgb) => rgb.join(",")));
  assertEquals(t2Swatches.size, 7);
  const t2RoleSwatches = new Set(THEME_RGB_FIELDS.map((field) => t2[field].join(",")));
  assertEquals(t2RoleSwatches, t2Swatches);
  assert(contrastRatio(t2.text, t2.surface) >= 4.5);
  assert(contrastRatio(t2.muted, t2.surface) >= 4.5);
  assert(contrastRatio(t2.muted, t2.surfaceStrong) >= 4.5);
  assert(contrastRatio(t2.border, t2.surfaceStrong) >= 3);
  assert(contrastRatio(t2.danger, t2.surfaceStrong) >= 4.5);
  for (const theme of EXOMUX_THEMES) {
    assert(theme.label.length > 0 && theme.label.length <= 24);
    for (const field of THEME_RGB_FIELDS) {
      assertEquals(theme[field].length, 3);
      assert(theme[field].every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255));
    }
  }
  assertEquals(exomuxTheme("not-a-theme").id, "midnight");
  assertEquals(normalizeExomuxWorkspaceState({ themeId: "not-a-theme" }).themeId, "midnight");
});

Deno.test("Exomux preserves extended colors and remaps basic ANSI text for every theme", () => {
  assertEquals(exomuxTerminalRgb(30, false), [0, 0, 0]);
  assertEquals(exomuxTerminalRgb(encodeTerminalIndexedColor(0), false), [0, 0, 0]);
  assertEquals(exomuxTerminalRgb(encodeTerminalIndexedColor(30), false), [0, 135, 135]);
  assertEquals(exomuxTerminalRgb(encodeTerminalIndexedColor(196), false), [255, 0, 0]);
  assertEquals(exomuxTerminalRgb(encodeTerminalRgbColor(0, 0, 30), false), [0, 0, 30]);
  assertEquals(exomuxTerminalRgb(encodeTerminalRgbColor(12, 34, 56), false), [12, 34, 56]);

  const ansiForegrounds = [
    30,
    31,
    32,
    33,
    34,
    35,
    36,
    37,
    90,
    91,
    92,
    93,
    94,
    95,
    96,
    97,
  ];
  for (const theme of EXOMUX_THEMES) {
    for (const code of ansiForegrounds) {
      const resolved = exomuxTerminalForegroundRgb(code, theme.surface, theme.text);
      assert(resolved);
      assert(
        contrastRatio(resolved, theme.surface) >= 4.5,
        `${theme.id} ANSI ${code} contrast was ${contrastRatio(resolved, theme.surface)}`,
      );
    }
  }
});

Deno.test("Exomux launcher defaults to durable client mode and parses explicit daemon paths", () => {
  assertEquals(parseExomuxShowcaseArgs([]), {
    daemon: false,
    persistLayout: true,
    listSessions: false,
    newSession: false,
    showHelp: false,
    resetConfig: false,
  });
  assertEquals(
    parseExomuxShowcaseArgs([
      "--daemon",
      "--state-dir=/private/state",
      "--descriptor=/private/state/host.json",
      "--layout-file=/private/state/layout.json",
    ]),
    {
      daemon: true,
      persistLayout: true,
      listSessions: false,
      newSession: false,
      showHelp: false,
      resetConfig: false,
      stateDirectory: "/private/state",
      descriptorPath: "/private/state/host.json",
      layoutPath: "/private/state/layout.json",
    },
  );
  assertEquals(parseExomuxShowcaseArgs(["--memory"]), {
    daemon: false,
    persistLayout: false,
    listSessions: false,
    newSession: false,
    showHelp: false,
    resetConfig: false,
  });
  assertThrows(() => parseExomuxShowcaseArgs(["--mystery"]), TypeError, "Unknown Exomux option");
});

Deno.test("Exomux detaches presentation windows without killing and replays on reopen", async () => {
  const host = new FakeExomuxHost();
  const session = host.seed("shell-one", "shell one");
  const client = host.client();
  const controller = await createExomuxController({ client, defaultCommand: "/bin/sh" });
  try {
    assertEquals(controller.inspect().attachedCount, 1);
    host.emit(session.id, "\x1b[31mR\x1b[0m");
    const runtime = controller.runtime(session.id)!;
    assertEquals(runtime.screen.cellRows()[0]![0], { char: "R", foreground: 31 });

    assertEquals(await controller.closeActive(BOUNDS), true);
    assertEquals(runtime.attached.peek(), false);
    assertEquals(client.killCalls, 0);
    assertEquals(host.sessions.has(session.id), true);
    assertEquals(
      controller.windowHost.controller.inspect().windows.find((window) => window.id === exomuxWindowId(session.id))
        ?.state,
      "closed",
    );

    host.emit(session.id, "\r\nhidden-output");
    assertEquals(runtime.screen.textRows().some((row) => row.includes("hidden-output")), false);
    assertEquals(await controller.openSession(session.id, BOUNDS), true);
    assertEquals(runtime.attached.peek(), true);
    assert(runtime.screen.textRows().some((row) => row.includes("hidden-output")));
    assertEquals(client.killCalls, 0);

    assertEquals(await controller.writeActive("echo exact\n"), true);
    assertEquals(client.inputs.at(-1), { sessionId: session.id, data: "echo exact\n" });
  } finally {
    await controller.dispose();
  }
  assertEquals(client.killCalls, 0);
  assertEquals(host.sessions.has(session.id), true);
  assert(client.detachCalls >= 2);
});

Deno.test("Exomux rejected kill preserves the live attachment generation and output", async () => {
  const host = new FakeExomuxHost();
  const session = host.seed("rejected-kill", "keep streaming");
  const client = host.client();
  const controller = await createExomuxController({ client });
  try {
    const runtime = controller.runtime(session.id)!;
    const generation = runtime.attachGeneration;
    client.rejectKill = true;
    assertEquals(await controller.killSession(session.id), false);
    assertEquals(client.killCalls, 1);
    assertEquals(runtime.attachGeneration, generation);
    assertEquals(runtime.attached.peek(), true);
    assertEquals(host.sessions.has(session.id), true);

    host.emit(session.id, "still-live");
    assertEquals(runtime.lastSequence, 1);
    assert(runtime.screen.textRows().some((row) => row.includes("still-live")));
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux ordinary terminals float by default and explicit splits tile their anchor", async () => {
  const host = new FakeExomuxHost();
  const controller = await createExomuxController({ client: host.client() });
  try {
    assertEquals(await launchInitialExomuxTerminalIfEmpty(controller, "Connected"), true);
    const first = controller.sessions.peek()[0];
    assertStringIncludes(controller.status.peek(), "floating terminal ready");
    assertEquals(await launchInitialExomuxTerminalIfEmpty(controller, "Reattached"), false);
    assertEquals(controller.sessions.peek().length, 1);
    assertEquals(controller.status.peek(), "Reattached");
    const second = await controller.spawn({ bounds: BOUNDS, title: "second" });
    assert(first);
    assert(second);
    let windows = controller.windowHost.controller.inspect().windows;
    assertEquals(windows.find((window) => window.id === exomuxWindowId(first.id))?.placement, "floating");
    assertEquals(windows.find((window) => window.id === exomuxWindowId(second.id))?.placement, "floating");

    controller.beginPrefix();
    assertEquals(await controller.handlePrefixKey("%", BOUNDS), true);
    const split = controller.sessions.peek().find((session) => session.id !== first.id && session.id !== second.id);
    assert(split);
    windows = controller.windowHost.controller.inspect().windows;
    assertEquals(windows.find((window) => window.id === exomuxWindowId(first.id))?.placement, "floating");
    assertEquals(windows.find((window) => window.id === exomuxWindowId(second.id))?.placement, "tiled");
    assertEquals(windows.find((window) => window.id === exomuxWindowId(split.id))?.placement, "tiled");
    assertEquals(controller.kernel.workspace.inspect().layout.root?.kind, "split");
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux adopts split OSC application titles in runtime and session inventory", async () => {
  const host = new FakeExomuxHost();
  const session = host.seed("title-session", "shell");
  const controller = await createExomuxController({ client: host.client() });
  try {
    host.emit(session.id, "\x1b]2;ascii");
    assertEquals(controller.runtime(session.id)?.summary.peek().title, "shell");
    host.emit(session.id, "churn\x07");
    assertEquals(controller.runtime(session.id)?.summary.peek().title, "asciichurn");
    assertEquals(controller.sessions.peek().find((item) => item.id === session.id)?.title, "asciichurn");

    host.emit(session.id, "\x1b]2;bad\n\x1b title\x07");
    assertEquals(controller.runtime(session.id)?.summary.peek().title, "bad title");
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux prefix commands create dock resize theme and explicitly terminate sessions", async () => {
  const host = new FakeExomuxHost();
  const initial = host.seed("primary", "primary");
  const client = host.client();
  const controller = await createExomuxController({ client, defaultCommand: "/bin/sh" });
  try {
    controller.beginPrefix();
    assertEquals(controller.prefixPending.peek(), true);
    assertEquals(await controller.handlePrefixKey("%", BOUNDS), true);
    assertEquals(controller.prefixPending.peek(), false);
    assertEquals(controller.sessions.peek().length, 2);
    const created = controller.sessions.peek().find((session) => session.id !== initial.id)!;
    assertEquals(controller.windowHost.controller.inspect().activeWindowId, exomuxWindowId(created.id));
    const tiledRoot = controller.kernel.workspace.inspect().layout.root;
    assertEquals(tiledRoot?.kind, "split");
    if (tiledRoot?.kind === "split") assertEquals(tiledRoot.direction, "row");

    const beforeTheme = controller.themeId.peek();
    controller.beginPrefix();
    await controller.handlePrefixKey("t", BOUNDS);
    assert(controller.themeId.peek() !== beforeTheme);

    const projection = controller.windowHost.project(BOUNDS);
    controller.syncTerminalGeometry(projection);
    await Promise.resolve();
    assert(client.resizes.some((resize) => resize.sessionId === created.id));

    assertEquals(await controller.killSession(created.id), true);
    assertEquals(client.killCalls, 1);
    assertEquals(host.sessions.has(created.id), false);
    assertEquals(controller.sessions.peek().length, 1);
    assertEquals(
      controller.windowHost.controller.inspect().windows.some((window) => window.id === exomuxWindowId(created.id)),
      false,
    );
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux coalesces a live resize burst to the first and latest PTY geometry", async () => {
  const host = new FakeExomuxHost();
  const session = host.seed("resize-burst", "resize burst");
  const client = host.client();
  const controller = await createExomuxController({ client });
  try {
    await Promise.resolve();
    client.resizes.splice(0);
    client.delayResize = true;
    const projection = controller.windowHost.project(BOUNDS);
    const projectSize = (columns: number, rows: number) => ({
      ...projection,
      windows: projection.windows.map((window) =>
        window.id === exomuxWindowId(session.id)
          ? { ...window, clientRect: { ...window.clientRect, width: columns, height: rows } }
          : window
      ),
    });

    controller.syncTerminalGeometry(projectSize(81, 25));
    controller.syncTerminalGeometry(projectSize(82, 26));
    controller.syncTerminalGeometry(projectSize(83, 27));

    assertEquals(client.resizes, [{ sessionId: session.id, columns: 81, rows: 25 }]);
    assertEquals(client.pendingResizeCount, 1);
    assertEquals(controller.runtime(session.id)!.screen.inspect().columns, 83);
    assertEquals(controller.runtime(session.id)!.screen.inspect().rows, 27);

    client.resolveNextResize();
    await Promise.resolve();
    assertEquals(client.resizes, [
      { sessionId: session.id, columns: 81, rows: 25 },
      { sessionId: session.id, columns: 83, rows: 27 },
    ]);
    assertEquals(client.pendingResizeCount, 1);
    client.resolveNextResize();
    await Promise.resolve();
    assertEquals(client.resizes.length, 2);
  } finally {
    client.delayResize = false;
    client.resolveAllResizes();
    await controller.dispose();
  }
});

Deno.test("Exomux cycles the complete theme catalog in both directions with exact wraparound", async () => {
  const host = new FakeExomuxHost();
  const session = host.seed("theme-cycle", "theme cycle");
  const controller = await createExomuxController({ client: host.client() });
  try {
    const initialThemeRevision = controller.themeRevision.peek();
    const initialRenderRevision = controller.runtime(session.id)!.renderRevision.peek();
    for (let index = 1; index < EXOMUX_THEMES.length; index += 1) {
      const expected = EXOMUX_THEMES[index]!;
      assertEquals(controller.cycleTheme(), expected);
      assertEquals(controller.themeId.peek(), expected.id);
      assertEquals(controller.theme.peek(), expected);
      assertEquals(controller.status.peek(), `Theme: ${expected.label}`);
    }

    assertEquals(controller.cycleTheme(), EXOMUX_THEMES[0]);
    assertEquals(controller.themeId.peek(), "midnight");
    assertEquals(controller.cycleTheme(-1), EXOMUX_THEMES.at(-1));
    assertEquals(controller.themeId.peek(), "miami");
    assertEquals(controller.themeRevision.peek(), initialThemeRevision + EXOMUX_THEMES.length + 1);
    assertEquals(
      controller.runtime(session.id)!.renderRevision.peek(),
      initialRenderRevision + EXOMUX_THEMES.length + 1,
    );
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux restores theme and exact dynamic window placement while daemon sessions persist", async () => {
  const host = new FakeExomuxHost();
  const session = host.seed("durable", "durable shell");
  const store = new MemoryStore<unknown>();

  const first = await createExomuxController({ client: host.client(), store, persistenceDebounceMs: 0 });
  try {
    for (let index = 1; index < EXOMUX_THEMES.length; index += 1) first.cycleTheme();
    assertEquals(first.themeId.peek(), "miami");
    const result = first.windowHost.execute(
      { kind: "set-placement", id: exomuxWindowId(session.id), placement: "floating" },
      BOUNDS,
    );
    assertEquals(result.handled, true);
    await first.kernel.flush();
  } finally {
    await first.dispose();
  }

  assertEquals(host.sessions.has(session.id), true);
  const second = await createExomuxController({ client: host.client(), store, persistenceDebounceMs: 0 });
  try {
    assertEquals(second.themeId.peek(), "miami");
    assertEquals(second.theme.peek(), exomuxTheme("miami"));
    const terminalWindow = second.windowHost.controller.inspect().windows.find((window) =>
      window.id === exomuxWindowId(session.id)
    );
    assertEquals(terminalWindow?.placement, "floating");
    assertEquals(second.inspect().sessionCount, 1);
    assertStringIncludes(second.inspect().status, "running");
  } finally {
    await second.dispose();
  }
});

function testHexRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function contrastRatio(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  return (Math.max(leftLuminance, rightLuminance) + 0.05) /
    (Math.min(leftLuminance, rightLuminance) + 0.05);
}

function relativeLuminance(rgb: readonly [number, number, number]): number {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

Deno.test("Exomux serializes immediate reopen behind a delayed detach", async () => {
  const host = new FakeExomuxHost();
  const session = host.seed("reopen-race", "reopen race");
  const client = host.client();
  const controller = await createExomuxController({ client });
  try {
    const runtime = controller.runtime(session.id)!;
    client.delayDetach = true;
    const closing = controller.closeActive(BOUNDS);
    await Promise.resolve();
    assertEquals(client.pendingDetachCount, 1);

    const reopening = controller.openSession(session.id, BOUNDS);
    await Promise.resolve();
    assertEquals(client.attachCalls, 1);
    client.resolveNextDetach();

    assertEquals(await closing, true);
    assertEquals(await reopening, true);
    assertEquals(runtime.attached.peek(), true);
    assertEquals(client.attachCalls, 2);
    assertEquals(
      controller.windowHost.controller.inspect().windows.find((window) => window.id === exomuxWindowId(session.id))
        ?.state,
      "normal",
    );
  } finally {
    client.delayDetach = false;
    client.resolveAllDetaches();
    await controller.dispose();
  }
});

Deno.test("Exomux retries transiently blocked dynamic window reconciliation", async () => {
  const host = new FakeExomuxHost();
  host.seed("blocking-primary", "blocking primary");
  const client = host.client();
  const controller = await createExomuxController({ client });
  try {
    const manager = controller.windowHost.project(BOUNDS).floatingWindows.find((window) => window.id === "sessions")!;
    const x = manager.titleBarRect.column + 2;
    const y = manager.titleBarRect.row;
    const started = controller.windowHost.handleMouse(
      "terminal",
      createTestMousePress({ x, y }),
      BOUNDS,
    );
    assertEquals(started.interaction?.status, "started");

    const spawning = controller.spawn({ title: "after gesture", bounds: BOUNDS });
    await Promise.resolve();
    controller.windowHost.handleMouse(
      "terminal",
      createTestMousePress({ x, y, release: true, button: undefined }),
      BOUNDS,
    );
    const created = await spawning;
    assert(created);
    assert(controller.runtime(created.id));
    assertEquals(
      controller.windowHost.controller.inspect().windows.some((window) => window.id === exomuxWindowId(created.id)),
      true,
    );
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux rolls back spawn when dynamic window reconciliation fails", async () => {
  const host = new FakeExomuxHost();
  const initial = host.seed("rollback-primary", "rollback primary");
  const client = host.client();
  const controller = await createExomuxController({ client });
  const failPublication = () => {
    throw new Error("exomux-window-publication-failed");
  };
  try {
    controller.kernel.workspace.state.subscribe(failPublication);
    const created = await controller.spawn({ title: "must roll back", bounds: BOUNDS });
    controller.kernel.workspace.state.unsubscribe(failPublication);

    assertEquals(created, undefined);
    assertEquals([...host.sessions.keys()], [initial.id]);
    assertEquals(controller.sessions.peek().map((session) => session.id), [initial.id]);
    assertEquals(
      controller.windowHost.controller.inspect().windows.filter((window) => window.id.startsWith("terminal-"))
        .map((window) => window.id),
      [exomuxWindowId(initial.id)],
    );
  } finally {
    controller.kernel.workspace.state.unsubscribe(failPublication);
    await controller.dispose();
  }
});

Deno.test("Exomux retains a truthful tombstone after failed kill cleanup and refreshes it atomically", async () => {
  const host = new FakeExomuxHost();
  const session = host.seed("kill-cleanup", "kill cleanup");
  const client = host.client();
  const controller = await createExomuxController({ client });
  const failPublication = () => {
    throw new Error("exomux-kill-publication-failed");
  };
  try {
    controller.kernel.workspace.state.subscribe(failPublication);
    assertEquals(await controller.killSession(session.id), true);
    controller.kernel.workspace.state.unsubscribe(failPublication);

    assertEquals(host.sessions.has(session.id), false);
    assertEquals(controller.runtime(session.id)?.attached.peek(), false);
    assertEquals(controller.runtime(session.id)?.summary.peek().running, false);
    assertStringIncludes(controller.runtime(session.id)?.warning.peek() ?? "", "window cleanup is pending");

    await controller.refreshSessions();
    assertEquals(controller.runtime(session.id), undefined);
    assertEquals(
      controller.windowHost.controller.inspect().windows.some((window) => window.id === exomuxWindowId(session.id)),
      false,
    );
  } finally {
    controller.kernel.workspace.state.unsubscribe(failPublication);
    await controller.dispose();
  }
});

Deno.test("Exomux leaves controller and chrome inventory unchanged when refresh reconciliation fails", async () => {
  const host = new FakeExomuxHost();
  const session = host.seed("refresh-atomic", "refresh atomic");
  const client = host.client();
  const controller = await createExomuxController({ client });
  const failPublication = () => {
    throw new Error("exomux-refresh-publication-failed");
  };
  try {
    host.sessions.delete(session.id);
    host.outputs.delete(session.id);
    host.attachments.delete(session.id);
    controller.kernel.workspace.state.subscribe(failPublication);
    await controller.refreshSessions();
    controller.kernel.workspace.state.unsubscribe(failPublication);

    assert(controller.runtime(session.id));
    assertEquals(
      controller.windowHost.controller.inspect().windows.some((window) => window.id === exomuxWindowId(session.id)),
      true,
    );
    assertStringIncludes(controller.status.peek(), "Session refresh deferred");

    await controller.refreshSessions();
    assertEquals(controller.runtime(session.id), undefined);
    assertEquals(
      controller.windowHost.controller.inspect().windows.some((window) => window.id === exomuxWindowId(session.id)),
      false,
    );
  } finally {
    controller.kernel.workspace.state.unsubscribe(failPublication);
    await controller.dispose();
  }
});

class FakeExomuxHost {
  readonly sessions = new Map<string, MutableSession>();
  readonly outputs = new Map<string, ExomuxOutputFrame[]>();
  readonly attachments = new Map<string, Set<FakeExomuxClient>>();
  #ordinal = 0;
  #now = 1_800_000_000_000;

  seed(id = `session-${++this.#ordinal}`, title = id): ExomuxSessionSummary {
    const createdAt = this.#now++;
    const session: MutableSession = {
      id,
      title,
      commandLine: "/bin/sh",
      status: "running",
      running: true,
      columns: 80,
      rows: 24,
      sequence: 0,
      createdAt,
      updatedAt: createdAt,
    };
    this.sessions.set(id, session);
    this.outputs.set(id, []);
    return cloneSession(session);
  }

  client(): FakeExomuxClient {
    return new FakeExomuxClient(this);
  }

  emit(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("missing fake session");
    session.sequence += 1;
    session.updatedAt = this.#now++;
    const frame = { sessionId, sequence: session.sequence, data };
    this.outputs.get(sessionId)!.push(frame);
    for (const client of this.attachments.get(sessionId) ?? []) client.accept(frame, cloneSession(session));
  }

  nextId(): string {
    return `session-${++this.#ordinal}`;
  }
}

interface MutableSession {
  id: string;
  title: string;
  commandLine: string;
  status: "running" | "exited" | "failed";
  running: boolean;
  columns: number;
  rows: number;
  sequence: number;
  createdAt: number;
  updatedAt: number;
  exitCode?: number;
}

class FakeExomuxClient implements ExomuxClientPort {
  connected = true;
  killCalls = 0;
  rejectKill = false;
  detachCalls = 0;
  attachCalls = 0;
  delayDetach = false;
  delayResize = false;
  readonly inputs: Array<{ sessionId: string; data: string }> = [];
  readonly resizes: Array<{ sessionId: string; columns: number; rows: number }> = [];
  readonly #callbacks = new Map<
    string,
    { onOutput: (frame: ExomuxOutputFrame) => void; onSession?: (session: ExomuxSessionSummary) => void }
  >();
  readonly #pendingDetaches: Array<() => void> = [];
  readonly #pendingResizes: Array<() => void> = [];

  constructor(readonly host: FakeExomuxHost) {}

  list(): Promise<readonly ExomuxSessionSummary[]> {
    return Promise.resolve([...this.host.sessions.values()].map(cloneSession));
  }

  spawn(options: ExomuxSpawnOptions): Promise<ExomuxSessionSummary> {
    const session = this.host.seed(this.host.nextId(), options.title ?? "terminal");
    const mutable = this.host.sessions.get(session.id)!;
    mutable.commandLine = [options.command, ...(options.args ?? [])].join(" ");
    mutable.columns = options.columns ?? 80;
    mutable.rows = options.rows ?? 24;
    return Promise.resolve(cloneSession(mutable));
  }

  attach(
    sessionId: string,
    options: {
      readonly sinceSequence?: number;
      readonly onOutput: (frame: ExomuxOutputFrame) => void;
      readonly onSession?: (session: ExomuxSessionSummary) => void;
    },
  ): Promise<ExomuxAttachResult> {
    this.attachCalls += 1;
    const session = this.host.sessions.get(sessionId);
    if (!session) return Promise.reject(new Error("missing fake session"));
    this.#callbacks.set(sessionId, options);
    const clients = this.host.attachments.get(sessionId) ?? new Set<FakeExomuxClient>();
    clients.add(this);
    this.host.attachments.set(sessionId, clients);
    const since = options.sinceSequence ?? 0;
    return Promise.resolve({
      session: cloneSession(session),
      replay: (this.host.outputs.get(sessionId) ?? []).filter((frame) => frame.sequence > since),
      truncated: false,
    });
  }

  detach(sessionId: string): Promise<boolean> {
    this.detachCalls += 1;
    const finish = () => {
      this.#callbacks.delete(sessionId);
      this.host.attachments.get(sessionId)?.delete(this);
    };
    if (!this.delayDetach) {
      finish();
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      this.#pendingDetaches.push(() => {
        finish();
        resolve(true);
      });
    });
  }

  get pendingDetachCount(): number {
    return this.#pendingDetaches.length;
  }

  resolveNextDetach(): void {
    this.#pendingDetaches.shift()?.();
  }

  resolveAllDetaches(): void {
    for (const resolve of this.#pendingDetaches.splice(0)) resolve();
  }

  get pendingResizeCount(): number {
    return this.#pendingResizes.length;
  }

  resolveNextResize(): void {
    this.#pendingResizes.shift()?.();
  }

  resolveAllResizes(): void {
    for (const resolve of this.#pendingResizes.splice(0)) resolve();
  }

  input(sessionId: string, data: string | Uint8Array): Promise<boolean> {
    this.inputs.push({
      sessionId,
      data: typeof data === "string" ? data : new TextDecoder().decode(data),
    });
    return Promise.resolve(this.host.sessions.has(sessionId));
  }

  resize(sessionId: string, columns: number, rows: number): Promise<boolean> {
    this.resizes.push({ sessionId, columns, rows });
    const session = this.host.sessions.get(sessionId);
    if (!session) return Promise.resolve(false);
    const apply = () => {
      session.columns = columns;
      session.rows = rows;
    };
    if (!this.delayResize) {
      apply();
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      this.#pendingResizes.push(() => {
        apply();
        resolve(true);
      });
    });
  }

  kill(sessionId: string): Promise<boolean> {
    this.killCalls += 1;
    if (this.rejectKill) return Promise.resolve(false);
    this.#callbacks.delete(sessionId);
    this.host.attachments.delete(sessionId);
    this.host.outputs.delete(sessionId);
    return Promise.resolve(this.host.sessions.delete(sessionId));
  }

  shutdownHost(): Promise<boolean> {
    this.host.sessions.clear();
    this.host.outputs.clear();
    this.host.attachments.clear();
    return Promise.resolve(true);
  }

  dispose(): Promise<void> {
    this.connected = false;
    for (const sessionId of this.#callbacks.keys()) this.host.attachments.get(sessionId)?.delete(this);
    this.#callbacks.clear();
    return Promise.resolve();
  }

  accept(frame: ExomuxOutputFrame, summary: ExomuxSessionSummary): void {
    const callback = this.#callbacks.get(frame.sessionId);
    callback?.onOutput(frame);
    callback?.onSession?.(summary);
  }
}

function cloneSession(session: MutableSession): ExomuxSessionSummary {
  return { ...session };
}

Deno.test("Exomux refits floating windows that a smaller desktop would strand offscreen", async () => {
  const host = new FakeExomuxHost();
  const controller = await createExomuxController({ client: host.client() });
  try {
    const big = { column: 0, row: 1, width: 160, height: 48 };
    const session = await controller.spawn({ bounds: big, title: "floater" });
    assert(session);
    const windowId = exomuxWindowId(session.id);

    // Park it near the far corner of the large desktop.
    controller.windowHost.execute(
      {
        kind: "set-placement",
        id: windowId,
        placement: "floating",
        rect: { column: 120, row: 30, width: 34, height: 14 },
      },
      big,
    );
    const floatingRectOf = () =>
      controller.windowHost.controller.inspect().windows.find((window) => window.id === windowId)!.floatingRect!;
    const before = floatingRectOf();
    assertEquals(before, { column: 120, row: 30, width: 34, height: 14 });

    // Shrinking the desktop strands that corner; the reflow pulls it back on.
    const small = { column: 0, row: 1, width: 80, height: 24 };
    assertEquals(controller.reflowFloatingWindows(small), true);
    const after = floatingRectOf();
    assert(after.column >= small.column, "left edge on screen");
    assert(after.row >= small.row, "top edge on screen");
    assert(after.column + after.width <= small.column + small.width, "right edge on screen");
    assert(after.row + after.height <= small.row + small.height, "bottom edge on screen");
    // It shrank only as needed and never grew.
    assert(after.width <= before.width && after.height <= before.height);

    // A window that already fits is left exactly where it is, and a no-op reflow
    // reports no change so it never churns geometry needlessly.
    assertEquals(controller.reflowFloatingWindows(small), false);
    assertEquals(floatingRectOf(), after);

    // Growing the desktop back does not disturb a window that already fits.
    assertEquals(controller.reflowFloatingWindows(big), false);
    assertEquals(floatingRectOf(), after);
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux reflow re-centers a badly stranded window and cascades several", async () => {
  const host = new FakeExomuxHost();
  const controller = await createExomuxController({ client: host.client() });
  try {
    const big = { column: 0, row: 1, width: 200, height: 60 };
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const session = await controller.spawn({ bounds: big, title: `far-${index}` });
      assert(session);
      const id = exomuxWindowId(session.id);
      // Park each one entirely off a smaller desktop, all in the same spot.
      controller.windowHost.execute(
        { kind: "set-placement", id, placement: "floating", rect: { column: 180, row: 52, width: 30, height: 10 } },
        big,
      );
      ids.push(id);
    }
    const rectOf = (id: string) =>
      controller.windowHost.controller.inspect().windows.find((window) => window.id === id)!.floatingRect!;

    const small = { column: 0, row: 1, width: 80, height: 24 };
    assertEquals(controller.reflowFloatingWindows(small), true);
    const rects = ids.map(rectOf);
    for (const rect of rects) {
      assert(rect.column >= small.column, "left edge on screen");
      assert(rect.row >= small.row, "top edge on screen");
      assert(rect.column + rect.width <= small.column + small.width, "right edge on screen");
      assert(rect.row + rect.height <= small.row + small.height, "bottom edge on screen");
    }
    // The first stranded window is centered horizontally, not clamped to an edge.
    assertEquals(rects[0]!.column, small.column + Math.floor((small.width - 30) / 2));
    // Several rescued at once cascade rather than stacking on one column.
    assert(new Set(rects.map((rect) => rect.column)).size > 1, "cascaded windows must not share one column");
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux reflow nudges a slightly-off window instead of re-centering it", async () => {
  const host = new FakeExomuxHost();
  const controller = await createExomuxController({ client: host.client() });
  try {
    const bounds = { column: 0, row: 1, width: 80, height: 24 };
    const session = await controller.spawn({ bounds, title: "edge" });
    assert(session);
    const id = exomuxWindowId(session.id);
    // Mostly on screen, hanging a few columns off the right edge.
    controller.windowHost.execute(
      { kind: "set-placement", id, placement: "floating", rect: { column: 60, row: 6, width: 30, height: 10 } },
      bounds,
    );
    assertEquals(controller.reflowFloatingWindows(bounds), true);
    const rect = controller.windowHost.controller.inspect().windows.find((window) => window.id === id)!.floatingRect!;
    // Nudged just far enough to sit fully on screen — not yanked to the middle.
    assertEquals(rect, { column: 50, row: 6, width: 30, height: 10 });
  } finally {
    await controller.dispose();
  }
});

Deno.test("Exomux reflow leaves tiled and maximized windows to the layout", async () => {
  const host = new FakeExomuxHost();
  const controller = await createExomuxController({ client: host.client() });
  try {
    const big = { column: 0, row: 1, width: 160, height: 48 };
    const session = await controller.spawn({ bounds: big, title: "tiled" });
    assert(session);
    const windowId = exomuxWindowId(session.id);
    controller.windowHost.execute({ kind: "set-placement", id: windowId, placement: "tiled" }, big);

    // A tiled window is the layout's concern; reflow must not touch it.
    assertEquals(controller.reflowFloatingWindows({ column: 0, row: 1, width: 40, height: 12 }), false);
    assertEquals(
      controller.windowHost.controller.inspect().windows.find((window) => window.id === windowId)?.placement,
      "tiled",
    );
  } finally {
    await controller.dispose();
  }
});
