// Copyright 2023 Im-Beast. MIT license.

// Visualisations that project: a surface, a cloud, a ring, a field of vectors.
//
// Promoted from the neon three.js scenes, which are driven by pointer state and
// a phase counter rather than by data — so what came across is the form, not the
// code. They are drawn here by arithmetic rather than through three.js, because
// the core of this library has no runtime dependencies and a wireframe chart
// does not need one. The shaded, post-processed look those scenes have is what
// the three.js path is for.

import { blankFrame, type Visualization, type VizCell, type VizContext, type VizFrame } from "./render.ts";
import { baselineDomain, domainOfAll, normalize, resample, safeDomain } from "./scale.ts";
import { mixColor, rampGradient } from "./theme.ts";
import { camera, depthFade, type Point3, type Projected, toUnit } from "./project.ts";
import { AUTO_GLYPH, DotPainter, drawLine, lineGlyph, plot } from "./draw.ts";
import type { Matrix, Volume } from "./data.ts";

/** Far enough back that nothing in a unit cube is behind the eye. */
const DISTANCE = 3.2;

function fadeToward(
  colour: readonly [number, number, number],
  background: readonly [number, number, number],
  depth: number,
) {
  return mixColor(
    colour as [number, number, number],
    background as [number, number, number],
    depthFade(depth, DISTANCE - 1.2, DISTANCE + 1.4) * 0.65,
  );
}

/**
 * 2d — a matrix as a height field, drawn as a wireframe.
 *
 * The map slab from the demos. A heatmap answers "where is it hot" by colour
 * alone; a surface adds a second channel — height — so a ridge reads as a ridge
 * rather than as a band of a slightly different shade. What it costs is exact
 * comparison between distant cells, which is why the heatmap keeps the default.
 */
export const surface: Visualization<Matrix> = {
  id: "surface",
  label: "Surface",
  accepts: "2d",
  minimum: { width: 16, height: 8 },
  weight: 0.95,
  suits: (shape) => (shape.extent?.[1] ?? 0) !== 2,
  render(matrix, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0 || matrix.length === 0) return frame;
    const domain = safeDomain(context.domain ?? domainOfAll(matrix));
    // Steep enough that successive rows separate on screen; flat enough that
    // the far edge is still behind rather than above.
    const eye = camera(context.size, { yaw: 0.06, pitch: 0.145, distance: DISTANCE });
    const rows = matrix.length;
    // One sample per column of the frame, at most: a mesh finer than the grid
    // it is drawn on is a solid block of glyphs, which is what the first
    // version of this looked like.
    const columns = Math.min(Math.max(...matrix.map((row) => row.length)), Math.max(2, width));
    if (columns === 0) return frame;

    const grid: (Projected & { heat: number })[][] = matrix.map((row, z) => {
      const sampled = resample(row, columns);
      return Array.from({ length: columns }, (_, x) => {
        const heat = normalize(sampled[x] ?? 0, domain);
        const point: Point3 = {
          x: toUnit(x, { min: 0, max: Math.max(1, columns - 1) }),
          // Height is the value, kept to the lower half of the cube so a flat
          // field sits on the floor rather than through the middle of it.
          y: -0.55 + heat * 1.1,
          z: toUnit(z, { min: 0, max: Math.max(1, rows - 1) }),
        };
        return { ...eye.project(point), heat };
      });
    });

    // A floating horizon: strands are drawn front to back, and a farther one is
    // only drawn where it rises above everything already in that column. That
    // is what makes a surface look solid without a depth buffer — without it,
    // every row shows through every other and the whole thing is a texture.
    const horizon = new Array<number>(width).fill(Number.POSITIVE_INFINITY);
    const order = Array.from({ length: rows }, (_, index) => index)
      .sort((a, b) => (grid[a]![0]?.depth ?? 0) - (grid[b]![0]?.depth ?? 0));
    for (const z of order) {
      const line = grid[z]!;
      for (let x = 0; x + 1 < columns; x += 1) {
        const point = line[x]!;
        const right = line[x + 1]!;
        if (!point.visible || !right.visible) continue;
        const colour = fadeToward(rampGradient(context.theme, point.heat), context.theme.background, point.depth);
        const style = { foreground: colour, background: context.theme.background };
        const glyph = lineGlyph(point, right);
        const steps = Math.max(Math.abs(right.column - point.column), Math.abs(right.row - point.row), 1);
        for (let step = 0; step <= steps; step += 1) {
          const at = step / steps;
          const column = Math.round(point.column + (right.column - point.column) * at);
          const row = Math.round(point.row + (right.row - point.row) * at);
          if (column < 0 || column >= width) continue;
          if (row >= horizon[column]!) continue;
          horizon[column] = row;
          plot(frame, column, row, glyph, style);
        }
      }
    }
    return frame;
  },
};

/**
 * 3d — a volume as a cloud of points, dimmer the further back they are.
 *
 * Every cell of the volume that carries something becomes a point. Sub-cell
 * dots and depth fading are what stop it collapsing into a grey smear: a cloud
 * with no depth cue is a texture, not a shape.
 */
export const pointCloud: Visualization<Volume> = {
  id: "point-cloud",
  label: "Point Cloud",
  accepts: "3d",
  minimum: { width: 12, height: 6 },
  weight: 0.9,
  render(volume, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0 || volume.length === 0) return frame;
    // Baseline rather than extent: occupancy is "is there anything here", which
    // is a question about zero, not about where a value sits in a range. Scaled
    // to its own extent, a volume of all zeroes normalises every cell to the
    // middle and draws a solid fog.
    const domain = baselineDomain(volume, context.domain);
    const eye = camera(context.size, { yaw: 0.09, pitch: 0.1, distance: DISTANCE });
    const depths = volume.length;
    const dots = new DotPainter(context.size);
    const points: { at: Projected; heat: number }[] = [];
    for (let z = 0; z < depths; z += 1) {
      const plane = volume[z] ?? [];
      for (let y = 0; y < plane.length; y += 1) {
        const line = plane[y] ?? [];
        for (let x = 0; x < line.length; x += 1) {
          const raw = line[x] ?? 0;
          // An empty cell is not a faint point, it is nothing. Drawing it would
          // fill the cube with a fog that hides everything inside.
          if (raw <= 0) continue;
          const heat = normalize(raw, domain);
          points.push({
            at: eye.project({
              x: toUnit(x, { min: 0, max: Math.max(1, line.length - 1) }),
              y: toUnit(y, { min: 0, max: Math.max(1, plane.length - 1) }),
              z: toUnit(z, { min: 0, max: Math.max(1, depths - 1) }),
            }),
            heat,
          });
        }
      }
    }
    points.sort((a, b) => b.at.depth - a.at.depth);
    const across = dots.resolution.width / width;
    const down = dots.resolution.height / height;
    for (const point of points) {
      if (!point.at.visible) continue;
      dots.plot(
        Math.round(point.at.column * across),
        Math.round(point.at.row * down),
        fadeToward(rampGradient(context.theme, point.heat), context.theme.background, point.at.depth),
      );
    }
    dots.paint(frame, { column: 0, row: 0 }, { background: context.theme.background });
    return frame;
  },
};

/**
 * 2d — a matrix wrapped around a cylinder: rings stacked along an axis.
 *
 * The A.T. field rings from the demos. Right for data whose first axis is
 * periodic — a spectrum, a compass, a duty cycle — because the wrap puts the
 * last column next to the first, where a flat chart puts them at opposite ends
 * and hides that they are neighbours.
 */
export const ringVolume: Visualization<Matrix> = {
  id: "ring-volume",
  label: "Ring Volume",
  accepts: "2d",
  minimum: { width: 14, height: 7 },
  weight: 0.85,
  suits: (shape) => (shape.extent?.[1] ?? 0) !== 2,
  render(matrix, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0 || matrix.length === 0) return frame;
    const domain = safeDomain(context.domain ?? domainOfAll(matrix));
    // Looking down on the stack rather than edge-on: rings drawn from the side
    // land on top of one another and read as one tangle.
    const eye = camera(context.size, { yaw: 0.02, pitch: 0.2, distance: DISTANCE + 0.4 });
    const rings = matrix.length;
    const drawn: { at: Projected; heat: number; previous?: Projected }[] = [];
    for (let ring = 0; ring < rings; ring += 1) {
      const values = matrix[ring] ?? [];
      const axis = toUnit(ring, { min: 0, max: Math.max(1, rings - 1) });
      let previous: Projected | undefined;
      let first: Projected | undefined;
      for (let index = 0; index <= values.length; index += 1) {
        // One past the end closes the ring back onto its first point, which is
        // the whole reason to draw it round.
        const wrapped = index % Math.max(1, values.length);
        const heat = normalize(values[wrapped] ?? 0, domain);
        const theta = (wrapped / Math.max(1, values.length)) * Math.PI * 2;
        // A modest wobble. Letting the value swing the radius from a third to
        // nearly the full cube made every ring a different irregular shape and
        // the stack read as one tangle; colour carries most of the value and
        // the radius carries enough to see the shape of it.
        const radius = 0.58 + heat * 0.34;
        const at = eye.project({ x: Math.cos(theta) * radius, y: axis * 0.9, z: Math.sin(theta) * radius });
        if (index === 0) first = at;
        drawn.push({ at, heat, ...(previous ? { previous } : {}) });
        previous = at;
      }
      if (first && previous) drawn.push({ at: first, heat: 0, previous });
    }
    drawn.sort((a, b) => b.at.depth - a.at.depth);
    for (const point of drawn) {
      if (!point.at.visible) continue;
      const style = {
        foreground: fadeToward(rampGradient(context.theme, point.heat), context.theme.background, point.at.depth),
        background: context.theme.background,
      };
      if (point.previous?.visible) drawLine(frame, point.previous, point.at, AUTO_GLYPH, style);
    }
    return frame;
  },
};

/**
 * 3d — a field of vectors, drawn as stems pointing where they point.
 *
 * The solenoid from the demos. The innermost axis is the vector's components,
 * so a `3d` reading of shape `[rows][columns][3]` is a grid of arrows rather
 * than a cube of densities — which is why this declares the shape it wants and
 * a point cloud does not take it.
 */
export const vectorField: Visualization<Volume> = {
  id: "vector-field",
  label: "Vector Field",
  accepts: "3d",
  minimum: { width: 14, height: 7 },
  weight: 0.9,
  suits: (shape) => shape.extent?.[2] === 3,
  render(volume, context) {
    const frame = blankFrame(context.size, { char: " ", background: context.theme.background });
    const { width, height } = context.size;
    if (width <= 0 || height <= 0 || volume.length === 0) return frame;
    const eye = camera(context.size, { yaw: 0.1, pitch: 0.1, distance: DISTANCE });
    // Subsampled to a coarse grid: arrows drawn one per data point overlap into
    // a mat as soon as the field is finer than the frame, and a vector field is
    // read by its flow rather than by counting its arrows.
    const rows = Math.min(volume.length, Math.max(2, Math.floor(height / 2)));
    const lengths = volume.flatMap((plane) =>
      plane.map((vector) => Math.hypot(vector[0] ?? 0, vector[1] ?? 0, vector[2] ?? 0))
    );
    const magnitude = safeDomain(context.domain ?? domainOfAll([lengths]));
    const stems: { from: Projected; to: Projected; heat: number }[] = [];
    for (let row = 0; row < rows; row += 1) {
      const plane = volume[Math.round((row * (volume.length - 1)) / Math.max(1, rows - 1))] ?? [];
      const columns = Math.min(plane.length, Math.max(2, Math.floor(width / 6)));
      for (let index = 0; index < columns; index += 1) {
        const column = Math.round((index * (plane.length - 1)) / Math.max(1, columns - 1));
        const vector = plane[column] ?? [];
        const length = Math.hypot(vector[0] ?? 0, vector[1] ?? 0, vector[2] ?? 0);
        const heat = normalize(length, magnitude);
        const base: Point3 = {
          x: toUnit(index, { min: 0, max: Math.max(1, columns - 1) }),
          y: 0,
          z: toUnit(row, { min: 0, max: Math.max(1, rows - 1) }),
        };
        // Scaled so the longest arrow spans about a third of the cube: longer
        // and neighbouring arrows overlap into a mat.
        const reach = 0.22 * (length === 0 ? 0 : heat / Math.max(length, 1e-6));
        stems.push({
          from: eye.project(base),
          to: eye.project({
            x: base.x + (vector[0] ?? 0) * reach,
            y: base.y + (vector[1] ?? 0) * reach,
            z: base.z + (vector[2] ?? 0) * reach,
          }),
          heat,
        });
      }
    }
    stems.sort((a, b) => b.from.depth - a.from.depth);
    for (const stem of stems) {
      if (!stem.from.visible || !stem.to.visible) continue;
      const style = {
        foreground: fadeToward(rampGradient(context.theme, stem.heat), context.theme.background, stem.from.depth),
        background: context.theme.background,
      };
      drawLine(frame, stem.from, stem.to, AUTO_GLYPH, style);
      plot(frame, stem.to.column, stem.to.row, "◆", style);
    }
    return frame;
  },
};

/** Every projected visualisation, for a registry to pick from. */
export const SPATIAL_VISUALIZATIONS: readonly Visualization<never>[] = Object.freeze([
  surface as unknown as Visualization<never>,
  ringVolume as unknown as Visualization<never>,
  pointCloud as unknown as Visualization<never>,
  vectorField as unknown as Visualization<never>,
]);

export type { VizCell, VizContext, VizFrame };
