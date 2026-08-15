// Copyright 2023 Im-Beast. MIT license.

/** Hard quotas applied to every field accepted from tailscaled before it may reach the Tailnet panel. */
const TAILNET_LIMITS = Object.freeze(
  {
    id: 128,
    shortName: 63,
    dnsName: 253,
    address: 45,
    addresses: 32,
    os: 32,
    tag: 64,
    tags: 16,
    devices: 256,
    backendState: 32,
    tailnetName: 128,
    detail: 200,
    lastSeen: 40,
    socketPath: 4096,
    cliCommand: 1024,
    headerBytes: 16 * 1024,
  } as const,
);

const DEFAULT_SOCKET_PATH = "/var/run/tailscale/tailscaled.sock";
const DEFAULT_CLI_COMMAND = "tailscale";
const LOCAL_API_STATUS_PATH = "/localapi/v0/status";
const UNAVAILABLE_DETAIL = "tailscale is not installed or tailscaled is not running";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

/** One normalized tailnet device row rendered by the Exomux Tailnet panel. */
export interface TailnetDevice {
  readonly id: string;
  readonly shortName: string;
  readonly dnsName: string;
  readonly ipv4?: string;
  readonly ipv6?: string;
  readonly os: string;
  readonly online: boolean;
  readonly self: boolean;
  readonly relayed: boolean;
  readonly tags: readonly string[];
  readonly lastSeenAt?: number;
}

/** Content-minimized view of one `tailscale status --json` document. */
export interface TailnetSnapshot {
  readonly backendState: string;
  readonly tailnetName?: string;
  readonly magicDnsSuffix?: string;
  readonly selfId?: string;
  readonly devices: readonly TailnetDevice[];
  readonly capturedAt: number;
}

/** Coarse health of the tailscale integration as presented to the panel. */
export type TailnetAvailability = "available" | "degraded" | "unavailable";

/** Outcome of one status fetch: availability, optional snapshot, and a bounded one-line explanation. */
export interface TailnetStatusResult {
  readonly availability: TailnetAvailability;
  readonly snapshot?: TailnetSnapshot;
  readonly detail: string;
}

/** Injectable argv-only subprocess runner used by the CLI fallback transport. */
export interface TailnetCommandRunner {
  (
    command: string,
    args: readonly string[],
    timeoutMs: number,
    maxBytes: number,
  ): Promise<{ code: number; stdout: Uint8Array }>;
}

/** Injectable LocalAPI GET used by the primary unix-socket transport. */
export interface TailnetLocalApiFetcher {
  (path: string, timeoutMs: number, maxBytes: number): Promise<{ status: number; body: Uint8Array }>;
}

/** Construction options for {@linkcode createTailscaleStatusSource}; every effect is injectable for tests. */
export interface TailnetStatusSourceOptions {
  readonly socketPath?: string;
  readonly cliCommand?: string;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly now?: () => number;
  readonly localApi?: TailnetLocalApiFetcher;
  readonly runCommand?: TailnetCommandRunner;
}

/** Pull-based tailscale status source preferring the LocalAPI socket and falling back to the CLI. */
export interface TailnetStatusSource {
  fetchStatus(): Promise<TailnetStatusResult>;
  inspect(): { readonly socketPath: string; readonly cliCommand: string; readonly lastTransport?: "localapi" | "cli" };
}

/** Construction options for {@linkcode TailnetPoller}; timers and randomness are injectable for tests. */
export interface TailnetPollerOptions {
  readonly source: Pick<TailnetStatusSource, "fetchStatus">;
  readonly onResult: (result: TailnetStatusResult) => void;
  readonly intervalMs?: number;
  readonly maxBackoffMs?: number;
  readonly jitterRatio?: number;
  readonly random?: () => number;
  readonly setTimer?: (callback: () => void, delayMs: number) => number;
  readonly clearTimer?: (id: number) => void;
}

/** Creates the production tailscale status source with real unix-socket and subprocess transports by default. */
export function createTailscaleStatusSource(options: TailnetStatusSourceOptions = {}): TailnetStatusSource {
  return new TailscaleStatusSource(options);
}

/** Strictly normalizes a parsed ipnstate.Status document, dropping hostile fields and all key material. */
export function normalizeTailnetStatusJson(value: unknown, capturedAt: number): TailnetSnapshot | undefined {
  if (!isRecord(value) || typeof value.BackendState !== "string") return undefined;
  const backendState = truncate(value.BackendState, TAILNET_LIMITS.backendState);
  const tailnetName = isRecord(value.CurrentTailnet)
    ? optionalText(value.CurrentTailnet.Name, TAILNET_LIMITS.tailnetName)
    : undefined;
  const magicDnsSuffix = optionalText(value.MagicDNSSuffix, TAILNET_LIMITS.dnsName);
  const self = isRecord(value.Self)
    ? normalizeTailnetDevice(value.Self, optionalText(value.Self.ID, TAILNET_LIMITS.id) ?? "self", true)
    : undefined;
  const peers: TailnetDevice[] = [];
  if (isRecord(value.Peer)) {
    for (const [key, node] of Object.entries(value.Peer)) {
      if (peers.length >= TAILNET_LIMITS.devices) break;
      if (!isRecord(node)) continue;
      const device = normalizeTailnetDevice(node, optionalText(key, TAILNET_LIMITS.id), false);
      if (device) peers.push(device);
    }
  }
  peers.sort(compareTailnetDevices);
  const devices: TailnetDevice[] = [];
  if (self) devices.push(self);
  for (const peer of peers) {
    if (devices.length >= TAILNET_LIMITS.devices) break;
    devices.push(peer);
  }
  return Object.freeze({
    backendState,
    ...(tailnetName !== undefined ? { tailnetName } : {}),
    ...(magicDnsSuffix !== undefined ? { magicDnsSuffix } : {}),
    ...(self ? { selfId: self.id } : {}),
    devices: Object.freeze(devices),
    capturedAt: Number.isFinite(capturedAt) ? capturedAt : 0,
  });
}

/** Parses one buffered HTTP/1.1 response (Content-Length, chunked, or close-delimited) within a byte quota. */
export function parseHttpResponseBytes(
  bytes: Uint8Array,
  maxBytes: number,
): { status: number; body: Uint8Array } | undefined {
  if (!(bytes instanceof Uint8Array) || typeof maxBytes !== "number" || !Number.isFinite(maxBytes) || maxBytes < 0) {
    return undefined;
  }
  const headerEnd = findDoubleCrlf(bytes);
  if (headerEnd < 0 || headerEnd > TAILNET_LIMITS.headerBytes) return undefined;
  const lines = DECODER.decode(bytes.subarray(0, headerEnd)).split("\r\n");
  const statusMatch = /^HTTP\/1\.[01] (\d{3})(?: |$)/.exec(lines[0] ?? "");
  if (!statusMatch) return undefined;
  const status = Number.parseInt(statusMatch[1]!, 10);
  let contentLength: number | undefined;
  let chunked = false;
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const headerValue = line.slice(colon + 1).trim();
    if (name === "content-length") {
      if (!/^\d{1,15}$/.test(headerValue)) return undefined;
      contentLength = Number.parseInt(headerValue, 10);
    } else if (name === "transfer-encoding") {
      chunked = headerValue.toLowerCase().split(",").some((part) => part.trim() === "chunked");
    }
  }
  const rest = bytes.subarray(headerEnd + 4);
  if (chunked) {
    const body = decodeChunkedBody(rest, maxBytes);
    return body ? { status, body } : undefined;
  }
  if (contentLength !== undefined) {
    if (contentLength > maxBytes || rest.byteLength < contentLength) return undefined;
    return { status, body: rest.slice(0, contentLength) };
  }
  if (rest.byteLength > maxBytes) return undefined;
  return { status, body: rest.slice() };
}

/** Polls a tailnet status source while visible, with jittered intervals and exponential failure backoff. */
export class TailnetPoller {
  readonly #source: Pick<TailnetStatusSource, "fetchStatus">;
  readonly #onResult: (result: TailnetStatusResult) => void;
  readonly #intervalMs: number;
  readonly #maxBackoffMs: number;
  readonly #jitterRatio: number;
  readonly #random: () => number;
  readonly #setTimer: (callback: () => void, delayMs: number) => number;
  readonly #clearTimer: (id: number) => void;
  #visible = false;
  #disposed = false;
  #timerId: number | undefined;
  #inFlight: Promise<void> | undefined;
  #failures = 0;

  constructor(options: TailnetPollerOptions) {
    if (typeof options?.source?.fetchStatus !== "function" || typeof options.onResult !== "function") {
      throw new TypeError("TailnetPoller requires a status source and a result callback.");
    }
    this.#source = options.source;
    this.#onResult = options.onResult;
    this.#intervalMs = clampInteger(options.intervalMs, 15_000, 1000, 300_000);
    this.#maxBackoffMs = clampInteger(options.maxBackoffMs, 120_000, this.#intervalMs, 3_600_000);
    this.#jitterRatio = clampRatio(options.jitterRatio, 0.2);
    this.#random = typeof options.random === "function" ? options.random : Math.random;
    this.#setTimer = typeof options.setTimer === "function"
      ? options.setTimer
      : (callback, delayMs) => Number(setTimeout(callback, delayMs));
    this.#clearTimer = typeof options.clearTimer === "function" ? options.clearTimer : (id) => clearTimeout(id);
  }

  /** Starts polling with an immediate fetch when true; cancels the pending timer when false. */
  setVisible(visible: boolean): void {
    if (this.#disposed) {
      if (visible === true) throw new TypeError("TailnetPoller has been disposed.");
      return;
    }
    const next = visible === true;
    if (next === this.#visible) return;
    this.#visible = next;
    if (next) void this.#cycle();
    else this.#cancelTimer();
  }

  /** Fetches immediately, even while hidden, joining any fetch already in flight. */
  refresh(): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    return this.#fetchOnce();
  }

  /** Permanently stops the poller; later `setVisible(true)` calls throw. */
  dispose(): void {
    this.#disposed = true;
    this.#visible = false;
    this.#cancelTimer();
  }

  async #cycle(): Promise<void> {
    await this.#fetchOnce();
    this.#scheduleNext();
  }

  #fetchOnce(): Promise<void> {
    if (this.#inFlight) return this.#inFlight;
    const flight = this.#runFetch().finally(() => {
      if (this.#inFlight === flight) this.#inFlight = undefined;
    });
    this.#inFlight = flight;
    return flight;
  }

  async #runFetch(): Promise<void> {
    let result: TailnetStatusResult;
    try {
      result = await this.#source.fetchStatus();
    } catch (error) {
      result = Object.freeze({
        availability: "degraded" as const,
        detail: detailText(`tailnet poll failed: ${errorDetail(error)}`),
      });
    }
    this.#failures = result.availability === "available" ? 0 : Math.min(this.#failures + 1, 20);
    try {
      this.#onResult(result);
    } catch {
      // Observer failures must never break the polling loop.
    }
  }

  #scheduleNext(): void {
    if (!this.#visible || this.#disposed || this.#timerId !== undefined) return;
    this.#timerId = this.#setTimer(() => {
      this.#timerId = undefined;
      if (!this.#visible || this.#disposed) return;
      void this.#cycle();
    }, this.#nextDelayMs());
  }

  #nextDelayMs(): number {
    const base = this.#failures === 0
      ? this.#intervalMs
      : Math.min(this.#intervalMs * 2 ** this.#failures, this.#maxBackoffMs);
    const jittered = base * (1 + this.#jitterRatio * (2 * this.#random() - 1));
    return Math.max(1, Math.round(jittered));
  }

  #cancelTimer(): void {
    if (this.#timerId === undefined) return;
    this.#clearTimer(this.#timerId);
    this.#timerId = undefined;
  }
}

class TailscaleStatusSource implements TailnetStatusSource {
  readonly #socketPath: string;
  readonly #cliCommand: string;
  readonly #timeoutMs: number;
  readonly #maxBytes: number;
  readonly #now: () => number;
  readonly #localApi: TailnetLocalApiFetcher;
  readonly #runCommand: TailnetCommandRunner;
  #lastTransport: "localapi" | "cli" | undefined;

  constructor(options: TailnetStatusSourceOptions) {
    this.#socketPath = boundedText(options.socketPath, TAILNET_LIMITS.socketPath) ?? DEFAULT_SOCKET_PATH;
    this.#cliCommand = boundedText(options.cliCommand, TAILNET_LIMITS.cliCommand) ?? DEFAULT_CLI_COMMAND;
    this.#timeoutMs = clampInteger(options.timeoutMs, 3000, 250, 30_000);
    this.#maxBytes = clampInteger(options.maxBytes, 2_000_000, 1024, 64_000_000);
    this.#now = typeof options.now === "function" ? options.now : Date.now;
    this.#localApi = typeof options.localApi === "function"
      ? options.localApi
      : createUnixLocalApiFetcher(this.#socketPath);
    this.#runCommand = typeof options.runCommand === "function" ? options.runCommand : runTailscaleCommand;
  }

  async fetchStatus(): Promise<TailnetStatusResult> {
    const capturedAt = this.#now();
    let localReachable = false;
    let localFailure: string;
    try {
      const response = await this.#localApi(LOCAL_API_STATUS_PATH, this.#timeoutMs, this.#maxBytes);
      localReachable = true;
      if (response.status === 200) {
        const interpreted = this.#interpret(response.body, capturedAt);
        if (interpreted.snapshot) {
          this.#lastTransport = "localapi";
          return interpreted;
        }
        localFailure = interpreted.detail;
      } else {
        localFailure = `LocalAPI returned HTTP ${Math.trunc(Number(response.status))}`;
      }
    } catch (error) {
      localFailure = errorDetail(error);
    }
    try {
      const output = await this.#runCommand(this.#cliCommand, ["status", "--json"], this.#timeoutMs, this.#maxBytes);
      this.#lastTransport = "cli";
      const stdout = output.stdout instanceof Uint8Array ? output.stdout : new Uint8Array();
      const interpreted = this.#interpret(stdout, capturedAt);
      if (!interpreted.snapshot && typeof output.code === "number" && output.code !== 0) {
        return degradedResult(`tailscale status exited with code ${output.code} — ${interpreted.detail}`);
      }
      return interpreted;
    } catch (error) {
      if (isNotFoundError(error) && !localReachable) {
        return Object.freeze({ availability: "unavailable" as const, detail: UNAVAILABLE_DETAIL });
      }
      return degradedResult(`tailscale status failed: ${errorDetail(error)} (LocalAPI: ${localFailure})`);
    }
  }

  inspect(): { readonly socketPath: string; readonly cliCommand: string; readonly lastTransport?: "localapi" | "cli" } {
    return Object.freeze({
      socketPath: this.#socketPath,
      cliCommand: this.#cliCommand,
      ...(this.#lastTransport ? { lastTransport: this.#lastTransport } : {}),
    });
  }

  #interpret(body: Uint8Array, capturedAt: number): TailnetStatusResult {
    if (body.byteLength > this.#maxBytes) {
      return degradedResult("tailscale status payload exceeded the configured byte quota");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(DECODER.decode(body));
    } catch {
      return degradedResult("tailscale status payload is not valid JSON");
    }
    const snapshot = normalizeTailnetStatusJson(parsed, capturedAt);
    if (snapshot === undefined) {
      return degradedResult("tailscale status payload has an unrecognized shape");
    }
    if (snapshot.backendState === "Running") {
      const online = snapshot.devices.filter((device) => device.online).length;
      return Object.freeze({
        availability: "available" as const,
        snapshot,
        detail: detailText(`tailnet reachable — ${online}/${snapshot.devices.length} devices online`),
      });
    }
    return Object.freeze({
      availability: "degraded" as const,
      snapshot,
      detail: detailText(`tailscaled reports ${snapshot.backendState}${backendHint(snapshot.backendState)}`),
    });
  }
}

// Only the allow-listed fields below are ever copied out of a node. `PublicKey`, `NodeKey`, `KeyExpiry`,
// `PeerAPIURL`, `Capabilities`, and `CapMap` are deliberately ignored so key material can never leak.
function normalizeTailnetDevice(
  node: Record<string, unknown>,
  id: string | undefined,
  self: boolean,
): TailnetDevice | undefined {
  if (id === undefined) return undefined;
  const hostName = optionalText(node.HostName, TAILNET_LIMITS.shortName);
  const rawDns = typeof node.DNSName === "string" && node.DNSName.length > 0 ? node.DNSName : undefined;
  const dnsName = rawDns === undefined
    ? undefined
    : optionalText(rawDns.endsWith(".") ? rawDns.slice(0, -1) : rawDns, TAILNET_LIMITS.dnsName);
  const shortName = hostName ?? (dnsName === undefined ? undefined : firstDnsLabel(dnsName));
  if (shortName === undefined) return undefined;
  let ipv4: string | undefined;
  let ipv6: string | undefined;
  if (Array.isArray(node.TailscaleIPs)) {
    for (const candidate of node.TailscaleIPs.slice(0, TAILNET_LIMITS.addresses)) {
      if (typeof candidate !== "string" || candidate.length > TAILNET_LIMITS.address) continue;
      if (ipv4 === undefined && isTailnetIpv4(candidate)) {
        ipv4 = candidate;
        continue;
      }
      if (ipv6 === undefined && isTailnetIpv6(candidate)) ipv6 = candidate;
      if (ipv4 !== undefined && ipv6 !== undefined) break;
    }
  }
  const relay = typeof node.Relay === "string" ? node.Relay : "";
  const curAddr = typeof node.CurAddr === "string" ? node.CurAddr : "";
  const tags: string[] = [];
  if (Array.isArray(node.Tags)) {
    for (const tag of node.Tags) {
      if (tags.length >= TAILNET_LIMITS.tags) break;
      const text = optionalText(tag, TAILNET_LIMITS.tag);
      if (text !== undefined) tags.push(text);
    }
  }
  let lastSeenAt: number | undefined;
  if (typeof node.LastSeen === "string" && node.LastSeen.length <= TAILNET_LIMITS.lastSeen) {
    const parsed = Date.parse(node.LastSeen);
    if (Number.isFinite(parsed) && parsed > 0) lastSeenAt = parsed;
  }
  return Object.freeze({
    id,
    shortName,
    dnsName: dnsName ?? "",
    ...(ipv4 !== undefined ? { ipv4 } : {}),
    ...(ipv6 !== undefined ? { ipv6 } : {}),
    os: optionalText(node.OS, TAILNET_LIMITS.os) ?? "",
    online: node.Online === true,
    self,
    relayed: relay.length > 0 && curAddr.length === 0,
    tags: Object.freeze(tags),
    ...(lastSeenAt !== undefined ? { lastSeenAt } : {}),
  });
}

function compareTailnetDevices(first: TailnetDevice, second: TailnetDevice): number {
  if (first.online !== second.online) return first.online ? -1 : 1;
  return first.shortName < second.shortName ? -1 : first.shortName > second.shortName ? 1 : 0;
}

function firstDnsLabel(dnsName: string): string | undefined {
  const label = dnsName.split(".", 1)[0] ?? "";
  return label.length > 0 ? truncate(label, TAILNET_LIMITS.shortName) : undefined;
}

function isTailnetIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number.parseInt(part, 10) <= 255);
}

function isTailnetIpv6(value: string): boolean {
  return value.length <= TAILNET_LIMITS.address && value.includes(":") && /^[0-9A-Fa-f:]+$/.test(value);
}

function backendHint(state: string): string {
  if (state === "NeedsLogin" || state === "Stopped") return " — run: tailscale up";
  if (state === "NeedsMachineAuth") return " — approve this device in the tailscale admin console";
  return "";
}

function degradedResult(detail: string): TailnetStatusResult {
  return Object.freeze({ availability: "degraded" as const, detail: detailText(detail) });
}

function detailText(text: string): string {
  const flattened = text.replace(/\s+/g, " ").trim();
  return flattened.length > TAILNET_LIMITS.detail ? flattened.slice(0, TAILNET_LIMITS.detail) : flattened;
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message.length > 0 ? error.message : error.name;
  return typeof error === "string" && error.length > 0 ? error : "unknown error";
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Deno.errors.NotFound || (error instanceof Error && error.name === "NotFound");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return truncate(value, maxLength);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength || value.includes("\0")) {
    return undefined;
  }
  return value;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function clampRatio(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function findDoubleCrlf(bytes: Uint8Array): number {
  for (let index = 0; index + 3 < bytes.byteLength; index += 1) {
    if (bytes[index] === 13 && bytes[index + 1] === 10 && bytes[index + 2] === 13 && bytes[index + 3] === 10) {
      return index;
    }
  }
  return -1;
}

function findCrlf(bytes: Uint8Array, offset: number): number {
  for (let index = offset; index + 1 < bytes.byteLength; index += 1) {
    if (bytes[index] === 13 && bytes[index + 1] === 10) return index;
  }
  return -1;
}

function decodeChunkedBody(bytes: Uint8Array, maxBytes: number): Uint8Array | undefined {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let offset = 0;
  for (;;) {
    const lineEnd = findCrlf(bytes, offset);
    if (lineEnd < 0) return undefined;
    const sizeText = DECODER.decode(bytes.subarray(offset, lineEnd)).split(";", 1)[0]!.trim();
    if (!/^[0-9a-fA-F]{1,7}$/.test(sizeText)) return undefined;
    const size = Number.parseInt(sizeText, 16);
    offset = lineEnd + 2;
    if (size === 0) break;
    total += size;
    if (total > maxBytes) return undefined;
    if (offset + size + 2 > bytes.byteLength) return undefined;
    if (bytes[offset + size] !== 13 || bytes[offset + size + 1] !== 10) return undefined;
    chunks.push(bytes.subarray(offset, offset + size));
    offset += size + 2;
  }
  const body = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    body.set(chunk, position);
    position += chunk.byteLength;
  }
  return body;
}

function concatBytes(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.byteLength;
  }
  return bytes;
}

function createUnixLocalApiFetcher(socketPath: string): TailnetLocalApiFetcher {
  return async (path, timeoutMs, maxBytes) => {
    let connection: Deno.Conn | undefined;
    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      try {
        connection?.close();
      } catch {
        // Already closed.
      }
    }, timeoutMs);
    try {
      connection = await Deno.connect({ transport: "unix", path: socketPath });
      if (timedOut) throw new Error("tailscaled LocalAPI connect timed out");
      const request = `GET ${path} HTTP/1.1\r\n` +
        "Host: local-tailscaled.sock\r\nConnection: close\r\nAccept: application/json\r\n\r\n";
      await writeAll(connection, ENCODER.encode(request));
      const chunks: Uint8Array[] = [];
      let total = 0;
      const buffer = new Uint8Array(32 * 1024);
      for (;;) {
        const read = await connection.read(buffer);
        if (read === null) break;
        total += read;
        if (total > maxBytes + TAILNET_LIMITS.headerBytes) {
          throw new Error("tailscaled LocalAPI response exceeded the byte quota");
        }
        chunks.push(buffer.slice(0, read));
      }
      const response = parseHttpResponseBytes(concatBytes(chunks, total), maxBytes);
      if (response === undefined) throw new Error("tailscaled LocalAPI response could not be parsed");
      return response;
    } catch (error) {
      throw timedOut ? new Error("tailscaled LocalAPI request timed out") : error;
    } finally {
      clearTimeout(deadline);
      try {
        connection?.close();
      } catch {
        // Already closed.
      }
    }
  };
}

async function writeAll(connection: Deno.Conn, bytes: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) offset += await connection.write(bytes.subarray(offset));
}

/** The default argv-only bounded runner, shared with the network panel's probes. */
export const runBoundedTailnetCommand: TailnetCommandRunner = (command, args, timeoutMs, maxBytes) =>
  runTailscaleCommand(command, args, timeoutMs, maxBytes);

const runTailscaleCommand: TailnetCommandRunner = async (command, args, timeoutMs, maxBytes) => {
  const child = new Deno.Command(command, {
    args: [...args],
    stdin: "null",
    stdout: "piped",
    stderr: "null",
  }).spawn();
  let timedOut = false;
  let oversized = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGKILL");
    } catch {
      // Already exited.
    }
  }, timeoutMs);
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = child.stdout.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          oversized = true;
          try {
            child.kill("SIGKILL");
          } catch {
            // Already exited.
          }
          break;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const status = await child.status;
    if (oversized) throw new Error("tailscale status output exceeded the byte quota");
    if (timedOut) throw new Error("tailscale status timed out");
    return { code: status.code, stdout: concatBytes(chunks, total) };
  } finally {
    clearTimeout(deadline);
  }
};
