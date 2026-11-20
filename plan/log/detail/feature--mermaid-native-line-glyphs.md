# Detailed development log: `feature/mermaid-native-line-glyphs`

- **Branch:** `feature/mermaid-native-line-glyphs`
- **Started:** 2026-11-19

## 2026-11-19 — Line strokes, arrowheads and corners in native Mermaid frames

### Prompt

After the 0.10.1 release and the kitty merge: "I think you should keep going on the mermaid ascii implementation."

### Response and strategy

**Reading the request.** Task 050's October 6 pivot moved browser diagrams to upstream SVG and stopped bespoke
SVG/MathML-to-cell parity research. The native cell renderer stayed as the terminal path. "Mermaid ASCII" is taken to
mean that renderer, and "keep going" to mean making its output better where a person would notice, not reopening the
radical-rule and MathML threads the October entries end on. That reading is mine; the maintainer has not confirmed it.

**Finding the work.** A scratch script compiled all 57 catalogue fixtures through the headless compiler and wrote each
native frame as text, with filled cells shown so boxes are visible. Nothing in the suites looks at whole frames this
way. The defects, in order of how badly they read:

1. Corners and junctions were wrong almost everywhere. A class box drew as `│─────│` with `─────` dividers that did not
   meet the sides; rounded boxes had `╲` and `╱` in their corners.
2. No arrowheads on any family. A marker is under a cell across, so sampled as a fill it was one stray background cell
   or nothing.
3. Lines cut through labels (`Wor│er`).
4. Start and end states were two rows of box fragments.

**Cause of 1.** Each path chose its glyphs alone, from its own previous and next cell. Upstream (rough.js shapes in
Mermaid 12) draws a rectangle as separate two-point strokes, so every side ended in a bare endpoint, and whichever
stroke was painted last owned the corner cell.

**Fix** (`src/content/mermaid_cells.ts`). Two per-frame byte arrays record, for each cell, which sides its line strokes
leave by and what kind of ink owns it. A line stroke ORs its arms into the cell and the glyph comes from the union. An
opaque fill or any other ink resets the cell. Heavy and light strokes do not merge with one another. A label owns its
cells against later lines.

- Diagonals: a cell used to be `╱` or `╲` whenever its tangent rounded to a diagonal, which is what put slashes in
  rounded corners. A run of sloped cells is now diagonal only if it travels at least two cells both ways. Shorter runs
  are corners, rounded (`╭╮╰╯`) when a sloped segment crossed the cell. The slope is tracked per cell, because a small
  corner radius turns entirely inside one cell and neither its entry nor its exit direction is diagonal.
- Markers: `src/content/mermaid_scene.ts` tags marker geometry with the vertex it decorates. `markerGlyph` reads the
  shape: a triangle's apex faces its odd side, a concave quadrilateral is a barbed arrow, a convex one a diamond, an
  even ring of six or more points is round, two strokes that cross are `×`. The glyph goes in the cell before the tip
  and the line skips its end cell there, so the target keeps its border. Filled or hollow is decided by luminance
  contrast between fill and stroke, because upstream "hollow" markers are filled with the backdrop colour.
- Small round shapes that are not markers use the same classifier; a ring put on a dot's cell (or the reverse) is `◉`.

**Two things that cost time.**

- The first version did nothing for class boxes while working in isolation. Mermaid 12 wraps each node in a drop-shadow
  filter group, and tracking was switched off while a filter layer was open. The cell state is independent of the
  compositor's layers, so the condition was simply removed.
- Class arrowheads were classified but never appeared. A marker item carries its marker viewport as a clip, and the
  glyph is deliberately placed outside it. The marker's own centre is tested against the clip instead.

**Evidence.** `tests/mermaid_line_glyphs.test.ts`, seven tests on hand-built scenes: joins, fill reset, rounded corner
against sustained slope, arrow placement and border preservation, marker shapes, state marks, label protection. The 281
existing Mermaid and document tests pass unchanged. All 57 catalogue fixtures still compile and render.

**Left as found, and why.**

- Entity-relationship cardinalities are several strokes per marker and still rasterise as fragments. They need the
  marker's identity carried into the scene, not shape guessing.
- An arrowhead can sit one cell short of its box when the upstream tip stops short of the border. Moving it forward
  would overwrite the border in the common case.
- Gantt tick labels overlap, the drop shadow paints a column and row of cells beside every box, and node boxes carry
  spare empty rows. All visible, none of them line drawing.
- Steep pie-slice edges are now connected staircases rather than unconnected stacks of `│`.
