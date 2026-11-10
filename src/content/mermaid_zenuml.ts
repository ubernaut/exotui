// Copyright 2026 ExotUI contributors. MIT license.
import { ZENUML_VALIDATION_WORKER } from "./mermaid_zenuml_data.ts";

/** Private data-only result from the pinned grammar; no upstream parser graph crosses realms. */
export interface ZenUmlParseResult {
  pass: boolean;
  error?: { line: number; column: number; msg: string };
}

/** One request, one owned realm. Always release its worker and script URL. */
export async function parseZenUml(source: string, signal?: AbortSignal): Promise<ZenUmlParseResult> {
  signal?.throwIfAborted();
  if (typeof source !== "string" || source.length > 128_000) {
    throw new RangeError("ZenUML source exceeds its character budget.");
  }
  if (typeof Worker === "undefined") throw new Error("ZenUML validation requires the host's Worker capability.");
  const url = URL.createObjectURL(new Blob([ZENUML_VALIDATION_WORKER], { type: "text/javascript" }));
  let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    worker = new Worker(url, { type: "module" });
    const owned = worker;
    return await new Promise<ZenUmlParseResult>((resolve, reject) => {
      abort = () => reject(signal!.reason);
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => reject(new DOMException("ZenUML validation timed out.", "TimeoutError")), 30_000);
      owned.onerror = (event) => {
        event.preventDefault();
        reject(
          new Error(
            event.message
              ? `ZenUML validation worker failed: ${event.message}`
              : "ZenUML validation worker could not start; check module-worker and blob: CSP permissions.",
          ),
        );
      };
      owned.onmessageerror = () => reject(new Error("ZenUML validation worker returned an unreadable result."));
      owned.onmessage = ({ data }: MessageEvent<ZenUmlParseResult>) => resolve(data);
      owned.postMessage(source);
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
    worker?.terminate();
    URL.revokeObjectURL(url);
  }
}
