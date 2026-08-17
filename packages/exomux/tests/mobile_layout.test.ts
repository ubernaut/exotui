import { assert, assertEquals } from "./deps.ts";
import { createTestTerminalApp } from "@ubernaut/deno-tui/testing";
import { createExomuxController } from "../controller.ts";
import { createExomuxTerminalOptions, type ExomuxAppMountRef } from "../app.ts";
import { EXOMUX_NETWORK_WINDOW_ID, EXOMUX_SESSIONS_WINDOW_ID, EXOMUX_SETTINGS_WINDOW_ID } from "../controller.ts";
import { exomuxViewportIsMobile } from "../model.ts";
import { FakeExomuxClient, session } from "./fakes.ts";

// A phone-sized terminal cannot carry the floating desktop: the default window
// rects alone (settings wants 64x30) do not fit, so a resumed workspace used to
// come back with windows hanging off the screen. On a viewport this small the
// desktop hands the whole body to one window at a time.

const PHONE = { columns: 44, rows: 26 };
const DESKTOP = { columns: 120, rows: 36 };

async function mountExomux(size: { columns: number; rows: number }, sessions: ReturnType<typeof session>[] = []) {
  const client = new FakeExomuxClient(sessions);
  const controller = await createExomuxController({ client, initialSessions: sessions });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size });
  const mounted = mount.current;
  assert(mounted);
  await harness.pilot.settle();
  await mounted.whenIdle();
  return {
    controller,
    harness,
    mounted,
    /** Every window the desktop is currently drawing. */
    painted: () => {
      const projection = mounted.windowProjection.peek();
      return [...projection.tiledWindows, ...projection.floatingWindows];
    },
    /** Painted windows with any part outside the body area. */
    offscreen: () => {
      const body = mounted.bodyRect.peek();
      const projection = mounted.windowProjection.peek();
      return [...projection.tiledWindows, ...projection.floatingWindows].filter((window) =>
        window.rect.column < body.column || window.rect.row < body.row ||
        window.rect.column + window.rect.width > body.column + body.width ||
        window.rect.row + window.rect.height > body.row + body.height
      );
    },
    maximizedId: () => controller.windowHost.controller.inspect().maximizedWindowId,
    dispose: async () => {
      harness.destroy();
      await controller.dispose();
    },
  };
}

Deno.test("the mobile threshold answers on columns and on rows", () => {
  assert(exomuxViewportIsMobile({ width: 44, height: 40 }), "a narrow portrait phone is mobile");
  assert(exomuxViewportIsMobile({ width: 90, height: 17 }), "a short landscape phone is mobile");
  assertEquals(exomuxViewportIsMobile({ width: 120, height: 35 }), false, "a desktop terminal is not");
  assertEquals(exomuxViewportIsMobile({ width: 80, height: 24 }), false, "the classic terminal keeps its desktop");
});

Deno.test("a session resumed on a phone comes back on screen, not off it", async () => {
  const sessions = [session("s-one", "shell one", 0), session("s-two", "shell two", 1)];
  const exomux = await mountExomux(PHONE, sessions);
  try {
    const painted = exomux.painted();
    assertEquals(exomux.offscreen(), [], "no window hangs off a phone screen");
    assertEquals(painted.length, 1, "exactly one window owns the body");
    const body = exomux.mounted.bodyRect.peek();
    assertEquals(painted[0]!.rect, body, "and it fills it");
    // The resumed terminal is what the user came back for, not a panel.
    assertEquals(exomux.maximizedId(), "terminal-s-one");
  } finally {
    await exomux.dispose();
  }
});

Deno.test("panels take the whole phone screen too, not just terminals", async () => {
  const exomux = await mountExomux(PHONE, [session("s-one", "shell one", 0)]);
  try {
    const body = exomux.mounted.bodyRect.peek();
    for (
      const [label, open] of [
        ["settings", () => exomux.controller.openGlobalConfig(body)],
        ["network", () => exomux.controller.toggleNetworkPanel(body)],
        ["sessions", () => exomux.controller.openSessionManager(body)],
      ] as const
    ) {
      open();
      await exomux.mounted.whenIdle();
      await exomux.harness.pilot.settle();
      const painted = exomux.painted();
      assertEquals(exomux.offscreen(), [], `${label} stays on screen`);
      assertEquals(painted.length, 1, `${label} is the only window drawn`);
      assertEquals(painted[0]!.rect, body, `${label} fills the body`);
    }
    assertEquals(exomux.maximizedId(), EXOMUX_SESSIONS_WINDOW_ID);
  } finally {
    await exomux.dispose();
  }
});

Deno.test("growing the terminal hands the desktop back, and shrinking takes it again", async () => {
  const sessions = [session("s-one", "shell one", 0), session("s-two", "shell two", 1)];
  const exomux = await mountExomux(PHONE, sessions);
  try {
    assertEquals(exomux.maximizedId(), "terminal-s-one");

    await exomux.harness.pilot.resize(DESKTOP.columns, DESKTOP.rows);
    await exomux.mounted.whenIdle();
    assertEquals(exomux.maximizedId(), undefined, "a roomy terminal is a desktop again");
    assert(exomux.painted().length > 1, "windows come back side by side");
    assertEquals(exomux.offscreen(), [], "and none of them is stranded");

    await exomux.harness.pilot.resize(PHONE.columns, PHONE.rows);
    await exomux.mounted.whenIdle();
    assertEquals(exomux.painted().length, 1, "shrinking returns to one window");
    assertEquals(exomux.offscreen(), []);
  } finally {
    await exomux.dispose();
  }
});

Deno.test("minimizing the full-screen window promotes the next one", async () => {
  const exomux = await mountExomux(PHONE, [session("s-one", "shell one", 0)]);
  try {
    const body = exomux.mounted.bodyRect.peek();
    exomux.controller.openGlobalConfig(body);
    await exomux.mounted.whenIdle();
    assertEquals(exomux.maximizedId(), EXOMUX_SETTINGS_WINDOW_ID);

    // Closing settings tucks it away: the screen must not be left empty.
    exomux.controller.closeGlobalConfig(body);
    await exomux.mounted.whenIdle();
    await exomux.harness.pilot.settle();
    const promoted = exomux.maximizedId();
    assert(promoted && promoted !== EXOMUX_SETTINGS_WINDOW_ID, "another window takes the screen");
    assertEquals(exomux.painted().length, 1);
    assertEquals(exomux.painted()[0]!.rect, body);
  } finally {
    await exomux.dispose();
  }
});

Deno.test("restoring a window by hand is respected until the next switch", async () => {
  const exomux = await mountExomux(PHONE, [session("s-one", "shell one", 0)]);
  try {
    const body = exomux.mounted.bodyRect.peek();
    const maximized = exomux.maximizedId();
    assert(maximized);

    // The titlebar restore control still means what it says.
    exomux.controller.windowHost.execute({ kind: "restore", id: maximized }, body);
    await exomux.mounted.whenIdle();
    await exomux.harness.pilot.settle();
    assertEquals(exomux.maximizedId(), undefined, "the desktop does not immediately re-maximize it");

    // Switching windows puts the mobile layout back in charge.
    exomux.controller.openSessionManager(body);
    await exomux.mounted.whenIdle();
    assertEquals(exomux.maximizedId(), EXOMUX_SESSIONS_WINDOW_ID);
  } finally {
    await exomux.dispose();
  }
});

Deno.test("the mobile-layout setting overrides the size test in both directions", async () => {
  const phone = await mountExomux(PHONE, [session("s-one", "shell one", 0)]);
  try {
    phone.controller.globalSettings.value = { ...phone.controller.globalSettings.peek(), mobileLayout: "off" };
    await phone.harness.pilot.resize(PHONE.columns, PHONE.rows - 1);
    await phone.mounted.whenIdle();
    assertEquals(phone.maximizedId(), undefined, "off keeps the floating desktop on a phone");
  } finally {
    await phone.dispose();
  }

  const desktop = await mountExomux(DESKTOP, [session("s-one", "shell one", 0)]);
  try {
    assertEquals(desktop.maximizedId(), undefined);
    desktop.controller.globalSettings.value = { ...desktop.controller.globalSettings.peek(), mobileLayout: "on" };
    await desktop.harness.pilot.resize(DESKTOP.columns, DESKTOP.rows - 1);
    await desktop.mounted.whenIdle();
    assert(desktop.maximizedId(), "on forces one full-screen window on a desktop");
    assertEquals(desktop.painted().length, 1);
  } finally {
    await desktop.dispose();
  }
});

Deno.test("the network panel is reachable on a phone even while another window is full screen", async () => {
  const exomux = await mountExomux(PHONE, [session("s-one", "shell one", 0)]);
  try {
    const body = exomux.mounted.bodyRect.peek();
    // Focus alone cannot do this: the host refuses to focus a window that a
    // maximized peer is hiding, which is what made panels unreachable.
    assert(exomux.maximizedId());
    exomux.controller.toggleNetworkPanel(body);
    await exomux.mounted.whenIdle();
    assertEquals(exomux.maximizedId(), EXOMUX_NETWORK_WINDOW_ID);
    assertEquals(exomux.painted()[0]!.rect, body);
  } finally {
    await exomux.dispose();
  }
});
