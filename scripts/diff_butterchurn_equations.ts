// Copyright 2023 Im-Beast. MIT license.

/**
 * 033: equation-divergence diffing. Runs a preset's frame equations in
 * REAL butterchurn (converted JS, executed by the real
 * presetEquationRunner in headless Chromium) and in OUR EEL
 * interpreter, both under SILENCE at 30 fps, and diffs every watched
 * variable at checkpoints. Divergence in the variables feeding comp
 * uniforms (gamma, echo, decay, q-vars) localizes a dark-comp preset
 * without touching shaders. Needs network + Chromium; BC_AB_TMP points
 * the temp root somewhere both Deno and node can see.
 *
 *   deno run -A -c packages/exomux/deno.json scripts/diff_butterchurn_equations.ts ["name substring"]
 */

import { EXOMUX_BUTTERCHURN_CATALOG } from "../packages/exomux/butterchurn_catalog.ts";
import { ExomuxButterchurnPreset } from "../packages/exomux/butterchurn_preset.ts";
import { EXOMUX_AUDIO_BANDS, EXOMUX_AUDIO_WAVEFORM } from "../packages/exomux/audio.ts";

const TARGET = Deno.args[0] ?? "Ego Decontructor";
const FRAMES = 60;
const STRIDE = 10;
const WATCH = [
  "time",
  "bass",
  "mid",
  "treb",
  "bass_att",
  "decay",
  "gammaadj",
  "echo_alpha",
  "echo_zoom",
  "zoom",
  "rot",
  "warp",
  "wave_r",
  "wave_g",
  "wave_b",
  "wave_a",
  "q1",
  "q2",
  "q3",
  "q4",
  "q5",
  "q6",
  "q7",
  "q8",
];

const scratch = await Deno.makeTempDir({
  prefix: "bc-eq-",
  ...(Deno.env.get("BC_AB_TMP") ? { dir: Deno.env.get("BC_AB_TMP")! } : {}),
});

async function fetchTarball(url: string, into: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch failed: ${url}`);
  const tarPath = `${into}.tgz`;
  await Deno.writeFile(tarPath, new Uint8Array(await response.arrayBuffer()));
  await Deno.mkdir(into, { recursive: true });
  const untar = new Deno.Command("tar", { args: ["xzf", tarPath, "-C", into] });
  if (!(await untar.output()).success) throw new Error(`untar failed: ${url}`);
}

await fetchTarball("https://registry.npmjs.org/butterchurn/-/butterchurn-2.6.7.tgz", `${scratch}/bc`);
await fetchTarball("https://registry.npmjs.org/butterchurn-presets/-/butterchurn-presets-2.4.7.tgz", `${scratch}/bcp`);
await fetchTarball(
  "https://registry.npmjs.org/milkdrop-preset-converter-aws/-/milkdrop-preset-converter-aws-0.1.6.tgz",
  `${scratch}/mpc`,
);
await Deno.copyFile(`${scratch}/bc/package/lib/butterchurn.js`, `${scratch}/butterchurn.unmin.js`);
await Deno.copyFile(`${scratch}/bcp/package/lib/butterchurnPresets.min.js`, `${scratch}/butterchurnPresets.min.js`);

async function convertEquations(
  init: string,
  frame: string,
  pixel: string,
): Promise<{ init_eqs_str: string; frame_eqs_str: string; pixel_eqs_str: string }> {
  const probe = `
    global.window = global;
    const m = require(${JSON.stringify(`${scratch}/mpc/package/dist/milkdrop-preset-converter-aws.min.js`)});
    const api = m.default || m;
    // Signature: (versionSlot, init, frame, pixel) — the first argument
    // is consumed before the equation slots; passing init there shifts
    // every equation into the wrong stage (found empirically Aug 16).
    Promise.resolve(api.convertPresetEquations(
      "", ${JSON.stringify(init)}, ${JSON.stringify(frame)}, ${JSON.stringify(pixel)},
    )).then((result) => console.log(JSON.stringify(result)));
  `;
  const run = new Deno.Command("node", { args: ["-e", probe], stdout: "piped", stderr: "piped" });
  const output = await run.output();
  if (!output.success) throw new Error("conversion failed: " + new TextDecoder().decode(output.stderr));
  return JSON.parse(new TextDecoder().decode(output.stdout).trim().split("\n").pop()!);
}

const catalogEntry = EXOMUX_BUTTERCHURN_CATALOG.find((entry) =>
  entry.name.toLowerCase().includes(TARGET.toLowerCase())
);
if (!catalogEntry) throw new Error(`preset not found in catalog: ${TARGET}`);
const injected = {
  name: catalogEntry.name,
  preset: {
    baseVals: catalogEntry.baseVals,
    ...(await convertEquations(catalogEntry.init ?? "", catalogEntry.frame ?? "", catalogEntry.pixel ?? "")),
    warp: "",
    comp: "",
    waves: await Promise.all((catalogEntry.waves ?? []).map(async (wave) => {
      const converted = await convertEquations(wave.init ?? "", wave.frame ?? "", wave.point ?? "");
      return {
        baseVals: wave.baseVals,
        init_eqs_str: converted.init_eqs_str,
        frame_eqs_str: converted.frame_eqs_str,
        point_eqs_str: converted.pixel_eqs_str,
      };
    })),
    shapes: await Promise.all((catalogEntry.shapes ?? []).map(async (shape) => {
      const converted = await convertEquations(shape.init ?? "", shape.frame ?? "", "");
      return {
        baseVals: shape.baseVals,
        init_eqs_str: converted.init_eqs_str,
        frame_eqs_str: converted.frame_eqs_str,
      };
    })),
  },
};
// Real butterchurn iterates a FIXED four waves and four shapes; pad the
// authored lists with disabled entries.
while (injected.preset.waves.length < 4) {
  injected.preset.waves.push({ baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "", point_eqs_str: "" });
}
while (injected.preset.shapes.length < 4) {
  injected.preset.shapes.push({ baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" });
}

const page = `<!doctype html>
<html><body>
<canvas id="canvas" width="512" height="288"></canvas>
<pre id="out"></pre>
<script src="./butterchurn.unmin.js"></script>
<script src="./butterchurnPresets.min.js"></script>
<script>
(async () => {
  const out = (text) => { document.getElementById("out").textContent = text; };
  try {
    const injected = ${JSON.stringify(injected)};
    const presets = window.butterchurnPresets.getPresets();
    const packName = Object.keys(presets).find((key) => key.includes(${JSON.stringify(TARGET)}));
    const base = packName ? presets[packName] : injected.preset;
    const audio = new AudioContext();
    if (audio.state === "suspended") await audio.resume();
    const canvas = document.getElementById("canvas");
    const viz = window.butterchurn.default.createVisualizer(audio, canvas, { width: 512, height: 288 });
    viz.loadPreset(base, 0);
    const WATCH = ${JSON.stringify(WATCH)};
    const trajectory = [];
    for (let frame = 0; frame < ${FRAMES}; frame += 1) {
      viz.render({ elapsedTime: 1 / 30 });
      if (frame % ${STRIDE} === ${STRIDE} - 1) {
        const vars = viz.renderer.presetEquationRunner.mdVSFrame ?? {};
        const sample = { frame: frame + 1 };
        for (const key of WATCH) {
          if (typeof vars[key] === "number" && Number.isFinite(vars[key])) {
            sample[key] = Number(vars[key].toFixed(5));
          }
        }
        trajectory.push(sample);
      }
    }
    out("EQVARS:" + JSON.stringify({ preset: packName ?? injected.name, trajectory }));
  } catch (error) {
    out("EQVARS:" + JSON.stringify({ error: String(error && error.stack || error) }));
  }
})();
</script>
</body></html>`;
await Deno.writeTextFile(`${scratch}/index.html`, page);

const server = Deno.serve({ port: 8143, hostname: "127.0.0.1", onListen: () => {} }, async (request) => {
  const path = new URL(request.url).pathname;
  const file = path === "/" ? "/index.html" : path;
  try {
    const body = await Deno.readFile(`${scratch}${file}`);
    const type = file.endsWith(".js") ? "text/javascript" : "text/html";
    return new Response(body, { headers: { "content-type": type } });
  } catch {
    return new Response("not found", { status: 404 });
  }
});
let realResult = "";
for (const binary of ["google-chrome", "chromium"]) {
  try {
    const run = new Deno.Command(binary, {
      args: [
        "--headless",
        "--no-sandbox",
        "--autoplay-policy=no-user-gesture-required",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--virtual-time-budget=120000",
        "--dump-dom",
        "http://127.0.0.1:8143/",
      ],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await run.output();
    const dom = new TextDecoder().decode(output.stdout);
    const marker = dom.indexOf("EQVARS:{");
    if (marker >= 0) {
      realResult = dom.slice(marker + "EQVARS:".length, dom.indexOf("</pre>", marker));
      break;
    }
  } catch {
    // try the next binary
  }
}
await server.shutdown();
if (!realResult) throw new Error("no EQVARS from any browser");
const real = JSON.parse(realResult) as {
  preset?: string;
  error?: string;
  trajectory?: { frame: number; [key: string]: number }[];
};
if (real.error) throw new Error("real side failed: " + real.error);

// ── our side: same preset, silence, 30 fps ────────────────────────────
const preset = new ExomuxButterchurnPreset(catalogEntry, 96, 28);
preset.debugWatch(WATCH);
const bands = new Float32Array(EXOMUX_AUDIO_BANDS);
const waveform = new Float32Array(EXOMUX_AUDIO_WAVEFORM);
const silent = { level: 0, bass: 0, mid: 0, treble: 0, bands, waveform, beat: false } as never;
const ours: { frame: number; [key: string]: number }[] = [];
for (let frame = 0; frame < FRAMES; frame += 1) {
  preset.advance(silent, (frame + 1) / 30, frame + 1, 30);
  if (frame % STRIDE === STRIDE - 1) {
    const sample: { frame: number; [key: string]: number } = { frame: frame + 1 };
    const snapshot = preset.debugFrameValues() ?? {};
    for (const key of WATCH) {
      const value = snapshot[key];
      if (value !== undefined && Number.isFinite(value)) sample[key] = Number(value.toFixed(5));
    }
    ours.push(sample);
  }
}

// ── the diff ──────────────────────────────────────────────────────────
console.log(`preset: ${real.preset}`);
console.log(
  "var          " + real.trajectory!.map((sample) => `f${sample.frame}`.padStart(9)).join("") + "  (real / ours)",
);
const drifts: { key: string; drift: number }[] = [];
for (const key of WATCH) {
  const realRow = real.trajectory!.map((sample) => sample[key]);
  const oursRow = ours.map((sample) => sample[key]);
  if (realRow.every((value) => value === undefined) && oursRow.every((value) => value === undefined)) continue;
  const cells = realRow.map((realValue, index) => {
    const oursValue = oursRow[index];
    if (realValue === undefined || oursValue === undefined) return "   ?    ";
    return `${realValue.toFixed(2)}/${oursValue.toFixed(2)}`.padStart(9);
  });
  const drift = Math.max(
    ...realRow.map((realValue, index) =>
      realValue !== undefined && oursRow[index] !== undefined ? Math.abs(realValue - oursRow[index]!) : 0
    ),
  );
  drifts.push({ key, drift });
  console.log(key.padEnd(12) + cells.join("") + (drift > 0.01 ? `  ← drift ${drift.toFixed(3)}` : ""));
}
drifts.sort((a, b) => b.drift - a.drift);
console.log(
  "\nlargest drifts: " + drifts.slice(0, 5).map((entry) => `${entry.key}=${entry.drift.toFixed(3)}`).join(", "),
);
