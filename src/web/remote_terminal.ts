// Copyright 2023 Im-Beast. MIT license.
import { EventEmitter } from "../event_emitter.ts";
import {
  encodeTerminalFocusEvent,
  encodeTerminalKeyPress,
  encodeTerminalPaste,
  type TerminalInputRoutingOptions,
  type TerminalKeyEncodingOptions,
} from "../app/terminal_input.ts";
import { formatTerminalOutputLine, type TerminalOutputLine } from "../components/terminal_output.ts";
import type { ConsoleSize } from "../types.ts";
import type {
  KeyPressEvent,
  MousePressEvent,
  MouseScrollEvent,
  PasteEvent,
  TerminalFocusEvent,
} from "../input_reader/types.ts";
import type { TerminalSessionHandle } from "../runtime/terminal_backend.ts";
import {
  decodeRemoteHandshakeMessage,
  encodeRemoteHandshakeMessage,
  isRemoteHandshakeMessageType,
  RemoteCapabilityHandshake,
  type RemoteCapabilityHandshakeInspection,
  type RemoteCapabilityManifest,
  type RemoteHandshakeLimits,
  type RemoteHandshakeMessage,
  type RemoteHandshakeNegotiated,
  type RemoteHandshakeRejection,
  type RemoteHandshakeRejectionCode,
  type ResolvedRemoteHandshakeLimits,
} from "../remote/handshake.ts";

const textDecoder = new TextDecoder();
const typedArrayPrototype: object = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayTagGetter: ((this: ArrayBufferView) => string | undefined) | undefined = Object
  .getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)?.get as
    | ((this: ArrayBufferView) => string | undefined)
    | undefined;
const typedArrayByteLengthGetter: ((this: ArrayBufferView) => number) | undefined = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)?.get as
  | ((this: ArrayBufferView) => number)
  | undefined;
const typedArrayBufferGetter: ((this: ArrayBufferView) => ArrayBufferLike) | undefined = Object
  .getOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get as
    | ((this: ArrayBufferView) => ArrayBufferLike)
    | undefined;
const typedArrayByteOffsetGetter: ((this: ArrayBufferView) => number) | undefined = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteOffset",
)?.get as
  | ((this: ArrayBufferView) => number)
  | undefined;

/** Stable capability identifiers understood by the negotiated terminal protocol. */
export const REMOTE_TERMINAL_CAPABILITIES: Readonly<{
  input: "terminal.input";
  output: "terminal.output";
  binary: "terminal.binary";
  ping: "terminal.ping";
  resize: "terminal.resize";
}> = Object.freeze(
  {
    input: "terminal.input",
    output: "terminal.output",
    binary: "terminal.binary",
    ping: "terminal.ping",
    resize: "terminal.resize",
  } as const,
);

/** Default terminal capability manifest used by negotiated factories. */
export const DEFAULT_REMOTE_TERMINAL_CAPABILITY_MANIFEST: RemoteCapabilityManifest = Object.freeze({
  protocol: Object.freeze({ major: 1, minor: 0 }),
  mandatory: Object.freeze([REMOTE_TERMINAL_CAPABILITIES.input, REMOTE_TERMINAL_CAPABILITIES.output]),
  optional: Object.freeze([
    REMOTE_TERMINAL_CAPABILITIES.binary,
    REMOTE_TERMINAL_CAPABILITIES.ping,
    REMOTE_TERMINAL_CAPABILITIES.resize,
  ]),
});

/** Optional manifest and strict wire bounds for a negotiated endpoint. */
export interface RemoteTerminalNegotiationOptions {
  readonly manifest?: RemoteCapabilityManifest;
  readonly limits?: RemoteHandshakeLimits;
}

/** Local negotiated-client operation failure codes. */
export type RemoteTerminalNegotiationErrorCode =
  | "closed"
  | "not-ready"
  | "capability-not-negotiated"
  | "send-failed"
  | "invalid-options";

/** Typed local failure raised when negotiated traffic cannot be sent safely. */
export class RemoteTerminalNegotiationError extends Error {
  constructor(
    readonly code: RemoteTerminalNegotiationErrorCode,
    message: string,
    readonly capability?: string,
    override readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "RemoteTerminalNegotiationError";
  }
}

/** Input event payload sent from a remote client to a hosted terminal session. */
export type RemoteTerminalInputEvent =
  | { kind: "keyPress"; event: KeyPressEvent }
  | { kind: "mousePress"; event: MousePressEvent }
  | { kind: "mouseScroll"; event: MouseScrollEvent }
  | { kind: "paste"; event: PasteEvent }
  | { kind: "terminalFocus"; event: TerminalFocusEvent };

/** Client-to-server message for remote terminal input, resize, and heartbeat traffic. */
export type RemoteTerminalClientMessage =
  | { type: "input"; input: RemoteTerminalInputEvent }
  | { type: "resize"; size: ConsoleSize }
  | { type: "ping"; id: string };

/** Server-to-client message for remote terminal output, resize acknowledgements, errors, and lifecycle. */
export type RemoteTerminalServerMessage =
  | { type: "data"; data: string }
  | { type: "binary"; data: Uint8Array }
  | { type: "resize"; size: ConsoleSize }
  | { type: "pong"; id: string }
  | { type: "error"; message: string }
  | { type: "close"; reason?: string };

/** Bidirectional string/binary transport used by remote terminal clients and bridges. */
export interface RemoteTerminalTransport {
  send(message: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onOpen?(listener: () => void): () => void;
  onMessage(listener: (message: string | Uint8Array) => void): () => void;
  onClose(listener: (reason?: string) => void): () => void;
  onError?(listener: (error: unknown) => void): () => void;
}

/** Snapshot of remote terminal client connection counters. */
export interface RemoteTerminalClientInspection {
  open: boolean;
  dataMessages: number;
  inputMessages: number;
  resizeMessages: number;
}

/** Event map emitted by a remote terminal client. */
export type RemoteTerminalClientEvents = {
  data: { args: [string | Uint8Array] };
  resize: { args: [ConsoleSize] };
  error: { args: [unknown] };
  close: { args: [string | undefined] };
  pong: { args: [string] };
};

/** Snapshot of remote terminal bridge connection counters. */
export interface RemoteTerminalBridgeInspection {
  open: boolean;
  dataMessages: number;
  inputMessages: number;
  resizeMessages: number;
  errorMessages: number;
}

/** Client for driving a hosted terminal session over a transport. */
export class RemoteTerminalClient extends EventEmitter<RemoteTerminalClientEvents> {
  readonly #transport: RemoteTerminalTransport;
  readonly #removeListeners: Array<() => void>;
  #open = true;
  #dataMessages = 0;
  #inputMessages = 0;
  #resizeMessages = 0;

  constructor(transport: RemoteTerminalTransport) {
    super();
    this.#transport = transport;
    this.#removeListeners = [
      transport.onMessage((message) => this.#handleMessage(message)),
      transport.onClose((reason) => {
        this.#open = false;
        this.emit("close", reason);
      }),
    ];
    const removeError = transport.onError?.((error) => this.emit("error", error));
    if (removeError) this.#removeListeners.push(removeError);
  }

  sendInput(input: RemoteTerminalInputEvent): void {
    this.#inputMessages += 1;
    this.#send({ type: "input", input });
  }

  sendKeyPress(event: KeyPressEvent): void {
    this.sendInput({ kind: "keyPress", event });
  }

  sendMousePress(event: MousePressEvent): void {
    this.sendInput({ kind: "mousePress", event });
  }

  sendMouseScroll(event: MouseScrollEvent): void {
    this.sendInput({ kind: "mouseScroll", event });
  }

  sendPaste(event: PasteEvent): void {
    this.sendInput({ kind: "paste", event });
  }

  sendTerminalFocus(event: TerminalFocusEvent): void {
    this.sendInput({ kind: "terminalFocus", event });
  }

  resize(size: ConsoleSize): void {
    this.#resizeMessages += 1;
    this.#send({ type: "resize", size });
  }

  ping(id: string = crypto.randomUUID()): string {
    this.#send({ type: "ping", id });
    return id;
  }

  close(code?: number, reason?: string): void {
    if (!this.#open) return;
    this.#open = false;
    this.#transport.close(code, reason);
    for (const remove of this.#removeListeners) remove();
    this.#removeListeners.length = 0;
  }

  inspectClient(): RemoteTerminalClientInspection {
    return {
      open: this.#open,
      dataMessages: this.#dataMessages,
      inputMessages: this.#inputMessages,
      resizeMessages: this.#resizeMessages,
    };
  }

  #send(message: RemoteTerminalClientMessage): void {
    this.#transport.send(encodeRemoteTerminalMessage(message));
  }

  #handleMessage(message: string | Uint8Array): void {
    const decoded = decodeRemoteTerminalServerMessage(message);
    if (decoded.type === "data") {
      this.#dataMessages += 1;
      this.emit("data", decoded.data);
    } else if (decoded.type === "binary") {
      this.#dataMessages += 1;
      this.emit("data", decoded.data);
    } else if (decoded.type === "resize") {
      this.emit("resize", decoded.size);
    } else if (decoded.type === "pong") {
      this.emit("pong", decoded.id);
    } else if (decoded.type === "error") {
      this.emit("error", new Error(decoded.message));
    } else {
      this.#open = false;
      this.emit("close", decoded.reason);
    }
  }
}

/** WebSocket transport implementation for browser remote terminal clients. */
export class WebSocketRemoteTerminalTransport implements RemoteTerminalTransport {
  readonly #socket: WebSocket;

  constructor(url: string | URL, protocols?: string | string[]) {
    this.#socket = new WebSocket(url, protocols);
    this.#socket.binaryType = "arraybuffer";
  }

  send(message: string | Uint8Array): void {
    this.#socket.send(typeof message === "string" ? message : new Uint8Array(message));
  }

  close(code?: number, reason?: string): void {
    this.#socket.close(code, reason);
  }

  onMessage(listener: (message: string | Uint8Array) => void): () => void {
    const handler = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        listener(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        listener(new Uint8Array(event.data));
      } else if (event.data instanceof Blob) {
        void event.data.arrayBuffer().then((buffer) => listener(new Uint8Array(buffer)));
      }
    };
    this.#socket.addEventListener("message", handler);
    return () => this.#socket.removeEventListener("message", handler);
  }

  onOpen(listener: () => void): () => void {
    let active = true;
    const handler = () => {
      if (active) listener();
    };
    if (this.#socket.readyState === WebSocket.OPEN) queueMicrotask(handler);
    else if (this.#socket.readyState === WebSocket.CONNECTING) {
      this.#socket.addEventListener("open", handler, { once: true });
    }
    return () => {
      active = false;
      this.#socket.removeEventListener("open", handler);
    };
  }

  onClose(listener: (reason?: string) => void): () => void {
    const handler = (event: CloseEvent) => listener(event.reason);
    this.#socket.addEventListener("close", handler);
    return () => this.#socket.removeEventListener("close", handler);
  }

  onError(listener: (error: unknown) => void): () => void {
    const handler = (event: Event) => listener(event);
    this.#socket.addEventListener("error", handler);
    return () => this.#socket.removeEventListener("error", handler);
  }
}

/** Creates a remote terminal client over the provided transport. */
export function createRemoteTerminalClient(transport: RemoteTerminalTransport): RemoteTerminalClient {
  return new RemoteTerminalClient(transport);
}

/** Creates a remote terminal client backed by a browser WebSocket. */
export function createWebSocketRemoteTerminalClient(
  url: string | URL,
  protocols?: string | string[],
): RemoteTerminalClient {
  return new RemoteTerminalClient(new WebSocketRemoteTerminalTransport(url, protocols));
}

/** Snapshot of a capability-gated remote terminal client. */
export interface NegotiatedRemoteTerminalClientInspection extends RemoteTerminalClientInspection {
  readonly handshake: RemoteCapabilityHandshakeInspection;
}

/** Additional lifecycle events emitted by a capability-gated client. */
export type NegotiatedRemoteTerminalClientEvents = RemoteTerminalClientEvents & {
  ready: { args: [RemoteHandshakeNegotiated] };
  rejection: { args: [RemoteHandshakeRejection] };
};

/**
 * Remote terminal client that sends no application traffic until the strict
 * version/capability handshake succeeds.
 */
export class NegotiatedRemoteTerminalClient extends EventEmitter<NegotiatedRemoteTerminalClientEvents> {
  readonly #transport: RemoteTerminalTransport;
  readonly #handshake: RemoteCapabilityHandshake;
  readonly #limits: ResolvedRemoteHandshakeLimits;
  readonly #removeListeners: Array<() => void> = [];
  #handshakeSnapshot?: RemoteCapabilityHandshakeInspection;
  #open = true;
  #finished = false;
  #started = false;
  #rejectionEmitted = false;
  #dataMessages = 0;
  #inputMessages = 0;
  #resizeMessages = 0;

  constructor(transport: RemoteTerminalTransport, options: RemoteTerminalNegotiationOptions = {}) {
    super();
    const negotiation = snapshotRemoteTerminalNegotiationOptions(options, "client options");
    this.#transport = transport;
    this.#handshake = new RemoteCapabilityHandshake({
      role: "initiator",
      manifest: negotiation.manifest ?? DEFAULT_REMOTE_TERMINAL_CAPABILITY_MANIFEST,
      ...(negotiation.limits === undefined ? {} : { limits: negotiation.limits }),
    });
    this.#limits = this.#handshake.inspect().limits;
    this.#registerListener(transport.onMessage((message) => this.#handleMessage(message)));
    if (!this.#finished) {
      this.#registerListener(transport.onClose((reason) => this.#finishClose(reason, false)));
    }
    if (!this.#finished) {
      const removeError = transport.onError?.((error) => {
        this.#emitError(error);
        this.#rejectHandshake("transport-error", "remote terminal transport failed");
      });
      if (removeError) this.#registerListener(removeError);
    }
    const removeOpen = this.#finished ? undefined : transport.onOpen?.(() => this.#startHandshake());
    if (removeOpen) this.#registerListener(removeOpen);
    else if (!transport.onOpen) {
      this.#startHandshake();
    }
  }

  /** Sends a negotiated input event. */
  sendInput(input: RemoteTerminalInputEvent): void {
    this.#requireCapability(REMOTE_TERMINAL_CAPABILITIES.input);
    this.#sendApplication({ type: "input", input });
    this.#inputMessages += 1;
  }

  /** Sends a negotiated key press. */
  sendKeyPress(event: KeyPressEvent): void {
    this.sendInput({ kind: "keyPress", event });
  }

  /** Sends a negotiated mouse press. */
  sendMousePress(event: MousePressEvent): void {
    this.sendInput({ kind: "mousePress", event });
  }

  /** Sends a negotiated mouse scroll event. */
  sendMouseScroll(event: MouseScrollEvent): void {
    this.sendInput({ kind: "mouseScroll", event });
  }

  /** Sends a negotiated paste event. */
  sendPaste(event: PasteEvent): void {
    this.sendInput({ kind: "paste", event });
  }

  /** Sends a negotiated terminal-focus event. */
  sendTerminalFocus(event: TerminalFocusEvent): void {
    this.sendInput({ kind: "terminalFocus", event });
  }

  /** Requests a resize only when resize was negotiated. */
  resize(size: ConsoleSize): void {
    this.#requireCapability(REMOTE_TERMINAL_CAPABILITIES.resize);
    this.#sendApplication({ type: "resize", size });
    this.#resizeMessages += 1;
  }

  /** Sends a heartbeat only when heartbeat support was negotiated. */
  ping(id: string = crypto.randomUUID()): string {
    this.#requireCapability(REMOTE_TERMINAL_CAPABILITIES.ping);
    this.#sendApplication({ type: "ping", id });
    return id;
  }

  /** Idempotently closes the transport and releases listeners exactly once. */
  close(code?: number, reason?: string): void {
    this.#finishClose(reason, true, code);
  }

  /** Returns a deeply immutable handshake snapshot plus application counters. */
  inspectClient(): NegotiatedRemoteTerminalClientInspection {
    return Object.freeze({
      open: this.#open,
      dataMessages: this.#dataMessages,
      inputMessages: this.#inputMessages,
      resizeMessages: this.#resizeMessages,
      handshake: this.#handshakeSnapshot ?? this.#handshake.inspect(),
    });
  }

  #startHandshake(): void {
    if (!this.#open || this.#started) return;
    this.#started = true;
    this.#sendHandshake(this.#handshake.start());
  }

  #registerListener(remove: () => void): void {
    if (!this.#finished) {
      this.#removeListeners.push(remove);
      return;
    }
    try {
      remove();
    } catch {
      // A synchronously reentrant registration is removed immediately.
    }
  }

  #handleMessage(message: string | Uint8Array): void {
    if (!this.#open) return;
    if (!isRemoteTerminalWireValue(message)) {
      this.#rejectHandshake("malformed-handshake", "remote terminal wire value is invalid");
      return;
    }
    if (typeof message === "string" && !remoteTerminalTextWithinBound(message, this.#limits.maxMessageBytes)) {
      this.#rejectHandshake("invalid-negotiation", "remote terminal text message exceeds the wire bound");
      return;
    }
    const discriminant = this.#handshake.ready && typeof message !== "string"
      ? undefined
      : remoteHandshakeDiscriminant(message, this.#limits.maxMessageBytes);
    if (!this.#handshake.ready) {
      if (discriminant === undefined) {
        this.#rejectHandshake("traffic-before-ready", "terminal traffic arrived before handshake completion");
        return;
      }
      this.#consumeHandshake(message);
      return;
    }
    if (discriminant !== undefined) {
      this.#consumeHandshake(message);
      return;
    }

    let decoded: RemoteTerminalServerMessage;
    try {
      decoded = decodeRemoteTerminalServerMessage(message);
    } catch (error) {
      this.#emitError(error);
      this.#rejectHandshake("invalid-negotiation", "malformed terminal server message");
      return;
    }
    if (decoded.type === "data") {
      if (!this.#acceptPeerCapability(REMOTE_TERMINAL_CAPABILITIES.output)) return;
      this.#dataMessages += 1;
      this.#emitData(decoded.data);
    } else if (decoded.type === "binary") {
      if (!this.#acceptPeerCapability(REMOTE_TERMINAL_CAPABILITIES.binary)) return;
      this.#dataMessages += 1;
      this.#emitData(decoded.data);
    } else if (decoded.type === "resize") {
      if (!this.#acceptPeerCapability(REMOTE_TERMINAL_CAPABILITIES.resize)) return;
      this.#emitResize(decoded.size);
    } else if (decoded.type === "pong") {
      if (!this.#acceptPeerCapability(REMOTE_TERMINAL_CAPABILITIES.ping)) return;
      this.#emitPong(decoded.id);
    } else if (decoded.type === "error") {
      this.#emitError(new Error(decoded.message));
    } else if (decoded.type === "close") {
      this.#finishClose(decoded.reason, true);
    } else {
      this.#rejectHandshake("invalid-negotiation", "unknown terminal server message type");
    }
  }

  #consumeHandshake(message: string | Uint8Array): void {
    let decoded: RemoteHandshakeMessage;
    try {
      decoded = decodeRemoteHandshakeMessage(message, this.#limits);
    } catch (error) {
      this.#emitError(error);
      this.#rejectHandshake("malformed-handshake", "received a malformed remote handshake");
      return;
    }
    const result = this.#handshake.receive(decoded);
    if (result.response !== undefined && !this.#sendHandshake(result.response)) return;
    if (result.rejection !== undefined) {
      this.#emitRejection(result.rejection);
      this.#finishClose(result.rejection.code, true, 1002);
      return;
    }
    if (result.negotiated !== undefined) this.#emitReady(result.negotiated);
  }

  #requireCapability(capability: string): void {
    if (!this.#open) {
      throw new RemoteTerminalNegotiationError("closed", "remote terminal client is closed", capability);
    }
    const inspection = this.#handshake.inspect();
    if (!this.#handshake.ready || inspection.negotiated === undefined) {
      throw new RemoteTerminalNegotiationError("not-ready", "remote terminal handshake is not ready", capability);
    }
    if (!inspection.negotiated.capabilities.includes(capability)) {
      throw new RemoteTerminalNegotiationError(
        "capability-not-negotiated",
        `remote terminal capability ${capability} was not negotiated`,
        capability,
      );
    }
  }

  #acceptPeerCapability(capability: string): boolean {
    const negotiated = this.#handshake.inspect().negotiated;
    if (negotiated?.capabilities.includes(capability)) return true;
    this.#rejectHandshake(
      "unsupported-capability",
      `peer used unnegotiated capability ${capability}`,
      [capability],
    );
    return false;
  }

  #sendApplication(message: RemoteTerminalClientMessage): void {
    try {
      this.#transport.send(encodeRemoteTerminalMessage(message));
    } catch (cause) {
      this.#failSend(cause);
      throw new RemoteTerminalNegotiationError("send-failed", "remote terminal send failed", undefined, cause);
    }
  }

  #sendHandshake(message: RemoteHandshakeMessage): boolean {
    try {
      this.#transport.send(encodeRemoteHandshakeMessage(message, this.#limits));
      return true;
    } catch (cause) {
      if (message.type !== "remote.handshake.reject") this.#failSend(cause);
      else {
        this.#emitError(cause);
        this.#finishClose("send-failed", true, 1002);
      }
      return false;
    }
  }

  #failSend(cause: unknown): void {
    if (!this.#open) return;
    const rejection = this.#handshake.reject({
      code: "send-failed",
      message: "remote terminal handshake send failed",
      localProtocol: this.#handshake.inspect().manifest.protocol,
    }).rejection;
    this.#emitRejection(rejection);
    this.#finishClose("send-failed", true, 1002);
    this.#emitError(cause);
  }

  #rejectHandshake(
    code: RemoteHandshakeRejectionCode,
    message: string,
    capabilities?: readonly string[],
  ): void {
    if (!this.#open) return;
    const rejectionMessage = this.#handshake.reject({
      code,
      message,
      ...(capabilities === undefined ? {} : { capabilities }),
      localProtocol: this.#handshake.inspect().manifest.protocol,
    });
    this.#sendHandshake(rejectionMessage);
    this.#emitRejection(rejectionMessage.rejection);
    this.#finishClose(code, true, 1002);
  }

  #finishClose(reason: string | undefined, closeTransport: boolean, code?: number): void {
    if (this.#finished) return;
    this.#finished = true;
    this.#open = false;
    this.#handshakeSnapshot = this.#handshake.inspect();
    this.#handshake.dispose();
    for (const remove of this.#removeListeners.splice(0)) {
      try {
        remove();
      } catch {
        // Listener cleanup is best-effort, but every remover is attempted once.
      }
    }
    if (closeTransport) {
      try {
        this.#transport.close(code, reason);
      } catch (error) {
        this.#emitError(error);
      }
    }
    try {
      this.emit("close", reason);
    } catch {
      // A user close listener cannot make lifecycle cleanup run twice.
    }
  }

  #emitReady(negotiated: RemoteHandshakeNegotiated): void {
    try {
      this.emit("ready", negotiated);
    } catch (error) {
      this.#emitError(error);
    }
  }

  #emitRejection(rejection: RemoteHandshakeRejection): void {
    if (this.#rejectionEmitted) return;
    this.#rejectionEmitted = true;
    try {
      this.emit("rejection", rejection);
    } catch {
      // Rejection delivery cannot interrupt fail-closed teardown.
    }
  }

  #emitData(data: string | Uint8Array): void {
    try {
      this.emit("data", data);
    } catch (error) {
      this.#emitError(error);
    }
  }

  #emitResize(size: ConsoleSize): void {
    try {
      this.emit("resize", size);
    } catch (error) {
      this.#emitError(error);
    }
  }

  #emitPong(id: string): void {
    try {
      this.emit("pong", id);
    } catch (error) {
      this.#emitError(error);
    }
  }

  #emitError(error: unknown): void {
    try {
      this.emit("error", error);
    } catch {
      // Error listeners are isolated from protocol state transitions.
    }
  }
}

/** Creates a capability-gated client; negotiation is enabled by default. */
export function createNegotiatedRemoteTerminalClient(
  transport: RemoteTerminalTransport,
  options: RemoteTerminalNegotiationOptions = {},
): NegotiatedRemoteTerminalClient {
  return new NegotiatedRemoteTerminalClient(transport, options);
}

/** Creates a capability-gated browser WebSocket client. */
export function createWebSocketNegotiatedRemoteTerminalClient(
  url: string | URL,
  protocols?: string | string[],
  options: RemoteTerminalNegotiationOptions = {},
): NegotiatedRemoteTerminalClient {
  return new NegotiatedRemoteTerminalClient(new WebSocketRemoteTerminalTransport(url, protocols), options);
}

/** Options for bridging a remote transport to a terminal session handle. */
export interface RemoteTerminalBridgeOptions {
  killOnClose?: boolean;
  sourcePrefix?: boolean;
}

/** Bridges transport messages to a terminal session and forwards session output back to the client. */
export class RemoteTerminalBridge {
  readonly #transport: RemoteTerminalTransport;
  readonly #session: TerminalSessionHandle;
  readonly #options: RemoteTerminalBridgeOptions;
  readonly #removeListeners: Array<() => void>;
  #open = true;
  #dataMessages = 0;
  #inputMessages = 0;
  #resizeMessages = 0;
  #errorMessages = 0;
  #lineCount = 0;

  constructor(
    transport: RemoteTerminalTransport,
    session: TerminalSessionHandle,
    options: RemoteTerminalBridgeOptions = {},
  ) {
    this.#transport = transport;
    this.#session = session;
    this.#options = options;
    this.#lineCount = session.output.lines.peek().length;
    const outputListener = (lines: TerminalOutputLine[]) => this.#sendNewOutputLines(lines);
    session.output.lines.subscribe(outputListener);
    this.#removeListeners = [
      transport.onMessage((message) => void this.#handleClientMessage(message)),
      transport.onClose((reason) => {
        const wasOpen = this.#open;
        this.#open = false;
        if (this.#options.killOnClose) void this.#session.kill();
        this.#disposeListeners();
        if (wasOpen && reason) this.#send({ type: "close", reason });
      }),
      () => session.output.lines.unsubscribe(outputListener),
    ];
    const removeError = transport.onError?.((error) =>
      this.#sendError(error instanceof Error ? error.message : String(error))
    );
    if (removeError) this.#removeListeners.push(removeError);
  }

  sendData(data: string | Uint8Array): void {
    if (typeof data === "string") this.#send({ type: "data", data });
    else this.#send({ type: "binary", data });
  }

  close(reason?: string): void {
    if (!this.#open) return;
    this.#open = false;
    this.#send({ type: "close", reason });
    this.#disposeListeners();
    this.#transport.close(undefined, reason);
  }

  inspectBridge(): RemoteTerminalBridgeInspection {
    return {
      open: this.#open,
      dataMessages: this.#dataMessages,
      inputMessages: this.#inputMessages,
      resizeMessages: this.#resizeMessages,
      errorMessages: this.#errorMessages,
    };
  }

  async #handleClientMessage(message: string | Uint8Array): Promise<void> {
    if (!this.#open) return;
    let decoded: RemoteTerminalClientMessage;
    try {
      decoded = decodeRemoteTerminalClientMessage(message);
    } catch (error) {
      this.#sendError(error instanceof Error ? error.message : String(error));
      return;
    }

    if (decoded.type === "ping") {
      this.#send({ type: "pong", id: decoded.id });
      return;
    }
    if (decoded.type === "resize") {
      this.#resizeMessages += 1;
      const resized = await this.#session.resize(decoded.size.columns, decoded.size.rows);
      if (!resized && this.#session.inspect().resizeSupported) {
        this.#sendError("terminal resize was not accepted");
      }
      this.#send({ type: "resize", size: decoded.size });
      return;
    }

    this.#inputMessages += 1;
    const bytes = encodeRemoteTerminalInput(decoded.input);
    if (!bytes) return;
    const written = await this.#session.write(bytes);
    if (!written) this.#sendError("terminal input was not accepted");
  }

  #sendNewOutputLines(lines: readonly TerminalOutputLine[]): void {
    if (!this.#open || lines.length <= this.#lineCount) return;
    const next = lines.slice(this.#lineCount);
    this.#lineCount = lines.length;
    for (const line of next) {
      this.#send({
        type: "data",
        data: `${formatTerminalOutputLine(line, { sourcePrefix: this.#options.sourcePrefix ?? true })}\n`,
      });
    }
  }

  #sendError(message: string): void {
    this.#errorMessages += 1;
    this.#send({ type: "error", message });
  }

  #send(message: RemoteTerminalServerMessage): void {
    if (message.type === "data" || message.type === "binary") this.#dataMessages += 1;
    this.#transport.send(encodeRemoteTerminalServerMessage(message));
  }

  #disposeListeners(): void {
    for (const remove of this.#removeListeners) remove();
    this.#removeListeners.length = 0;
  }
}

/** Creates a bridge between a remote transport and a terminal session handle. */
export function createRemoteTerminalBridge(
  transport: RemoteTerminalTransport,
  session: TerminalSessionHandle,
  options: RemoteTerminalBridgeOptions = {},
): RemoteTerminalBridge {
  return new RemoteTerminalBridge(transport, session, options);
}

/** Options for a capability-gated terminal bridge. */
export interface NegotiatedRemoteTerminalBridgeOptions extends RemoteTerminalBridgeOptions {
  readonly handshake?: RemoteTerminalNegotiationOptions;
}

/** Snapshot of a capability-gated terminal bridge. */
export interface NegotiatedRemoteTerminalBridgeInspection extends RemoteTerminalBridgeInspection {
  readonly handshake: RemoteCapabilityHandshakeInspection;
}

interface ResolvedNegotiatedRemoteTerminalBridgeOptions {
  readonly killOnClose: boolean;
  readonly sourcePrefix: boolean;
}

/**
 * Terminal bridge that rejects input, resize, and other application traffic
 * until version and mandatory-capability negotiation succeeds.
 */
export class NegotiatedRemoteTerminalBridge {
  readonly #transport: RemoteTerminalTransport;
  readonly #session: TerminalSessionHandle;
  readonly #options: ResolvedNegotiatedRemoteTerminalBridgeOptions;
  readonly #handshake: RemoteCapabilityHandshake;
  readonly #limits: ResolvedRemoteHandshakeLimits;
  readonly #removeListeners: Array<() => void> = [];
  #handshakeSnapshot?: RemoteCapabilityHandshakeInspection;
  #open = true;
  #finished = false;
  #killRequested = false;
  #dataMessages = 0;
  #inputMessages = 0;
  #resizeMessages = 0;
  #errorMessages = 0;
  #lineCount = 0;

  constructor(
    transport: RemoteTerminalTransport,
    session: TerminalSessionHandle,
    options: NegotiatedRemoteTerminalBridgeOptions = {},
  ) {
    const resolvedOptions = snapshotNegotiatedRemoteTerminalBridgeOptions(options);
    this.#transport = transport;
    this.#session = session;
    this.#options = resolvedOptions.runtime;
    this.#handshake = new RemoteCapabilityHandshake({
      role: "acceptor",
      manifest: resolvedOptions.handshake.manifest ?? DEFAULT_REMOTE_TERMINAL_CAPABILITY_MANIFEST,
      ...(resolvedOptions.handshake.limits === undefined ? {} : { limits: resolvedOptions.handshake.limits }),
    });
    this.#limits = this.#handshake.inspect().limits;
    this.#lineCount = session.output.lines.peek().length;
    const outputListener = (lines: TerminalOutputLine[]) => {
      try {
        this.#sendNewOutputLines(lines);
      } catch {
        // A send failure already transitions the bridge to closed.
      }
    };
    session.output.lines.subscribe(outputListener);
    this.#registerListener(() => session.output.lines.unsubscribe(outputListener));
    if (!this.#finished) {
      this.#registerListener(transport.onMessage((message) => {
        void this.#handleClientMessage(message).catch((error) => {
          if (!this.#open) return;
          this.#rejectHandshake("invalid-negotiation", "malformed terminal client message");
          void error;
        });
      }));
    }
    if (!this.#finished) {
      this.#registerListener(transport.onClose((reason) => this.#finishClose(reason, false)));
    }
    if (!this.#finished) {
      const removeError = transport.onError?.(() => {
        this.#rejectHandshake("transport-error", "remote terminal transport failed");
      });
      if (removeError) this.#registerListener(removeError);
    }
  }

  /** Sends output only after the required output capabilities are negotiated. */
  sendData(data: string | Uint8Array): void {
    this.#requireCapability(REMOTE_TERMINAL_CAPABILITIES.output);
    if (data instanceof Uint8Array) this.#requireCapability(REMOTE_TERMINAL_CAPABILITIES.binary);
    this.#sendApplication(typeof data === "string" ? { type: "data", data } : { type: "binary", data });
  }

  /** Sends an application close when ready, then releases the transport exactly once. */
  close(reason?: string): void {
    if (!this.#open) return;
    if (this.#handshake.ready) {
      try {
        this.#sendApplication({ type: "close", reason });
      } catch {
        return;
      }
    }
    this.#finishClose(reason, true);
  }

  /** Returns immutable negotiation state and application counters. */
  inspectBridge(): NegotiatedRemoteTerminalBridgeInspection {
    return Object.freeze({
      open: this.#open,
      dataMessages: this.#dataMessages,
      inputMessages: this.#inputMessages,
      resizeMessages: this.#resizeMessages,
      errorMessages: this.#errorMessages,
      handshake: this.#handshakeSnapshot ?? this.#handshake.inspect(),
    });
  }

  #registerListener(remove: () => void): void {
    if (!this.#finished) {
      this.#removeListeners.push(remove);
      return;
    }
    try {
      remove();
    } catch {
      // A synchronously reentrant registration is removed immediately.
    }
  }

  async #handleClientMessage(message: string | Uint8Array): Promise<void> {
    if (!this.#open) return;
    if (!isRemoteTerminalWireValue(message)) {
      this.#rejectHandshake("malformed-handshake", "remote terminal wire value is invalid");
      return;
    }
    if (typeof message === "string" && !remoteTerminalTextWithinBound(message, this.#limits.maxMessageBytes)) {
      this.#rejectHandshake("invalid-negotiation", "remote terminal text message exceeds the wire bound");
      return;
    }
    const discriminant = remoteHandshakeDiscriminant(message, this.#limits.maxMessageBytes);
    if (!this.#handshake.ready) {
      if (discriminant === undefined) {
        this.#rejectHandshake("traffic-before-ready", "terminal traffic arrived before handshake completion");
        return;
      }
      this.#consumeHandshake(message);
      return;
    }
    if (discriminant !== undefined) {
      this.#consumeHandshake(message);
      return;
    }

    const decoded = decodeRemoteTerminalClientMessage(message);
    if (decoded.type === "ping") {
      if (!this.#acceptPeerCapability(REMOTE_TERMINAL_CAPABILITIES.ping)) return;
      this.#sendApplication({ type: "pong", id: decoded.id });
      return;
    }
    if (decoded.type === "resize") {
      if (!this.#acceptPeerCapability(REMOTE_TERMINAL_CAPABILITIES.resize)) return;
      this.#resizeMessages += 1;
      const resized = await this.#session.resize(decoded.size.columns, decoded.size.rows);
      if (!this.#open) return;
      if (!resized && this.#session.inspect().resizeSupported) {
        this.#sendError("terminal resize was not accepted");
      }
      if (this.#open) this.#sendApplication({ type: "resize", size: decoded.size });
      return;
    }
    if (decoded.type !== "input") {
      this.#rejectHandshake("invalid-negotiation", "unknown terminal client message type");
      return;
    }
    if (!this.#acceptPeerCapability(REMOTE_TERMINAL_CAPABILITIES.input)) return;
    this.#inputMessages += 1;
    const bytes = encodeRemoteTerminalInput(decoded.input);
    if (!bytes) return;
    const written = await this.#session.write(bytes);
    if (this.#open && !written) this.#sendError("terminal input was not accepted");
  }

  #consumeHandshake(message: string | Uint8Array): void {
    let decoded: RemoteHandshakeMessage;
    try {
      decoded = decodeRemoteHandshakeMessage(message, this.#limits);
    } catch {
      this.#rejectHandshake("malformed-handshake", "received a malformed remote handshake");
      return;
    }
    const result = this.#handshake.receive(decoded);
    if (result.response !== undefined && !this.#sendHandshake(result.response)) return;
    if (result.rejection !== undefined) {
      this.#finishClose(result.rejection.code, true, 1002);
      return;
    }
    if (result.negotiated !== undefined) this.#sendNewOutputLines(this.#session.output.lines.peek());
  }

  #requireCapability(capability: string): void {
    if (!this.#open) {
      throw new RemoteTerminalNegotiationError("closed", "remote terminal bridge is closed", capability);
    }
    const inspection = this.#handshake.inspect();
    if (!this.#handshake.ready || inspection.negotiated === undefined) {
      throw new RemoteTerminalNegotiationError("not-ready", "remote terminal handshake is not ready", capability);
    }
    if (!inspection.negotiated.capabilities.includes(capability)) {
      throw new RemoteTerminalNegotiationError(
        "capability-not-negotiated",
        `remote terminal capability ${capability} was not negotiated`,
        capability,
      );
    }
  }

  #acceptPeerCapability(capability: string): boolean {
    const negotiated = this.#handshake.inspect().negotiated;
    if (negotiated?.capabilities.includes(capability)) return true;
    this.#rejectHandshake(
      "unsupported-capability",
      `peer used unnegotiated capability ${capability}`,
      [capability],
    );
    return false;
  }

  #sendNewOutputLines(lines: readonly TerminalOutputLine[]): void {
    if (!this.#open || !this.#handshake.ready || lines.length <= this.#lineCount) return;
    const next = lines.slice(this.#lineCount);
    for (const line of next) {
      if (!this.#open) break;
      this.#sendApplication({
        type: "data",
        data: `${formatTerminalOutputLine(line, { sourcePrefix: this.#options.sourcePrefix })}\n`,
      });
      this.#lineCount += 1;
    }
  }

  #sendError(message: string): void {
    if (!this.#open) return;
    this.#sendApplication({ type: "error", message });
    this.#errorMessages += 1;
  }

  #sendApplication(message: RemoteTerminalServerMessage): void {
    try {
      this.#transport.send(encodeRemoteTerminalServerMessage(message));
      if (message.type === "data" || message.type === "binary") this.#dataMessages += 1;
    } catch (cause) {
      this.#failSend(cause);
      throw new RemoteTerminalNegotiationError("send-failed", "remote terminal send failed", undefined, cause);
    }
  }

  #sendHandshake(message: RemoteHandshakeMessage): boolean {
    try {
      this.#transport.send(encodeRemoteHandshakeMessage(message, this.#limits));
      return true;
    } catch (cause) {
      if (message.type !== "remote.handshake.reject") this.#failSend(cause);
      else this.#finishClose("send-failed", true, 1002);
      return false;
    }
  }

  #failSend(_cause: unknown): void {
    if (!this.#open) return;
    this.#handshake.reject({
      code: "send-failed",
      message: "remote terminal handshake send failed",
      localProtocol: this.#handshake.inspect().manifest.protocol,
    });
    this.#finishClose("send-failed", true, 1002);
  }

  #rejectHandshake(
    code: RemoteHandshakeRejectionCode,
    message: string,
    capabilities?: readonly string[],
  ): void {
    if (!this.#open) return;
    const rejection = this.#handshake.reject({
      code,
      message,
      ...(capabilities === undefined ? {} : { capabilities }),
      localProtocol: this.#handshake.inspect().manifest.protocol,
    });
    this.#sendHandshake(rejection);
    this.#finishClose(code, true, 1002);
  }

  #finishClose(reason: string | undefined, closeTransport: boolean, code?: number): void {
    if (this.#finished) return;
    this.#finished = true;
    this.#open = false;
    this.#handshakeSnapshot = this.#handshake.inspect();
    this.#handshake.dispose();
    for (const remove of this.#removeListeners.splice(0)) {
      try {
        remove();
      } catch {
        // Listener cleanup is best-effort, but every remover is attempted once.
      }
    }
    if (closeTransport) {
      try {
        this.#transport.close(code, reason);
      } catch {
        // Protocol state is already terminal even if transport.close throws.
      }
    }
    if (this.#options.killOnClose && !this.#killRequested) {
      this.#killRequested = true;
      try {
        void Promise.resolve(this.#session.kill()).catch(() => undefined);
      } catch {
        // Session cleanup cannot prevent transport cleanup or escape close().
      }
    }
  }
}

/** Creates a capability-gated bridge; negotiation is enabled by default. */
export function createNegotiatedRemoteTerminalBridge(
  transport: RemoteTerminalTransport,
  session: TerminalSessionHandle,
  options: NegotiatedRemoteTerminalBridgeOptions = {},
): NegotiatedRemoteTerminalBridge {
  return new NegotiatedRemoteTerminalBridge(transport, session, options);
}

/** Optional terminal mode flags applied when encoding remote input events to PTY bytes. */
export interface RemoteTerminalInputEncodingOptions
  extends TerminalKeyEncodingOptions, Pick<TerminalInputRoutingOptions, "bracketedPaste" | "focusReporting"> {}

/** Converts a remote input event to terminal bytes when the event has a byte representation. */
export function encodeRemoteTerminalInput(
  input: RemoteTerminalInputEvent,
  options: RemoteTerminalInputEncodingOptions = {},
): Uint8Array | undefined {
  if (input.kind === "keyPress") return encodeTerminalKeyPress(input.event, options);
  if (input.kind === "paste") return encodeTerminalPaste(input.event, options);
  if (input.kind === "terminalFocus") {
    if (options.focusReporting === false) return undefined;
    if (options.focusReporting === true) return encodeTerminalFocusEvent(input.event.focused);
    return input.event.buffer.byteLength > 0 ? new Uint8Array(input.event.buffer) : undefined;
  }
  if (input.event.buffer.byteLength > 0) return new Uint8Array(input.event.buffer);
  return undefined;
}

/** Encodes a remote terminal client message for transport. */
export function encodeRemoteTerminalMessage(message: RemoteTerminalClientMessage): string {
  return JSON.stringify(message, (_key, value) => {
    if (value instanceof Uint8Array) {
      return { __type: "Uint8Array", data: Array.from(value) };
    }
    return value;
  });
}

/** Encodes a remote terminal server message for transport. */
export function encodeRemoteTerminalServerMessage(message: RemoteTerminalServerMessage): string | Uint8Array {
  if (message.type === "binary") return message.data;
  return JSON.stringify(message, (_key, value) => {
    if (value instanceof Uint8Array) {
      return { __type: "Uint8Array", data: Array.from(value) };
    }
    return value;
  });
}

/** Decodes a remote terminal client message from transport data. */
export function decodeRemoteTerminalClientMessage(message: string | Uint8Array): RemoteTerminalClientMessage {
  return JSON.parse(decodeMessage(message), reviveRemoteValue) as RemoteTerminalClientMessage;
}

/** Decodes a remote terminal server message from transport data. */
export function decodeRemoteTerminalServerMessage(message: string | Uint8Array): RemoteTerminalServerMessage {
  if (message instanceof Uint8Array) {
    return { type: "binary", data: message };
  }
  return JSON.parse(message, reviveRemoteValue) as RemoteTerminalServerMessage;
}

function decodeMessage(message: string | Uint8Array): string {
  return typeof message === "string" ? message : textDecoder.decode(message);
}

function reviveRemoteValue(_key: string, value: unknown): unknown {
  if (
    value && typeof value === "object" && "__type" in value && value.__type === "Uint8Array" && "data" in value &&
    Array.isArray(value.data)
  ) {
    return new Uint8Array(value.data);
  }
  return value;
}

function snapshotNegotiatedRemoteTerminalBridgeOptions(
  value: NegotiatedRemoteTerminalBridgeOptions,
): {
  readonly runtime: ResolvedNegotiatedRemoteTerminalBridgeOptions;
  readonly handshake: RemoteTerminalNegotiationOptions;
} {
  const killOnClose = optionDataProperty(value, "killOnClose", "bridge options");
  const sourcePrefix = optionDataProperty(value, "sourcePrefix", "bridge options");
  const handshake = optionDataProperty(value, "handshake", "bridge options");
  if (killOnClose !== undefined && typeof killOnClose !== "boolean") {
    throw invalidOptions("bridge option killOnClose must be boolean");
  }
  if (sourcePrefix !== undefined && typeof sourcePrefix !== "boolean") {
    throw invalidOptions("bridge option sourcePrefix must be boolean");
  }
  return Object.freeze({
    runtime: Object.freeze({
      killOnClose: killOnClose ?? false,
      sourcePrefix: sourcePrefix ?? true,
    }),
    handshake: handshake === undefined
      ? Object.freeze({})
      : snapshotRemoteTerminalNegotiationOptions(handshake, "bridge handshake options"),
  });
}

function snapshotRemoteTerminalNegotiationOptions(
  value: unknown,
  label: string,
): RemoteTerminalNegotiationOptions {
  if (typeof value !== "object" || value === null) {
    throw invalidOptions(`${label} must be an object`);
  }
  let isArray: boolean;
  try {
    isArray = Array.isArray(value);
  } catch (cause) {
    throw invalidOptions(`${label} shape is not inspectable`, cause);
  }
  if (isArray) throw invalidOptions(`${label} must be an object`);
  const manifest = optionDataProperty(value, "manifest", label);
  const limits = optionDataProperty(value, "limits", label);
  return Object.freeze({
    ...(manifest === undefined ? {} : { manifest: manifest as RemoteCapabilityManifest }),
    ...(limits === undefined ? {} : { limits: limits as RemoteHandshakeLimits }),
  });
}

function optionDataProperty(value: unknown, key: string, label: string): unknown {
  if (typeof value !== "object" || value === null) throw invalidOptions(`${label} must be an object`);
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch (cause) {
    throw invalidOptions(`${label}.${key} is not inspectable`, cause);
  }
  if (descriptor === undefined) return undefined;
  if (!("value" in descriptor)) throw invalidOptions(`${label}.${key} must be a data property`);
  return descriptor.value;
}

function invalidOptions(message: string, cause?: unknown): RemoteTerminalNegotiationError {
  return new RemoteTerminalNegotiationError("invalid-options", message, undefined, cause);
}

function isRemoteTerminalWireValue(value: unknown): value is string | Uint8Array {
  if (typeof value === "string") return true;
  if (typeof value !== "object" || value === null || typedArrayTagGetter === undefined) return false;
  try {
    return ArrayBuffer.isView(value) && Reflect.apply(typedArrayTagGetter, value, []) === "Uint8Array";
  } catch {
    return false;
  }
}

function nativeUint8ArrayMetadata(
  value: Uint8Array,
): { readonly buffer: ArrayBufferLike; readonly byteLength: number; readonly byteOffset: number } | undefined {
  if (
    typedArrayBufferGetter === undefined || typedArrayByteLengthGetter === undefined ||
    typedArrayByteOffsetGetter === undefined
  ) return undefined;
  try {
    return {
      buffer: Reflect.apply(typedArrayBufferGetter, value, []),
      byteLength: Reflect.apply(typedArrayByteLengthGetter, value, []),
      byteOffset: Reflect.apply(typedArrayByteOffsetGetter, value, []),
    };
  } catch {
    return undefined;
  }
}

function remoteTerminalTextWithinBound(value: string, maxMessageBytes: number): boolean {
  if (value.length > maxMessageBytes) return false;
  return new TextEncoder().encode(value).byteLength <= maxMessageBytes;
}

function remoteHandshakeDiscriminant(
  message: string | Uint8Array,
  maxMessageBytes: number,
): RemoteHandshakeMessage["type"] | undefined {
  let text: string;
  let definitelyOverLimit = false;
  if (typeof message === "string") {
    text = message;
    definitelyOverLimit = message.length > maxMessageBytes;
  } else {
    const metadata = nativeUint8ArrayMetadata(message);
    if (metadata === undefined) return undefined;
    definitelyOverLimit = metadata.byteLength > maxMessageBytes;
    const bytes = definitelyOverLimit ? new Uint8Array(metadata.buffer, metadata.byteOffset, maxMessageBytes) : message;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return undefined;
    }
  }
  const prefix = text.slice(0, maxMessageBytes);
  const candidate = prefix.match(
    /"type"\s*:\s*"(remote\.handshake\.(?:hello|ack|reject))"/,
  )?.[1];
  if (definitelyOverLimit) {
    const leadingCandidate = prefix.match(
      /^\s*\{\s*"type"\s*:\s*"(remote\.handshake\.(?:hello|ack|reject))"\s*(?:,|})/,
    )?.[1];
    return isRemoteHandshakeMessageType(leadingCandidate) ? leadingCandidate : undefined;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(parsed, "type");
    return descriptor && "value" in descriptor && isRemoteHandshakeMessageType(descriptor.value)
      ? descriptor.value
      : undefined;
  } catch {
    return typeof message === "string" && isRemoteHandshakeMessageType(candidate) ? candidate : undefined;
  }
}
