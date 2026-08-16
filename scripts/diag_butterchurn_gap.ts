// Copyright 2023 Im-Beast. MIT license.

/**
 * Characterises the GPU-vs-CPU butterchurn render gap. For every preset it
 * measures coverage on BOTH renderers and buckets the result, so we know the
 * real scope of "renders on the CPU but black on the GPU" rather than guessing.
 *
 *   deno run -A --unstable-webgpu -c packages/exomux/deno.json scripts/diag_butterchurn_gap.ts
 */

import { EXOMUX_BUTTERCHURN_CATALOG } from "../packages/exomux/butterchurn_catalog.ts";
import { ExomuxButterchurnField } from "../packages/exomux/butterchurn_background.ts";
import { createScriptedExomuxAudio } from "../packages/exomux/audio_scripted.ts";
import { exomuxTheme } from "../packages/exomux/model.ts";

const WIDTH = 96;
const HEIGHT = 28;
const BOUNDS = { column: 0, row: 0, width: WIDTH, height: HEIGHT };
const THEME = exomuxTheme("midnight");
const CELLS = WIDTH * HEIGHT;
const WARMUP_FRAMES = 120;
const FRAME_SLEEP_MS = 6;
const RENDER = 0.03; // matches the audit's keep threshold
const BLACK = 0.005; // below this, treat as truly-black (nothing drawn)

function coverage(field: ExomuxButterchurnField): number {
  let painted = 0;
  for (const row of field.rasterizeCells(BOUNDS, THEME)) {
    for (const cell of row) if (cell) painted += 1;
  }
  return painted / CELLS;
}

async function cover(index: number, gpu: boolean): Promise<number> {
  const field = new ExomuxButterchurnField({
    gpu,
    presetIndex: index,
    autoCycle: false,
    audio: createScriptedExomuxAudio(),
  });
  let now = 0;
  for (let frame = 0; frame < WARMUP_FRAMES; frame += 1) {
    now += 1000 / 30;
    field.advance({ bounds: BOUNDS, now });
    if (gpu) await new Promise((resolve) => setTimeout(resolve, FRAME_SLEEP_MS));
  }
  const cov = coverage(field);
  field.dispose();
  return cov;
}

const gapNames: string[] = []; // renders on CPU, black on GPU
const trulyBlack: string[] = []; // ...of those, GPU draws essentially nothing
const dim: string[] = []; // ...of those, GPU draws something but < RENDER
let bothRender = 0;
let bothBlank = 0;
let gpuOnly = 0;

for (let index = 0; index < EXOMUX_BUTTERCHURN_CATALOG.length; index += 1) {
  const name = EXOMUX_BUTTERCHURN_CATALOG[index]!.name;
  const cpu = await cover(index, false);
  const g = await cover(index, true);
  if (cpu >= RENDER && g >= RENDER) bothRender += 1;
  else if (cpu < RENDER && g < RENDER) bothBlank += 1;
  else if (cpu >= RENDER && g < RENDER) {
    gapNames.push(`${name}  cpu=${(cpu * 100).toFixed(1)}%  gpu=${(g * 100).toFixed(2)}%`);
    if (g < BLACK) trulyBlack.push(name);
    else dim.push(name);
  } else gpuOnly += 1;
  if (index % 40 === 0) {
    console.error(`...${index}/${EXOMUX_BUTTERCHURN_CATALOG.length}  gap=${gapNames.length}`);
  }
}

console.log("=== butterchurn GPU-vs-CPU gap ===");
console.log(`total presets:        ${EXOMUX_BUTTERCHURN_CATALOG.length}`);
console.log(`both render (>=3%):   ${bothRender}`);
console.log(`both blank (<3%):     ${bothBlank}`);
console.log(`gpu renders, cpu not: ${gpuOnly}`);
console.log(`CPU renders, GPU not: ${gapNames.length}   <-- the real regression`);
console.log(`  of those truly black (gpu<0.5%): ${trulyBlack.length}`);
console.log(`  of those dim (0.5%..3%):         ${dim.length}`);
console.log("");
console.log("--- the gap presets ---");
for (const line of gapNames) console.log(line);
