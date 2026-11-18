// Copyright 2023 Im-Beast. MIT license.
import { assert, assertAlmostEquals, assertEquals, assertThrows } from "./deps.ts";
import {
  type MermaidAnimationTiming,
  mermaidAnimationValue,
  MermaidFlexMarkdownSurface,
  MermaidMarkdownCache,
  MermaidMarkdownController,
  type MermaidScene,
  type MermaidSceneAnimation,
  prepareMermaidMarkdown,
  projectMermaidScene,
  renderMermaidNativeFrame,
} from "../mod.mermaid.ts";
import { MarkdownSurface } from "../mod.document.ts";
import { Signal } from "../src/signals/mod.ts";
import { stripStyles, textWidth } from "../src/utils/strings.ts";

function animation(timing: Partial<MermaidAnimationTiming> = {}): MermaidSceneAnimation {
  return {
    target: { kind: "path", item: 0, property: "dashOffset" },
    timing: {
      duration: 1000,
      delay: 0,
      endDelay: 0,
      iterations: "infinite",
      iterationStart: 0,
      direction: "normal",
      fill: "none",
      easing: "linear",
      ...timing,
    },
    keyframes: [{ offset: 0, value: 100, easing: "linear" }, { offset: 1, value: 0, easing: "linear" }],
  };
}

function scene(): MermaidScene {
  return {
    width: 160,
    height: 36,
    title: "Moving edge",
    description: "Portable animation",
    diagnostics: [],
    items: [{
      kind: "path",
      points: [{ x: 2, y: 18, distance: 0 }, { x: 158, y: 18, distance: 156 }],
      closed: false,
      paint: { fill: "none", stroke: "red", strokeWidth: 2, dash: [9, 5], dashOffset: 12, opacity: 1 },
      href: "product:edge",
      interaction: { id: "edge", href: "product:edge", title: "Edge detail" },
    }],
    composites: [{ start: 0, end: 1, opacity: 1, depth: 0, blendMode: "normal" }],
    animations: [animation()],
  };
}

Deno.test("Mermaid animation repeats, fills finite/fractional endpoints and holds authored pause", () => {
  assertEquals([0, 125, 500, 1000, 1500].map((t) => mermaidAnimationValue(animation(), t)), [100, 87.5, 50, 100, 50]);
  assertEquals(mermaidAnimationValue(animation(), -1), undefined);
  const finite = animation({ iterations: 3, fill: "forwards" });
  assertEquals(mermaidAnimationValue(finite, 3000), 0);
  assertEquals(mermaidAnimationValue(finite, 9000), 0);
  assertEquals(mermaidAnimationValue(animation({ iterations: 2.5, fill: "both" }), 2500), 50);
  assertEquals(mermaidAnimationValue(animation({ iterations: 0, fill: "both" }), 0), 100);
  assertEquals(mermaidAnimationValue({ ...finite, holdTime: 250 }, 9000), 75);
  assertEquals(JSON.parse(JSON.stringify(animation())).timing.iterations, "infinite");
});

Deno.test("Mermaid animation delay, negative end delay, zero duration and all directions", () => {
  const delayed = animation({ delay: 1000, iterations: 3, direction: "alternate", fill: "both" });
  assertEquals([0, 1000, 1250, 2250, 3250, 4000, 9000].map((t) => mermaidAnimationValue(delayed, t)), [
    100,
    100,
    75,
    25,
    75,
    0,
    0,
  ]);
  assertEquals(mermaidAnimationValue(animation({ direction: "reverse" }), 250), 25);
  assertEquals(mermaidAnimationValue(animation({ direction: "alternate-reverse" }), 1250), 75);
  assertEquals(mermaidAnimationValue(animation({ delay: -250 }), 0), 75);
  assertEquals(mermaidAnimationValue(animation({ iterationStart: 1.25, direction: "alternate" }), 0), 25);
  assertEquals(mermaidAnimationValue(animation({ iterations: 1, endDelay: -250, fill: "both" }), 900), 10);
  assertEquals(mermaidAnimationValue(animation({ duration: 0, delay: 1000, iterations: 2, fill: "both" }), 999), 100);
  assertEquals(mermaidAnimationValue(animation({ duration: 0, delay: 1000, iterations: 2, fill: "both" }), 1000), 0);
});

Deno.test("Mermaid animation CSS cubic/step easing differs from approximate toolkit motion and preserves before flags", () => {
  assertAlmostEquals(mermaidAnimationValue(animation({ easing: "ease" }), 500)!, 19.75966124, 1e-7);
  assertAlmostEquals(mermaidAnimationValue(animation({ easing: "ease-in-out" }), 250)!, 87.0838069, 1e-7);
  const stepped = animation({ delay: 1000, fill: "both", easing: "steps(4,start)" });
  assertEquals([999, 1000, 1250].map((t) => mermaidAnimationValue(stepped, t)), [100, 75, 50]);
  for (const [name, expected] of [["jump-end", 75], ["jump-none", 100 * 2 / 3], ["jump-both", 60]] as const) {
    assertAlmostEquals(mermaidAnimationValue(animation({ easing: `steps(4,${name})` }), 250)!, expected);
  }
  const overshoot = animation({ easing: "cubic-bezier(.25,2,.75,2)" });
  assert(mermaidAnimationValue(overshoot, 500)! < 0);
});

Deno.test("Mermaid keyframe intervals, per-frame easing and duplicate offsets preserve boundary semantics", () => {
  const track = animation();
  track.keyframes = [
    { offset: 0, value: 100, easing: "steps(2,end)" },
    { offset: .5, value: 50, easing: "linear" },
    { offset: .5, value: 40, easing: "linear" },
    { offset: 1, value: 0, easing: "linear" },
  ];
  assertEquals([125, 250, 499, 500, 750].map((t) => mermaidAnimationValue(track, t)), [100, 75, 75, 40, 20]);
  track.keyframes = [
    { offset: 0, value: 100, easing: "ease-in" },
    { offset: .5, value: 50, easing: "linear" },
    { offset: .5, value: 40, easing: "steps(4,jump-both)" },
    { offset: 1, value: 0, easing: "linear" },
  ];
  assertEquals(mermaidAnimationValue({ ...track, timing: { ...track.timing, easing: "ease-in-out" } }, 500), 32);
  assertEquals(mermaidAnimationValue({ ...track, timing: { ...track.timing, direction: "reverse" } }, 0), 8);
  assertEquals(mermaidAnimationValue({ ...track, timing: { ...track.timing, direction: "reverse" } }, 1000), 0);
  assertEquals(mermaidAnimationValue({ ...track, timing: { ...track.timing, duration: 0, fill: "both" } }, 0), 0);
});

Deno.test("Mermaid portable animated scenes project paint and group opacity without changing metadata or inputs", () => {
  const source = scene();
  const original = JSON.stringify(source);
  source.animations = [...source.animations!, {
    ...animation(),
    target: { kind: "composite", index: 0 },
    keyframes: [
      { offset: 0, value: 1, easing: "linear" },
      { offset: 1, value: 0, easing: "linear" },
    ],
  }];
  const frozen = JSON.stringify(source);
  const result = projectMermaidScene(source, 500);
  assertEquals(result.items[0]!.kind === "path" && result.items[0].paint.dashOffset, 50);
  assertEquals(result.composites![0]!.opacity, .5);
  assertEquals(result.items[0]!.interaction, source.items[0]!.interaction);
  assertEquals(JSON.stringify(source), frozen);
  const native = renderMermaidNativeFrame(JSON.parse(original));
  const moved = renderMermaidNativeFrame(JSON.parse(original), { timeMs: 250 });
  assertEquals([native.columns, native.rows], [moved.columns, moved.rows]);
  assert(JSON.stringify(native.cells) !== JSON.stringify(moved.cells));
  assert(moved.cells.flat().some((cell) => cell.interaction?.id === "edge"));
});

Deno.test("Mermaid animation rejects malformed JSON, nonfinite values and bounded work before mutation", () => {
  for (const t of [NaN, Infinity, -Infinity, 1e16]) assertThrows(() => projectMermaidScene(scene(), t), RangeError);
  for (
    const timing of [
      { duration: -1 },
      { iterations: Infinity },
      { iterationStart: -1 },
      { easing: "steps(1,jump-none)" },
      { easing: "cubic-bezier(2,0,0,1)" },
      { easing: "eval(alert(1))" },
    ]
  ) {
    assertThrows(() => mermaidAnimationValue(animation(timing), 0), RangeError);
  }
  const bad = scene();
  bad.animations = [{ ...animation(), target: { kind: "path", item: 999, property: "dashOffset" } }];
  assertThrows(() => projectMermaidScene(bad), RangeError);
  bad.animations = Array.from({ length: 513 }, () => animation());
  assertThrows(() => projectMermaidScene(bad), RangeError, "track budget");
  const frames = Array.from({ length: 128 }, (_, i) => ({ offset: i / 127, value: i, easing: "linear" }));
  bad.animations = Array.from({ length: 65 }, () => ({ ...animation(), keyframes: frames }));
  assertThrows(() => projectMermaidScene(bad), RangeError, "keyframe budget");
});

Deno.test("animated transparent paint removes native stale hit targets while retaining declarative scene identity", () => {
  const source = scene();
  source.animations = [{
    ...animation({ iterations: 1, fill: "forwards" }),
    target: { kind: "composite", index: 0 },
    keyframes: [
      { offset: 0, value: 1, easing: "linear" },
      { offset: 1, value: 0, easing: "linear" },
    ],
  }];
  assert(renderMermaidNativeFrame(source, { timeMs: 0 }).cells.flat().some((cell) => cell.interaction?.id === "edge"));
  assert(
    !renderMermaidNativeFrame(source, { timeMs: 1000 }).cells.flat().some((cell) => cell.href || cell.interaction),
  );
  assertEquals(source.items[0]!.interaction?.id, "edge");
});

Deno.test("prepared Mermaid playback shares one compile, caches a tick and remains transactional after bad clock values", async () => {
  let calls = 0;
  let time = 0;
  const prepared = await prepareMermaidMarkdown("```mermaid\nmoving\n```", {
    compile: (source) => {
      calls++;
      return Promise.resolve({ source, diagramType: "flowchart", version: "fixture", svg: "<svg/>", scene: scene() });
    },
  }, { time: () => time });
  const first = prepared.render.diagram!("moving", 80)!;
  assertEquals(calls, 1);
  assert(prepared.render.diagram!("moving", 80)!.cells === first.cells);
  time = NaN;
  assertThrows(() => prepared.render.diagram!("moving", 80), RangeError);
  time = 250;
  const moved = prepared.render.diagram!("moving", 80)!;
  assert(JSON.stringify(moved.cells) !== JSON.stringify(first.cells));
  assertEquals(calls, 1);
});

Deno.test("mounted Markdown and flex animation clock ticks repaint without recompilation and release borrowed subscriptions", async () => {
  let calls = 0;
  const time = new Signal(0);
  const cache = new MermaidMarkdownCache({
    compile: (source) => {
      calls++;
      return Promise.resolve({ source, diagramType: "flowchart", version: "fixture", svg: "<svg/>", scene: scene() });
    },
  });
  const source = "# Motion\n\n```mermaid\nmoving\n```\n\nAfter motion.";
  const controller = new MermaidMarkdownController(cache, { source, time, width: 60 });
  const surface = new MarkdownSurface({ controller });
  const flex = new MermaidFlexMarkdownSurface(cache, {
    time,
    sections: [{ id: "motion", label: "Motion", rows: [{ panels: [{ id: "edge", source }] }] }],
  });
  try {
    await surface.ready;
    surface.render(60, 12);
    await controller.settled();
    await flex.settled(60);
    const before = surface.render(60, 12);
    const beforeFlex = flex.render(60, 12);
    const count = calls;
    const generation = controller.state.peek().generation;
    time.value = 250;
    assert(surface.render(60, 12).join("\n") !== before.join("\n"));
    assert(flex.render(60, 12).join("\n") !== beforeFlex.join("\n"));
    for (const width of [12, 60, 100, 60]) {
      surface.render(width, 12);
      await controller.settled();
      await flex.settled(width);
      const currentCalls = calls;
      const generation = controller.state.peek().generation;
      time.value += 125;
      for (const host of [surface, flex]) {
        assert(host.render(width, 12).map(stripStyles).every((row) => textWidth(row) === width));
      }
      await Promise.resolve();
      assertEquals(calls, currentCalls);
      assertEquals(controller.state.peek().generation, generation);
      assertEquals(cache.inspect().pending, 0);
    }
    assert(count >= 1 && generation >= 1);
  } finally {
    surface.dispose();
    controller.dispose();
    flex.dispose();
    cache.dispose();
  }
  assertEquals(time.inspect().subscriptions, 0);
  time.value = 2000;
  assertEquals(time.peek(), 2000);
  time.dispose();
});
