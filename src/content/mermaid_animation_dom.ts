// Copyright 2023 Im-Beast. MIT license.
import { type MermaidAnimationTiming, mermaidAnimationValue, type MermaidSceneAnimation } from "./mermaid_animation.ts";
import type { MermaidScenePaint } from "./mermaid_scene.ts";

interface CapturedEffect {
  element: Element;
  effect: KeyframeEffect;
  frames: ComputedKeyframe[];
  timing: MermaidAnimationTiming;
  properties: string[];
  holdTime?: number;
}

/** Disable only supported paint effects while measuring their underlying scene, then restore in finally. */
export function beginMermaidAnimationCapture(svg: SVGSVGElement) {
  const view = svg.ownerDocument.defaultView!;
  const diagnostics = new Set<string>();
  const tracks: MermaidSceneAnimation[] = [];
  const captured: CapturedEffect[] = [];
  const effects = new Map<Element, CapturedEffect[]>();
  const rejected = new Set<Element>();
  const animations = svg.getAnimations({ subtree: true });
  if (animations.length > 512) throw new RangeError("Mermaid SVG exceeds its animation effect budget.");
  let keyframes = 0;
  let trackKeyframes = 0;
  const propertyNames = new Set(["strokeDashoffset", "fillOpacity", "strokeOpacity", "opacity"]);
  const prepared = animations.flatMap((animation) => {
    const effect = animation.effect;
    if (!(effect instanceof view.KeyframeEffect) || !effect.target || !svg.contains(effect.target)) {
      diagnostics.add("Animation needs a local element keyframe effect.");
      return [];
    }
    const frames = effect.getKeyframes();
    keyframes += frames.length;
    if (keyframes > 8192 || frames.length > 128) {
      throw new RangeError("Mermaid SVG exceeds its animation keyframe budget.");
    }
    const properties = [...new Set(frames.flatMap((frame) => Object.keys(frame)))].filter((key) =>
      !["offset", "computedOffset", "easing", "composite"].includes(key)
    );
    return [{ animation, effect, element: effect.target, frames, properties }];
  });
  const stacks = new Map<Element, Map<string, number>>();
  for (const record of prepared) {
    const counts = stacks.get(record.element) ?? new Map<string, number>();
    for (const property of record.properties) counts.set(property, (counts.get(property) ?? 0) + 1);
    stacks.set(record.element, counts);
  }
  try {
    for (const { animation, effect, element, frames, properties } of prepared) {
      const reject = (message: string) => {
        rejected.add(element);
        diagnostics.add(message);
      };
      if (!properties.length) continue;
      if (properties.some((key) => stacks.get(element)!.get(key)! > 1)) {
        reject("Stacked animated SVG properties need dynamic underlying-value composition.");
        continue;
      }
      if (properties.some((key) => !propertyNames.has(key))) {
        reject(
          `Animated SVG properties need time-aware scene expansion: ${
            properties.filter((key) => !propertyNames.has(key)).join(", ")
          }.`,
        );
        continue;
      }
      if (
        effect.pseudoElement || effect.composite !== "replace" ||
        Reflect.get(effect, "iterationComposite") === "accumulate" ||
        frames.some((frame) => frame.composite !== "auto" && frame.composite !== "replace") ||
        animation.playbackRate !== 1
      ) {
        reject("Animation additive composition, pseudo-elements or playback rates need scene expansion.");
        continue;
      }
      if (properties.some((key) => key !== "opacity") && !(element instanceof view.SVGGeometryElement)) {
        reject("Inherited animated SVG paint needs descendant scene expansion.");
        continue;
      }
      const original = effect.getTiming();
      const timing: MermaidAnimationTiming = {
        duration: typeof original.duration === "number"
          ? original.duration
          : original.duration === "auto" || original.duration === undefined
          ? 0
          : NaN,
        delay: original.delay ?? 0,
        endDelay: original.endDelay ?? 0,
        iterations: original.iterations === Infinity ? "infinite" : original.iterations ?? 1,
        iterationStart: original.iterationStart ?? 0,
        direction: original.direction ?? "normal",
        fill: original.fill === "auto" ? "none" : original.fill ?? "none",
        easing: original.easing ?? "linear",
      };
      try {
        // Validate timing/easings before touching the live effect. Property values resolve at the measured owner.
        mermaidAnimationValue({
          target: { kind: "composite", index: 0 },
          timing,
          keyframes: [
            ...(frames[0]?.computedOffset === 0 ? [] : [{ offset: 0, value: 0, easing: "linear" }]),
            ...frames.map((frame) => ({
              offset: frame.computedOffset,
              value: 0,
              easing: frame.easing,
            })),
            ...(frames.at(-1)?.computedOffset === 1 ? [] : [{ offset: 1, value: 0, easing: "linear" }]),
          ],
        }, 0);
      } catch (error) {
        reject(error instanceof Error ? error.message : "Unsupported Mermaid animation timing.");
        continue;
      }
      const held = animation.playState === "paused" ? animation.currentTime : undefined;
      if (held !== undefined && typeof held !== "number") {
        reject("Unresolved paused animation needs a local timeline.");
        continue;
      }
      const record = { element, effect, frames, timing, properties, holdTime: held };
      captured.push(record);
      effects.set(element, [...(effects.get(element) ?? []), record]);
      effect.setKeyframes([]);
    }
  } catch (error) {
    for (const record of captured) record.effect.setKeyframes(record.frames);
    throw error;
  }
  const add = (
    record: CapturedEffect,
    property: string,
    target: MermaidSceneAnimation["target"],
    underlying: number,
    resolve: (value: string) => number,
  ) => {
    const keyframes = record.frames.filter((frame) => property in frame).map((frame) => ({
      offset: frame.computedOffset,
      value: resolve(String(Reflect.get(frame, property))),
      easing: frame.easing,
    }));
    if (keyframes[0]?.offset !== 0) {
      keyframes.unshift({ offset: 0, value: underlying, easing: record.frames[0]?.easing ?? "linear" });
    }
    if (keyframes.at(-1)?.offset !== 1) keyframes.push({ offset: 1, value: underlying, easing: "linear" });
    const track: MermaidSceneAnimation = { target, timing: record.timing, keyframes, holdTime: record.holdTime };
    mermaidAnimationValue(track, 0);
    tracks.push(track);
    trackKeyframes += keyframes.length;
    if (tracks.length > 512) throw new RangeError("Mermaid scene exceeds its animation track budget.");
    if (trackKeyframes > 8192) throw new RangeError("Mermaid scene exceeds its animation keyframe budget.");
  };
  const number = (value: string): number => {
    const match = /^([-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?)(%)?$/i.exec(value.trim());
    if (!match) throw new RangeError("Animated SVG opacity needs numeric value resolution.");
    return Number(match[1]) / (match[2] ? 100 : 1);
  };
  return {
    tracks,
    diagnostics,
    handled: (element: Element) => effects.has(element) && !rejected.has(element),
    opacity: (element: Element) =>
      effects.get(element)?.some((record) => record.properties.includes("opacity")) ?? false,
    path(element: Element, item: number, paint: MermaidScenePaint, distance: (value: string) => number) {
      for (const record of effects.get(element) ?? []) {
        for (
          const [property, targetProperty] of [
            ["strokeDashoffset", "dashOffset"],
            ["fillOpacity", "fillOpacity"],
            ["strokeOpacity", "strokeOpacity"],
          ] as const
        ) {
          if (record.properties.includes(property)) {
            add(
              record,
              property,
              { kind: "path", item, property: targetProperty },
              paint[targetProperty] ?? (targetProperty === "dashOffset" ? 0 : 1),
              property === "strokeDashoffset" ? distance : number,
            );
          }
        }
      }
    },
    composite(element: Element, index: number, opacity: number) {
      for (const record of effects.get(element) ?? []) {
        if (record.properties.includes("opacity")) {
          add(record, "opacity", { kind: "composite", index }, opacity, number);
        }
      }
    },
    dispose() {
      for (const record of captured) record.effect.setKeyframes(record.frames);
    },
  };
}
