// Copyright 2026 ubernaut. MIT license.

/** Portable process signal names accepted by supported terminal hosts. */
export type RuntimeSignal =
  | "SIGABRT"
  | "SIGALRM"
  | "SIGBREAK"
  | "SIGBUS"
  | "SIGCHLD"
  | "SIGCONT"
  | "SIGEMT"
  | "SIGFPE"
  | "SIGHUP"
  | "SIGILL"
  | "SIGINFO"
  | "SIGINT"
  | "SIGIO"
  | "SIGKILL"
  | "SIGPIPE"
  | "SIGPROF"
  | "SIGPWR"
  | "SIGQUIT"
  | "SIGSEGV"
  | "SIGSTKFLT"
  | "SIGSTOP"
  | "SIGSYS"
  | "SIGTERM"
  | "SIGTRAP"
  | "SIGTSTP"
  | "SIGTTIN"
  | "SIGTTOU"
  | "SIGURG"
  | "SIGUSR1"
  | "SIGUSR2"
  | "SIGVTALRM"
  | "SIGWINCH"
  | "SIGXCPU"
  | "SIGXFSZ";

/** Byte output used by terminal renderers. */
export interface RuntimeStdout {
  write(data: Uint8Array): Promise<number>;
  writeSync(data: Uint8Array): number;
  isTerminal(): boolean;
  readonly writable: WritableStream<Uint8Array>;
}

/** Byte input and terminal mode control used by input readers. */
export interface RuntimeStdin {
  read(data: Uint8Array): Promise<number | null>;
  setRaw(mode: boolean, options?: { cbreak?: boolean }): void;
  isTerminal(): boolean;
  readonly readable: ReadableStream<Uint8Array>;
}

/** Terminal size in character cells. */
export interface RuntimeConsoleSize {
  columns: number;
  rows: number;
}

/** Portable filesystem metadata. */
export interface RuntimeFileInfo {
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  mtime: Date | null;
  atime: Date | null;
  birthtime: Date | null;
  ctime: Date | null;
  dev: number | null;
  ino: number | null;
  mode: number | null;
  nlink: number | null;
  uid: number | null;
  gid: number | null;
  rdev: number | null;
  blksize: number | null;
  blocks: number | null;
  isBlockDevice: boolean | null;
  isCharDevice: boolean | null;
  isFifo: boolean | null;
  isSocket: boolean | null;
}

/** Portable directory entry. */
export interface RuntimeDirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

/** An owned filesystem descriptor with byte streams. */
export interface RuntimeFile {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  read(data: Uint8Array): Promise<number | null>;
  readSync(data: Uint8Array): number | null;
  write(data: Uint8Array): Promise<number>;
  writeSync(data: Uint8Array): number;
  stat(): Promise<RuntimeFileInfo>;
  statSync(): RuntimeFileInfo;
  sync(): Promise<void>;
  syncSync(): void;
  close(): void;
}

/** Filesystem watcher events consumed by hot reload and configuration services. */
export interface RuntimeFsEvent {
  kind: "any" | "access" | "create" | "modify" | "remove" | "other";
  paths: string[];
}
/** An owned asynchronous watcher. */
export interface RuntimeWatcher extends AsyncIterable<RuntimeFsEvent> {
  close(): void;
}

/** Portable subprocess launch options. */
export interface RuntimeCommandOptions {
  args?: string[];
  cwd?: string | URL;
  env?: Record<string, string>;
  clearEnv?: boolean;
  stdin?: "piped" | "inherit" | "null";
  stdout?: "piped" | "inherit" | "null";
  stderr?: "piped" | "inherit" | "null";
  uid?: number;
  gid?: number;
  signal?: AbortSignal;
  windowsRawArguments?: boolean;
}
/** Portable subprocess exit information. */
export interface RuntimeCommandStatus {
  success: boolean;
  code: number;
  signal: RuntimeSignal | null;
}
/** Captured subprocess output. */
export interface RuntimeCommandOutput extends RuntimeCommandStatus {
  stdout: Uint8Array;
  stderr: Uint8Array;
}
/** An owned subprocess and its streams. */
export interface RuntimeChildProcess {
  readonly pid: number;
  readonly stdin: WritableStream<Uint8Array>;
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly status: Promise<RuntimeCommandStatus>;
  kill(signal?: RuntimeSignal): void;
  ref(): void;
  unref(): void;
  output(): Promise<RuntimeCommandOutput>;
}
/** Portable command implementation. */
export interface RuntimeCommand {
  spawn(): RuntimeChildProcess;
  output(): Promise<RuntimeCommandOutput>;
  outputSync(): RuntimeCommandOutput;
}

/** TCP endpoint metadata. */
export interface RuntimeNetAddr {
  transport: "tcp" | "udp";
  hostname: string;
  port: number;
}
/** Unix-domain socket endpoint. */
export interface RuntimeUnixAddr {
  transport: "unix";
  path: string;
}
/** An owned network connection. */
export interface RuntimeConn {
  readonly localAddr: RuntimeNetAddr | RuntimeUnixAddr;
  readonly remoteAddr: RuntimeNetAddr | RuntimeUnixAddr;
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  read(data: Uint8Array): Promise<number | null>;
  write(data: Uint8Array): Promise<number>;
  close(): void;
  closeWrite(): Promise<void>;
  ref(): void;
  unref(): void;
}
/** An HTTP listener with an observable shutdown lifecycle. */
export interface RuntimeHttpServer {
  readonly addr: RuntimeNetAddr;
  readonly finished: Promise<void>;
  shutdown(): Promise<void>;
  ref(): void;
  unref(): void;
}
/** Listener settings shared by Deno and Bun server adapters. */
export interface RuntimeServeOptions {
  hostname?: string;
  port?: number;
  signal?: AbortSignal;
  onListen?: (address: RuntimeNetAddr) => void;
  onError?: (error: unknown) => Response | Promise<Response>;
}
/** Host memory readings in bytes. */
export interface RuntimeSystemMemoryInfo {
  total: number;
  free: number;
  available: number;
  buffers: number;
  cached: number;
  swapTotal: number;
  swapFree: number;
}
/** The supported runtime permission vocabulary. Bun reports ambient access, without claiming a sandbox. */
export type RuntimePermissionDescriptor =
  | { name: "read" | "write" | "ffi"; path?: string | URL }
  | { name: "run"; command?: string | URL }
  | { name: "env"; variable?: string }
  | { name: "net"; host?: string }
  | { name: "sys"; kind?: string }
  | { name: "import"; host?: string };
/** A permission query result. */
export type RuntimePermissionState = "granted" | "denied" | "prompt";
/** Deno timer IDs and Bun/Node timer handles. */
export type RuntimeTimer = number | { unref(): unknown; ref(): unknown };

/** Filesystem open options. */
export interface RuntimeOpenOptions {
  read?: boolean;
  write?: boolean;
  append?: boolean;
  truncate?: boolean;
  create?: boolean;
  createNew?: boolean;
  mode?: number;
}
/** File write options. */
export interface RuntimeWriteOptions {
  append?: boolean;
  create?: boolean;
  createNew?: boolean;
  mode?: number;
  signal?: AbortSignal;
}

/** Explicit operating-system boundary shared by Deno and Bun hosts. */
export interface RuntimeHost {
  readonly runtime: "deno" | "bun";
  readonly args: string[];
  readonly pid: number;
  exitCode: number;
  readonly build: {
    os: "linux" | "darwin" | "windows" | "freebsd" | "netbsd" | "aix" | "solaris" | "illumos" | "android";
    arch: string;
    target?: string;
    standalone: boolean;
  };
  readonly version: { deno: string; bun?: string; v8: string; typescript: string };
  readonly stdin: RuntimeStdin;
  readonly stdout: RuntimeStdout;
  readonly stderr: RuntimeStdout;
  readonly env: {
    get(name: string): string | undefined;
    set(name: string, value: string): void;
    delete(name: string): void;
    has(name: string): boolean;
    toObject(): Record<string, string>;
  };
  readonly errors: Record<string, new (message?: string) => Error>;
  readonly permissions: {
    querySync(descriptor: RuntimePermissionDescriptor): { state: RuntimePermissionState };
    query(descriptor: RuntimePermissionDescriptor): Promise<{ state: RuntimePermissionState }>;
    request(descriptor: RuntimePermissionDescriptor): Promise<{ state: RuntimePermissionState }>;
    revoke(descriptor: RuntimePermissionDescriptor): Promise<{ state: RuntimePermissionState }>;
  };
  readonly Command: new (command: string | URL, options?: RuntimeCommandOptions) => RuntimeCommand;
  readonly customInspect: symbol;
  consoleSize(): RuntimeConsoleSize;
  addSignalListener(signal: RuntimeSignal, listener: () => void): void;
  removeSignalListener(signal: RuntimeSignal, listener: () => void): void;
  unrefTimer(timer: RuntimeTimer): void;
  refTimer(timer: RuntimeTimer): void;
  exit(code?: number): never;
  execPath(): string;
  cwd(): string;
  chdir(path: string | URL): void;
  kill(pid: number, signal?: RuntimeSignal): void;
  readFile(path: string | URL, options?: { signal?: AbortSignal }): Promise<Uint8Array<ArrayBuffer>>;
  readFileSync(path: string | URL): Uint8Array<ArrayBuffer>;
  readTextFile(path: string | URL, options?: { signal?: AbortSignal }): Promise<string>;
  readTextFileSync(path: string | URL): string;
  writeFile(path: string | URL, data: Uint8Array, options?: RuntimeWriteOptions): Promise<void>;
  writeFileSync(path: string | URL, data: Uint8Array, options?: RuntimeWriteOptions): void;
  writeTextFile(path: string | URL, data: string, options?: RuntimeWriteOptions): Promise<void>;
  writeTextFileSync(path: string | URL, data: string, options?: RuntimeWriteOptions): void;
  mkdir(path: string | URL, options?: { recursive?: boolean; mode?: number }): Promise<void>;
  mkdirSync(path: string | URL, options?: { recursive?: boolean; mode?: number }): void;
  remove(path: string | URL, options?: { recursive?: boolean }): Promise<void>;
  removeSync(path: string | URL, options?: { recursive?: boolean }): void;
  rename(from: string | URL, to: string | URL): Promise<void>;
  copyFile(from: string | URL, to: string | URL): Promise<void>;
  chmod(path: string | URL, mode: number): Promise<void>;
  stat(path: string | URL): Promise<RuntimeFileInfo>;
  statSync(path: string | URL): RuntimeFileInfo;
  lstat(path: string | URL): Promise<RuntimeFileInfo>;
  lstatSync(path: string | URL): RuntimeFileInfo;
  readDir(path: string | URL): AsyncIterable<RuntimeDirEntry>;
  readDirSync(path: string | URL): Iterable<RuntimeDirEntry>;
  open(path: string | URL, options?: RuntimeOpenOptions): Promise<RuntimeFile>;
  openSync(path: string | URL, options?: RuntimeOpenOptions): RuntimeFile;
  makeTempDir(options?: { dir?: string; prefix?: string; suffix?: string }): Promise<string>;
  makeTempDirSync(options?: { dir?: string; prefix?: string; suffix?: string }): string;
  makeTempFile(options?: { dir?: string; prefix?: string; suffix?: string }): Promise<string>;
  utime(path: string | URL, atime: number | Date, mtime: number | Date): Promise<void>;
  watchFs(paths: string | string[], options?: { recursive?: boolean }): RuntimeWatcher;
  connect(
    options: { hostname?: string; port: number; transport?: "tcp" } | { path: string; transport: "unix" },
  ): Promise<RuntimeConn>;
  serve(options: RuntimeServeOptions, handler: (request: Request) => Response | Promise<Response>): RuntimeHttpServer;
  upgradeWebSocket(
    request: Request,
    options?: { idleTimeout?: number; protocols?: string[] },
  ): { socket: WebSocket; response: Response };
  inspect(value: unknown, options?: Record<string, unknown>): string;
  memoryUsage(): { rss: number; heapTotal: number; heapUsed: number; external: number };
  systemMemoryInfo(): RuntimeSystemMemoryInfo;
  hostname(): string;
  osRelease(): string;
  loadavg(): number[];
  networkInterfaces(): {
    name: string;
    family: "IPv4" | "IPv6";
    address: string;
    netmask: string;
    scopeid: number | null;
    cidr: string;
    mac: string;
  }[];
}
