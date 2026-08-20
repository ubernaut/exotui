// Copyright 2023 Im-Beast. MIT license.

// Relaying kitty graphics from a child terminal to the host terminal.
//
// A multiplexer sits between an application that draws images and a terminal
// that can show them. The screen model consumes the child's APC sequences (so
// they never print as text); this relay is the other half: it rewrites each
// sequence so it can be replayed to the host — ids remapped so two sessions
// cannot collide, placements pinned to the cursor cell the child issued them
// at, deletes scoped to what this session actually owns — and routes the
// host's replies back to the child that asked.
//
// Pure by construction: ingest returns actions, and the caller decides where
// the window sits, whether it is visible, and what stdout to write to. That is
// what makes every rule here testable without a terminal on either side.

/** One parsed kitty graphics command: control keys plus the payload. */
export interface KittyGraphicsData {
  /** Control keys in their original order, values as written. */
  readonly control: readonly (readonly [string, string])[];
  readonly payload: string;
}

/** Parses APC data of the form `G<k=v,...>;<payload>`. */
export function parseKittyGraphicsData(data: string): KittyGraphicsData | undefined {
  if (!data.startsWith("G")) return undefined;
  const separator = data.indexOf(";");
  const controlText = separator < 0 ? data.slice(1) : data.slice(1, separator);
  const payload = separator < 0 ? "" : data.slice(separator + 1);
  const control: (readonly [string, string])[] = [];
  if (controlText.length > 0) {
    for (const part of controlText.split(",")) {
      const equals = part.indexOf("=");
      if (equals <= 0) return undefined;
      control.push([part.slice(0, equals), part.slice(equals + 1)]);
    }
  }
  return { control, payload };
}

/** Serializes back to APC data, preserving key order. */
export function serializeKittyGraphicsData(data: KittyGraphicsData): string {
  const control = data.control.map(([key, value]) => `${key}=${value}`).join(",");
  return `G${control}${data.payload.length > 0 || control.length === 0 ? ";" : ";"}${data.payload}`;
}

function controlValue(data: KittyGraphicsData, key: string): string | undefined {
  for (const [name, value] of data.control) if (name === key) return value;
  return undefined;
}

function withControl(data: KittyGraphicsData, key: string, value: string): KittyGraphicsData {
  const control: (readonly [string, string])[] = [];
  let replaced = false;
  for (const [name, existing] of data.control) {
    if (name === key) {
      control.push([name, value]);
      replaced = true;
    } else control.push([name, existing]);
  }
  if (!replaced) control.push([key, value]);
  return { control, payload: data.payload };
}

/** A cell in the child's own coordinates, captured when the sequence arrived. */
export interface KittyRelayCell {
  readonly row: number;
  readonly column: number;
}

/** One thing the caller should do with the host terminal. */
export interface KittyRelayEmission {
  /**
   * Where the host cursor must be before this sequence, in the child's own
   * cells — the caller translates by the window's content origin. Absent for
   * continuation chunks, deletes and queries, which are position-free.
   */
  readonly cell?: KittyRelayCell;
  /** APC data (`G…`) ready to wrap in `ESC _ … ESC \` for the host. */
  readonly data: string;
}

/** Options for one session's relay: chiefly, its private host-id block. */
export interface KittyPassthroughRelayOptions {
  /**
   * First host image id this relay may allocate. Each session gets a disjoint
   * range so two children using `i=1` cannot collide at the host.
   */
  readonly imageIdBase: number;
  /** Ids available from the base. Kitty ids are 32-bit; a block per session. */
  readonly imageIdSpan?: number;
}

/**
 * The per-session relay.
 *
 * Tracks the child-to-host id map, live host images, an in-flight chunked
 * transmission, and outstanding queries. `ingest` never writes anywhere: it
 * returns emissions and the caller owns visibility, translation and stdout.
 */
export class KittyPassthroughRelay {
  readonly #base: number;
  readonly #span: number;
  #next = 0;
  /** Child image id -> host image id. */
  readonly #images = new Map<string, number>();
  /** Host image ids this session has transmitted and not deleted. */
  readonly #live = new Set<number>();
  /** Host image ids with an unanswered query, mapped back to the child's id. */
  readonly #queries = new Map<number, string>();
  /** True while a chunked transmission (`m=1`) is open. */
  #chainOpen = false;

  constructor(options: KittyPassthroughRelayOptions) {
    this.#base = options.imageIdBase;
    this.#span = options.imageIdSpan ?? 65_536;
  }

  #allocate(): number {
    const id = this.#base + (this.#next % this.#span);
    this.#next += 1;
    return id;
  }

  #hostIdFor(childId: string): number {
    const existing = this.#images.get(childId);
    if (existing !== undefined) return existing;
    const id = this.#allocate();
    this.#images.set(childId, id);
    return id;
  }

  /** Host ids currently live, for a caller sizing its cleanup. */
  get liveImages(): number {
    return this.#live.size;
  }

  /**
   * Ingests one APC's data with the child cursor at its arrival.
   *
   * Returns what to replay to the host. Unknown or malformed sequences return
   * nothing: a relay must never forward what it cannot account for, because
   * whatever it forwards it must later be able to delete.
   */
  ingest(data: string, cursor: KittyRelayCell): KittyRelayEmission[] {
    const parsed = parseKittyGraphicsData(data);
    if (!parsed) return [];

    // Continuation chunks of an open transmission carry only m (and q).
    // They are relayed untouched and position-free: kitty anchors a chained
    // transmission at the command that opened it.
    if (this.#chainOpen) {
      const more = controlValue(parsed, "m");
      this.#chainOpen = more === "1";
      return [{ data: serializeKittyGraphicsData(parsed) }];
    }

    const action = controlValue(parsed, "a") ?? "t";
    if (action === "d") return this.#ingestDelete(parsed);
    if (action === "q") return this.#ingestQuery(parsed);
    if (action === "t" || action === "T" || action === "p" || action === "f" || action === "c" || action === "a") {
      return this.#ingestTransmit(parsed, cursor, action);
    }
    return [];
  }

  #ingestTransmit(parsed: KittyGraphicsData, cursor: KittyRelayCell, action: string): KittyRelayEmission[] {
    const childId = controlValue(parsed, "i") ?? "";
    const hostId = this.#hostIdFor(childId);
    let rewritten = withControl(parsed, "i", String(hostId));
    // Quiet unless the child asked for responses: an OK per frame from the
    // host would land in the caller's reply router with nobody waiting.
    if (controlValue(parsed, "q") === undefined) rewritten = withControl(rewritten, "q", "2");
    this.#live.add(hostId);
    this.#chainOpen = controlValue(parsed, "m") === "1";
    // A display command is anchored to the cursor; a bare transmit is not.
    const displays = action === "T" || action === "p";
    return [{
      ...(displays ? { cell: cursor } : {}),
      data: serializeKittyGraphicsData(rewritten),
    }];
  }

  #ingestDelete(parsed: KittyGraphicsData): KittyRelayEmission[] {
    const scope = controlValue(parsed, "d") ?? "a";
    if (scope === "a" || scope === "A") {
      // "Delete everything" from a child means everything of *this child's* —
      // expanded to per-id deletes so one session cannot clear another's
      // images, or the host application's own.
      const emissions: KittyRelayEmission[] = [];
      for (const hostId of this.#live) {
        emissions.push({
          data: serializeKittyGraphicsData({
            control: [["a", "d"], ["d", scope === "A" ? "I" : "i"], ["i", String(hostId)], ["q", "2"]],
            payload: "",
          }),
        });
        if (scope === "A") this.#live.delete(hostId);
      }
      return emissions;
    }
    const childId = controlValue(parsed, "i");
    if (childId === undefined) return [];
    const hostId = this.#images.get(childId);
    if (hostId === undefined) return [];
    if (scope === "I" || scope === "i") {
      if (scope === "I") this.#live.delete(hostId);
      return [{ data: serializeKittyGraphicsData(withControl(withControl(parsed, "i", String(hostId)), "q", "2")) }];
    }
    return [{ data: serializeKittyGraphicsData(withControl(parsed, "i", String(hostId))) }];
  }

  #ingestQuery(parsed: KittyGraphicsData): KittyRelayEmission[] {
    const childId = controlValue(parsed, "i") ?? "";
    const hostId = this.#hostIdFor(childId);
    this.#queries.set(hostId, childId);
    return [{ data: serializeKittyGraphicsData(withControl(parsed, "i", String(hostId))) }];
  }

  /**
   * Routes a host reply back to the child that asked.
   *
   * Returns APC data to write to the child's stdin, with the id translated
   * back into the child's numbering; null when the reply belongs to nobody —
   * another session's, or a response to a command this relay quieted.
   */
  routeReply(data: string): string | null {
    const parsed = parseKittyGraphicsData(data);
    if (!parsed) return null;
    const idText = controlValue(parsed, "i");
    if (idText === undefined) return null;
    const hostId = Number(idText);
    const childId = this.#queries.get(hostId);
    if (childId === undefined) return null;
    this.#queries.delete(hostId);
    if (childId === "") {
      // The child queried without an id; hand the reply back without one.
      const control = parsed.control.filter(([name]) => name !== "i");
      return serializeKittyGraphicsData({ control, payload: parsed.payload });
    }
    return serializeKittyGraphicsData(withControl(parsed, "i", childId));
  }

  /**
   * Everything needed to clean this session off the host: one delete per live
   * image, freeing its data. For a window close, a blur, or a move — a relayed
   * image the compositor no longer accounts for must not stay on screen.
   */
  release(): KittyRelayEmission[] {
    const emissions: KittyRelayEmission[] = [];
    for (const hostId of this.#live) {
      emissions.push({
        data: serializeKittyGraphicsData({
          control: [["a", "d"], ["d", "I"], ["i", String(hostId)], ["q", "2"]],
          payload: "",
        }),
      });
    }
    this.#live.clear();
    this.#chainOpen = false;
    return emissions;
  }
}
