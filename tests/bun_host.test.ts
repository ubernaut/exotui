// Copyright 2026 ubernaut. MIT license.
import { assert, assertEquals } from "./deps.ts";
import { runtimeHost } from "../src/runtime/host.ts";
import { createBunPtyTerminalBackend } from "../src/runtime/bun_pty_backend.ts";

const bun = "Bun" in globalThis;

Deno.test({
  name: "Bun terminal receives native key, paste, focus and mouse input, resizes and restores modes",
  ignore: !bun,
  async fn() {
    let ready!: () => void;
    const started = new Promise<void>((resolve) => ready = resolve);
    let output = "";
    const decoder = new TextDecoder();
    const session = await createBunPtyTerminalBackend().spawn({
      command: runtimeHost.execPath(),
      args: [new URL("./fixtures/bun_terminal_input.ts", import.meta.url).pathname],
      columns: 80,
      rows: 24,
      onData(data) {
        output += typeof data === "string" ? data : decoder.decode(data, { stream: true });
        if (output.includes("__READY__")) ready();
      },
    });
    try {
      await started;
      assert(await session.resize(91, 29));
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert(await session.write("a\x1b[200~hello\x1b[201~\x1b[I\x1b[<0;3;4M\x1b[<0;3;4m\x1b[Oq"));
      const closed = await session.closed;
      assertEquals(closed.exit?.code, 0);
      const match = /__RESULT__(\{[^\r\n]+\})/.exec(output);
      assert(match, output);
      const result = JSON.parse(match[1]) as {
        events: { key: string; text?: string; focused?: boolean }[];
        size: { columns: number; rows: number };
        restored: boolean;
      };
      assertEquals(result.events.map((event) => event.key), ["a", "paste", "focus", "mouse", "mouse", "focus", "q"]);
      assertEquals(result.events[1].text, "hello");
      assertEquals(result.events[2].focused, true);
      assertEquals(result.events[5].focused, false);
      assertEquals(result.size, { columns: 91, rows: 29 });
      assert(result.restored);
      assert(output.includes("\x1b[?1049h") && output.includes("\x1b[?1049l"));
    } finally {
      await session.dispose();
    }
  },
});

Deno.test({
  name: "Bun host concurrent stdin reads preserve every byte",
  ignore: !bun,
  async fn() {
    const child = new runtimeHost.Command(runtimeHost.execPath(), {
      args: [new URL("./fixtures/bun_stdin.ts", import.meta.url).pathname],
      stdin: "piped",
    }).spawn();
    const writer = child.stdin.getWriter();
    const output = child.output();
    try {
      await writer.write(new TextEncoder().encode("ABCDEFGH"));
      await new Promise((resolve) => setTimeout(resolve, 20));
      await writer.write(new TextEncoder().encode("IJKL"));
      await writer.close();
      const result = await output;
      assertEquals(result.code, 0);
      assertEquals(new TextDecoder().decode(result.stdout).trim(), "ABCDEFGHIJKL");
    } finally {
      writer.releaseLock();
    }
  },
});

Deno.test({
  name: "Bun file writes truncate existing files and respect no-create append",
  ignore: !bun,
  async fn() {
    const directory = await runtimeHost.makeTempDir();
    const file = `${directory}/file`;
    try {
      await runtimeHost.writeTextFile(file, "long-content");
      await runtimeHost.writeTextFile(file, "x", { create: false });
      assertEquals(await runtimeHost.readTextFile(file), "x");
      const opened = await runtimeHost.open(file);
      try {
        assertEquals(opened.readSync(new Uint8Array(0)), 0);
        assertEquals(await opened.read(new Uint8Array(0)), 0);
      } finally {
        opened.close();
      }
      await runtimeHost.remove(file);
      let missing = false;
      try {
        await runtimeHost.writeTextFile(file, "y", { append: true, create: false });
      } catch (error) {
        missing = error instanceof runtimeHost.errors.NotFound;
      }
      assert(missing);
    } finally {
      await runtimeHost.remove(directory);
    }
  },
});

Deno.test({
  name: "Bun PTY disposal cancels an output consumer that never resolves",
  ignore: !bun,
  async fn() {
    let received!: () => void;
    const observed = new Promise<void>((resolve) => received = resolve);
    const session = await createBunPtyTerminalBackend().spawn({
      command: "/bin/sh",
      args: ["-c", "printf ready; sleep 30"],
      onData() {
        received();
        return new Promise<void>(() => {});
      },
    });
    try {
      await observed;
      await session.dispose();
      assertEquals(session.inspect().running, false);
    } finally {
      await session.dispose();
    }
  },
});

Deno.test({
  name: "Bun file watcher survives successive atomic replacements and closes pending reads",
  ignore: !bun,
  async fn() {
    const directory = await runtimeHost.makeTempDir();
    const target = `${directory}/state.json`;
    await runtimeHost.writeTextFile(target, "original");
    const watcher = runtimeHost.watchFs(target);
    const iterator = watcher[Symbol.asyncIterator]();
    try {
      for (const value of ["first", "second"]) {
        const next = iterator.next();
        await runtimeHost.writeTextFile(`${target}.tmp`, value);
        await runtimeHost.rename(`${target}.tmp`, target);
        const event = await next;
        assert(!event.done);
        assert(event.value.paths.includes(target));
        assertEquals(await runtimeHost.readTextFile(target), value);
      }
      watcher.close();
      assertEquals((await iterator.next()).done, true);
    } finally {
      watcher.close();
      await runtimeHost.remove(directory, { recursive: true });
    }
  },
});

Deno.test({
  name: "Bun native PTY drains large output through an asynchronous consumer before closing",
  ignore: !bun,
  async fn() {
    const expected = "abcdefghijklmnop".repeat(65536);
    const chunks: Uint8Array[] = [];
    const backend = createBunPtyTerminalBackend();
    const session = await backend.spawn({
      command: runtimeHost.execPath(),
      args: ["--eval", `process.stdout.write(${JSON.stringify("abcdefghijklmnop")}.repeat(65536))`],
      columns: 80,
      rows: 24,
      async onData(data) {
        chunks.push(typeof data === "string" ? new TextEncoder().encode(data) : data.slice());
        await new Promise((resolve) => setTimeout(resolve, 2));
      },
    });
    try {
      const result = await session.closed;
      assertEquals(result.exit?.code, 0);
      const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      assertEquals(length, expected.length);
      const actual = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        actual.set(chunk, offset);
        offset += chunk.length;
      }
      assertEquals(new TextDecoder().decode(actual), expected);
    } finally {
      await session.dispose();
    }
  },
});

Deno.test({
  name: "Bun HTTP shutdown flushes the final WebSocket acknowledgement",
  ignore: !bun,
  async fn() {
    const controller = new AbortController();
    const server = runtimeHost.serve({ hostname: "127.0.0.1", port: 0, signal: controller.signal }, (request) => {
      const { socket, response } = runtimeHost.upgradeWebSocket(request);
      socket.onmessage = () => {
        socket.send("shutdown-ack");
        socket.close(1000);
        controller.abort();
      };
      return response;
    });
    const client = new WebSocket(`ws://127.0.0.1:${server.addr.port}`);
    try {
      const acknowledgement = new Promise<string>((resolve, reject) => {
        client.onmessage = (event) => resolve(String(event.data));
        client.onerror = () => reject(new Error("WebSocket failed"));
      });
      const closed = new Promise<void>((resolve) => client.onclose = () => resolve());
      await new Promise<void>((resolve, reject) => {
        client.onopen = () => resolve();
        client.onerror = () => reject(new Error("WebSocket failed to open"));
      });
      client.send("shutdown");
      assertEquals(await acknowledgement, "shutdown-ack");
      await closed;
      await server.finished;
    } finally {
      client.close();
      controller.abort();
      await server.finished;
    }
  },
});
