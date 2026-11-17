// Vendored pinned canonical source: https://jsr.io/@std/json/1.1.0/types.ts
// Cache metadata removed; JSONC type import redirected locally.
// deno-fmt-ignore-file
// Copyright 2018-2026 the Deno authors. MIT license.
// This module is browser compatible.

/** A primitive JSON value. */
export type JsonPrimitive = string | number | boolean | null;

/** The type of the result of parsing JSON. */
export type JsonValue =
  | { [key: string]: JsonValue | undefined }
  | JsonValue[]
  | JsonPrimitive;

