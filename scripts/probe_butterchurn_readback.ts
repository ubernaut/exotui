// Copyright 2023 Im-Beast. MIT license.

/**
 * 033 echo-amplifier probe: reads the GPU feedback texture back at checkpoints
 * to see what the loop actually holds — the truly-black presets resolve to
 * nothing, so cell output cannot distinguish "the loop is empty" from "the
 * loop oscillates around zero and cancels".
 *
 *   deno run -A --unstable-webgpu -c packages/exomux/deno.json scripts/probe_butterchurn_readback.ts
 */

import { EXOMUX_BUTTERCHURN_CATALOG } from "../packages/exomux/butterchurn_catalog.ts";
import { ExomuxButterchurnField } from "../packages/exomux/butterchurn_background.ts";
import { createScriptedExomuxAudio } from "../packages/exomux/audio_scripted.ts";
import { exomuxTheme } from "../packages/exomux/model.ts";

const BOUNDS = { column: 0, row: 0, width: 96, height: 28 };
const THEME = exomuxTheme("midnight");
const CHECKPOINTS = [2, 5, 10, 20, 40, 80, 120];

const TARGETS = [
  "Goody - The Wild Vort", // echo amplifier, black on GPU
  "flexi - bouncing balls", // echo class, healthy since the UNORM fix
  "cope - digital sea", // authors b1n=0.4: blur1 floor via the clamped store
];

function presetIndex(name: string): number {
  const needle = name.toLowerCase();
  const index = EXOMUX_BUTTERCHURN_CATALOG.findIndex((preset) => preset.name.toLowerCase().includes(needle));
  if (index < 0) throw new Error(`preset not found: ${name}`);
  return index;
}

for (const name of TARGETS) {
  const field = new ExomuxButterchurnField({ gpu: true, presetIndex: presetIndex(name), autoCycle: false , audio: createScriptedExomuxAudio() });
  let now = 0;
  console.log(`\n=== ${name}`);
  for (let frame = 1; frame <= 120; frame += 1) {
    now += 125;
    field.advance({ bounds: BOUNDS, now });
    await new Promise((resolve) => setTimeout(resolve, 6));
    if (CHECKPOINTS.includes(frame)) {
      const stats = await field.debugGpu()?.debugMainStats();
      const comp = await field.debugGpu()?.debugCompStats();
      if (!stats) {
        console.log(`  frame ${frame}: no gpu stats (renderer not ready)`);
        continue;
      }
      const compText = comp
        ? ` | comp mean=${comp.mean.toFixed(4)} max=${comp.max.toFixed(3)} >0.1=${(comp.aboveTenth * 100).toFixed(1)}%`
        : " | comp: n/a";
      console.log(
        `  frame ${String(frame).padStart(3)}: loop mean=${stats.mean.toFixed(4)} min=${stats.min.toFixed(3)} max=${
          stats.max.toFixed(3)
        } neg=${(stats.negativeShare * 100).toFixed(1)}% >0.1=${(stats.aboveTenth * 100).toFixed(1)}%${compText}`,
      );
    }
  }
  field.dispose();
}
