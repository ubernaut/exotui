import { runtimeHost } from "./host.ts";
// Copyright 2023 Im-Beast. MIT license.
import { Signal, type SignalOptions } from "../signals/mod.ts";
import { errorMessage } from "../utils/formatting.ts";
import type { DiagnosticsCollector } from "./diagnostics.ts";

/** Public interface describing an async Store. */
export interface AsyncStore<T = unknown> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Public class implementing a memory Store. */
export class MemoryStore<T = unknown> implements AsyncStore<T> {
  private readonly values = new Map<string, T>();

  get(key: string): Promise<T | undefined> {
    return Promise.resolve(this.values.get(key));
  }

  set(key: string, value: T): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.values.delete(key);
    return Promise.resolve();
  }
}

/** Public class implementing a Deno JSON-file backed Store. */
export class JsonFileStore<T = unknown> implements AsyncStore<T> {
  private readonly readTextFile: (path: string) => Promise<string>;
  private readonly writeTextFile: (path: string, data: string) => Promise<void>;
  private readonly isNotFound: (error: unknown) => boolean;

  constructor(
    private readonly path: string,
    fileSystem: {
      readTextFile?: (path: string) => Promise<string>;
      writeTextFile?: (path: string, data: string) => Promise<void>;
      isNotFound?: (error: unknown) => boolean;
    } = {},
  ) {
    this.readTextFile = fileSystem.readTextFile ?? runtimeHost.readTextFile;
    this.writeTextFile = fileSystem.writeTextFile ?? runtimeHost.writeTextFile;
    this.isNotFound = fileSystem.isNotFound ?? ((error) => error instanceof runtimeHost.errors.NotFound);
  }

  async get(key: string): Promise<T | undefined> {
    const values = await this.#read();
    return values[key] as T | undefined;
  }

  async set(key: string, value: T): Promise<void> {
    const values = await this.#read();
    values[key] = value;
    await this.writeTextFile(this.path, `${JSON.stringify(values, null, 2)}\n`);
  }

  async delete(key: string): Promise<void> {
    const values = await this.#read();
    delete values[key];
    await this.writeTextFile(this.path, `${JSON.stringify(values, null, 2)}\n`);
  }

  async #read(): Promise<Record<string, unknown>> {
    try {
      const content = await this.readTextFile(this.path);
      if (content.trim() === "") return {};
      const parsed = JSON.parse(content);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch (error) {
      if (this.isNotFound(error)) return {};
      throw error;
    }
  }
}

/** Options for configuring indexed Db Store. */
export interface IndexedDbStoreOptions {
  databaseName: string;
  storeName?: string;
  version?: number;
  diagnostics?: DiagnosticsCollector;
  scope?: typeof globalThis;
}

/** Options for configuring runtime Store. */
export interface RuntimeStoreOptions extends IndexedDbStoreOptions {
  preferIndexedDb?: boolean;
}

/** Options for configuring persistent Signal. */
export interface PersistentSignalOptions<T, Stored = T> {
  key: string;
  initialValue: T;
  store: AsyncStore<Stored>;
  signalOptions?: SignalOptions<T>;
  serialize?: (value: T) => Stored;
  deserialize?: (value: Stored) => T;
  onError?: (error: unknown) => void;
}

interface MinimalIdbDatabase {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string): unknown;
  transaction(storeName: string, mode: "readonly" | "readwrite"): {
    objectStore(name: string): {
      get(key: string): MinimalIdbRequest<unknown>;
      put(value: unknown, key: string): MinimalIdbRequest<unknown>;
      delete(key: string): MinimalIdbRequest<unknown>;
    };
  };
}

interface MinimalIdbRequest<T> {
  error: Error | null;
  result: T;
  // deno-lint-ignore no-explicit-any
  onsuccess: ((event: any) => any) | null;
  // deno-lint-ignore no-explicit-any
  onerror: ((event: any) => any) | null;
}

interface MinimalIdbOpenRequest extends MinimalIdbRequest<MinimalIdbDatabase> {
  // deno-lint-ignore no-explicit-any
  onupgradeneeded: ((event: any) => any) | null;
}

interface MinimalIndexedDb {
  open(databaseName: string, version: number): MinimalIdbOpenRequest;
}

/** Public class implementing an indexed Db Store. */
export class IndexedDbStore<T = unknown> implements AsyncStore<T> {
  private readonly storeName: string;
  private readonly databasePromise: Promise<MinimalIdbDatabase>;
  private readonly diagnostics?: DiagnosticsCollector;

  constructor(options: IndexedDbStoreOptions) {
    this.storeName = options.storeName ?? "values";
    this.diagnostics = options.diagnostics;
    this.databasePromise = openDatabase(options.databaseName, this.storeName, options.version ?? 1, options.scope)
      .catch((error) => {
        this.diagnostics?.report({
          source: "storage",
          code: "indexeddb-open-failed",
          severity: "warning",
          message: "IndexedDB open failed.",
          detail: errorMessage(error),
          context: {
            databaseName: options.databaseName,
            storeName: this.storeName,
            version: options.version ?? 1,
          },
        });
        throw error;
      });
  }

  async get(key: string): Promise<T | undefined> {
    const database = await this.databasePromise;
    return await requestValue<T | undefined>(
      database.transaction(this.storeName, "readonly").objectStore(this.storeName).get(key) as MinimalIdbRequest<
        T | undefined
      >,
      this.diagnostics,
      "get",
      this.storeName,
      key,
    );
  }

  async set(key: string, value: T): Promise<void> {
    const database = await this.databasePromise;
    await requestValue(
      database.transaction(this.storeName, "readwrite").objectStore(this.storeName).put(value, key),
      this.diagnostics,
      "set",
      this.storeName,
      key,
    );
  }

  async delete(key: string): Promise<void> {
    const database = await this.databasePromise;
    await requestValue(
      database.transaction(this.storeName, "readwrite").objectStore(this.storeName).delete(key),
      this.diagnostics,
      "delete",
      this.storeName,
      key,
    );
  }
}

/** Creates an runtime Store. */
export function createRuntimeStore<T = unknown>(options: RuntimeStoreOptions): AsyncStore<T> {
  const scope = options.scope ?? globalThis;
  if (options.preferIndexedDb !== false && "indexedDB" in scope) {
    return new IndexedDbStore<T>(options);
  }
  options.diagnostics?.report({
    source: "storage",
    code: options.preferIndexedDb === false ? "indexeddb-disabled" : "indexeddb-unavailable",
    severity: "info",
    message: options.preferIndexedDb === false
      ? "IndexedDB preference disabled; using memory store."
      : "IndexedDB unavailable; using memory store.",
    context: {
      databaseName: options.databaseName,
      storeName: options.storeName ?? "values",
      preferIndexedDb: options.preferIndexedDb !== false,
    },
  });
  return new MemoryStore<T>();
}

/** Public class implementing a persistent Signal. */
export class PersistentSignal<T, Stored = T> {
  readonly value: Signal<T>;
  readonly ready: Promise<T>;
  readonly key: string;
  readonly store: AsyncStore<Stored>;
  readonly initialValue: T;
  #loaded = false;
  #dirtyBeforeLoad = false;
  #suspendWrites = false;
  #pendingWrite: Promise<void> = Promise.resolve();

  readonly #serialize: (value: T) => Stored;
  readonly #deserialize: (value: Stored) => T;
  readonly #onError?: (error: unknown) => void;

  constructor(options: PersistentSignalOptions<T, Stored>) {
    this.key = options.key;
    this.store = options.store;
    this.initialValue = options.initialValue;
    this.value = new Signal(options.initialValue, options.signalOptions);
    this.#serialize = options.serialize ?? ((value) => value as unknown as Stored);
    this.#deserialize = options.deserialize ?? ((value) => value as unknown as T);
    this.#onError = options.onError;

    this.value.subscribe((value) => {
      if (this.#suspendWrites) return;
      if (!this.#loaded) {
        this.#dirtyBeforeLoad = true;
        return;
      }
      this.#write(value);
    });

    this.ready = this.#load();
  }

  set(value: T): void {
    this.value.value = value;
  }

  update(updater: (value: T) => T): void {
    this.value.value = updater(this.value.peek());
  }

  async flush(): Promise<void> {
    await this.ready;
    await this.#pendingWrite;
  }

  async reset(value = this.initialValue): Promise<void> {
    await this.ready;
    this.#suspendWrites = true;
    this.value.value = value;
    this.#suspendWrites = false;
    this.#pendingWrite = this.#pendingWrite
      .catch(() => undefined)
      .then(() => this.store.delete(this.key))
      .catch((error) => {
        this.#onError?.(error);
      });
    await this.#pendingWrite;
  }

  async #load(): Promise<T> {
    try {
      const stored = await this.store.get(this.key);
      this.#loaded = true;
      if (stored !== undefined && !this.#dirtyBeforeLoad) {
        this.value.value = this.#deserialize(stored);
      } else if (this.#dirtyBeforeLoad) {
        this.#write(this.value.peek());
      }
      return this.value.peek();
    } catch (error) {
      this.#loaded = true;
      this.#onError?.(error);
      return this.value.peek();
    }
  }

  #write(value: T): void {
    this.#pendingWrite = this.#pendingWrite
      .catch(() => undefined)
      .then(() => this.store.set(this.key, this.#serialize(value)))
      .catch((error) => {
        this.#onError?.(error);
      });
  }
}

/** Creates an persistent Signal. */
export function createPersistentSignal<T, Stored = T>(
  options: PersistentSignalOptions<T, Stored>,
): PersistentSignal<T, Stored> {
  return new PersistentSignal(options);
}

function openDatabase(
  databaseName: string,
  storeName: string,
  version: number,
  scope: typeof globalThis = globalThis,
): Promise<MinimalIdbDatabase> {
  if (!("indexedDB" in scope)) {
    return Promise.reject(new Error("IndexedDB is not available in this runtime."));
  }

  return new Promise((resolve, reject) => {
    const indexedDb = (scope as typeof globalThis & { indexedDB: MinimalIndexedDb }).indexedDB;
    const request = indexedDb.open(databaseName, version);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB database."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
  });
}

function requestValue<T>(
  request: MinimalIdbRequest<T>,
  diagnostics: DiagnosticsCollector | undefined,
  operation: string,
  storeName: string,
  key: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => {
      const error = request.error ?? new Error("IndexedDB request failed.");
      diagnostics?.report({
        source: "storage",
        code: "indexeddb-request-failed",
        severity: "warning",
        message: "IndexedDB request failed.",
        detail: errorMessage(error),
        context: { operation, storeName, key },
      });
      reject(error);
    };
    request.onsuccess = () => resolve(request.result);
  });
}
