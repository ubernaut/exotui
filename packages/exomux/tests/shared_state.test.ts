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
