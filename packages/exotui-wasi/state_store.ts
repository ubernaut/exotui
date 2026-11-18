import type { AsyncStore } from "../../src/runtime/storage.ts";

interface ByteStore {
  get(key: string): Uint8Array | undefined;
  set(key: string, bytes: Uint8Array): void;
  delete(key: string): void;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** UTF-8 JSON for the existing desktop settings schema; not a structured-clone store. */
export function stateStore<T>(backend: ByteStore, onError?: (error: unknown) => void): AsyncStore<T> {
  function access<R>(key: string, action: () => R): R {
    try {
      if (encoder.encode(key).length > 256 || key.includes("\0")) throw new RangeError("Invalid desktop state key");
      return action();
    } catch (error) {
      onError?.(error);
      throw error;
    }
  }
  return {
    async get(key) {
      return access(key, () => {
        const bytes = backend.get(key);
        return bytes === undefined ? undefined : JSON.parse(decoder.decode(bytes)) as T;
      });
    },
    async set(key, value) {
      access(key, () => {
        const json = JSON.stringify(value);
        if (json === undefined) throw new TypeError("Desktop state must be JSON-serializable");
        const bytes = encoder.encode(json);
        if (bytes.length > 1024 * 1024) throw new RangeError("Desktop state value is too large");
        backend.set(key, bytes);
      });
    },
    async delete(key) {
      access(key, () => backend.delete(key));
    },
  };
}
