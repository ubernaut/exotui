# The corruption background: the glitch that was a bug, as a field that reclaims idle windows

Status: **open, August 25 2026.** Not started.

## Outcome

A new animated background, `corruption`, that reproduces the look of the kitty-placeholder screen corruption fixed on
August 24 — smeared glyphs, doubled columns, cascading wrap, lurid id-coloured runs — and creeps over idle windows
through the overgrowth machinery that already exists.

## Where it plugs in

Nothing here needs new machinery; the seams are all in place.

- **The field** goes in `src/app/backgrounds/corruption_background.ts` and exports from `src/app/backgrounds/mod.ts`,
  implementing `ShellAnimatedBackground` from `src/app/backgrounds/contract.ts` (`advance` + `rasterizeCells`).
  `matrix_background.ts` is the closest model — a per-column simulation with theming confined to `rasterizeCells`.
- **The exomux name** is a re-export shim at `packages/exomux/corruption_background.ts`, the pattern every field already
  follows since they moved into the library.
- **The id** joins `EXOMUX_BACKGROUND_IDS` in `packages/exomux/model.ts`. `exomuxBackgroundId` falls back to
  `metaballs`, so an unknown persisted value stays safe.
- **The overgrowth** is one line: add `"corruption"` to `EXOMUX_OVERGROWTH_BACKGROUND_IDS` in
  `packages/exomux/overgrowth.ts`. `exomuxOvergrowthRatio` already ramps from focus loss to
  `EXOMUX_MAX_OVERGROWTH_RATIO` (0.82), and `exomuxOvergrowthThreshold` already makes the frontier creep inward from the
  border with a stable hash breaking up the contour.

## The look, from what the bug actually did

Grounded in the capture in `047`, not in an impression of it:

- **The doubled column.** Each placeholder cell took two columns instead of one, so glyphs came out with a ghost one
  cell to their right. This is the signature move and should be the field's primary gesture.
- **The wrap cascade.** Content twice as wide as its pane overflowed, wrapped, and stepped down-left row after row.
  Reads as a diagonal shear.
- **The id colour.** Runs carried a flat `ESC[38;2;28;239;13m` — a lurid, arbitrary truecolor foreground, because kitty
  encodes the image id in the cell's foreground. A saturated colour with no relation to the palette around it is what
  made the corruption look _wrong_ rather than merely noisy.
- **Bare marks contaminating their neighbour.** A cell holding only a combining mark bound to whatever was painted
  before it, so damage jumped outside the window. As a background this is the "reaching past the frontier" gesture.
- **Tofu.** `U+10EEEE` has no glyph, so the grid read as boxes and blanks.

## The one hard constraint

**The field must never emit a real kitty placeholder codepoint or a bare combining mark.** `U+10EEEE` carries meaning: a
terminal that understands the Unicode placeholder protocol would bind those cells to whatever image id the foreground
colour happens to encode, and this field paints arbitrary foregrounds by design. Emitting them would make a decorative
background reach into the host terminal's image plane, and would re-create the exact hazard
`src/runtime/terminal_screen.ts` was fixed to contain.

Use lookalikes — `▯ ▮ □ ■ ▒ ░ ▚ ▞` and ordinary glyphs offset by a column — and get the smear from _placement_, not from
marks. A test should assert this rather than a comment.

## Design notes

- **Deterministic.** Seed the simulation so a rasterize is reproducible; every other field's tests depend on that and
  this one's snapshot tests will too.
- **Theme fidelity.** Everything resolves through `ShellThemeSpec` like the other fields — except the id colour, which
  is deliberately outside the palette. Derive it from a stable hash rather than a random number so it is reproducible,
  and clamp its luminance so it stays legible in the darkest themes. State this tradeoff in the module and the commit
  rather than letting it read as an oversight.
- **Edges.** `exomuxOvergrowthEdges` currently offers `"all"` and `"top"`. Corruption spreads the way the bug did —
  right, then wrapping down — so it wants a third profile (`"cascade"`) advancing from the top-left along the shear.
  Adding one is a real change to that module; `"all"` is an acceptable first cut if the shear reads well without it.
- **Restraint.** This is a background, not a seizure. The glitch gestures should be sparse and slow by default, with
  density and rate exposed through `backgroundSettings` like the other configurable fields.

## Acceptance checks

- [ ] `corruption` appears in the background list, is selectable, persists, and restores.
- [ ] It creeps over a window that loses focus and recedes when focus returns, at the same ramp as the other overgrowth
      fields.
- [ ] A seeded rasterize is byte-identical across runs; snapshot tests cover at least two themes.
- [ ] **No cell it emits contains `U+10EEEE`, and no cell's glyph begins with a combining mark.** Asserted over a long
      run at high density, not a single frame.
- [ ] Legible in the darkest theme and in T2 Neural Steel; the id colour never drops below the contrast floor.
- [ ] `deno fmt`, `deno task health`, regenerated `budgets/entrypoints.json` and the public API baseline for the new
      module and export.
- [ ] Driven in a real terminal by the maintainer — animation and colour are exactly what headless mounts cannot see.

## Notes

The joke only lands if the field is good on its own terms. If the shear and the id colour do not read as deliberate at
low density, it is a worse background than the ones already shipped and should not go in the catalog just because its
origin story is funny.
