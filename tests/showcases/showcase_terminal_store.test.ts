// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertRejects, assertStrictEquals } from "../deps.ts";
import { DiagnosticsCollector } from "../../src/runtime/diagnostics.ts";
import { MemoryStore } from "../../src/runtime/storage.ts";
import {
  createShowcaseTerminalStore,
  createShowcaseTerminalStorePermissionManifest,
  type ShowcaseTerminalFileAdapter,
  ShowcaseTerminalJsonStore,
  type ShowcaseTerminalPermissionGateway,
} from "../../src/showcase/terminal_store.ts";

const STATE_PATH = "/state/inkstone-session.json";

Deno.test("terminal showcase store stays in memory without querying permissions when disabled", async () => {
  const diagnostics = new DiagnosticsCollector();
  let queries = 0;
  const selection = await createShowcaseTerminalStore({
    enabled: false,
    path: STATE_PATH,
    diagnostics,
    permissions: {
      query: () => {
        queries += 1;
        return Promise.resolve("granted");
      },
    },
  });

  assert(selection.store instanceof MemoryStore);
  assertEquals(queries, 0);
  assertEquals(selection.inspect(), {
    mode: "memory-disabled",
    durable: false,
    explicitlyEnabled: false,
    requiredPermissionCount: 0,
    ungrantedPermissionCount: 0,
    reads: 0,
    writes: 0,
    recoveries: 0,
    rejectedFiles: 0,
  });
  assertEquals(diagnostics.entries().map((entry) => entry.code), ["terminal-store-disabled"]);
});

Deno.test("terminal showcase store declares exact immutable primary temp and backup permissions", () => {
  const manifest = createShowcaseTerminalStorePermissionManifest(STATE_PATH);
  assert(Object.isFrozen(manifest));
  assert(Object.isFrozen(manifest.required));
  assertEquals(manifest.adapterId, "showcase.terminal-json-store");
  assertEquals(manifest.optional, []);
  assertEquals(
    manifest.required.map((entry) => `${entry.kind}/${entry.operation}/${entry.target}`),
    [
      `read/content/${STATE_PATH}`,
      `read/content/${STATE_PATH}.bak`,
      `read/content/${STATE_PATH}.tmp`,
      "write/create//state",
      `write/create/${STATE_PATH}.tmp`,
      `write/modify/${STATE_PATH}.tmp`,
      `write/remove/${STATE_PATH}`,
      `write/remove/${STATE_PATH}.bak`,
      `write/remove/${STATE_PATH}.tmp`,
      `write/rename/${STATE_PATH}`,
      `write/rename/${STATE_PATH}.bak`,
      `write/rename/${STATE_PATH}.tmp`,
    ],
  );
});

Deno.test("terminal showcase store falls back deterministically when one exact permission is denied", async () => {
  const diagnostics = new DiagnosticsCollector();
  const queried: Array<{ name: string; path: string }> = [];
  let fileCalls = 0;
  const selection = await createShowcaseTerminalStore({
    enabled: true,
    path: STATE_PATH,
    diagnostics,
    permissions: {
      query(query) {
        queried.push({ ...query });
        return Promise.resolve(query.name === "write" && query.path.endsWith(".bak") ? "denied" : "granted");
      },
    },
    files: countingFiles(() => fileCalls += 1),
  });

  assert(selection.store instanceof MemoryStore);
  assertEquals(queried, [
    { name: "read", path: STATE_PATH },
    { name: "write", path: STATE_PATH },
    { name: "read", path: `${STATE_PATH}.tmp` },
    { name: "write", path: `${STATE_PATH}.tmp` },
    { name: "read", path: `${STATE_PATH}.bak` },
    { name: "write", path: `${STATE_PATH}.bak` },
    { name: "write", path: "/state" },
  ]);
  assertEquals(fileCalls, 0);
  assertEquals(selection.inspect().mode, "memory-permission-fallback");
  assertEquals(selection.inspect().requiredPermissionCount, 7);
  assertEquals(selection.inspect().ungrantedPermissionCount, 1);
  assertEquals(diagnostics.entries().map((entry) => entry.code), ["terminal-store-permission-fallback"]);
});

Deno.test("terminal showcase JSON store durably restores values across instances", async () => {
  const files = new MemoryFiles();
  const first = await createShowcaseTerminalStore<{ draft: string }>({
    enabled: true,
    path: STATE_PATH,
    permissions: grantedPermissions(),
    files,
  });
  assertEquals(first.inspect().mode, "durable");
  assertEquals(files.createdDirectories, ["/state"]);

  await first.store.set("workspace", { draft: "first" });
  await first.store.set("workspace", { draft: "second" });
  assert(files.values.has(STATE_PATH));
  assert(files.values.has(`${STATE_PATH}.bak`));
  assertEquals(files.values.has(`${STATE_PATH}.tmp`), false);

  const restored = new ShowcaseTerminalJsonStore<{ draft: string }>({ path: STATE_PATH, files });
  assertEquals(await restored.get("workspace"), { draft: "second" });
  const detached = await restored.get("workspace");
  assertStrictEquals(detached === await restored.get("workspace"), false);
});

Deno.test("terminal showcase store falls back when its exact parent directory cannot be created", async () => {
  const files = new MemoryFiles();
  const diagnostics = new DiagnosticsCollector();
  files.directoryError = new Error("PRIVATE DIRECTORY FAILURE");
  const selection = await createShowcaseTerminalStore({
    enabled: true,
    path: STATE_PATH,
    permissions: grantedPermissions(),
    files,
    diagnostics,
  });

  assert(selection.store instanceof MemoryStore);
  assertEquals(files.createdDirectories, ["/state"]);
  assertEquals(selection.inspect().mode, "memory-unavailable-fallback");
  const reported = JSON.stringify(diagnostics.entries());
  assertEquals(reported.includes("PRIVATE DIRECTORY FAILURE"), false);
  assertEquals(reported.includes(STATE_PATH), false);
  assertEquals(diagnostics.entries().map((entry) => entry.code), ["terminal-store-directory-unavailable"]);
});

Deno.test("terminal showcase JSON store serializes overlapping writes", async () => {
  const files = new MemoryFiles();
  const release = deferred<void>();
  const started = deferred<void>();
  let first = true;
  files.beforeWrite = async () => {
    if (!first) return;
    first = false;
    started.resolve();
    await release.promise;
  };
  const store = new ShowcaseTerminalJsonStore<number>({ path: STATE_PATH, files });

  const one = store.set("count", 1);
  const two = store.set("count", 2);
  await started.promise;
  assertEquals(files.activeWrites, 1);
  assertEquals(files.maxActiveWrites, 1);
  release.resolve();
  await Promise.all([one, two]);

  assertEquals(files.maxActiveWrites, 1);
  assertEquals(await store.get("count"), 2);
});

Deno.test("terminal showcase JSON store supports strict non-replacing rename across rotation and repair", async () => {
  const files = new MemoryFiles();
  const diagnostics = new DiagnosticsCollector();
  files.rejectExistingRename = true;
  const store = new ShowcaseTerminalJsonStore<number>({ path: STATE_PATH, files, diagnostics });

  await store.set("count", 1);
  await store.set("count", 2);
  await store.set("count", 3);
  assertEquals(await store.get("count"), 3);
  assertEquals(files.existingRenameAttempts, 0);
  assert(files.removedPaths.includes(`${STATE_PATH}.bak`));

  files.values.set(STATE_PATH, "{PRIVATE-CORRUPT-PRIMARY");
  await store.set("count", 4);
  assertEquals(await store.get("count"), 4);
  assertEquals(files.existingRenameAttempts, 0);
  assert(files.removedPaths.includes(STATE_PATH));
  assert(files.values.has(`${STATE_PATH}.bak`));
  const reported = JSON.stringify(diagnostics.entries());
  assertEquals(reported.includes("PRIVATE-CORRUPT-PRIMARY"), false);
  assertEquals(reported.includes(STATE_PATH), false);
});

Deno.test("terminal showcase JSON store recovers missing and corrupt primaries from backup", async () => {
  const files = new MemoryFiles();
  const diagnostics = new DiagnosticsCollector();
  const writer = new ShowcaseTerminalJsonStore<number>({ path: STATE_PATH, files });
  await writer.set("count", 1);
  await writer.set("count", 2);

  files.values.delete(STATE_PATH);
  const missing = new ShowcaseTerminalJsonStore<number>({ path: STATE_PATH, files, diagnostics });
  assertEquals(await missing.get("count"), 1);

  files.values.set(STATE_PATH, "{PRIVATE-CORRUPT-CONTENT");
  const corrupt = new ShowcaseTerminalJsonStore<number>({ path: STATE_PATH, files, diagnostics });
  assertEquals(await corrupt.get("count"), 1);
  assertEquals(corrupt.inspect().recoveries, 1);
  assertEquals(corrupt.inspect().rejectedFiles, 1);
  const reported = JSON.stringify(diagnostics.entries());
  assertEquals(reported.includes("PRIVATE-CORRUPT-CONTENT"), false);
  assertEquals(reported.includes(STATE_PATH), false);
  assert(diagnostics.entries().some((entry) => entry.code === "terminal-store-backup-recovered"));
});

Deno.test("terminal showcase JSON store rejects corrupt bounded files without leaking paths or content", async () => {
  const files = new MemoryFiles();
  const diagnostics = new DiagnosticsCollector();
  files.values.set(STATE_PATH, '["PRIVATE-PRIMARY"]');
  files.values.set(`${STATE_PATH}.bak`, '{"PRIVATE-BACKUP":');
  const store = new ShowcaseTerminalJsonStore<unknown>({ path: STATE_PATH, files, diagnostics, maxBytes: 128 });

  assertEquals(await store.get("workspace"), undefined);
  await assertRejects(() => store.set("workspace", "x".repeat(256)));
  const inspection = store.inspect();
  assertEquals(inspection.rejectedFiles >= 2, true);
  const publicState = JSON.stringify({ inspection, diagnostics: diagnostics.entries() });
  assertEquals(publicState.includes(STATE_PATH), false);
  assertEquals(publicState.includes("PRIVATE-PRIMARY"), false);
  assertEquals(publicState.includes("PRIVATE-BACKUP"), false);
});

function grantedPermissions(): ShowcaseTerminalPermissionGateway {
  return { query: () => Promise.resolve("granted") };
}

function countingFiles(onCall: () => void): ShowcaseTerminalFileAdapter {
  return {
    readTextFile: () => {
      onCall();
      return Promise.reject(new Error("unused"));
    },
    writeTextFile: () => {
      onCall();
      return Promise.resolve();
    },
    rename: () => {
      onCall();
      return Promise.resolve();
    },
    remove: () => {
      onCall();
      return Promise.resolve();
    },
    isNotFound: () => false,
  };
}

class MemoryFiles implements ShowcaseTerminalFileAdapter {
  readonly values = new Map<string, string>();
  readonly missing = new Error("missing");
  readonly createdDirectories: string[] = [];
  readonly removedPaths: string[] = [];
  directoryError?: Error;
  rejectExistingRename = false;
  existingRenameAttempts = 0;
  activeWrites = 0;
  maxActiveWrites = 0;
  beforeWrite?: () => Promise<void>;

  createDirectory(path: string): Promise<void> {
    this.createdDirectories.push(path);
    return this.directoryError ? Promise.reject(this.directoryError) : Promise.resolve();
  }

  readTextFile(path: string, maxBytes: number): Promise<string> {
    const value = this.values.get(path);
    if (value === undefined) return Promise.reject(this.missing);
    if (new TextEncoder().encode(value).byteLength > maxBytes) return Promise.reject(new Error("bounded"));
    return Promise.resolve(value);
  }

  async writeTextFile(path: string, data: string): Promise<void> {
    this.activeWrites += 1;
    this.maxActiveWrites = Math.max(this.maxActiveWrites, this.activeWrites);
    try {
      await this.beforeWrite?.();
      this.values.set(path, data);
    } finally {
      this.activeWrites -= 1;
    }
  }

  rename(oldPath: string, newPath: string): Promise<void> {
    const value = this.values.get(oldPath);
    if (value === undefined) return Promise.reject(this.missing);
    if (this.rejectExistingRename && this.values.has(newPath)) {
      this.existingRenameAttempts += 1;
      return Promise.reject(new Error("destination exists"));
    }
    this.values.set(newPath, value);
    this.values.delete(oldPath);
    return Promise.resolve();
  }

  remove(path: string): Promise<void> {
    this.removedPaths.push(path);
    if (!this.values.delete(path)) return Promise.reject(this.missing);
    return Promise.resolve();
  }

  isNotFound(error: unknown): boolean {
    return error === this.missing;
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
