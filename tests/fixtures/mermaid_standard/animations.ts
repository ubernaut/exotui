// Copyright 2023 Im-Beast. MIT license.
import {
  extractMermaidScene,
  type MermaidAnimationTiming,
  mermaidAnimationValue,
  MermaidFlexMarkdownSurface,
  MermaidMarkdownCache,
  MermaidMarkdownController,
  type MermaidStandardDiagram,
  type MermaidStandardRenderer,
  projectMermaidScene,
  renderMermaidNativeFrame,
} from "../../../mod.mermaid.ts";
import { MarkdownSurface } from "../../../mod.document.ts";
import { Signal } from "../../../src/signals/mod.ts";
import { stripStyles, textWidth } from "../../../src/utils/strings.ts";

const examples = [
  { name: "default", duration: 20000, source: "flowchart LR\nA e1@--> B\ne1@{ animate: true }" },
  { name: "fast", duration: 20000, source: "flowchart LR\nA e1@--> B\ne1@{ animation: fast }" },
  { name: "slow", duration: 50000, source: "flowchart LR\nA e1@--> B\ne1@{ animation: slow }" },
  {
    name: "class",
    duration: 25000,
    source:
      "flowchart LR\nA e1@--> B\nclassDef animate stroke-dasharray:9\\,5,stroke-dashoffset:900,animation:dash 25s linear infinite;\nclass e1 animate",
  },
  {
    name: "finite",
    duration: 2000,
    source:
      "flowchart LR\nA e1@--> B\nclassDef animate stroke-dasharray:9\\,5,stroke-dashoffset:900,animation:dash 2s ease-in-out 1s 3 alternate both;\nclass e1 animate",
  },
  {
    name: "stationary",
    duration: 2000,
    source:
      "flowchart LR\nA e1@--> B\nclassDef animate stroke-dasharray:9\\,5,animation:dash 2s linear infinite;\nclass e1 animate",
  },
];

/** Actual pinned engine syntax/keyframes in either browser or private headless compiler. */
export async function verifyMermaidAnimations(renderer: Pick<MermaidStandardRenderer, "compile">) {
  const retained: MermaidStandardDiagram[] = [];
  let snapshots = 0;
  for (const example of examples) {
    const diagram = await renderer.compile(example.source, { trusted: true, config: { securityLevel: "loose" } });
    const scene = diagram.scene!;
    const track = scene.animations?.find((animation) => animation.target.kind === "path");
    if (!track || track.timing.duration !== example.duration) {
      throw new Error(`${example.name}: official animation timing missing`);
    }
    if (scene.diagnostics.some((message) => /animat/i.test(message))) {
      throw new Error(`${example.name}: supported animation still diagnosed`);
    }
    if (example.name !== "finite" && track.timing.iterations !== "infinite") {
      throw new Error("Infinite timing was not portable.");
    }
    let initial = "";
    let changed = false;
    const dimensions = new Set<string>();
    for (const timeMs of [0, 125, 500, 1000, 1250, 2500, 3500, 7000, 12500, 25000, 50000]) {
      const frame = renderMermaidNativeFrame(scene, { timeMs });
      dimensions.add(`${frame.columns}x${frame.rows}`);
      const current = JSON.stringify(frame.cells);
      if (!snapshots || !initial) initial = current;
      else if (current !== initial) changed = true;
      if (
        !frame.cells.flat().some((cell) => cell.char === "A") || !frame.cells.flat().some((cell) => cell.char === "B")
      ) {
        throw new Error("Animated paint changed native node labels.");
      }
      snapshots++;
      if (["default", "fast", "slow", "class"].includes(example.name)) {
        const value = mermaidAnimationValue(track, timeMs)!;
        const expected = 900 * (1 - timeMs % example.duration / example.duration);
        if (Math.abs(value - expected) > 1e-8) {
          throw new Error("Upstream dash period disagrees with portable timeline.");
        }
      }
    }
    if (dimensions.size !== 1 || changed === (example.name === "stationary")) {
      throw new Error("Native animation failed stable/moving phase evidence.");
    }
    retained.push(JSON.parse(JSON.stringify(diagram)));
  }
  return { retained, examples: retained.length, snapshots };
}

/** Native models/mounts consume retained JSON after the real compiler has been disposed. */
export async function verifyMermaidAnimationTransport(retained: readonly MermaidStandardDiagram[]) {
  const diagram = retained[0]!;
  let calls = 0;
  let snapshots = 0;
  const clock = new Signal(0);
  const cache = new MermaidMarkdownCache({
    compile: () => {
      calls++;
      return Promise.resolve(diagram);
    },
  });
  const source = `# Motion\n\n\`\`\`mermaid\n${diagram.source}\n\`\`\`\n\nAfter motion.`;
  const controller = new MermaidMarkdownController(cache, { source, time: clock, width: 80 });
  const markdown = new MarkdownSurface({ controller });
  const flex = new MermaidFlexMarkdownSurface(cache, {
    time: clock,
    sections: [{ id: "motion", label: "Motion", rows: [{ panels: [{ id: "edge", source }] }] }],
  });
  try {
    await markdown.ready;
    await controller.settled();
    await flex.settled(80);
    for (const width of [80, 16, 120, 80]) {
      markdown.render(width, 12);
      await controller.settled();
      await flex.settled(width);
      const generation = controller.state.peek().generation;
      const before = calls;
      for (const time of [0, 125, 500, 1250, 2500, 5000]) {
        clock.value = time;
        for (const host of [markdown, flex]) {
          const rows = host.render(width, 12).map(stripStyles);
          if (rows.length !== 12 || rows.some((row) => textWidth(row) !== width)) {
            throw new Error("Animated native row clipping mismatch.");
          }
          snapshots++;
        }
        await Promise.resolve();
        if (calls !== before || controller.state.peek().generation !== generation || cache.inspect().pending) {
          throw new Error("Animation clock started a new compiler/cache generation.");
        }
      }
    }
  } finally {
    markdown.dispose();
    controller.dispose();
    flex.dispose();
    cache.dispose();
  }
  if (clock.inspect().subscriptions !== 0) throw new Error("Disposed animation views retained a borrowed clock.");
  clock.value = 9000;
  clock.dispose();
  return { compiles: calls, nativeSnapshots: snapshots };
}

/** Independent mounted DOM oracle, rather than assertions made from the native implementation itself. */
export function verifyMermaidAnimationDOM() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "200");
  svg.setAttribute("height", "100");
  svg.setAttribute("viewBox", "0 0 200 100");
  svg.innerHTML =
    '<g opacity=".8"><path id="edge" d="M10 50 H190" fill="none" stroke="red" stroke-width="2" stroke-dasharray="9 5" stroke-dashoffset="12"/></g>';
  document.body.append(svg);
  const path = svg.querySelector("path")!;
  const group = svg.querySelector("g")!;
  const animationFrames: Keyframe[] = [
    { offset: 0, strokeDashoffset: "100px", easing: "ease-in" },
    { offset: .5, strokeDashoffset: "50px" },
    { offset: .5, strokeDashoffset: "40px", easing: "steps(4,jump-both)" },
    { offset: 1, strokeDashoffset: "0px" },
  ];
  const common: MermaidAnimationTiming = {
    duration: 1000,
    delay: 0,
    endDelay: 0,
    iterations: 3,
    iterationStart: 0,
    direction: "normal",
    fill: "both",
    easing: "linear",
  };
  const timings: Partial<MermaidAnimationTiming>[] = [
    {},
    { fill: "none" },
    { fill: "backwards" },
    { fill: "forwards" },
    { direction: "reverse" },
    { direction: "alternate" },
    { direction: "alternate-reverse" },
    { iterations: 2.5 },
    { iterations: 0 },
    { delay: -250 },
    { delay: 1000 },
    { delay: 1000, direction: "reverse" },
    { endDelay: -250 },
    { endDelay: 250 },
    { iterationStart: 1.25, direction: "alternate" },
    { duration: 0 },
    { duration: 0, iterations: "infinite" },
    { duration: 0, delay: 1000 },
    { duration: 0, delay: -1000 },
    { easing: "ease" },
    { easing: "ease-in-out" },
    { easing: "cubic-bezier(.25,2,.75,2)" },
    { easing: "steps(4,jump-start)", delay: 1000 },
    { easing: "steps(4,jump-end)", direction: "reverse" },
    { easing: "steps(4,jump-none)" },
    { easing: "steps(4,jump-both)" },
  ];
  let samples = 0;
  try {
    for (const patch of timings) {
      const t = { ...common, ...patch };
      const animation = path.animate(animationFrames, {
        ...t,
        iterations: t.iterations === "infinite" ? Infinity : t.iterations,
      });
      try {
        const frames = JSON.stringify((animation.effect as KeyframeEffect).getKeyframes());
        const markup = svg.outerHTML;
        const scene = extractMermaidScene(svg);
        if (
          svg.outerHTML !== markup || JSON.stringify((animation.effect as KeyframeEffect).getKeyframes()) !== frames
        ) throw new Error("Capture mutated source keyframes/markup.");
        if (scene.animations?.length !== 1 || scene.diagnostics.some((message) => /animat/i.test(message))) {
          throw new Error("DOM animation track was not captured.");
        }
        const target = scene.animations[0]!.target;
        if (target.kind !== "path") throw new Error("Animated path target missing.");
        animation.pause();
        for (
          const time of [
            -100,
            0,
            125,
            250,
            499.99,
            500,
            750,
            999.99,
            1000,
            1250,
            1750,
            2000,
            2500,
            2750,
            3000,
            3250,
            4000,
            9000,
          ]
        ) {
          animation.currentTime = time;
          const expected = Number.parseFloat(getComputedStyle(path).strokeDashoffset);
          const item = projectMermaidScene(scene, time).items[target.item]!;
          const actual = item.kind === "path" ? item.paint.dashOffset! : NaN;
          if (Math.abs(expected - actual) > 1e-3) {
            throw new Error(
              `Animation oracle mismatch ${JSON.stringify(patch)} at ${time}: browser ${expected}, native ${actual}`,
            );
          }
          samples++;
        }
        const heldTime = animation.currentTime;
        const state = animation.playState;
        const observable = svg.getAnimations({ subtree: true }).includes(animation);
        const paused = extractMermaidScene(svg);
        if (
          animation.currentTime !== heldTime || animation.playState !== state ||
          observable && paused.animations?.[0]?.holdTime !== heldTime
        ) throw new Error(`Paused capture/restoration lost local time: ${JSON.stringify(patch)}`);
      } finally {
        animation.cancel();
      }
    }
    const opacity = group.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1000, fill: "both" });
    const scene = extractMermaidScene(svg);
    if (scene.animations?.[0]?.target.kind !== "composite") throw new Error("Group opacity animation missing.");
    if (projectMermaidScene(scene, 500).composites!.at(-1)!.opacity !== .5) {
      throw new Error("Group opacity projection disagrees.");
    }
    opacity.cancel();
    const failure = path.animate([{ strokeDashoffset: "100px" }, { strokeDashoffset: "0px" }], 1000);
    const failureFrames = JSON.stringify((failure.effect as KeyframeEffect).getKeyframes());
    svg.setAttribute("width", "0");
    svg.setAttribute("viewBox", "0 0 0 100");
    let rejected = false;
    try {
      extractMermaidScene(svg);
    } catch {
      rejected = true;
    }
    if (!rejected || JSON.stringify((failure.effect as KeyframeEffect).getKeyframes()) !== failureFrames) {
      throw new Error("Failed scene extraction did not restore animation keyframes.");
    }
    svg.setAttribute("width", "200");
    svg.setAttribute("viewBox", "0 0 200 100");
    failure.cancel();
    const unsupported = path.animate([{ transform: "translateX(0px)" }, { transform: "translateX(20px)" }], 1000);
    const diagnosed = extractMermaidScene(svg);
    if (diagnosed.animations?.length || !diagnosed.diagnostics.some((message) => message.includes("transform"))) {
      throw new Error("Unsupported animated geometry was silently accepted.");
    }
    unsupported.cancel();
    const lower = path.animate([{ strokeDashoffset: "100px" }, { strokeDashoffset: "0px" }], 1000);
    const upper = path.animate([{ offset: .5, strokeDashoffset: "20px" }], 1000);
    const stacked = extractMermaidScene(svg);
    if (stacked.animations?.length || !stacked.diagnostics.some((message) => message.includes("Stacked"))) {
      throw new Error("Coupled underlying-value animation was silently flattened.");
    }
    lower.cancel();
    upper.cancel();
    return { cases: timings.length, samples, opacity: true, restoration: true, pause: true, unsupported: true };
  } finally {
    svg.remove();
  }
}
