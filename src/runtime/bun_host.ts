// Copyright 2026 ubernaut. MIT license.
// Loaded only in a Bun process, never by a browser or Deno entrypoint.
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as net from "node:net";
import * as util from "node:util";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";
import { spawnSync } from "node:child_process";
import type {
  RuntimeChildProcess,
  RuntimeCommandOptions,
  RuntimeCommandOutput,
  RuntimeCommandStatus,
  RuntimeConn,
  RuntimeDirEntry,
  RuntimeFile,
  RuntimeFileInfo,
  RuntimeFsEvent,
  RuntimeHost,
  RuntimeHttpServer,
  RuntimeNetAddr,
  RuntimeOpenOptions,
  RuntimeServeOptions,
  RuntimeSignal,
  RuntimeUnixAddr,
  RuntimeWatcher,
  RuntimeWriteOptions,
} from "./host_types.ts";

interface NativeProcess {
  pid: number;
  stdin: { write(data: Uint8Array): number; flush(): void | Promise<void>; end(): void } | number | null;
  stdout: ReadableStream<Uint8Array> | number | null;
  stderr: ReadableStream<Uint8Array> | number | null;
  exited: Promise<number>;
  signalCode: string | number | null;
  kill(signal?: string): void;
  ref(): void;
  unref(): void;
}
interface NativeSocket {
  data: SocketBridge;
  readyState: number;
  bufferedAmount: number;
  send(data: string | ArrayBuffer | Uint8Array): number;
  close(code?: number, reason?: string): void;
}
interface NativeServer {
  hostname: string;
  port: number;
  stop(closeActive?: boolean): void | Promise<void>;
  ref(): void;
  unref(): void;
  upgrade(request: Request, options: { data: SocketBridge; headers?: Headers }): boolean;
}
interface NativeBun {
  version: string;
  spawn(args: string[], options: Record<string, unknown>): NativeProcess;
  serve(options: Record<string, unknown>): NativeServer;
}
const bun = (globalThis as unknown as { Bun: NativeBun }).Bun;
const filename = (value: string | URL): string => value instanceof URL ? fileURLToPath(value) : value;

const errorNames: Record<string, string> = {
  ENOENT: "NotFound",
  EEXIST: "AlreadyExists",
  EACCES: "PermissionDenied",
  EPERM: "PermissionDenied",
  EBADF: "BadResource",
  EAGAIN: "WouldBlock",
  EPIPE: "BrokenPipe",
  ECONNREFUSED: "ConnectionRefused",
  ECONNRESET: "ConnectionReset",
  EISDIR: "IsADirectory",
  ENOTDIR: "NotADirectory",
  ENOTEMPTY: "DirectoryNotEmpty",
  ETIMEDOUT: "TimedOut",
};
const errors: RuntimeHost["errors"] = {};
for (
  const name of new Set([
    ...Object.values(errorNames),
    "NotCapable",
    "Interrupted",
    "NotSupported",
    "InvalidData",
    "Busy",
  ])
) {
  errors[name] = class extends Error {
    constructor(message = name) {
      super(message);
      this.name = name;
    }
  };
}
function translated(error: unknown): Error {
  if (error instanceof Error && "code" in error) {
    const name = errorNames[String(error.code)];
    if (name) return Object.assign(new errors[name]!(error.message), { code: error.code, cause: error });
  }
  return error instanceof Error ? error : new Error(String(error));
}
function sync<T>(action: () => T): T {
  try {
    return action();
  } catch (e) {
    throw translated(e);
  }
}
async function asyncCall<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (e) {
    throw translated(e);
  }
}
function info(stat: fs.Stats): RuntimeFileInfo {
  return {
    isFile: stat.isFile(),
    isDirectory: stat.isDirectory(),
    isSymlink: stat.isSymbolicLink(),
    size: stat.size,
    mtime: stat.mtime,
    atime: stat.atime,
    birthtime: stat.birthtime,
    ctime: stat.ctime,
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    nlink: stat.nlink,
    uid: stat.uid,
    gid: stat.gid,
    rdev: stat.rdev,
    blksize: stat.blksize,
    blocks: stat.blocks,
    isBlockDevice: stat.isBlockDevice(),
    isCharDevice: stat.isCharacterDevice(),
    isFifo: stat.isFIFO(),
    isSocket: stat.isSocket(),
  };
}
function entry(value: fs.Dirent): RuntimeDirEntry {
  return {
    name: value.name,
    isFile: value.isFile(),
    isDirectory: value.isDirectory(),
    isSymlink: value.isSymbolicLink(),
  };
}
function openFlags(options: RuntimeOpenOptions = { read: true }): number {
  if (!(options.read || options.write || options.append)) throw new TypeError("An open mode is required");
  let flags = options.read && (options.write || options.append)
    ? fs.constants.O_RDWR
    : options.write || options.append
    ? fs.constants.O_WRONLY
    : fs.constants.O_RDONLY;
  if (options.append) flags |= fs.constants.O_APPEND;
  if (options.create || options.createNew) flags |= fs.constants.O_CREAT;
  if (options.createNew) flags |= fs.constants.O_EXCL;
  if (options.truncate) flags |= fs.constants.O_TRUNC;
  return flags;
}
class BunFile implements RuntimeFile {
  #closed = false;
  #readable?: ReadableStream<Uint8Array>;
  #writable?: WritableStream<Uint8Array>;
  constructor(readonly fd: number, readonly owned = true) {}
  get readable(): ReadableStream<Uint8Array> {
    return this.#readable ??= new ReadableStream({
      pull: async (controller) => {
        const buffer = new Uint8Array(64 * 1024);
        const n = await this.read(buffer);
        if (n === null) {
          controller.close();
          if (this.owned) this.close();
        } else controller.enqueue(buffer.slice(0, n));
      },
      cancel: () => {
        if (this.owned) this.close();
      },
    });
  }
  get writable(): WritableStream<Uint8Array> {
    return this.#writable ??= new WritableStream({
      write: async (data) => {
        let offset = 0;
        while (offset < data.length) offset += await this.write(data.subarray(offset));
      },
      close: () => {
        if (this.owned) this.close();
      },
      abort: () => {
        if (this.owned) this.close();
      },
    });
  }
  readSync(data: Uint8Array): number | null {
    if (data.length === 0) return 0;
    return sync(() => {
      const n = fs.readSync(this.fd, data, 0, data.length, null);
      return n === 0 ? null : n;
    });
  }
  read(data: Uint8Array): Promise<number | null> {
    if (data.length === 0) return Promise.resolve(0);
    return new Promise((resolve, reject) =>
      fs.read(this.fd, data, 0, data.length, null, (e, n) => e ? reject(translated(e)) : resolve(n === 0 ? null : n))
    );
  }
  writeSync(data: Uint8Array): number {
    return sync(() => fs.writeSync(this.fd, data, 0, data.length));
  }
  write(data: Uint8Array): Promise<number> {
    return new Promise((resolve, reject) =>
      fs.write(this.fd, data, 0, data.length, (e, n) => e ? reject(translated(e)) : resolve(n))
    );
  }
  statSync(): RuntimeFileInfo {
    return sync(() => info(fs.fstatSync(this.fd)));
  }
  async stat(): Promise<RuntimeFileInfo> {
    return this.statSync();
  }
  syncSync(): void {
    sync(() => fs.fsyncSync(this.fd));
  }
  async sync(): Promise<void> {
    this.syncSync();
  }
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.owned) sync(() => fs.closeSync(this.fd));
  }
  isTerminal(): boolean {
    return this.fd === 0
      ? Boolean(process.stdin.isTTY)
      : this.fd === 1
      ? Boolean(process.stdout.isTTY)
      : Boolean(process.stderr.isTTY);
  }
}

// One shared input owner: both read() and readable consume the same bounded Node stream.
class StdinReader {
  #tail: Uint8Array = new Uint8Array(0);
  #readable?: ReadableStream<Uint8Array>;
  #reads: Promise<void> = Promise.resolve();
  #interrupt?: () => void;
  isTerminal(): boolean {
    return Boolean(process.stdin.isTTY);
  }
  read(data: Uint8Array): Promise<number | null> {
    const result = this.#reads.then(() => this.#read(data));
    this.#reads = result.then(() => {}, () => {});
    return result;
  }
  async #read(data: Uint8Array): Promise<number | null> {
    if (data.length === 0) return 0;
    if (this.#tail.length === 0) {
      let chunk = process.stdin.read() as Buffer | null;
      if (chunk === null && !process.stdin.readableEnded) {
        chunk = await new Promise<Buffer | null>((resolve, reject) => {
          const cleanup = () => {
            process.stdin.off("readable", readable);
            process.stdin.off("end", end);
            process.stdin.off("error", error);
            this.#interrupt = undefined;
          };
          const readable = () => {
            const value = process.stdin.read() as Buffer | null;
            if (value !== null) {
              cleanup();
              resolve(value);
            }
          };
          const end = () => {
            cleanup();
            resolve(null);
          };
          const error = (value: Error) => {
            cleanup();
            reject(translated(value));
          };
          this.#interrupt = end;
          process.stdin.on("readable", readable);
          process.stdin.once("end", end);
          process.stdin.once("error", error);
          readable();
        });
      }
      if (chunk === null) return null;
      this.#tail = chunk;
    }
    const count = Math.min(data.length, this.#tail.length);
    data.set(this.#tail.subarray(0, count));
    this.#tail = this.#tail.slice(count);
    return count;
  }
  get readable(): ReadableStream<Uint8Array> {
    return this.#readable ??= new ReadableStream({
      pull: async (controller) => {
        const data = new Uint8Array(64 * 1024);
        const count = await this.read(data);
        count === null ? controller.close() : controller.enqueue(data.slice(0, count));
      },
      cancel: () => {
        this.#interrupt?.();
        process.stdin.pause();
      },
    });
  }
  setRaw(mode: boolean, options?: { cbreak?: boolean }): void {
    if (!process.stdin.isTTY) throw new errors.BadResource!("stdin is not a terminal");
    // cbreak must retain kernel signal handling. Node raw mode alone clears ISIG.
    process.stdin.setRawMode(mode);
    if (mode && options?.cbreak && process.platform !== "win32") {
      const result = spawnSync("stty", ["isig"], { stdio: [0, "ignore", "pipe"] });
      if (result.status !== 0) {
        process.stdin.setRawMode(false);
        throw new Error("Could not enable cbreak signal handling");
      }
    }
    if (!mode) {
      this.#interrupt?.();
      this.#readable = undefined;
      process.stdin.pause();
    }
  }
}
function status(code: number, signal: string | number | null): RuntimeCommandStatus {
  const signalName = typeof signal === "string"
    ? signal as RuntimeSignal
    : signal
    ? Object.entries(os.constants.signals).find(([, value]) => value === signal)?.[0] as RuntimeSignal ?? null
    : null;
  return { code, success: code === 0 && !signalName, signal: signalName };
}
class BunChild implements RuntimeChildProcess {
  readonly pid: number;
  readonly status: Promise<RuntimeCommandStatus>;
  constructor(readonly native: NativeProcess, readonly options: RuntimeCommandOptions) {
    this.pid = native.pid;
    this.status = native.exited.then((code) => status(code, native.signalCode));
  }
  get stdin(): WritableStream<Uint8Array> {
    if (!this.native.stdin || typeof this.native.stdin === "number") throw new TypeError("stdin is not piped");
    const sink = this.native.stdin;
    return this.#stdin ??= new WritableStream({
      write: async (data) => {
        sink.write(data);
        await sink.flush();
      },
      close: () => sink.end(),
      abort: () => sink.end(),
    });
  }
  #stdin?: WritableStream<Uint8Array>;
  get stdout(): ReadableStream<Uint8Array> {
    if (!this.native.stdout || typeof this.native.stdout === "number") throw new TypeError("stdout is not piped");
    return this.native.stdout;
  }
  get stderr(): ReadableStream<Uint8Array> {
    if (!this.native.stderr || typeof this.native.stderr === "number") throw new TypeError("stderr is not piped");
    return this.native.stderr;
  }
  kill(signal: RuntimeSignal = "SIGTERM"): void {
    try {
      this.native.kill(signal);
    } catch (e) {
      throw translated(e);
    }
  }
  ref(): void {
    this.native.ref();
  }
  unref(): void {
    this.native.unref();
  }
  async output(): Promise<RuntimeCommandOutput> {
    const [exit, stdout, stderr] = await Promise.all([
      this.status,
      this.options.stdout === "piped" ? new Response(this.stdout).bytes() : new Uint8Array(),
      this.options.stderr === "piped" ? new Response(this.stderr).bytes() : new Uint8Array(),
    ]);
    return { ...exit, stdout, stderr };
  }
}
function stdio(mode: "piped" | "inherit" | "null" | undefined): "pipe" | "inherit" | "ignore" {
  return mode === "piped" ? "pipe" : mode === "null" ? "ignore" : "inherit";
}
class BunCommand {
  readonly options: RuntimeCommandOptions;
  constructor(readonly command: string | URL, options: RuntimeCommandOptions = {}) {
    this.options = { stdin: "null", stdout: "piped", stderr: "piped", ...options };
  }
  spawn(): RuntimeChildProcess {
    const options = this.options;
    const native = sync(() =>
      bun.spawn([filename(this.command), ...(options.args ?? [])], {
        cwd: options.cwd && filename(options.cwd),
        env: options.clearEnv ? options.env ?? {} : { ...process.env, ...options.env },
        stdin: stdio(options.stdin),
        stdout: stdio(options.stdout),
        stderr: stdio(options.stderr),
        uid: options.uid,
        gid: options.gid,
      })
    );
    const child = new BunChild(native, options);
    if (options.signal) {
      const stop = () => child.kill();
      options.signal.addEventListener("abort", stop, { once: true });
      void child.status.finally(() => options.signal?.removeEventListener("abort", stop));
      if (options.signal.aborted) stop();
    }
    return child;
  }
  async output(): Promise<RuntimeCommandOutput> {
    if (this.options.stdin === "piped") throw new TypeError("output() does not accept piped stdin");
    return this.spawn().output();
  }
  outputSync(): RuntimeCommandOutput {
    const options = this.options;
    const result = spawnSync(filename(this.command), options.args ?? [], {
      cwd: options.cwd,
      env: options.clearEnv ? options.env ?? {} : { ...process.env, ...options.env },
      stdio: [stdio(options.stdin), stdio(options.stdout), stdio(options.stderr)],
      maxBuffer: 64 * 1024 * 1024,
      uid: options.uid,
      gid: options.gid,
    });
    if (result.error) throw translated(result.error);
    return {
      ...status(result.status ?? 128, result.signal),
      stdout: new Uint8Array(result.stdout ?? []),
      stderr: new Uint8Array(result.stderr ?? []),
    };
  }
}

class SocketBridge extends EventTarget {
  raw?: NativeSocket;
  readyState = 0;
  binaryType = "blob";
  protocol = "";
  extensions = "";
  url = "";
  pendingClose?: { code?: number; reason?: string };
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  get bufferedAmount(): number {
    return this.raw?.bufferedAmount ?? 0;
  }
  emit(event: Event): void {
    this.dispatchEvent(event);
    const callback = event.type === "open"
      ? this.onopen
      : event.type === "close"
      ? this.onclose
      : event.type === "message"
      ? this.onmessage
      : this.onerror;
    (callback as ((e: Event) => void) | null)?.(event);
  }
  send(data: string | ArrayBuffer | Uint8Array): void {
    if (this.readyState !== 1 || !this.raw) throw new DOMException("WebSocket is not open", "InvalidStateError");
    this.raw.send(data);
  }
  close(code?: number, reason?: string): void {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    if (this.raw) this.raw.close(code, reason);
    else this.pendingClose = { code, reason };
  }
}
const upgrades = new WeakMap<Response, SocketBridge>();
const requests = new WeakSet<Request>();
function serve(
  options: RuntimeServeOptions,
  handler: (request: Request) => Response | Promise<Response>,
): RuntimeHttpServer {
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => resolveFinished = resolve);
  let closed = false;
  const server = bun.serve({
    hostname: options.hostname ?? "0.0.0.0",
    port: options.port ?? 8000,
    fetch: async (request: Request, native: NativeServer) => {
      requests.add(request);
      try {
        const response = await handler(request);
        const socket = upgrades.get(response);
        if (socket) {
          if (
            native.upgrade(request, {
              data: socket,
              headers: socket.protocol ? new Headers({ "sec-websocket-protocol": socket.protocol }) : undefined,
            })
          ) return undefined;
          return new Response("WebSocket upgrade failed", { status: 400 });
        }
        return response;
      } catch (e) {
        return options.onError ? await options.onError(e) : new Response("Internal server error", { status: 500 });
      } finally {
        requests.delete(request);
      }
    },
    websocket: {
      idleTimeout: 120,
      maxPayloadLength: 16 * 1024 * 1024,
      backpressureLimit: 16 * 1024 * 1024,
      closeOnBackpressureLimit: false,
      open: (ws: NativeSocket) => {
        ws.data.raw = ws;
        if (ws.data.pendingClose) {
          ws.close(ws.data.pendingClose.code, ws.data.pendingClose.reason);
          return;
        }
        ws.data.readyState = 1;
        ws.data.emit(new Event("open"));
      },
      message: (ws: NativeSocket, data: string | Uint8Array) =>
        ws.data.emit(
          new MessageEvent("message", {
            data: typeof data === "string"
              ? data
              : ws.data.binaryType === "arraybuffer"
              ? new Uint8Array(data).buffer
              : new Blob([new Uint8Array(data)]),
          }),
        ),
      close: (ws: NativeSocket, code: number, reason: string) => {
        ws.data.readyState = 3;
        ws.data.emit(new CloseEvent("close", { code, reason, wasClean: code === 1000 }));
      },
    },
  });
  const shutdown = async () => {
    if (closed) return finished;
    closed = true;
    // Graceful shutdown lets queued responses and WebSocket close frames drain.
    // Force only peers that refuse to finish, so daemon shutdown acknowledgements
    // remain observable by their clients.
    const deadline = setTimeout(() => {
      void server.stop(true);
    }, 5000);
    try {
      await server.stop(false);
    } finally {
      clearTimeout(deadline);
      options.signal?.removeEventListener("abort", abort);
      resolveFinished();
    }
  };
  const abort = () => {
    void shutdown();
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const addr: RuntimeNetAddr = { hostname: server.hostname, port: server.port, transport: "tcp" };
  queueMicrotask(() => options.onListen?.(addr));
  return { addr, finished, shutdown, ref: () => server.ref(), unref: () => server.unref() };
}
function upgradeWebSocket(
  request: Request,
  options?: { idleTimeout?: number; protocols?: string[] },
): { socket: WebSocket; response: Response } {
  if (!requests.has(request)) throw new TypeError("WebSocket upgrade requires a request from runtimeHost.serve");
  const socket = new SocketBridge();
  socket.url = request.url.replace(/^http/, "ws");
  const offered = request.headers.get("sec-websocket-protocol")?.split(",").map((v) => v.trim()) ?? [];
  socket.protocol = options?.protocols?.find((p) => offered.includes(p)) ?? "";
  const response = new Response(null);
  upgrades.set(response, socket);
  return { socket: socket as unknown as WebSocket, response };
}
function writeFlags(options: RuntimeWriteOptions = {}): number {
  return openFlags({
    write: true,
    append: options.append,
    truncate: !options.append,
    create: options.create !== false,
    createNew: options.createNew,
  });
}
async function writeFile(
  value: string | URL,
  data: string | Uint8Array,
  options: RuntimeWriteOptions = {},
): Promise<void> {
  options.signal?.throwIfAborted();
  const file = await fsp.open(value, writeFlags(options), options.mode);
  try {
    await file.writeFile(data, { signal: options.signal });
  } finally {
    await file.close();
  }
}
function writeFileSync(value: string | URL, data: string | Uint8Array, options: RuntimeWriteOptions = {}): void {
  options.signal?.throwIfAborted();
  const fd = fs.openSync(value, writeFlags(options), options.mode);
  try {
    fs.writeFileSync(fd, data);
  } finally {
    fs.closeSync(fd);
  }
}
async function remove(value: string | URL, options?: { recursive?: boolean }): Promise<void> {
  if (!options?.recursive && (await fsp.lstat(value)).isDirectory()) await fsp.rmdir(value);
  else await fsp.rm(value, { recursive: options?.recursive ?? false });
}
function removeSync(value: string | URL, options?: { recursive?: boolean }): void {
  if (!options?.recursive && fs.lstatSync(value).isDirectory()) fs.rmdirSync(value);
  else fs.rmSync(value, { recursive: options?.recursive ?? false });
}
function tempDirectory(options: { dir?: string; prefix?: string; suffix?: string } = {}): string {
  const base = fs.mkdtempSync(path.join(options.dir ?? os.tmpdir(), options.prefix ?? "exotui-"));
  if (!options.suffix) return base;
  const target = base + options.suffix;
  fs.renameSync(base, target);
  return target;
}
function watchFs(paths: string | string[], options: { recursive?: boolean } = {}): RuntimeWatcher {
  const events: RuntimeFsEvent[] = [];
  const pending: ((result: IteratorResult<RuntimeFsEvent>) => void)[] = [];
  let closed = false;
  const roots = typeof paths === "string" ? [paths] : paths;
  const watchers: fs.FSWatcher[] = [];
  try {
    for (const root of roots) {
      const directory = fs.statSync(root).isDirectory();
      // Watching a file's parent survives editors replacing its inode atomically.
      const watched = directory ? root : path.dirname(root);
      watchers.push(fs.watch(watched, { recursive: directory && (options.recursive ?? true) }, (kind, name) => {
        if (!directory && name?.toString() !== path.basename(root)) return;
        const fullPath = directory ? path.join(root, name?.toString() ?? "") : root;
        const event: RuntimeFsEvent = {
          kind: kind === "change" ? "modify" : fs.existsSync(fullPath) ? "create" : "remove",
          paths: [path.resolve(fullPath)],
        };
        const next = pending.shift();
        if (next) next({ value: event, done: false });
        else {
          if (events.length >= 1024) events.shift();
          events.push(event);
        }
      }));
    }
  } catch (error) {
    for (const watcher of watchers) watcher.close();
    throw translated(error);
  }
  const close = () => {
    if (closed) return;
    closed = true;
    for (const w of watchers) w.close();
    for (const p of pending.splice(0)) p({ value: undefined, done: true });
    events.length = 0;
  };
  return {
    close,
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          events.length
            ? Promise.resolve({ value: events.shift()!, done: false })
            : closed
            ? Promise.resolve({ value: undefined, done: true })
            : new Promise<IteratorResult<RuntimeFsEvent>>((resolve) => pending.push(resolve)),
        return: async () => {
          close();
          return { value: undefined, done: true };
        },
      };
    },
  };
}
async function connect(
  options: { hostname?: string; port?: number; transport?: "tcp" | "unix"; path?: string },
): Promise<RuntimeConn> {
  const socket = net.createConnection(
    options.transport === "unix"
      ? { path: options.path! }
      : { host: options.hostname ?? "127.0.0.1", port: options.port! },
  );
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", (e) => reject(translated(e)));
  });
  const readable = Readable.toWeb(socket) as unknown as ReadableStream<Uint8Array>;
  const writable = Writable.toWeb(socket) as unknown as WritableStream<Uint8Array>;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let tail: Uint8Array = new Uint8Array(0);
  let reads: Promise<void> = Promise.resolve();
  const read = async (data: Uint8Array): Promise<number | null> => {
    if (!data.length) return 0;
    if (!tail.length) {
      reader ??= readable.getReader();
      const result = await reader.read();
      if (result.done) return null;
      tail = result.value;
    }
    const count = Math.min(data.length, tail.length);
    data.set(tail.subarray(0, count));
    tail = tail.slice(count);
    return count;
  };
  const endpoint = (remote: boolean): RuntimeNetAddr | RuntimeUnixAddr =>
    options.transport === "unix" ? { transport: "unix", path: remote ? options.path! : "" } : {
      transport: "tcp",
      hostname: (remote ? socket.remoteAddress : socket.localAddress) ?? "",
      port: (remote ? socket.remotePort : socket.localPort) ?? 0,
    };
  return {
    localAddr: endpoint(false),
    remoteAddr: endpoint(true),
    readable,
    writable,
    read(data) {
      const result = reads.then(() => read(data));
      reads = result.then(() => {}, () => {});
      return result;
    },
    write(data) {
      return new Promise<number>((resolve, reject) =>
        socket.write(data, (e) => e ? reject(translated(e)) : resolve(data.length))
      );
    },
    close: () => socket.destroy(),
    closeWrite: () => new Promise<void>((resolve) => socket.end(resolve)),
    ref: () => socket.ref(),
    unref: () => socket.unref(),
  };
}

/** Creates the native Bun implementation of the portable host contract. */
export function createBunHost(): RuntimeHost {
  const [major, minor] = bun.version.split(".").map(Number);
  if (major < 1 || (major === 1 && minor < 4)) {
    throw new Error(
      `exotui requires Bun 1.4.0 or newer; found ${bun.version}. Earlier Bun versions have native WebSocket shutdown and file-watcher defects.`,
    );
  }
  const signalListeners = new Map<RuntimeSignal, Set<() => void>>();
  const host: RuntimeHost = {
    runtime: "bun",
    args: process.argv.slice(2),
    pid: process.pid,
    get exitCode() {
      return Number(process.exitCode ?? 0);
    },
    set exitCode(value: number) {
      process.exitCode = value;
    },
    build: {
      os: (process.platform === "win32" ? "windows" : process.platform) as RuntimeHost["build"]["os"],
      arch: process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : process.arch,
      standalone: /^\/(?:\$bunfs)\//.test(process.argv[1] ?? "") || /^B:\\~BUN\\/i.test(process.argv[1] ?? ""),
    },
    version: { deno: "", bun: bun.version, v8: "", typescript: "" },
    stdin: new StdinReader(),
    stdout: new BunFile(1, false),
    stderr: new BunFile(2, false),
    env: {
      get: (name) => process.env[name],
      set: (name, value) => {
        process.env[name] = value;
      },
      delete: (name) => {
        delete process.env[name];
      },
      has: (name) => name in process.env,
      toObject: () =>
        Object.fromEntries(
          Object.entries(process.env).filter((item): item is [string, string] => item[1] !== undefined),
        ),
    },
    errors,
    permissions: {
      querySync: () => ({ state: "granted" }),
      query: async () => ({ state: "granted" }),
      request: async () => ({ state: "granted" }),
      revoke: async () => {
        throw new errors.NotSupported!(
          "Bun has ambient process permissions; use the application permission broker to restrict access",
        );
      },
    },
    Command: BunCommand,
    customInspect: Symbol.for("nodejs.util.inspect.custom"),
    consoleSize: () => {
      if (!process.stdout.isTTY) throw new errors.BadResource!("stdout is not a terminal");
      return { columns: process.stdout.columns, rows: process.stdout.rows };
    },
    addSignalListener: (signal, listener) => {
      const listeners = signalListeners.get(signal) ?? new Set();
      if (listeners.has(listener)) return;
      listeners.add(listener);
      signalListeners.set(signal, listeners);
      process.on(signal, listener);
    },
    removeSignalListener: (signal, listener) => {
      const listeners = signalListeners.get(signal);
      if (!listeners?.delete(listener)) return;
      process.off(signal, listener);
      if (!listeners.size) signalListeners.delete(signal);
    },
    unrefTimer: (timer) => {
      (timer as unknown as { unref?: () => void }).unref?.();
    },
    refTimer: (timer) => {
      (timer as unknown as { ref?: () => void }).ref?.();
    },
    exit: (code) => process.exit(code),
    execPath: () => process.execPath,
    cwd: () => process.cwd(),
    chdir: (value) => process.chdir(filename(value)),
    kill: (pid, signal = "SIGTERM") => {
      sync(() => process.kill(pid, signal));
    },
    readFile: (value, options) => asyncCall(async () => new Uint8Array(await fsp.readFile(value, options))),
    readFileSync: (value) => sync(() => new Uint8Array(fs.readFileSync(value))),
    readTextFile: (value, options) => asyncCall(() => fsp.readFile(value, { ...options, encoding: "utf8" })),
    readTextFileSync: (value) => sync(() => fs.readFileSync(value, "utf8")),
    writeFile: (value, data, options) => asyncCall(() => writeFile(value, data, options)),
    writeFileSync: (value, data, options) => sync(() => writeFileSync(value, data, options)),
    writeTextFile: (value, data, options) => asyncCall(() => writeFile(value, data, options)),
    writeTextFileSync: (value, data, options) => sync(() => writeFileSync(value, data, options)),
    mkdir: (value, options) =>
      asyncCall(async () => {
        await fsp.mkdir(value, options);
      }),
    mkdirSync: (value, options) =>
      sync(() => {
        fs.mkdirSync(value, options);
      }),
    remove: (value, options) => asyncCall(() => remove(value, options)),
    removeSync: (value, options) => sync(() => removeSync(value, options)),
    rename: (from, to) => asyncCall(() => fsp.rename(from, to)),
    copyFile: (from, to) => asyncCall(() => fsp.copyFile(from, to)),
    chmod: (value, mode) => asyncCall(() => fsp.chmod(value, mode)),
    stat: (value) => asyncCall(async () => info(await fsp.stat(value))),
    statSync: (value) => sync(() => info(fs.statSync(value))),
    lstat: (value) => asyncCall(async () => info(await fsp.lstat(value))),
    lstatSync: (value) => sync(() => info(fs.lstatSync(value))),
    async *readDir(value) {
      for (const item of await asyncCall(() => fsp.readdir(value, { withFileTypes: true }))) yield entry(item);
    },
    readDirSync: (value) => sync(() => fs.readdirSync(value, { withFileTypes: true }).map(entry)),
    open: async (value, options) => sync(() => new BunFile(fs.openSync(value, openFlags(options), options?.mode))),
    openSync: (value, options) => sync(() => new BunFile(fs.openSync(value, openFlags(options), options?.mode))),
    makeTempDir: async (options) => sync(() => tempDirectory(options)),
    makeTempDirSync: (options) => sync(() => tempDirectory(options)),
    makeTempFile: async (options = {}) => {
      const target = path.join(
        options.dir ?? os.tmpdir(),
        `${options.prefix ?? "exotui-"}${crypto.randomUUID()}${options.suffix ?? ""}`,
      );
      await asyncCall(() => fsp.writeFile(target, "", { flag: "wx", mode: 0o600 }));
      return target;
    },
    utime: (value, atime, mtime) => asyncCall(() => fsp.utimes(value, atime, mtime)),
    watchFs,
    connect,
    serve,
    upgradeWebSocket,
    inspect: (value, options) => util.inspect(value, options),
    memoryUsage: () => process.memoryUsage(),
    systemMemoryInfo: () => {
      const result = {
        total: os.totalmem(),
        free: os.freemem(),
        available: os.freemem(),
        buffers: 0,
        cached: 0,
        swapTotal: 0,
        swapFree: 0,
      };
      if (process.platform === "linux") {
        const text = fs.readFileSync("/proc/meminfo", "utf8");
        const values = Object.fromEntries(
          [...text.matchAll(/^(\w+):\s+(\d+)\s+kB/gm)].map((m) => [m[1], Number(m[2]) * 1024]),
        );
        Object.assign(result, {
          available: values.MemAvailable ?? result.free,
          buffers: values.Buffers ?? 0,
          cached: values.Cached ?? 0,
          swapTotal: values.SwapTotal ?? 0,
          swapFree: values.SwapFree ?? 0,
        });
      }
      return result;
    },
    hostname: () => os.hostname(),
    osRelease: () => os.release(),
    loadavg: () => os.loadavg(),
    networkInterfaces: () =>
      Object.entries(os.networkInterfaces()).flatMap(([name, values]) =>
        (values ?? []).map((v) => ({
          name,
          family: v.family as "IPv4" | "IPv6",
          address: v.address,
          netmask: v.netmask,
          scopeid: "scopeid" in v ? v.scopeid ?? null : null,
          cidr: v.cidr ?? "",
          mac: v.mac,
        }))
      ),
  };
  return host;
}
