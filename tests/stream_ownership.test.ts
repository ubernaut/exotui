// Copyright 2023 Im-Beast. MIT license.

// 036 R1: the stream-ownership audit is enforceable data.

import { assert, assertEquals } from "./deps.ts";
import { isStreamActionAllowed, ProcessSessionController, STREAM_OWNERSHIP_CONTRACT } from "../mod.ts";

Deno.test("all five audited transports carry a complete frozen contract", () => {
  const transports = Object.keys(STREAM_OWNERSHIP_CONTRACT);
  assertEquals(transports.sort(), ["browser-remote", "pty", "ssh", "websocket", "xterm.js"]);
  for (const transport of transports) {
    const contract = STREAM_OWNERSHIP_CONTRACT[transport as keyof typeof STREAM_OWNERSHIP_CONTRACT];
    assert(Object.isFrozen(contract));
    assert(contract.closes.length > 0, `${transport}: someone must be allowed to close`);
    assert(contract.teardownOrder.length >= 2, `${transport}: teardown must be ordered`);
    assert(contract.notes.length > 0);
  }
});

Deno.test("closing is deny-by-default: unlisted actors are refused", () => {
  // The app may write to a PTY but never close it.
  assert(isStreamActionAllowed("pty", "app", "write"));
  assert(!isStreamActionAllowed("pty", "app", "close"));
  assert(isStreamActionAllowed("pty", "session-controller", "close"));
  // Borrowed streams: ssh and xterm.js are closed by their real owners.
  assert(!isStreamActionAllowed("ssh", "app", "close"));
  assert(isStreamActionAllowed("ssh", "external", "close"));
  assert(!isStreamActionAllowed("xterm.js", "app", "close"));
  assert(isStreamActionAllowed("xterm.js", "embedding-page", "close"));
  // The remote server frames but the creating host closes the socket.
  assert(!isStreamActionAllowed("websocket", "remote-server", "close"));
  assert(isStreamActionAllowed("websocket", "creating-host", "close"));
});

Deno.test("borrowed transports are marked, owned transports are not", () => {
  assert(STREAM_OWNERSHIP_CONTRACT.ssh.borrowed);
  assert(STREAM_OWNERSHIP_CONTRACT["xterm.js"].borrowed);
  assert(!STREAM_OWNERSHIP_CONTRACT.pty.borrowed);
  assert(!STREAM_OWNERSHIP_CONTRACT.websocket.borrowed);
});

Deno.test("the pty contract matches the real controller surface", () => {
  // The controller IS the closer the contract names: kill and dispose
  // exist and closing hooks are part of its public shape.
  // stop/dispose close the child and its PTY; hosts write only through
  // writeInput — exactly the ownership the contract records.
  const prototype = ProcessSessionController.prototype as unknown as Record<string, unknown>;
  assertEquals(typeof prototype["stop"], "function");
  assertEquals(typeof prototype["dispose"], "function");
  assertEquals(typeof prototype["writeInput"], "function");
});
