// The three-ascii window's renderer, loaded when the window is launched.
//
// `three` and the WebGPU ASCII pipeline are the heaviest thing the desktop can
// show, so they stay out of the landing bundle: the desktop dynamic-imports
// this module the first time the window opens. The ThreeAsciiObject draws
// itself on the shared cell canvas inside whatever rectangle the desktop hands
// it, and the desktop only hands it a rectangle while the window is topmost —
// the same active-window-only honesty the exomux graphics relay started with.

import { Signal } from "../../src/signals/mod.ts";
import type { Canvas } from "../../src/canvas/canvas.ts";
import { ThreeAsciiObject } from "../../src/canvas/three_ascii.ts";
import { probeCompatibleWebGPUDevice } from "../../src/three_ascii/webgpu_compat.ts";
import { asciiEffectOptions, createDefaultAsciiOptions } from "../../src/three_ascii/options.ts";
import { createNeonThreeScene } from "../../app/neon_three.ts";
import { type ThreeSceneMode, threeSceneModes } from "../../app/types.ts";
import type { Rectangle } from "../../src/types.ts";

export interface ThreeWindowOverlay {
  /** Where to draw, or null to hide; the desktop calls this every frame. */
  setRect(rect: Rectangle | null): void;
  /** Cycles the scene by one in either direction. */
  cycleScene(direction: -1 | 1): void;
  sceneName(): string;
  destroy(): void;
}

/** Probes the GPU and mounts the renderer; resolves undefined when the browser cannot run it. */
export async function createThreeWindowOverlay(canvas: Canvas): Promise<ThreeWindowOverlay | undefined> {
  if (!(await probeCompatibleWebGPUDevice())) return undefined;

  const modes: ThreeSceneMode[] = [...threeSceneModes];
  let modeIndex = 0;
  let bundle = createNeonThreeScene(modes[modeIndex]!);
  let paused = true;
  const asciiOptions = createDefaultAsciiOptions();
  const OFFSCREEN: Rectangle = { column: 0, row: 0, width: 0, height: 1 };
  const rectangle = new Signal<Rectangle>(OFFSCREEN);
  let visible = false;

  const ascii = new ThreeAsciiObject({
    canvas,
    rectangle,
    style: (text: string) => text,
    zIndex: 2,
    scene: bundle.scene,
    camera: bundle.camera,
    effect: asciiEffectOptions(asciiOptions),
    terminalGlyphStyle: asciiOptions.terminalGlyphStyle,
    terminalEdgeBias: asciiOptions.terminalEdgeBias,
    frameInterval: 1000 / 24,
    onFrame: () => {
      if (paused) return;
      // The standalone page drives the scene from pointer position; a desktop
      // window has no pointer of its own yet, so a slow autonomous drift keeps
      // the geometry alive the way the terminal launcher previews do.
      const time = performance.now();
      bundle.tick(time, {
        x: Math.sin(time * 0.0008),
        y: Math.cos(time * 0.0007),
        depth: 0.5 + Math.sin(time * 0.0005) * 0.5,
        twist: Math.sin(time * 0.0009),
        lift: Math.sin(time * 0.0011),
        pulse: 0.5 + Math.sin(time * 0.0016) * 0.5,
        active: true,
        pressed: false,
      });
    },
  });

  return {
    setRect(rect) {
      if (rect === null) {
        if (visible) {
          visible = false;
          paused = true;
          ascii.erase();
          rectangle.value = OFFSCREEN;
        }
        return;
      }
      const current = rectangle.peek();
      if (
        current.column !== rect.column || current.row !== rect.row ||
        current.width !== rect.width || current.height !== rect.height
      ) {
        rectangle.value = { ...rect };
      }
      if (!visible) {
        visible = true;
        paused = false;
        ascii.draw();
      }
    },
    cycleScene(direction) {
      modeIndex = (modeIndex + direction + modes.length) % modes.length;
      bundle = createNeonThreeScene(modes[modeIndex]!);
      // Swap the retained scene in place, the way the standalone page does:
      // the renderer keeps its GPU state; only the geometry changes hands.
      ascii.renderer.scene.clear();
      ascii.renderer.scene.background = bundle.scene.background;
      for (const child of [...bundle.scene.children]) {
        ascii.renderer.scene.add(child);
      }
      ascii.renderer.camera.copy(bundle.camera);
    },
    sceneName: () => modes[modeIndex]!,
    destroy() {
      ascii.erase();
    },
  };
}
