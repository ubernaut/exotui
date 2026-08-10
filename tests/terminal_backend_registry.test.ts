import { assertEquals } from "./deps.ts";
import { TerminalOutputController } from "../src/components/terminal_output.ts";
import {
  createDefaultTerminalBackendRegistry,
  createProcessTerminalBackendProvider,
  createSigmaPtyTerminalBackendFromConstructor,
  createSigmaPtyTerminalBackendProvider,
  DiagnosticsCollector,
  type SigmaPtyCommandOptions,
  type SigmaPtyLike,
  type SigmaPtySize,
  type TerminalBackend,
  TerminalBackendRegistry,
  type TerminalBackendSpawnOptions,
  type TerminalSessionHandle,
} from "../src/runtime/mod.ts";
import type { ProcessSessionCommand, ProcessSessionInspection, ProcessSessionStatus } from "../src/runtime/mod.ts";
import { createRuntimePermissionManifest } from "../src/permissions.ts";
import { parseLinuxProcessStat, sanitizeLinuxProcessTitle } from "../src/runtime/linux_foreground_process.ts";

Deno.test("Linux foreground process metadata parses stat names and sanitizes process titles", () => {
  const fields = [
    "S",
    "1",
    "123",
    "123",
    "34816",
    "456",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "20",
    "0",
    "1",
    "0",
    "999",
  ];
  assertEquals(parseLinuxProcessStat(`123 (strange ) name) ${fields.join(" ")}`), {
    pid: 123,
    parentPid: 1,
    processGroupId: 123,
    sessionId: 123,
    foregroundProcessGroupId: 456,
    startTime: "999",
  });
  assertEquals(sanitizeLinuxProcessTitle("\x1b]2;evil\x07\n  asciichurn\t"), "]2;evil asciichurn");
  assertEquals(parseLinuxProcessStat("malformed"), undefined);
});

Deno.test("terminal backend registry resolves the process backend by default", async () => {
  const registry = createDefaultTerminalBackendRegistry({ process: { id: "proc", label: "Proc" } });

  assertEquals(registry.ids(), ["proc"]);
  assertEquals(await registry.inspect(), [
    {
      id: "proc",
      label: "Proc",
      pty: false,
      priority: 0,
      detachable: false,
      reconnectable: false,
      available: true,
      backendId: "proc",
    },
  ]);

  const backend = await registry.resolve();
  assertEquals(backend?.id, "proc");
  assertEquals(backend?.pty, false);
});

Deno.test("terminal backend registry prefers available pty providers when requested", async () => {
  const registry = new TerminalBackendRegistry([
    createProcessTerminalBackendProvider({ id: "process" }),
    {
      id: "pty",
      label: "PTY",
      pty: true,
      permissionManifest: emptyPermissionManifest("terminal-backend:pty"),
      priority: 10,
      probe: () => ({ available: true }),
      create: () => new FakeTerminalBackend("pty", true),
    },
  ]);

  assertEquals((await registry.resolve())?.id, "pty");
  assertEquals((await registry.resolve({ preferPty: true }))?.id, "pty");
  assertEquals((await registry.resolve({ id: "process" }))?.id, "process");
});

Deno.test("terminal backend registry skips unavailable providers and can require pty", async () => {
  const registry = new TerminalBackendRegistry([
    {
      id: "broken-pty",
      label: "Broken PTY",
      pty: true,
      permissionManifest: emptyPermissionManifest("terminal-backend:broken-pty"),
      priority: 20,
      probe: () => ({ available: false, reason: "missing native library" }),
      create: () => new FakeTerminalBackend("broken-pty", true),
    },
    createProcessTerminalBackendProvider({ id: "process" }),
  ]);

  assertEquals((await registry.resolve({ preferPty: true }))?.id, "process");
  assertEquals(await registry.resolve({ requirePty: true }), undefined);
  assertEquals((await registry.inspect()).map((entry) => [entry.id, entry.available]), [
    ["broken-pty", false],
    ["process", true],
  ]);
});

Deno.test("terminal backend registry reports probe failures to diagnostics", async () => {
  const diagnostics = new DiagnosticsCollector();
  const registry = new TerminalBackendRegistry([
    {
      id: "throwing-pty",
      label: "Throwing PTY",
      pty: true,
      permissionManifest: emptyPermissionManifest("terminal-backend:throwing-pty"),
      probe: () => {
        throw new Error("native probe crashed");
      },
      create: () => new FakeTerminalBackend("throwing-pty", true),
    },
  ], { diagnostics });

  assertEquals(await registry.resolve({ requirePty: true }), undefined);
  assertEquals(diagnostics.entries().map((entry) => [entry.source, entry.code, entry.severity, entry.detail]), [
    ["terminal-backend", "probe-failed", "warning", "native probe crashed"],
  ]);
});

Deno.test("sigma pty backend provider stays lazy and supports injected modules", async () => {
  FakePty.instances = [];
  let instantiated = 0;
  const provider = createSigmaPtyTerminalBackendProvider({
    id: "ffi",
    label: "FFI",
    loader: () => ({
      Pty: FakePty,
      instantiate: () => {
        instantiated += 1;
        return Promise.resolve();
      },
    }),
  });
  const registry = new TerminalBackendRegistry([provider]);

  assertEquals(instantiated, 0);
  assertEquals(registry.permissionReport().required.map((entry) => [entry.kind, entry.operation, entry.target]), [
    ["subprocess", "spawn", "*"],
    ["ffi", "load", "jsr:@sigma/pty-ffi@0.42.0"],
  ]);
  assertEquals(registry.permissionReport().optional.map((entry) => [entry.kind, entry.operation, entry.target]), [
    ["read", "content", "/proc"],
  ]);
  assertEquals(instantiated, 0);
  assertEquals(await registry.inspect(), [
    {
      id: "ffi",
      label: "FFI",
      pty: true,
      priority: 100,
      detachable: false,
      reconnectable: false,
      available: true,
      backendId: "ffi",
    },
  ]);
  assertEquals(instantiated, 1);

  const backend = await registry.resolve({ requirePty: true });
  assertEquals(backend?.id, "ffi");
  assertEquals(instantiated, 1);
});

function emptyPermissionManifest(adapterId: string) {
  return createRuntimePermissionManifest({ adapterId, required: [] });
}

Deno.test("sigma pty terminal backend wraps output write resize and close lifecycle", async () => {
  FakePty.instances = [];
  const backend = createSigmaPtyTerminalBackendFromConstructor(FakePty, {
    id: "pty",
    label: "PTY",
    pollingIntervalMs: 5,
    now: fakeClock([10, 11, 12, 20]),
  });
  const rawChunks: string[] = [];
  const handle = backend.spawn({
    command: "bash",
    args: ["-lc", "echo hi"],
    columns: 100.8,
    rows: 30.2,
    onData: (data) => {
      rawChunks.push(String(data));
    },
  });
  const pty = FakePty.instances[0]!;

  assertEquals(handle.inspect(), {
    id: handle.id,
    backendId: "pty",
    pty: true,
    commandLine: 'bash -lc "echo hi"',
    status: "running",
    running: true,
    columns: 100,
    rows: 30,
    resizeSupported: true,
  });
  assertEquals(pty.pollingIntervalMs, 5);
  assertEquals(pty.resizes, [{ cols: 100, rows: 30 }]);

  assertEquals(await handle.write("pwd\n"), true);
  assertEquals(await handle.write(new TextEncoder().encode("ls\n")), true);
  assertEquals(pty.writes, ["pwd\n", "ls\n"]);

  assertEquals(await handle.resize(120.9, 40.1), true);
  assertEquals(pty.resizes.at(-1), { cols: 120, rows: 40 });
  pty.emit("hello\r\nworld\n");
  pty.finish(0);

  const closed = await handle.closed;
  assertEquals(closed.status, "exited");
  assertEquals(closed.exit?.code, 0);
  assertEquals(handle.output.inspect().lines.map((line) => [line.source, line.text]), [
    ["system", '$ bash -lc "echo hi"'],
    ["stdout", "hello"],
    ["stdout", "world"],
    ["system", "process exited code=0 duration=10ms"],
  ]);
  assertEquals(rawChunks, ["hello\r\nworld\n"]);

  await handle.dispose();
  assertEquals(pty.closed, true);
});

Deno.test("sigma pty terminal backend bounds fullscreen output without dropping raw PTY data", async () => {
  FakePty.instances = [];
  const backend = createSigmaPtyTerminalBackendFromConstructor(FakePty, {
    id: "pty",
    now: () => 100,
  });
  let rawBytes = 0;
  const handle = backend.spawn({
    command: "asciichurn",
    onData: (data) => {
      rawBytes += String(data).length;
    },
  });
  const pty = FakePty.instances[0]!;
  const chunk = "x".repeat(4 * 1024);
  const chunks = 2_048;

  for (let index = 0; index < chunks; index += 1) pty.emit(chunk);
  pty.finish(0);
  const closed = await handle.closed;

  assertEquals(closed.status, "exited");
  assertEquals(rawBytes, chunk.length * chunks);
  const output = handle.output.inspect().lines;
  assertEquals(
    output.filter((line) => line.source === "system" && line.text.includes("fragment truncated")).length,
    1,
  );
  const retained = output.find((line) => line.source === "stdout");
  assertEquals(retained?.text.length, 64 * 1024);
  assertEquals(retained?.text, "x".repeat(64 * 1024));
  await handle.dispose();
});

Deno.test("sigma pty terminal backend preserves UTF-8 split across raw byte reads", async () => {
  const encoded = new TextEncoder().encode("█");
  FakeBytePty.reads = [
    { data: encoded.slice(0, 2), done: false },
    { data: encoded.slice(2), done: false },
    { data: new Uint8Array(), done: true },
  ];
  const backend = createSigmaPtyTerminalBackendFromConstructor(FakeBytePty, {
    id: "byte-pty",
    pollingIntervalMs: 1,
    now: () => 100,
  });
  const raw: Uint8Array[] = [];
  const handle = backend.spawn({
    command: "blocks",
    onData: (data) => {
      raw.push(data instanceof Uint8Array ? data : new TextEncoder().encode(data));
    },
  });

  const closed = await handle.closed;

  assertEquals(closed.status, "exited");
  assertEquals(new TextDecoder().decode(concatBytes(raw)), "█");
  assertEquals(handle.output.inspect().lines.find((line) => line.source === "stdout")?.text, "█");
  await handle.dispose();
});

Deno.test("sigma pty terminal backend reports structured diagnostics for failures", async () => {
  FakePty.instances = [];
  const diagnostics = new DiagnosticsCollector();
  const backend = createSigmaPtyTerminalBackendFromConstructor(FakePty, {
    id: "pty",
    label: "PTY",
    diagnostics,
    now: fakeClock([30, 31, 32, 33, 34]),
  });
  const handle = backend.spawn({ command: "bash", columns: 80, rows: 24 });
  const pty = FakePty.instances[0]!;

  pty.failWrites = true;
  assertEquals(await handle.write("pwd\n"), false);
  pty.failResizes = true;
  assertEquals(await handle.resize(100, 40), false);
  pty.fail(new Error("read loop crashed"));

  const closed = await handle.closed;
  assertEquals(closed.status, "failed");
  assertEquals(handle.output.inspect().lines.map((line) => [line.source, line.text]), [
    ["system", "$ bash"],
    ["system", "input failed: write unavailable"],
    ["system", "resize failed: resize unavailable"],
    ["system", "pty failed: read loop crashed"],
  ]);
  assertEquals(diagnostics.entries().map((entry) => [entry.source, entry.code, entry.severity, entry.detail]), [
    ["terminal-pty", "input-failed", "warning", "write unavailable"],
    ["terminal-pty", "resize-failed", "warning", "resize unavailable"],
    ["terminal-pty", "read-failed", "error", "read loop crashed"],
  ]);
  assertEquals(diagnostics.entries().map((entry) => entry.context?.backendId), ["pty", "pty", "pty"]);
});

class FakeTerminalBackend implements TerminalBackend {
  readonly label: string;
  readonly detachable = false;
  readonly reconnectable = false;

  constructor(readonly id: string, readonly pty: boolean) {
    this.label = id;
  }

  spawn(options: TerminalBackendSpawnOptions): TerminalSessionHandle {
    return new FakeTerminalHandle(this.id, this.pty, options);
  }
}

class FakeTerminalHandle implements TerminalSessionHandle {
  readonly id = "fake";
  readonly command: ProcessSessionCommand;
  readonly output = new TerminalOutputController();
  readonly closed = Promise.resolve({ status: "exited" } as ProcessSessionInspection);

  constructor(readonly backendId: string, readonly pty: boolean, command: ProcessSessionCommand) {
    this.command = command;
  }

  write(): Promise<boolean> {
    return Promise.resolve(true);
  }

  resize(): Promise<boolean> {
    return Promise.resolve(this.pty);
  }

  kill(): Promise<boolean> {
    return Promise.resolve(true);
  }

  inspect() {
    const status: ProcessSessionStatus = "running";
    return {
      id: this.id,
      backendId: this.backendId,
      commandLine: this.command.command,
      status,
      running: true,
      columns: 80,
      rows: 24,
      resizeSupported: this.pty,
    };
  }

  dispose(): Promise<void> {
    this.output.dispose();
    return Promise.resolve();
  }
}

class FakePty implements SigmaPtyLike {
  static instances: FakePty[] = [];
  readonly writes: string[] = [];
  readonly resizes: SigmaPtySize[] = [];
  readonly readable: ReadableStream<string>;
  exitCode?: number;
  pollingIntervalMs?: number;
  closed = false;
  failWrites = false;
  failResizes = false;
  #controller!: ReadableStreamDefaultController<string>;

  constructor(readonly command: string, readonly options: SigmaPtyCommandOptions = {}) {
    FakePty.instances.push(this);
    this.readable = new ReadableStream<string>({
      start: (controller) => {
        this.#controller = controller;
      },
    });
  }

  write(data: string): void {
    if (this.failWrites) throw new Error("write unavailable");
    this.writes.push(data);
  }

  resize(size: SigmaPtySize): void {
    if (this.failResizes) throw new Error("resize unavailable");
    this.resizes.push({ ...size });
  }

  close(): void {
    this.closed = true;
  }

  setPollingInterval(ms: number): void {
    this.pollingIntervalMs = ms;
  }

  emit(text: string): void {
    this.#controller.enqueue(text);
  }

  finish(code: number): void {
    this.exitCode = code;
    this.#controller.close();
  }

  fail(error: Error): void {
    this.#controller.error(error);
  }
}

class FakeBytePty implements SigmaPtyLike {
  static reads: Array<{ data: Uint8Array; done: boolean }> = [];
  readonly readable = new ReadableStream<string>();
  readonly exitCode = 0;

  constructor(_command: string, _options: SigmaPtyCommandOptions = {}) {}

  readBytes(): { data: Uint8Array; done: boolean } {
    return FakeBytePty.reads.shift() ?? { data: new Uint8Array(), done: false };
  }

  write(_data: string): void {}
  resize(_size: SigmaPtySize): void {}
  close(): void {}
  setPollingInterval(_ms: number): void {}
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function fakeClock(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}

Deno.test("sigma pty terminal backend holds the poll loop while onData backpressure is pending", async () => {
  const reads: Array<{ data: Uint8Array; done: boolean }> = [
    { data: new TextEncoder().encode("first"), done: false },
    { data: new TextEncoder().encode("second"), done: false },
    { data: new Uint8Array(), done: true },
  ];
  let readCalls = 0;
  class CountingBytePty implements SigmaPtyLike {
    readonly readable = new ReadableStream<string>();
    readonly exitCode = 0;
    constructor(_command: string, _options: SigmaPtyCommandOptions = {}) {}
    readBytes(): { data: Uint8Array; done: boolean } {
      readCalls += 1;
      return reads.shift() ?? { data: new Uint8Array(), done: false };
    }
    write(_data: string): void {}
    resize(_size: SigmaPtySize): void {}
    close(): void {}
    setPollingInterval(_ms: number): void {}
  }
  const backend = createSigmaPtyTerminalBackendFromConstructor(CountingBytePty, {
    id: "gated-byte-pty",
    pollingIntervalMs: 1,
    now: () => 100,
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen: string[] = [];
  const handle = backend.spawn({
    command: "flood",
    onData: (data) => {
      seen.push(new TextDecoder().decode(data as Uint8Array));
      // Defer after the first chunk: the consumer is saturated.
      if (seen.length === 1) return gate;
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 30));
  assertEquals(seen, ["first"]);
  const stalledReads = readCalls;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assertEquals(readCalls, stalledReads, "the poll loop must not read while backpressure is pending");

  release();
  const closed = await handle.closed;
  assertEquals(closed.status, "exited");
  assertEquals(seen, ["first", "second"]);
  await handle.dispose();
});
