// Copyright 2023 Im-Beast. MIT license.

/**
 * Renders every preset on the GPU renderer and regenerates
 * `packages/exomux/butterchurn_gpu_rotation.ts` — the subset the GPU butterchurn
 * background auto-cycles.
 *
 * A minority of the catalog still resolves to a black or near-black frame on the
 * GPU path — mostly shader-heavy presets whose look the CPU builds from ink the
 * GPU seeds only from feedback, a genuine GPU-vs-CPU fidelity gap. Cycling
 * through those shows a preset that dead-skips within a second, which reads as a
 * strobe. This audit keeps the presets that draw above the runtime dead-skip
 * floor, so auto-cycle stays on real imagery. Every preset remains reachable by
 * index through `EXOMUX_BUTTERCHURN_CATALOG`.
 *
 * The keep threshold tracks the runtime dead-skip (`DEAD_PRESET_COVERAGE`, 1%),
 * not a stricter bar of its own: a preset that renders steadily above the floor
 * the runtime uses to skip strobes is one auto-cycle should visit. An earlier 3%
 * bar dropped ~a dozen presets that render a real, if sparse, figure.
 *
 * Runs against whichever WebGPU device the host exposes; that is a good proxy
 * for other conformant drivers but not identical, so a preset that only fails on
 * one machine still auto-skips there at runtime.
 *
 *   deno run -A --unstable-webgpu -c packages/exomux/deno.json scripts/audit_butterchurn_gpu.ts
 */

import { EXOMUX_BUTTERCHURN_CATALOG } from "../packages/exomux/butterchurn_catalog.ts";
import { ExomuxButterchurnField } from "../packages/exomux/butterchurn_background.ts";
import { createScriptedExomuxAudio } from "../packages/exomux/audio_scripted.ts";
import { exomuxTheme } from "../packages/exomux/model.ts";

const OUTPUT = new URL("../packages/exomux/butterchurn_gpu_rotation.ts", import.meta.url);
const WIDTH = 96;
const HEIGHT = 28;
const BOUNDS = { column: 0, row: 0, width: WIDTH, height: HEIGHT };
const THEME = exomuxTheme("midnight");
const CELLS = WIDTH * HEIGHT;

/** Frames rendered before measuring, giving the async GPU pipeline time to land. */
const WARMUP_FRAMES = 360;
/** Real-time gap per frame so readbacks keep up with the sim clock. */
const FRAME_SLEEP_MS = 6;
/**
 * A preset must cover at least this share of the desktop to be worth cycling.
 * Set just above the runtime dead-skip coverage (1%) so a kept preset renders
 * with margin over the floor that would make the runtime skip it as a strobe.
 */
const MIN_COVERAGE = 0.015;

function coverage(field: ExomuxButterchurnField): number {
  let painted = 0;
  for (const row of field.rasterizeCells(BOUNDS, THEME)) {
    for (const cell of row) if (cell) painted += 1;
  }
  return painted / CELLS;
}

async function audit(index: number): Promise<{ name: string; cov: number; keep: boolean }> {
  const name = EXOMUX_BUTTERCHURN_CATALOG[index]!.name;
  const field = new ExomuxButterchurnField({
    gpu: true,
    presetIndex: index,
    autoCycle: false,
    audio: createScriptedExomuxAudio(),
  });
  let now = 0;
  for (let frame = 0; frame < WARMUP_FRAMES; frame += 1) {
    now += 1000 / 30;
    field.advance({ bounds: BOUNDS, now });
    await new Promise((resolve) => setTimeout(resolve, FRAME_SLEEP_MS));
  }
  const cov = coverage(field);
  field.dispose();
  return { name, cov, keep: cov >= MIN_COVERAGE };
}

const kept: string[] = [];
let blank = 0;
for (let index = 0; index < EXOMUX_BUTTERCHURN_CATALOG.length; index += 1) {
  const verdict = await audit(index);
  if (verdict.keep) kept.push(verdict.name);
  else blank += 1;
  if (index % 40 === 0) console.error(`...${index}/${EXOMUX_BUTTERCHURN_CATALOG.length}  kept=${kept.length}`);
}

const module = `// Copyright 2023 Im-Beast. MIT license.

// GENERATED FILE — do not edit by hand.
// Regenerate with: deno run -A --unstable-webgpu -c packages/exomux/deno.json scripts/audit_butterchurn_gpu.ts
//
// The presets the GPU butterchurn background auto-cycles: those that render to a
// non-blank frame on the GPU. Of ${EXOMUX_BUTTERCHURN_CATALOG.length} presets in the catalog: ${kept.length} draw, ${blank} resolve to
// black/near-black on the GPU path and are skipped so auto-cycle does not strobe
// through them. Every preset stays selectable by index through
// \`EXOMUX_BUTTERCHURN_CATALOG\`; this only decides what the GPU field auto-cycles.

/** Names of the GPU-drawable presets, in catalog order. */
export const EXOMUX_BUTTERCHURN_GPU_ROTATION: readonly string[] = ${JSON.stringify(kept, null, 2)};
`;

await Deno.writeTextFile(OUTPUT, module);
await new Deno.Command(Deno.execPath(), { args: ["fmt", OUTPUT.pathname], stdout: "null", stderr: "null" }).output();
console.log(`wrote ${kept.length} GPU-drawable names (${blank} skipped) to ${OUTPUT.pathname}`);
