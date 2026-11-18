import type { DatabaseSync } from "node:sqlite";
import type { AsyncStore } from "../../src/runtime/storage.ts";
import { stateStore } from "./state_store.ts";

/** Optional adapter for Bun and Deno to read the same SQLite desktop state. */
export function sqliteStateStore<T>(db: DatabaseSync, namespace: string): AsyncStore<T> {
  if (namespace !== "desktop") throw new RangeError("Desktop state namespace is not allowed");
  const get = db.prepare("SELECT value FROM exotui_kv WHERE namespace=? AND key=?");
  const set = db.prepare(
    "INSERT INTO exotui_kv(namespace,key,value) VALUES (?,?,?) ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value",
  );
  const remove = db.prepare("DELETE FROM exotui_kv WHERE namespace=? AND key=?");
  return stateStore<T>({
    get: (key) => get.get(namespace, key)?.value as Uint8Array | undefined,
    set: (key, bytes) => {
      set.run(namespace, key, bytes);
    },
    delete: (key) => {
      remove.run(namespace, key);
    },
  });
}
