// Copyright 2026 ubernaut. MIT license.
// Bun-native execution of the existing Deno suite. This is a test adapter, not a production Deno global.
import { afterAll, test as bunTest } from "bun:test";
import { plugin } from "bun";
import { AsyncLocalStorage } from "node:async_hooks";
import { realpath, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeHost, type RuntimePermissionDescriptor } from "../src/runtime/host.ts";

await plugin({
  name: "canonical-deno-test-dependencies",
  setup(build) {
    build.onResolve({ filter: /^(?:crayon|jsonc)$/ }, (args) => ({
      path: fileURLToPath(new URL(`./vendor/${args.path}/mod.ts`, import.meta.url)),
      namespace: "file",
    }));
    build.onResolve({
      filter: /^\/\/deno\.land\/std@0\.192\.0\/(?:testing\/asserts|fs\/walk)\.ts$/,
      namespace: "https",
    }, () => ({
      path: fileURLToPath(new URL("../tests/bun_assert.ts", import.meta.url)),
      namespace: "file",
    }));
  },
});

// WebGPU constants have fixed specification values; fake device tests need them without opening a native adapter.
const gpuEnums = {
  GPUBufferUsage: {
    MAP_READ: 1,
    MAP_WRITE: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
    INDEX: 16,
    VERTEX: 32,
    UNIFORM: 64,
    STORAGE: 128,
    INDIRECT: 256,
    QUERY_RESOLVE: 512,
  },
  GPUTextureUsage: { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 },
  GPUMapMode: { READ: 1, WRITE: 2 },
  GPUShaderStage: { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 },
  GPUColorWrite: { RED: 1, GREEN: 2, BLUE: 4, ALPHA: 8, ALL: 15 },
};
for (const [name, values] of Object.entries(gpuEnums)) {
  if (!(name in globalThis)) {
    Object.defineProperty(globalThis, name, { value: Object.freeze(values), configurable: true, writable: true });
  }
}

type Callback = (context: TestContext) => unknown | Promise<unknown>;
type Permissions = "inherit" | "none" | Record<string, boolean | string[]>;
interface Definition {
  name: string;
  fn: Callback;
  ignore?: boolean;
  only?: boolean;
  sanitizeOps?: boolean;
  sanitizeResources?: boolean;
  sanitizeExit?: boolean;
  permissions?: Permissions;
}
interface TestContext {
  name: string;
  origin: string;
  parent?: TestContext;
  step(
    name: string | Definition | Omit<Definition, "fn"> | Callback,
    fn?: Callback | Omit<Definition, "fn">,
    callback?: Callback,
  ): Promise<boolean>;
}
interface Scope {
  permissions?: Permissions;
  sanitizeExit: boolean;
}
const scope = new AsyncLocalStorage<Scope>();
let exclusiveTests = false;
afterAll(() => {
  if (exclusiveTests) throw new Error("Exclusive Deno.test.only registrations cannot pass the suite");
});
const resources = new Map<object, string>();
const operations = new Map<Promise<unknown>, string>();
const timers = new Map<number, string>();
const signals = new Map<() => void, Set<string>>();
const nativeSetTimeout = globalThis.setTimeout;
const nativeSetInterval = globalThis.setInterval;
const nativeClearTimeout = globalThis.clearTimeout;
const nativeClearInterval = globalThis.clearInterval;

function timerId(timer: unknown): number {
  return Number(timer);
}
globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
  let id: number;
  const timer = nativeSetTimeout(
    (...values: unknown[]) => {
      timers.delete(id);
      fn(...values);
    },
    ms,
    ...args,
  );
  id = timerId(timer);
  timers.set(id, `timeout (${ms ?? 0}ms)`);
  return timer;
}) as typeof setTimeout;
globalThis.setInterval = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
  const timer = nativeSetInterval(fn, ms, ...args);
  timers.set(timerId(timer), `interval (${ms ?? 0}ms)`);
  return timer;
}) as typeof setInterval;
globalThis.clearTimeout = ((timer: unknown) => {
  timers.delete(timerId(timer));
  nativeClearTimeout(timer as number);
}) as typeof clearTimeout;
globalThis.clearInterval = ((timer: unknown) => {
  timers.delete(timerId(timer));
  nativeClearInterval(timer as number);
}) as typeof clearInterval;

function operation<T>(promise: Promise<T>, label: string): Promise<T> {
  // Return the observed promise so an unawaited rejection stays unhandled and Bun's test runner reports it.
  const observed = promise.then(
    (value) => {
      operations.delete(observed);
      return value;
    },
    (error) => {
      operations.delete(observed);
      throw error;
    },
  );
  operations.set(observed, label);
  return observed;
}
function resource<T extends object>(value: T, label: string, closeName: string): T {
  resources.set(value, label);
  const item = value as Record<string, unknown>;
  const close = item[closeName] as (...args: unknown[]) => unknown;
  item[closeName] = function (...args: unknown[]) {
    const result = close.apply(value, args);
    if (result instanceof Promise) {
      return operation(
        result.then((result) => {
          resources.delete(value);
          return result;
        }),
        `${label}.${closeName}`,
      );
    }
    resources.delete(value);
    return result;
  };
  return value;
}
function permissionAllowed(descriptor: RuntimePermissionDescriptor): boolean {
  const policy = scope.getStore()?.permissions;
  if (!policy || policy === "inherit") return true;
  if (policy === "none") return false;
  const allowance = policy[descriptor.name];
  if (allowance === true) return true;
  if (!Array.isArray(allowance)) return false;
  if ("path" in descriptor && descriptor.path !== undefined) {
    const target = descriptor.path instanceof URL ? fileURLToPath(descriptor.path) : resolve(descriptor.path);
    return allowance.some((entry) => target === resolve(entry) || target.startsWith(resolve(entry) + "/"));
  }
  const value = "variable" in descriptor
    ? descriptor.variable
    : "command" in descriptor
    ? descriptor.command
    : "host" in descriptor
    ? descriptor.host
    : "kind" in descriptor
    ? descriptor.kind
    : undefined;
  return value !== undefined && allowance.includes(String(value));
}
function requirePermission(descriptor: RuntimePermissionDescriptor): void {
  if (!permissionAllowed(descriptor)) {
    throw new runtimeHost.errors.NotCapable(`Test denied ${descriptor.name} permission`);
  }
}
for (const name of ["get", "set", "has", "delete"] as const) {
  const original = runtimeHost.env[name] as (...args: unknown[]) => unknown;
  (runtimeHost.env as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
    requirePermission({ name: "env", variable: args[0] as string });
    return original.apply(runtimeHost.env, args);
  };
}
const environmentObject = runtimeHost.env.toObject;
runtimeHost.env.toObject = () => {
  requirePermission({ name: "env" });
  return environmentObject.call(runtimeHost.env);
};
const host = runtimeHost as unknown as Record<string, unknown>;
const readMethods = [
  "readFile",
  "readFileSync",
  "readTextFile",
  "readTextFileSync",
  "readDir",
  "readDirSync",
  "stat",
  "statSync",
  "lstat",
  "lstatSync",
  "watchFs",
];
const writeMethods = [
  "writeFile",
  "writeFileSync",
  "writeTextFile",
  "writeTextFileSync",
  "mkdir",
  "mkdirSync",
  "remove",
  "removeSync",
  "chmod",
  "utime",
  "rename",
  "copyFile",
];
for (const name of [...readMethods, ...writeMethods, "makeTempDir", "makeTempDirSync", "makeTempFile"]) {
  const original = host[name];
  if (typeof original !== "function") continue;
  host[name] = (...args: unknown[]) => {
    const kind = readMethods.includes(name) ? "read" : "write";
    if (name === "copyFile") {
      requirePermission({ name: "read", path: args[0] as string | URL });
      requirePermission({ name: "write", path: args[1] as string | URL });
    } else if (name === "rename") {
      requirePermission({ name: "write", path: args[0] as string | URL });
      requirePermission({ name: "write", path: args[1] as string | URL });
    } else {
      const paths = Array.isArray(args[0]) ? args[0] : [args[0]];
      for (const path of paths) {
        requirePermission({
          name: kind,
          path: typeof path === "string" || path instanceof URL ? path : (path as { dir?: string } | undefined)?.dir,
        });
      }
    }
    const result = original.apply(runtimeHost, args);
    if (name === "watchFs") return resource(result, "filesystem watcher", "close");
    return result instanceof Promise ? operation(result, name) : result;
  };
}
for (const name of ["open", "openSync"]) {
  const original = host[name] as (...args: unknown[]) => unknown;
  host[name] = (...args: unknown[]) => {
    const options = args[1] as
      | { read?: boolean; write?: boolean; append?: boolean; create?: boolean; createNew?: boolean; truncate?: boolean }
      | undefined;
    const writing = options?.write || options?.append || options?.create || options?.createNew || options?.truncate;
    if (options?.read || !writing) requirePermission({ name: "read", path: args[0] as string | URL });
    if (writing) requirePermission({ name: "write", path: args[0] as string | URL });
    const result = original.apply(runtimeHost, args);
    if (result instanceof Promise) {
      return operation(result.then((value) => resource(value, "file descriptor", "close")), name);
    }
    return resource(result as object, "file descriptor", "close");
  };
}
for (const name of ["hostname", "osRelease", "loadavg", "systemMemoryInfo", "networkInterfaces"] as const) {
  const original = runtimeHost[name].bind(runtimeHost);
  host[name] = (...args: unknown[]) => {
    requirePermission({ name: "sys", kind: name });
    return original(...args as []);
  };
}
const Command = runtimeHost.Command;
class SanitizedCommand extends Command {
  constructor(command: string | URL, options?: ConstructorParameters<typeof Command>[1]) {
    requirePermission({ name: "run", command });
    super(command, options);
  }
  override spawn() {
    const child = super.spawn();
    resources.set(child, `subprocess ${child.pid}`);
    child.status.then(() => resources.delete(child), () => resources.delete(child));
    return child;
  }
  override output() {
    return operation(super.output(), "subprocess output");
  }
}
host.Command = SanitizedCommand;
const serve = runtimeHost.serve.bind(runtimeHost);
host.serve = (...args: Parameters<typeof serve>) => {
  requirePermission({ name: "net", host: `${args[0].hostname ?? "0.0.0.0"}:${args[0].port ?? 8000}` });
  const server = resource(serve(...args), "HTTP server", "shutdown");
  server.finished.then(() => resources.delete(server), () => resources.delete(server));
  return server;
};
const connect = runtimeHost.connect.bind(runtimeHost);
host.connect = (...args: Parameters<typeof connect>) => {
  requirePermission({
    name: "net",
    host: "path" in args[0] ? args[0].path : `${args[0].hostname ?? "127.0.0.1"}:${args[0].port}`,
  });
  return operation(connect(...args).then((value) => resource(value, "TCP connection", "close")), "connect");
};
const addSignal = runtimeHost.addSignalListener.bind(runtimeHost);
const removeSignal = runtimeHost.removeSignalListener.bind(runtimeHost);
host.addSignalListener = (...args: Parameters<typeof addSignal>) => {
  addSignal(...args);
  const names = signals.get(args[1]) ?? new Set<string>();
  names.add(args[0]);
  signals.set(args[1], names);
};
host.removeSignalListener = (...args: Parameters<typeof removeSignal>) => {
  removeSignal(...args);
  const names = signals.get(args[1]);
  names?.delete(args[0]);
  if (!names?.size) signals.delete(args[1]);
};
const exit = runtimeHost.exit.bind(runtimeHost);
host.exit = (code?: number) => {
  if (scope.getStore()?.sanitizeExit !== false) throw new Error(`Test attempted process exit (${code ?? 0})`);
  return exit(code);
};
const permissions = runtimeHost.permissions;
host.permissions = {
  querySync: (descriptor: RuntimePermissionDescriptor) =>
    permissionAllowed(descriptor) ? permissions.querySync(descriptor) : { state: "denied" },
  query: async (descriptor: RuntimePermissionDescriptor) =>
    permissionAllowed(descriptor) ? permissions.query(descriptor) : { state: "denied" },
  request: async (descriptor: RuntimePermissionDescriptor) =>
    permissionAllowed(descriptor) ? permissions.request(descriptor) : { state: "denied" },
  revoke: (descriptor: RuntimePermissionDescriptor) => permissions.revoke(descriptor),
};
const NativeWebSocket = globalThis.WebSocket;
globalThis.WebSocket = class extends NativeWebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    requirePermission({ name: "net", host: new URL(url).host });
    super(url, protocols);
    resources.set(this, "WebSocket");
    this.addEventListener("close", () => resources.delete(this), { once: true });
  }
};

const NativeWorker = globalThis.Worker;
globalThis.Worker = class extends NativeWorker {
  constructor(specifier: string | URL, options?: WorkerOptions) {
    super(specifier, options);
    resource(this, "Worker", "terminate");
  }
};

function definition(
  first: string | Definition | Omit<Definition, "fn"> | Callback,
  second?: Callback | Omit<Definition, "fn">,
  third?: Callback,
): Definition {
  if (typeof first === "string") {
    return typeof second === "function" ? { name: first, fn: second } : { ...second, name: first, fn: third! };
  }
  if (typeof first === "function") return { name: first.name || "unnamed test", fn: first };
  return typeof second === "function" ? { ...first, fn: second } : first as Definition;
}
async function runDefinition(def: Definition, parent?: TestContext): Promise<void> {
  if (typeof def.fn !== "function") throw new TypeError(`Test ${def.name} is missing its function`);
  const beforeResources = new Set(resources.keys());
  const beforeOps = new Set(operations.keys());
  const beforeTimers = new Set(timers.keys());
  const beforeSignals = new Map([...signals].map(([callback, names]) => [callback, new Set(names)]));
  const steps = new Set<Promise<boolean>>();
  const failures: unknown[] = [];
  const context: TestContext = {
    name: def.name,
    origin: import.meta.url,
    parent,
    step(first, second, third) {
      const child = definition(first, second, third);
      if (child.ignore) return Promise.resolve(false);
      const promise = runDefinition(child, context).then(() => true, (error) => {
        failures.push(error);
        return false;
      });
      steps.add(promise);
      promise.then(() => steps.delete(promise));
      return promise;
    },
  };
  let failure: unknown;
  await scope.run({
    permissions: def.permissions ?? scope.getStore()?.permissions,
    sanitizeExit: def.sanitizeExit ?? true,
  }, async () => {
    try {
      await def.fn(context);
    } catch (error) {
      failure = error;
    }
  });
  const unfinishedSteps = steps.size;
  // Let already-completed I/O and WebSocket close events reach their observers. Outstanding work remains visible.
  await new Promise<void>((resolve) => nativeSetTimeout(resolve, 0));
  const leaks: string[] = [];
  if (def.sanitizeResources !== false) {
    for (const [item, label] of resources) if (!beforeResources.has(item)) leaks.push(label);
    for (const [callback, names] of signals) {
      for (const name of names) if (!beforeSignals.get(callback)?.has(name)) leaks.push(`signal listener ${name}`);
    }
  }
  if (def.sanitizeOps !== false) {
    for (const [item, label] of operations) if (!beforeOps.has(item)) leaks.push(`pending ${label}`);
    for (const [id, label] of timers) if (!beforeTimers.has(id)) leaks.push(label);
  }
  if (unfinishedSteps) leaks.push(`${unfinishedSteps} unawaited test steps`);
  if (failure) throw failure;
  if (failures.length) throw new AggregateError(failures, `Failed steps in ${def.name}`);
  if (leaks.length) throw new Error(`Leaked resources/operations in ${def.name}: ${leaks.join(", ")}`);
}
function test(
  first: string | Definition | Omit<Definition, "fn"> | Callback,
  second?: Callback | Omit<Definition, "fn">,
  third?: Callback,
) {
  const def = definition(first, second, third);
  exclusiveTests ||= def.only === true;
  const register = def.ignore ? bunTest.skip : def.only ? bunTest.only : bunTest;
  register(def.name, () => runDefinition(def), 60_000);
}
// Host identity is selected before installing this fixture-only compatibility namespace.
const deno = Object.create(runtimeHost);
Object.assign(deno, {
  test,
  noColor: !process.stdout.isTTY,
  realPath: (path: string | URL) =>
    new Promise<string>((resolve, reject) => realpath(path, (error, value) => error ? reject(error) : resolve(value))),
  realPathSync: realpathSync,
});
Object.defineProperty(globalThis, "Deno", { value: deno, configurable: true, writable: true });
// A file: dependency can load a second module copy. Reuse the instrumented host
// through the same injection seam compiled applications use, so sanitizers and
// nominal host error classes remain authoritative across package boundaries.
Object.defineProperty(globalThis, "__exotuiRuntimeHost", { value: runtimeHost, configurable: true, writable: true });
