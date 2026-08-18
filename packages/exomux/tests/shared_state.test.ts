import { assert, assertEquals } from "./deps.ts";
import { createExomuxController } from "../controller.ts";
import { FakeExomuxClient, session } from "./fakes.ts";

// Plan 041 phase A. Two clients attached to one daemon: a terminal closed on
// one must not survive as a dead frame on the other. The daemon already
// broadcasts the final state to every client; the observer used to keep the
// window forever because its handler could only ADD sessions.

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

Deno.test("a terminal closed by another client stops being a window here", async () => {
  const sessions = [session("shared-one", "shell one", 0), session("shared-two", "shell two", 1)];
  const client = new FakeExomuxClient(sessions);
  const observer = await createExomuxController({ client, initialSessions: sessions });
  try {
    await observer.ready;
    assertEquals(observer.sessions.peek().length, 2);

    // Another client killed it: the daemon broadcasts the final not-running
    // state and drops the session.
    const closed = { ...sessions[1]!, running: false, status: "exited" as const };
    client.emitSessionRemoved(closed);

    await waitFor(() => observer.sessions.peek().length === 1, "the closed terminal to disappear");
    assertEquals(observer.sessions.peek().map((entry) => entry.id), ["shared-one"]);
    assert(
      !observer.windowHost.controller.inspect().windows.some((window) => window.id === "terminal-shared-two"),
      "its window is gone too, not left as a dead frame",
    );
  } finally {
    await observer.dispose();
  }
});

Deno.test("a terminal that merely exited is kept, because the daemon still has it", async () => {
  const sessions = [session("keep-one", "shell one", 0)];
  const client = new FakeExomuxClient(sessions);
  const observer = await createExomuxController({ client, initialSessions: sessions });
  try {
    await observer.ready;
    // A shell that exits on its own stays in the daemon's list, so exomux
    // keeps showing it — the Sessions panel labels it, and it is still there
    // to read. Only a session the daemon has dropped is swept.
    client.broadcastSession({ ...sessions[0]!, running: false, status: "exited" });
    await new Promise((resolve) => setTimeout(resolve, 120));
    assertEquals(observer.sessions.peek().length, 1, "an exited-but-listed terminal is not swept");
  } finally {
    await observer.dispose();
  }
});

Deno.test("a local kill is not raced by the sweep", async () => {
  const sessions = [session("race-one", "shell one", 0), session("race-two", "shell two", 1)];
  const client = new FakeExomuxClient(sessions);
  const controller = await createExomuxController({ client, initialSessions: sessions });
  try {
    await controller.ready;
    // The initiator's own kill removes the window; the broadcast it also
    // receives must not double-remove or throw.
    const killed = await controller.killSession("race-two");
    assertEquals(killed, true);
    client.emitSessionRemoved({ ...sessions[1]!, running: false, status: "exited" });
    await new Promise((resolve) => setTimeout(resolve, 120));
    assertEquals(controller.sessions.peek().map((entry) => entry.id), ["race-one"]);
  } finally {
    await controller.dispose();
  }
});

// Plan 041 phase C: appearance is a property of the desktop, not of one
// client's screen. Two controllers on one host adopt each other's theme.

Deno.test("changing the theme on one client changes it on the other", async () => {
  const sessions = [session("pref-one", "shell", 0)];
  const client = new FakeExomuxClient(sessions);
  const first = await createExomuxController({ client, initialSessions: sessions });
  const second = await createExomuxController({ client, initialSessions: sessions });
  try {
    await first.ready;
    await second.ready;
    assertEquals(second.themeId.peek(), first.themeId.peek());

    first.setTheme("matrix");
    await waitFor(() => second.themeId.peek() === "matrix", "the other client to adopt the theme");

    // And the other direction, so adoption does not disable publishing.
    second.setBackground("circuit");
    await waitFor(() => first.backgroundId.peek() === "circuit", "the background to travel back");
  } finally {
    await first.dispose();
    await second.dispose();
  }
});

Deno.test("a global setting travels between clients", async () => {
  const client = new FakeExomuxClient([]);
  const first = await createExomuxController({ client, initialSessions: [] });
  const second = await createExomuxController({ client, initialSessions: [] });
  try {
    await first.ready;
    await second.ready;
    first.globalSettings.value = { ...first.globalSettings.peek(), borderStyle: "ascii" };
    // Settings publish through the same persist path the UI uses.
    first.setTheme(first.themeId.peek() === "matrix" ? "amber" : "matrix");
    await waitFor(
      () => second.globalSettings.peek().borderStyle === "ascii",
      "the border style to travel",
    );
  } finally {
    await first.dispose();
    await second.dispose();
  }
});

Deno.test("a client attaching later adopts the desktop as it already is", async () => {
  const client = new FakeExomuxClient([]);
  const first = await createExomuxController({ client, initialSessions: [] });
  try {
    await first.ready;
    first.setTheme("paper");
    await waitFor(() => true, "publish to settle");

    const late = await createExomuxController({ client, initialSessions: [] });
    try {
      await late.ready;
      await waitFor(() => late.themeId.peek() === "paper", "the late client to adopt the current theme");
    } finally {
      await late.dispose();
    }
  } finally {
    await first.dispose();
  }
});

// Plan 041 phase D: window LIFECYCLE is a property of the desktop; geometry
// and viewport-driven state are properties of one screen and stay local.

function windowState(
  controller: { windowHost: { controller: { inspect(): { windows: readonly { id: string; state: string }[] } } } },
  id: string,
): string | undefined {
  return controller.windowHost.controller.inspect().windows.find((window) => window.id === id)?.state;
}

Deno.test("closing a window on one client closes it on the other", async () => {
  const sessions = [session("win-one", "shell one", 0), session("win-two", "shell two", 1)];
  const client = new FakeExomuxClient(sessions);
  const first = await createExomuxController({ client, initialSessions: sessions });
  const second = await createExomuxController({ client, initialSessions: sessions });
  try {
    await first.ready;
    await second.ready;
    const id = "terminal-win-two";
    assertEquals(windowState(second, id), windowState(first, id));

    first.windowHost.execute({ kind: "close", id }, { column: 0, row: 0, width: 120, height: 36 });
    await waitFor(() => windowState(second, id) === "closed", "the close to travel");

    // And it comes back, so the shared set is state and not a one-way latch.
    first.windowHost.execute({ kind: "restore", id }, { column: 0, row: 0, width: 120, height: 36 });
    await waitFor(() => windowState(second, id) !== "closed", "the reopen to travel");
  } finally {
    await first.dispose();
    await second.dispose();
  }
});

Deno.test("putting a window away travels between roomy clients", async () => {
  const sessions = [session("min-one", "shell one", 0), session("min-two", "shell two", 1)];
  const client = new FakeExomuxClient(sessions);
  const first = await createExomuxController({ client, initialSessions: sessions });
  const second = await createExomuxController({ client, initialSessions: sessions });
  try {
    await first.ready;
    await second.ready;
    const bounds = { column: 0, row: 0, width: 120, height: 36 };
    first.applyViewportLayout(bounds);
    second.applyViewportLayout(bounds);
    const id = "terminal-min-two";

    first.windowHost.execute({ kind: "minimize", id }, bounds);
    await waitFor(() => windowState(second, id) === "minimized", "the minimize to travel");

    second.windowHost.execute({ kind: "restore", id }, bounds);
    await waitFor(() => windowState(first, id) !== "minimized", "the restore to travel back");
  } finally {
    await first.dispose();
    await second.dispose();
  }
});

Deno.test("a phone shares its closes but never imposes its one-window layout", async () => {
  const sessions = [session("mob-one", "shell one", 0), session("mob-two", "shell two", 1)];
  const client = new FakeExomuxClient(sessions);
  const desk = await createExomuxController({ client, initialSessions: sessions });
  const phone = await createExomuxController({ client, initialSessions: sessions });
  try {
    await desk.ready;
    await phone.ready;
    const roomy = { column: 0, row: 0, width: 120, height: 36 };
    const narrow = { column: 0, row: 0, width: 40, height: 30 };
    desk.applyViewportLayout(roomy);
    phone.applyViewportLayout(narrow);
    assert(phone.mobileLayout(narrow), "40 columns is the mobile layout");

    // Showing one window on a phone puts the others away. That is navigation
    // on a small screen, not a statement about the desktop.
    phone.presentWindow("terminal-mob-one", narrow);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assertEquals(
      windowState(desk, "terminal-mob-two"),
      "normal",
      "the roomy client keeps showing the window the phone tucked away",
    );

    // A close is deliberate on any screen, so it still travels.
    phone.windowHost.execute({ kind: "close", id: "terminal-mob-two" }, narrow);
    await waitFor(() => windowState(desk, "terminal-mob-two") === "closed", "the phone's close to travel");
  } finally {
    await desk.dispose();
    await phone.dispose();
  }
});
