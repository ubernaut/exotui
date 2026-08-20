// Copyright 2023 Im-Beast. MIT license.

// VIS-005: 2D marks live in ONE logical dot space; backends only rasterize
// it. A mark canvas stores lit dots at logical coordinates — identical
// points are identical dots no matter which backend renders them — and
// braille (2x4), sextant (2x3), quadrant (2x2), and full-cell (1x1)
// backends divide the same dot grid by their own cell geometry. Backend
// selection is capability-checked: requesting a glyph set the terminal
// does not support DEGRADES EXPLICITLY to the best supported backend,
// with the report naming both the requested and the used backend.

/** Mark backend names, finest first. */
export type MarkBackend = "braille" | "sextant" | "quadrant" | "full-cell";

/** What glyph sets the output terminal supports. */
export interface GlyphCapabilities {
  readonly braille?: boolean;
  readonly sextants?: boolean;
  readonly quadrants?: boolean;
}

/** The rasterized output. */
export interface MarkRender {
  readonly backend: MarkBackend;
  readonly requested: MarkBackend;
  readonly degraded: boolean;
  readonly lines: readonly string[];
}

const BRAILLE_BIT: readonly (readonly number[])[] = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

const QUADRANT_GLYPHS = " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█";

function sextantGlyph(bits: number): string {
  if (bits === 0) return " ";
  if (bits === 0b111111) return "█";
  if (bits === 0b010101) return "▌"; // left half: not in the sextant block
  if (bits === 0b101010) return "▐"; // right half: not in the sextant block
  // U+1FB00.. covers the remaining combinations in order, skipping the
  // three exceptions above.
  let index = bits - 1;
  if (bits > 0b010101) index -= 1;
  if (bits > 0b101010) index -= 1;
  return String.fromCodePoint(0x1fb00 + index);
}

const GEOMETRY: Readonly<Record<MarkBackend, { x: number; y: number }>> = {
  braille: { x: 2, y: 4 },
  sextant: { x: 2, y: 3 },
  quadrant: { x: 2, y: 2 },
  "full-cell": { x: 1, y: 1 },
};

/**
 * Dots per cell for a backend.
 *
 * Exported because a caller sizing a dot canvas has to know it: a dot space
 * scaled for braille rasterises to twice the rows through the quadrant backend,
 * and a caller that assumed otherwise overflows whatever it was drawing into.
 */
export function markGeometry(backend: MarkBackend): { readonly x: number; readonly y: number } {
  return GEOMETRY[backend];
}

/** Resolves the backend under the terminal's capabilities. */
export function resolveMarkBackend(requested: MarkBackend, capabilities: GlyphCapabilities): {
  backend: MarkBackend;
  degraded: boolean;
} {
  const supported = (backend: MarkBackend): boolean => {
    if (backend === "braille") return capabilities.braille ?? false;
    if (backend === "sextant") return capabilities.sextants ?? false;
    if (backend === "quadrant") return capabilities.quadrants ?? false;
    return true; // full-cell always works
  };
  if (supported(requested)) return { backend: requested, degraded: false };
  const order: MarkBackend[] = ["braille", "sextant", "quadrant", "full-cell"];
  for (const candidate of order.slice(order.indexOf(requested) + 1)) {
    if (supported(candidate)) return { backend: candidate, degraded: true };
  }
  return { backend: "full-cell", degraded: true };
}

/** The logical-dot mark canvas. */
export class MarkCanvas {
  readonly #dots = new Set<number>();
  readonly width: number;
  readonly height: number;

  constructor(options: { readonly width: number; readonly height: number }) {
    this.width = Math.max(1, options.width);
    this.height = Math.max(1, options.height);
  }

  /** Lights one logical dot (out-of-bounds is ignored). */
  plot(x: number, y: number): void {
    const dotX = Math.floor(x);
    const dotY = Math.floor(y);
    if (dotX < 0 || dotY < 0 || dotX >= this.width || dotY >= this.height) return;
    this.#dots.add(dotY * this.width + dotX);
  }

  /** Backend-independent logical query — the shared truth. */
  hasDot(x: number, y: number): boolean {
    return this.#dots.has(Math.floor(y) * this.width + Math.floor(x));
  }

  /** Rasterizes through a backend under the terminal's capabilities. */
  render(requested: MarkBackend, capabilities: GlyphCapabilities = {}): MarkRender {
    const { backend, degraded } = resolveMarkBackend(requested, capabilities);
    const { x: dotsX, y: dotsY } = GEOMETRY[backend];
    const cellsWide = Math.ceil(this.width / dotsX);
    const cellsHigh = Math.ceil(this.height / dotsY);
    const lines: string[] = [];
    for (let cellY = 0; cellY < cellsHigh; cellY += 1) {
      let line = "";
      for (let cellX = 0; cellX < cellsWide; cellX += 1) {
        line += this.#glyph(backend, cellX * dotsX, cellY * dotsY, dotsX, dotsY);
      }
      lines.push(line);
    }
    return { backend, requested, degraded, lines };
  }

  #glyph(backend: MarkBackend, originX: number, originY: number, dotsX: number, dotsY: number): string {
    let bits = 0;
    let any = false;
    for (let dy = 0; dy < dotsY; dy += 1) {
      for (let dx = 0; dx < dotsX; dx += 1) {
        if (!this.hasDot(originX + dx, originY + dy)) continue;
        any = true;
        if (backend === "braille") bits |= BRAILLE_BIT[dy]![dx]!;
        else if (backend === "sextant") bits |= 1 << (dy * 2 + dx);
        else if (backend === "quadrant") bits |= 1 << (dy * 2 + dx);
      }
    }
    switch (backend) {
      case "braille":
        return bits === 0 ? " " : String.fromCodePoint(0x2800 + bits);
      case "sextant":
        return sextantGlyph(bits);
      case "quadrant":
        return QUADRANT_GLYPHS[bits] ?? " ";
      case "full-cell":
        return any ? "█" : " ";
    }
  }
}

/** Creates a logical-dot mark canvas. */
export function createMarkCanvas(options: { readonly width: number; readonly height: number }): MarkCanvas {
  return new MarkCanvas(options);
}
