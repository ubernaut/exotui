// The exotui desktop, in a browser tab — the thin end of plan 045.
//
// Everything the desktop *is* lives in `desktop_app.ts`, which never touches
// a host API. This page is the browser host: a presenter over the canvas, and
// the services only a browser can offer — the microphone-and-heap monitor,
// the WebGPU three-ascii overlay, opening links in tabs. The console entry
// (`examples/desktop_console.ts`) runs the same application object.

import { runShellApp } from "../../src/app/shell_presenter.ts";
import { webPresenter } from "../../src/web/web_presenter.ts";
import type { Rectangle } from "../../src/types.ts";
import { createBrowserMonitor } from "./browser_monitor.ts";
import { browserAudioSource } from "./browser_audio_source.ts";
import type { ShellAnimatedBackground } from "../../src/app/backgrounds/mod.ts";
import { createDesktopApp, type DesktopThreeOverlayService } from "./desktop_app.ts";
import type { ThreeWindowOverlay } from "./desktop_three.ts";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app mount element.");

const presenter = webPresenter({ root });

/**
 * The overlay loads lazily on first launch. The specifier is a variable on
 * purpose: esbuild must leave the import for the browser so `three` never
 * enters the landing bundle.
 */
function threeOverlayService(): DesktopThreeOverlayService {
  let overlay: ThreeWindowOverlay | undefined;
  let state: "idle" | "loading" | "ready" | "unavailable" = "idle";
  return {
    state: () => state,
    async ensure() {
      if (state !== "idle") return state === "ready" ? "ready" : "unavailable";
      state = "loading";
      try {
        const specifier = "./desktop-three.js";
        const module: typeof import("./desktop_three.ts") = await import(specifier);
        overlay = await module.createThreeWindowOverlay(presenter.host.canvas);
        state = overlay ? "ready" : "unavailable";
      } catch {
        state = "unavailable";
      }
      return state === "ready" ? "ready" : "unavailable";
    },
    setRect(rect: Rectangle | null) {
      overlay?.setRect(rect);
    },
    cycleScene(direction) {
      overlay?.cycleScene(direction);
    },
    sceneName: () => overlay?.sceneName() ?? "",
  };
}

const audio = browserAudioSource();

/**
 * The preset catalog is megabytes, so the field arrives lazily: nothing until
 * selected, a dynamic import on the first advance, the real field after.
 */
function lazyButterchurn(): ShellAnimatedBackground {
  let real: ShellAnimatedBackground | undefined;
  let loading = false;
  return {
    setPointer: (point, now) => real?.setPointer(point, now),
    clearPointer: () => real?.clearPointer(),
    advance(options) {
      if (!real && !loading) {
        loading = true;
        const specifier = "./desktop-butterchurn.js";
        void (import(specifier) as Promise<typeof import("./desktop_butterchurn.ts")>)
          .then((module) => {
            real = module.createButterchurnBackground(audio);
          })
          .catch(() => {
            loading = false;
          });
      }
      return real?.advance(options) ?? false;
    },
    rasterizeCells: (bounds, theme) => real?.rasterizeCells(bounds, theme) ?? [],
  };
}
// A click anywhere is the user gesture the microphone needs; the synth keeps
// butterchurn alive until then.
presenter.host.element.addEventListener("pointerdown", () => void audio.enableMicrophone(), { once: false });

runShellApp(
  presenter,
  createDesktopApp({
    openExternal: (url) => globalThis.open(url, "_blank", "noopener"),
    createMonitor: () => createBrowserMonitor({ header: false }),
    threeOverlay: threeOverlayService(),
    copyText: (text) => void navigator.clipboard?.writeText(text).catch(() => {}),
    shader: presenter.shader,
    extraBackgrounds: [
      {
        id: "butterchurn",
        label: "butterchurn — the milkdrop lava, audio-reactive",
        create: lazyButterchurn,
      },
    ],
  }),
);
