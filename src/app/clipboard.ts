// Copyright 2023 Im-Beast. MIT license.

// 036 V1: ONE clipboard abstraction for both hosts, and selection that
// crosses containers. ClipboardPort is the shared contract; the terminal
// adapter encodes writes as OSC 52 (base64, primary or clipboard
// selection) handed to the host's output sink, and the browser adapter
// wraps the async Clipboard API — both behind the same interface, so
// components never branch on host. CrossContainerSelection collects text
// from REGISTERED regions in declared order (a selection spanning two
// panes yields both panes' text joined with newlines), and copy() pipes
// the collected text through whichever port the host installed.

/** The shared clipboard contract. */
export interface ClipboardPort {
  write(text: string, target?: "clipboard" | "primary"): Promise<void>;
  /** Reading may be unsupported (terminal OSC 52 reads are often off). */
  read?(): Promise<string>;
}

/** The terminal adapter: OSC 52 through the host's byte sink. */
export function createOsc52Clipboard(sink: (bytes: string) => void): ClipboardPort {
  return {
    write(text, target = "clipboard") {
      const selection = target === "primary" ? "p" : "c";
      const payload = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
      sink(`\x1b]52;${selection};${payload}\x07`);
      return Promise.resolve();
    },
  };
}

/** The browser adapter over the async Clipboard API surface. */
export function createBrowserClipboard(clipboard: {
  writeText(text: string): Promise<void>;
  readText?(): Promise<string>;
}): ClipboardPort {
  return {
    write: (text) => clipboard.writeText(text),
    ...(clipboard.readText ? { read: () => clipboard.readText!() } : {}),
  };
}

/** One selectable region another container contributes. */
export interface SelectableRegion {
  readonly id: string;
  /** Declared reading order among regions. */
  readonly order: number;
  /** The region's current text lines. */
  lines(): readonly string[];
}

/** A selection anchor/focus in region-space. */
export interface SelectionPoint {
  readonly regionId: string;
  readonly line: number;
  readonly column: number;
}

/** The cross-container selection model. */
export class CrossContainerSelection {
  readonly #regions = new Map<string, SelectableRegion>();
  #anchor?: SelectionPoint;
  #focus?: SelectionPoint;

  register(region: SelectableRegion): () => void {
    this.#regions.set(region.id, region);
    return () => this.#regions.delete(region.id);
  }

  begin(point: SelectionPoint): void {
    this.#anchor = point;
    this.#focus = point;
  }

  extend(point: SelectionPoint): void {
    if (this.#anchor) this.#focus = point;
  }

  clear(): void {
    this.#anchor = undefined;
    this.#focus = undefined;
  }

  active(): boolean {
    return this.#anchor !== undefined && this.#focus !== undefined;
  }

  /** The selected text across every spanned region, in declared order. */
  selectedText(): string {
    if (!this.#anchor || !this.#focus) return "";
    const ordered = [...this.#regions.values()].sort((a, b) => a.order - b.order);
    const anchorRegion = ordered.findIndex((region) => region.id === this.#anchor!.regionId);
    const focusRegion = ordered.findIndex((region) => region.id === this.#focus!.regionId);
    if (anchorRegion < 0 || focusRegion < 0) return "";
    const [startRegion, endRegion] = anchorRegion <= focusRegion
      ? [anchorRegion, focusRegion]
      : [focusRegion, anchorRegion];
    const [start, end] = anchorRegion <= focusRegion ? [this.#anchor, this.#focus] : [this.#focus, this.#anchor];

    const parts: string[] = [];
    for (let index = startRegion; index <= endRegion; index += 1) {
      const region = ordered[index]!;
      const lines = region.lines();
      const fromLine = index === startRegion ? start.line : 0;
      const toLine = index === endRegion ? end.line : lines.length - 1;
      const segment: string[] = [];
      for (let line = fromLine; line <= toLine && line < lines.length; line += 1) {
        const isFirst = index === startRegion && line === fromLine;
        const isLast = index === endRegion && line === toLine;
        const from = isFirst ? start.column : 0;
        const to = isLast ? end.column : lines[line]!.length;
        segment.push(lines[line]!.slice(from, to));
      }
      parts.push(segment.join("\n"));
    }
    return parts.join("\n");
  }

  /** Copies the selection through the installed port. */
  async copy(port: ClipboardPort, target?: "clipboard" | "primary"): Promise<string> {
    const text = this.selectedText();
    if (text !== "") await port.write(text, target);
    return text;
  }
}

/** Creates a cross-container selection model. */
export function createCrossContainerSelection(): CrossContainerSelection {
  return new CrossContainerSelection();
}
