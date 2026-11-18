// Copyright 2023 Im-Beast. MIT license.
import type { MermaidScene } from "./mermaid_scene.ts";

/** Portable Web Animations timing; infinite repeats survive JSON without becoming null. */
export interface MermaidAnimationTiming {
  duration: number;
  delay: number;
  endDelay: number;
  iterations: number | "infinite";
  iterationStart: number;
  direction: "normal" | "reverse" | "alternate" | "alternate-reverse";
  fill: "none" | "backwards" | "forwards" | "both";
  easing: string;
}

/** One resolved numeric keyframe; easing applies from this offset to the next. */
export interface MermaidAnimationKeyframe {
  offset: number;
  value: number;
  easing: string;
}

/** A paint-only animation preserves measured geometry, labels, clipping and interaction metadata. */
export interface MermaidSceneAnimation {
  target:
    | { kind: "path"; item: number; property: "dashOffset" | "fillOpacity" | "strokeOpacity" }
    | { kind: "composite"; index: number };
  timing: MermaidAnimationTiming;
  keyframes: readonly MermaidAnimationKeyframe[];
  /** Authored paused effects hold their captured local time, ignoring the host clock. */
  holdTime?: number;
}

/** Evaluate a numeric effect at host-supplied local milliseconds; undefined means no fill/active effect. */
export function mermaidAnimationValue(animation: MermaidSceneAnimation, timeMs: number): number | undefined {
  const { timing: t, keyframes: frames } = animation;
  validate(t, frames);
  if (!Number.isFinite(timeMs) || Math.abs(timeMs) > 1e15) throw new RangeError("Invalid Mermaid animation time.");
  const local = animation.holdTime ?? timeMs;
  if (!Number.isFinite(local) || Math.abs(local) > 1e15) throw new RangeError("Invalid Mermaid animation hold time.");
  const iterations = t.iterations === "infinite" ? Infinity : t.iterations;
  const activeDuration = t.duration === 0 || iterations === 0 ? 0 : t.duration * iterations;
  const endTime = Math.max(0, t.delay + activeDuration + t.endDelay);
  const beforeBoundary = Math.max(0, Math.min(t.delay, endTime));
  const afterBoundary = Math.max(0, Math.min(t.delay + activeDuration, endTime));
  const phase = local < beforeBoundary ? "before" : local >= afterBoundary ? "after" : "active";
  if (phase === "before" && t.fill !== "both" && t.fill !== "backwards") return;
  if (phase === "after" && t.fill !== "both" && t.fill !== "forwards") return;
  const activeTime = phase === "before"
    ? Math.max(local - t.delay, 0)
    : phase === "after"
    ? Math.max(0, Math.min(local - t.delay, activeDuration))
    : local - t.delay;
  const overall = (t.duration === 0 ? phase === "before" ? 0 : iterations : activeTime / t.duration) + t.iterationStart;
  let simple = overall === Infinity ? t.iterationStart % 1 : overall % 1;
  if (simple === 0 && phase !== "before" && activeTime === activeDuration && iterations !== 0) simple = 1;
  const iteration = phase === "after" && iterations === Infinity
    ? Infinity
    : simple === 1
    ? Math.floor(overall) - 1
    : Math.floor(overall);
  const reverse = t.direction === "reverse" ||
    (t.direction === "alternate" || t.direction === "alternate-reverse") && iteration !== Infinity &&
      (iteration + (t.direction === "alternate-reverse" ? 1 : 0)) % 2 !== 0;
  const before = phase === "before" && !reverse || phase === "after" && reverse;
  const progress = easing(t.easing)(reverse ? 1 - simple : simple, before);
  if (progress < 0 && frames[1]!.offset === 0) return frames[0]!.value;
  if (progress >= 1 && frames.at(-2)!.offset === 1) return frames.at(-1)!.value;
  let index = 0;
  while (index < frames.length - 2 && frames[index + 1]!.offset <= progress && frames[index + 1]!.offset < 1) index++;
  // Duplicate offsets have zero duration. At a boundary the last duplicate wins.
  while (index < frames.length - 2 && frames[index]!.offset === frames[index + 1]!.offset) index++;
  const start = frames[index]!;
  const end = frames[index + 1]!;
  if (start.offset === end.offset) return end.value;
  const amount = easing(start.easing)(
    (progress - start.offset) / (end.offset - start.offset),
    phase === "before" || phase === "active" && activeTime === 0,
  );
  const value = start.value + (end.value - start.value) * amount;
  if (!Number.isFinite(value)) throw new RangeError("Mermaid animation produced a nonfinite paint value.");
  return value;
}

/** Project immutable, JSON-portable animation tracks without a DOM, compiler, timer or source execution. */
export function projectMermaidScene(scene: MermaidScene, timeMs = 0): MermaidScene {
  if (!Number.isFinite(timeMs) || Math.abs(timeMs) > 1e15) throw new RangeError("Invalid Mermaid animation time.");
  if (!scene.animations?.length) return scene;
  if (scene.animations.length > 512) throw new RangeError("Mermaid scene exceeds its animation track budget.");
  let frameCount = 0;
  const items = [...scene.items];
  const composites = [...(scene.composites ?? [])];
  for (const animation of scene.animations) {
    frameCount += animation.keyframes.length;
    if (frameCount > 8192) throw new RangeError("Mermaid scene exceeds its animation keyframe budget.");
    const target = animation.target;
    if (target.kind === "path") {
      const item = items[target.item];
      if (
        !Number.isSafeInteger(target.item) || item?.kind !== "path" ||
        !["dashOffset", "fillOpacity", "strokeOpacity"].includes(target.property)
      ) {
        throw new RangeError("Invalid Mermaid animation path target.");
      }
      const value = mermaidAnimationValue(animation, timeMs);
      if (value !== undefined) {
        items[target.item] = {
          ...item,
          paint: { ...item.paint, [target.property]: target.property === "dashOffset" ? value : clamp(value) },
        };
      }
    } else if (target.kind === "composite") {
      const composite = composites[target.index];
      if (!Number.isSafeInteger(target.index) || !composite) {
        throw new RangeError("Invalid Mermaid animation group target.");
      }
      const value = mermaidAnimationValue(animation, timeMs);
      if (value !== undefined) composites[target.index] = { ...composite, opacity: clamp(value) };
    } else throw new RangeError("Invalid Mermaid animation target.");
  }
  return { ...scene, items, composites };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function validate(t: MermaidAnimationTiming, frames: readonly MermaidAnimationKeyframe[]): void {
  if (
    ![t.duration, t.delay, t.endDelay, t.iterationStart].every(Number.isFinite) ||
    t.duration < 0 || t.duration > 1e12 || Math.abs(t.delay) > 1e12 || Math.abs(t.endDelay) > 1e12 ||
    t.iterationStart < 0 || t.iterationStart > 1e9 ||
    t.iterations !== "infinite" && (!Number.isFinite(t.iterations) || t.iterations < 0 || t.iterations > 1e9) ||
    !["normal", "reverse", "alternate", "alternate-reverse"].includes(t.direction) ||
    !["none", "backwards", "forwards", "both"].includes(t.fill)
  ) {
    throw new RangeError("Invalid Mermaid animation timing.");
  }
  easing(t.easing);
  if (frames.length < 2 || frames.length > 128 || frames[0]!.offset !== 0 || frames.at(-1)!.offset !== 1) {
    throw new RangeError("Invalid Mermaid animation keyframe endpoints/budget.");
  }
  let previous = 0;
  for (const frame of frames) {
    if (
      !Number.isFinite(frame.value) || Math.abs(frame.value) > 1e12 || !Number.isFinite(frame.offset) ||
      frame.offset < previous || frame.offset > 1
    ) throw new RangeError("Invalid Mermaid animation keyframe.");
    previous = frame.offset;
    easing(frame.easing);
  }
}

// CSS easing is not the approximate quadratic easing used by the toolkit's motion tokens.
function easing(source: string): (progress: number, before: boolean) => number {
  if (typeof source !== "string" || source.length > 512) throw new RangeError("Invalid Mermaid animation easing.");
  const text = source.trim();
  if (text === "linear") return (p) => p;
  const aliases: Record<string, string> = {
    ease: "cubic-bezier(.25,.1,.25,1)",
    "ease-in": "cubic-bezier(.42,0,1,1)",
    "ease-out": "cubic-bezier(0,0,.58,1)",
    "ease-in-out": "cubic-bezier(.42,0,.58,1)",
    "step-start": "steps(1,start)",
    "step-end": "steps(1,end)",
  };
  const value = aliases[text] ?? text;
  const steps = /^steps\(\s*(\d+)\s*(?:,\s*(start|end|jump-start|jump-end|jump-none|jump-both)\s*)?\)$/.exec(value);
  if (steps) {
    const count = Number(steps[1]);
    const position = steps[2] ?? "end";
    if (!Number.isSafeInteger(count) || count < 1 || count > 1e9 || position === "jump-none" && count < 2) {
      throw new RangeError("Invalid Mermaid animation step easing.");
    }
    const start = ["start", "jump-start", "jump-both"].includes(position);
    const jumps = count + (position === "jump-both" ? 1 : position === "jump-none" ? -1 : 0);
    return (p, before) => {
      let step = Math.floor(p * count) + (start ? 1 : 0);
      if (before && p * count % 1 === 0) step--;
      if (p >= 0) step = Math.max(0, step);
      if (p <= 1) step = Math.min(jumps, step);
      return step / jumps;
    };
  }
  const cubic = /^cubic-bezier\(([^)]+)\)$/.exec(value);
  if (cubic) {
    const parts = cubic[1]!.split(",").map((part) => part.trim());
    const numbers = parts.map(Number);
    if (
      parts.length !== 4 || parts.some((part) => !/^[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?$/i.test(part)) ||
      numbers.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e6) ||
      numbers[0]! < 0 || numbers[0]! > 1 || numbers[2]! < 0 || numbers[2]! > 1
    ) {
      throw new RangeError("Invalid Mermaid animation cubic easing.");
    }
    const [x1, y1, x2, y2] = numbers as [number, number, number, number];
    const curve = (p: number, a: number, b: number) => 3 * (1 - p) ** 2 * p * a + 3 * (1 - p) * p ** 2 * b + p ** 3;
    return (p) => {
      if (p < 0) return p * (x1 > 0 ? y1 / x1 : x2 > 0 ? y2 / x2 : 0);
      if (p > 1) return 1 + (p - 1) * (x2 < 1 ? (1 - y2) / (1 - x2) : x1 < 1 ? (1 - y1) / (1 - x1) : 0);
      if (p === 0 || p === 1) return p;
      let low = 0;
      let high = 1;
      for (let i = 0; i < 40; i++) {
        const middle = (low + high) / 2;
        const x = curve(middle, x1, x2);
        if (x === p) return curve(middle, y1, y2);
        if (x < p) low = middle;
        else high = middle;
      }
      return curve((low + high) / 2, y1, y2);
    };
  }
  throw new RangeError(`Unsupported Mermaid animation easing: ${text}`);
}
