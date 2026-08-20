// Copyright 2023 Im-Beast. MIT license.

// Projecting three dimensions onto a grid of cells.
//
// Deliberately arithmetic rather than a renderer: the core of this library has
// no runtime dependencies, and a chart that plots a surface should not drag one
// in. The three.js path exists for the shaded, post-processed look — this is for
// a wireframe that draws anywhere, which is what a terminal chart usually wants.
//
// The one thing that is not obvious: a character cell is about twice as tall as
// it is wide, so a projection that treats the grid as square draws a cube as a
// tower. `cellAspect` is what corrects it, and it is why every camera here takes
// the frame size rather than a bare field of view.

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Projected {
  readonly column: number;
  readonly row: number;
  /**
   * Distance from the camera after rotation, for sorting back to front and for
   * fading what is far away. Larger is further.
   */
  readonly depth: number;
  /** False when the point is behind the camera and must not be drawn. */
  readonly visible: boolean;
}

export interface CameraOptions {
  /** Turns around the vertical axis. A quarter turn looks along the side. */
  readonly yaw?: number;
  /** Turns above the horizon. A positive pitch looks down on the scene. */
  readonly pitch?: number;
  /** How far the eye sits from the origin, in scene units. */
  readonly distance?: number;
  /** How wide the lens is; smaller flattens the scene toward isometric. */
  readonly focal?: number;
  /** Cell height over cell width. Two is right for most terminals. */
  readonly cellAspect?: number;
}

export interface Camera {
  project(point: Point3): Projected;
}

/**
 * A camera looking at the origin from `distance` away.
 *
 * Points are expected in roughly -1..1 on each axis; `scaleToUnit` is the usual
 * way to get there. Anything further out still projects, it is just off-frame.
 */
export function camera(size: { width: number; height: number }, options: CameraOptions = {}): Camera {
  const yaw = (options.yaw ?? 0.12) * Math.PI * 2;
  const pitch = (options.pitch ?? 0.09) * Math.PI * 2;
  const distance = options.distance ?? 3.2;
  const focal = options.focal ?? 1.6;
  const cellAspect = options.cellAspect ?? 2;
  const centreColumn = (size.width - 1) / 2;
  const centreRow = (size.height - 1) / 2;
  // The vertical half-extent is in cells, and a cell is `cellAspect` times as
  // tall as it is wide, so it buys that much less scene per unit.
  // Each axis scaled to its own half-extent rather than both to the smaller.
  // A chart is expected to fill its box; reserving the difference to keep a
  // cube cubic leaves a wide tile mostly empty, which is a worse trade for a
  // plot than the stretch is.
  const scaleColumn = size.width / 2;
  const scaleRow = (size.height / 2) * cellAspect;

  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  return {
    project(point: Point3): Projected {
      const x = point.x * cosYaw - point.z * sinYaw;
      const z = point.x * sinYaw + point.z * cosYaw;
      // Pitch turns the scene so that what is further away rises on screen,
      // which is what "looking down on it" means. Getting this sign backwards
      // puts the far edge below the near one and the floating horizon then
      // hides the front of the surface instead of the back of it.
      const y = point.y * cosPitch + z * sinPitch;
      const depth = distance + (z * cosPitch - point.y * sinPitch);
      if (depth <= 0.05) return { column: 0, row: 0, depth, visible: false };
      const perspective = focal / depth;
      return {
        column: centreColumn + x * perspective * scaleColumn,
        row: centreRow - (y * perspective * scaleRow) / cellAspect,
        depth,
        visible: true,
      };
    },
  };
}

/** Maps a value in `domain` onto -1..1, which is where a camera expects it. */
export function toUnit(value: number, domain: { readonly min: number; readonly max: number }): number {
  const span = domain.max - domain.min;
  if (span === 0) return 0;
  return ((value - domain.min) / span) * 2 - 1;
}

/**
 * How far to fade something at this depth, 0 near and 1 far.
 *
 * Depth cue rather than depth test: a wireframe with no occlusion reads as a
 * flat tangle, and dimming what is behind is the cheapest thing that stops it.
 */
export function depthFade(depth: number, near: number, far: number): number {
  if (far <= near) return 0;
  return Math.min(1, Math.max(0, (depth - near) / (far - near)));
}
