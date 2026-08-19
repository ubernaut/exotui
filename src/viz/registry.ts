// Copyright 2023 Im-Beast. MIT license.

// Choosing a visualisation for a stream, and refusing the ones that cannot draw it.

import { type DataKind, satisfies } from "./data.ts";
import type { DataStream } from "./stream.ts";
import type { Visualization, VizContext, VizFrame, VizSize } from "./render.ts";
import { fits } from "./render.ts";
import { rankFits, scoreFit, type VizDataShape, type VizFit } from "./fit.ts";
import { SCALAR_VISUALIZATIONS } from "./renderers_scalar.ts";
import { VECTOR_VISUALIZATIONS } from "./renderers_vector.ts";
import { MATRIX_VISUALIZATIONS } from "./renderers_matrix.ts";
import { SPATIAL_VISUALIZATIONS } from "./renderers_spatial.ts";

/** Every visualisation this package ships. */
export const VISUALIZATIONS: readonly Visualization<never>[] = Object.freeze([
  ...SCALAR_VISUALIZATIONS,
  ...VECTOR_VISUALIZATIONS,
  ...MATRIX_VISUALIZATIONS,
  ...SPATIAL_VISUALIZATIONS,
]);

export function visualizationById(id: string): Visualization<never> | undefined {
  return VISUALIZATIONS.find((visualization) => visualization.id === id);
}

/** Visualisations that can draw a stream of this kind, at this size. */
export function visualizationsFor(kind: DataKind, size?: VizSize): readonly Visualization<never>[] {
  return VISUALIZATIONS.filter((visualization) =>
    satisfies(kind, visualization.accepts) && (size === undefined || fits(size, visualization.minimum))
  );
}

/**
 * Draws a stream with a visualisation, handing it the shape it declared.
 *
 * This is where the kind contract is paid off: a momentary renderer is given
 * the latest reading and a temporal one the history, so neither has to know
 * which kind of stream it was pointed at. A mismatch throws rather than drawing
 * something misleading — a chart that is quietly wrong is worse than an error.
 */
export function drawStream(
  visualization: Visualization<never>,
  stream: DataStream,
  context: VizContext,
): VizFrame {
  if (!satisfies(stream.kind, visualization.accepts)) {
    throw new TypeError(
      `${visualization.id} draws ${visualization.accepts}, and was given a ${stream.kind} stream`,
    );
  }
  const domain = context.domain ?? stream.domain;
  const resolved: VizContext = domain ? { ...context, domain } : context;
  if (visualization.accepts.endsWith("t")) {
    return visualization.render(stream.history() as never, resolved);
  }
  const latest = stream.latest();
  if (latest === undefined) return visualization.render([] as never, resolved);
  return visualization.render(latest as never, resolved);
}

/**
 * Ranks every visualisation that can draw this data at this size, best first.
 *
 * This is the choice a caller actually wants to make: not "does a waterfall
 * fit" but "what should this tile show, given it is eighty-eight cores and
 * twenty columns". A tile that grows or a machine with fewer cores changes the
 * answer without anyone rewriting a rule.
 */
export function fitVisualizations(shape: VizDataShape, size: VizSize): VizFit[] {
  return rankFits(
    VISUALIZATIONS
      .filter((visualization) => satisfies(shape.kind, visualization.accepts) && (visualization.suits?.(shape) ?? true))
      .map((visualization) =>
        scoreFit(
          {
            id: visualization.id,
            minimum: visualization.minimum,
            ...(visualization.perEntry ? { perEntry: visualization.perEntry } : {}),
            ...(visualization.minimumEntries === undefined ? {} : { minimumEntries: visualization.minimumEntries }),
            ...(visualization.weight === undefined ? {} : { weight: visualization.weight }),
          },
          shape,
          size,
        )
      ),
  );
}

/** The best visualisation for this data at this size, or none if nothing fits. */
export function bestVisualization(shape: VizDataShape, size: VizSize): Visualization<never> | undefined {
  const best = fitVisualizations(shape, size)[0];
  return best ? visualizationById(best.id) : undefined;
}
