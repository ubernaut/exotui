// Copyright 2023 Im-Beast. MIT license.

// The Three.js half of the visualisation layer: scenes that draw data.
//
// Deliberately not a `Visualization`. That contract is `render(data) => frame`,
// a synchronous grid of cells, and a scene is neither — it is retained
// geometry rendered by a pipeline on its own schedule, through `ThreeAscii`.
// Making a scene pretend to be a frame would mean rendering a whole GPU pass
// inside a call that is supposed to be pure arithmetic.
//
// So the shape is: build once, update when the data changes, dispose when the
// tile goes away. Everything else — the kinds it accepts, how it is ranked
// against alternatives — is the same vocabulary the cell renderers use, because
// a caller choosing between a heightfield and a heatmap is asking one question.

import type * as THREE from "three";
import type { DataKind } from "../data.ts";
import { acceptedKind } from "../data.ts";
import type { VizSize } from "../render.ts";
import { rankFits, scoreFit, type VizDataShape, type VizFit } from "../fit.ts";
import type { VisualizationTheme } from "../theme.ts";

/** Everything a scene is given besides its data. */
export interface DataSceneContext {
  readonly theme: VisualizationTheme;
  /** A fixed domain, when the caller knows one; otherwise the scene scales to the data. */
  readonly domain?: { readonly min: number; readonly max: number };
  /** Seconds since the scene was created, for anything that turns. */
  readonly time?: number;
}

/** A built scene, ready for `ThreeAscii` and for new data. */
export interface DataSceneInstance<Input = never> {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  /** Replaces what the scene shows. Cheap to call at the rate data arrives. */
  update(data: Input, context: DataSceneContext): void;
  /** Releases the geometries and materials the scene owns. */
  dispose(): void;
}

/**
 * A visualisation rendered through Three.js.
 *
 * Carries the same fitness vocabulary as a cell visualisation — `minimum`,
 * `perEntry`, `minimumEntries`, `weight`, `suits` — so the two can be ranked
 * against each other by the same rules, and a caller with a box and some data
 * gets one answer rather than two lists.
 */
export interface DataScene<Input = never> {
  readonly id: string;
  readonly label: string;
  readonly accepts: DataKind | readonly DataKind[];
  /** Smallest terminal box this reads in. ASCII needs more cells than a chart does. */
  readonly minimum: VizSize;
  readonly perEntry?: { readonly columns?: number; readonly rows?: number; readonly cells?: number };
  readonly minimumEntries?: number;
  readonly weight?: number;
  readonly suits?: (shape: VizDataShape) => boolean;
  create(context: DataSceneContext): DataSceneInstance<Input>;
}

/** Every scene this package ships. Populated by `scenes.ts`. */
export const DATA_SCENES: DataScene<never>[] = [];

export function dataSceneById(id: string): DataScene<never> | undefined {
  return DATA_SCENES.find((scene) => scene.id === id);
}

/**
 * Ranks the scenes that can draw this data at this size, best first.
 *
 * The same call as `fitVisualizations`, over the other registry. A caller that
 * wants both ranked together concatenates them: the scores are on one scale
 * because they come from one `scoreFit`.
 */
export function fitDataScenes(shape: VizDataShape, size: VizSize): VizFit[] {
  return rankFits(
    DATA_SCENES
      .filter((scene) => acceptedKind(shape.kind, scene.accepts) !== undefined && (scene.suits?.(shape) ?? true))
      .map((scene) =>
        scoreFit(
          {
            id: scene.id,
            minimum: scene.minimum,
            ...(scene.perEntry ? { perEntry: scene.perEntry } : {}),
            ...(scene.minimumEntries === undefined ? {} : { minimumEntries: scene.minimumEntries }),
            ...(scene.weight === undefined ? {} : { weight: scene.weight }),
          },
          shape,
          size,
        )
      ),
  );
}

/** A theme colour as the hex integer Three.js materials take. */
export function themeColor(rgb: readonly [number, number, number]): number {
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}
