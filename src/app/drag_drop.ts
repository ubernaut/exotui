// Copyright 2023 Im-Beast. MIT license.

// INP-008: typed drag-and-drop with policy-gated reads. Payloads carry
// their kind (text, files, application data); FILE CONTENT never loads
// until the host policy allows it — a denied file exposes metadata only,
// and its reader is structurally absent. Accepted drops hand the consumer
// an abortable session, and the event shape is adapter-neutral: browser
// DataTransfer adapters and Kitty/terminal adapters both produce the same
// DragDropEvent, so consumers never branch on the host.

/** File metadata, always visible; content is behind the policy gate. */
export interface DragFileEntry {
  readonly name: string;
  readonly size: number;
  readonly mimeType?: string;
}

/** The adapter-neutral payload. */
export type DragPayload =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "files"; readonly files: readonly DragFileEntry[] }
  | { readonly kind: "application"; readonly format: string; readonly data: unknown };

/** One drop event, as every adapter produces it. */
export interface DragDropEvent {
  readonly payload: DragPayload;
  readonly x: number;
  readonly y: number;
  /** Opens a file's content; present ONLY after the policy allowed it. */
  readonly readFile?: (name: string, signal: AbortSignal) => Promise<Uint8Array>;
}

/** The host policy: inspects metadata, decides before any read exists. */
export type DropPolicy = (payload: DragPayload) => "accept" | "deny";

/** A policy-checked drop, ready for the consumer. */
export interface AcceptedDrop {
  readonly payload: DragPayload;
  readonly x: number;
  readonly y: number;
  /** Present only for accepted file drops with a reader. */
  readonly readFile?: (name: string) => Promise<Uint8Array>;
  /** Cancels in-flight reads and marks the drop dead. */
  cancel(): void;
  readonly cancelled: boolean;
}

/** Result of routing one drop. */
export type DropOutcome =
  | { readonly kind: "accepted"; readonly drop: AcceptedDrop }
  | { readonly kind: "denied"; readonly metadata: DragPayload };

/** Routes adapter events through the host policy. */
export class DragDropRouter {
  readonly #policy: DropPolicy;

  constructor(policy: DropPolicy) {
    this.#policy = policy;
  }

  /**
   * Applies the policy. Denied drops keep metadata only — the reader is
   * stripped structurally, so no code path can read denied content.
   */
  route(event: DragDropEvent): DropOutcome {
    if (this.#policy(event.payload) === "deny") {
      return { kind: "denied", metadata: event.payload };
    }
    const controller = new AbortController();
    let cancelled = false;
    const reader = event.readFile;
    const drop: AcceptedDrop = {
      payload: event.payload,
      x: event.x,
      y: event.y,
      readFile: reader && event.payload.kind === "files"
        ? async (name) => {
          if (cancelled) throw new Error("drop was cancelled");
          return await reader(name, controller.signal);
        }
        : undefined,
      cancel: () => {
        cancelled = true;
        controller.abort();
      },
      get cancelled() {
        return cancelled;
      },
    };
    return { kind: "accepted", drop };
  }
}

/** Adapts a browser DataTransfer-shaped object to the neutral event. */
export function adaptBrowserDrop(
  transfer: {
    readonly types: readonly string[];
    getData(type: string): string;
    readonly files?: ReadonlyArray<{ name: string; size: number; type: string }>;
  },
  position: { readonly x: number; readonly y: number },
  readFile?: (name: string, signal: AbortSignal) => Promise<Uint8Array>,
): DragDropEvent {
  if (transfer.files && transfer.files.length > 0) {
    return {
      payload: {
        kind: "files",
        files: transfer.files.map((file) => ({ name: file.name, size: file.size, mimeType: file.type || undefined })),
      },
      ...position,
      readFile,
    };
  }
  if (transfer.types.includes("application/json")) {
    return {
      payload: {
        kind: "application",
        format: "application/json",
        data: JSON.parse(transfer.getData("application/json")),
      },
      ...position,
    };
  }
  return { payload: { kind: "text", text: transfer.getData("text/plain") }, ...position };
}

/** Adapts a Kitty/terminal path-drop (newline-separated paths) likewise. */
export function adaptTerminalDrop(
  paths: readonly string[],
  position: { readonly x: number; readonly y: number },
  stat: (path: string) => { readonly size: number } | undefined,
  readFile?: (name: string, signal: AbortSignal) => Promise<Uint8Array>,
): DragDropEvent {
  return {
    payload: {
      kind: "files",
      files: paths.map((path) => ({ name: path, size: stat(path)?.size ?? 0 })),
    },
    ...position,
    readFile,
  };
}

/** Creates a drop router over a host policy. */
export function createDragDropRouter(policy: DropPolicy): DragDropRouter {
  return new DragDropRouter(policy);
}
