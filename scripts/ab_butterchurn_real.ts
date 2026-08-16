// Copyright 2023 Im-Beast. MIT license.

/**
 * 033: the decisive real-butterchurn A/B. Fetches the published
 * butterchurn + butterchurn-presets browser builds, runs a target
 * preset in headless Chromium (WebGL via SwiftShader), measures the
 * equilibrium luminance trajectory, and runs the ablation matrix that
 * isolates which injected term carries the energy (shapes, waves,
 * basic wave, motion vectors, echo_alpha, gamma). This is the
 * instrument that found the echo-amplifier root cause on Aug 16 2026:
 * shapesOff collapsed real butterchurn from 0.68 to 0.0398 — our exact
 * pre-fix equilibrium — and the source diff showed real textured-shape
 * UVs are a fixed 0.5/tex_zoom ring, independent of shape radius.
 *
 *   deno run -A scripts/ab_butterchurn_real.ts ["preset name substring"]
 */

const TARGET = Deno.args[0] ?? "The Wild Vort";
// BC_AB_TMP overrides the temp root for sandboxes where /tmp is
// namespaced per process and a spawned node cannot see Deno's files.
const scratch = await Deno.makeTempDir({
  prefix: "bc-ab-",
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
await Deno.copyFile(`${scratch}/bc/package/lib/butterchurn.min.js`, `${scratch}/butterchurn.min.js`);
await Deno.copyFile(`${scratch}/bcp/package/lib/butterchurnPresets.min.js`, `${scratch}/butterchurnPresets.min.js`);

// The tarball also ships ~1,754 individually converted preset JSONs —
// far more than the 100 in the bundled pack. Prefer an exact converted
// file for the target so the A/B covers most of the fleet.
let convertedPreset: { name: string; preset: unknown } | undefined;
try {
  const convertedDir = `${scratch}/bcp/package/presets/converted`;
  for await (const entry of Deno.readDir(convertedDir)) {
    if (entry.isFile && entry.name.toLowerCase().includes(TARGET.toLowerCase())) {
      convertedPreset = {
        name: entry.name.replace(/\.json$/, ""),
        preset: JSON.parse(await Deno.readTextFile(`${convertedDir}/${entry.name}`)),
      };
      break;
    }
  }
} catch {
  // no converted directory in this tarball layout — pack search still applies
}

// Presets outside the published 100-preset pack come from OUR catalog,
// converted to the pack schema (init/frame/pixel → *_eqs_str).
const { EXOMUX_BUTTERCHURN_CATALOG } = await import("../packages/exomux/butterchurn_catalog.ts");
const catalogEntry = EXOMUX_BUTTERCHURN_CATALOG.find((entry) =>
  entry.name.toLowerCase().includes(TARGET.toLowerCase())
);
/**
 * Converts raw Milkdrop EEL equations to the executable JS real
 * butterchurn expects, via the converter's local (non-AWS) equation
 * path running in node. Shaders are NOT converted — our catalog holds
 * WGSL — so catalog-injected A/B runs the preset's DYNAMICS under
 * MilkDrop's default warp/comp, which is faithful exactly for the
 * wave/shape-driven presets and documented as such.
 */
async function convertEquations(
  init: string,
  frame: string,
  pixel: string,
): Promise<{ init_eqs_str: string; frame_eqs_str: string; pixel_eqs_str: string }> {
  const probe = `
    global.window = global;
    const m = require(${JSON.stringify(`${scratch}/mpc/package/dist/milkdrop-preset-converter-aws.min.js`)});
    const api = m.default || m;
    Promise.resolve(api.convertPresetEquations(
      ${JSON.stringify(init)}, ${JSON.stringify(frame)}, ${JSON.stringify(pixel)}, "",
    )).then((result) => console.log(JSON.stringify(result)));
  `;
  const run = new Deno.Command("node", { args: ["-e", probe], stdout: "piped", stderr: "piped" });
  const output = await run.output();
  if (!output.success) throw new Error("equation conversion failed: " + new TextDecoder().decode(output.stderr));
  return JSON.parse(new TextDecoder().decode(output.stdout).trim().split("\n").pop()!);
}

const catalogInjected = catalogEntry
  ? {
    name: catalogEntry.name,
    preset: {
      baseVals: catalogEntry.baseVals,
      ...(await convertEquations(catalogEntry.init ?? "", catalogEntry.frame ?? "", catalogEntry.pixel ?? "")),
      // Our catalog stores WGSL; default shaders carry the A/B instead.
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
  }
  : undefined;

const injected = convertedPreset ?? catalogInjected;

const page = `<!doctype html>
<html><body>
<canvas id="canvas" width="512" height="288"></canvas>
<pre id="out"></pre>
<script src="./butterchurn.min.js"></script>
<script src="./butterchurnPresets.min.js"></script>
<script>
(async () => {
  const out = (text) => { document.getElementById("out").textContent = text; };
  try {
    const injected = INJECTED_PRESET;
    const presets = window.butterchurnPresets.getPresets();
    const packName = Object.keys(presets).find((key) => key.includes(${JSON.stringify(TARGET)}));
    const name = packName ?? (injected ? injected.name : undefined);
    if (!name) { out("ABLATE:" + JSON.stringify({ error: "preset missing" })); return; }
    const base = packName ? presets[packName] : injected.preset;
    const audio = new AudioContext();
    if (audio.state === "suspended") await audio.resume();
    const osc = audio.createOscillator();
    osc.frequency.value = 110;
    const gain = audio.createGain();
    gain.gain.value = 0.6;
    osc.connect(gain);
    osc.start();
    const canvas = document.getElementById("canvas");
    const viz = window.butterchurn.default.createVisualizer(audio, canvas, { width: 512, height: 288 });
    viz.connectAudio(gain);
    const gl = canvas.getContext("webgl2");
    const pixels = new Uint8Array(512 * 288 * 4);
    const measure = () => {
      gl.readPixels(0, 0, 512, 288, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let sum = 0, above = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const lum = (0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) / 255;
        sum += lum;
        if (lum > 0.1) above += 1;
      }
      const count = pixels.length / 4;
      return { mean: Number((sum / count).toFixed(4)), aboveTenth: Number((above / count).toFixed(4)) };
    };
    const run = (mutate) => {
      const preset = JSON.parse(JSON.stringify(base));
      if (mutate) mutate(preset);
      viz.loadPreset(preset, 0);
      for (let frame = 0; frame < 360; frame += 1) viz.render({ elapsedTime: 1 / 30 });
      return measure();
    };
    const results = {};
    results.baseline = run(null);
    results.shapesOff = run((preset) => { for (const shape of preset.shapes ?? []) shape.baseVals.enabled = 0; });
    results.wavesOff = run((preset) => { for (const wave of preset.waves ?? []) wave.baseVals.enabled = 0; });
    results.basicWaveOff = run((preset) => { preset.baseVals.wave_a = 0; });
    results.mvOff = run((preset) => { preset.baseVals.mv_a = 0; });
    results.echoAlphaOff = run((preset) => { preset.baseVals.echo_alpha = 0; });
    results.gammaOne = run((preset) => { preset.baseVals.gammaadj = 1; });
    out("ABLATE:" + JSON.stringify({ preset: name, results }));
  } catch (error) {
    out("ABLATE:" + JSON.stringify({ error: String(error && error.stack || error) }));
  }
})();
</script>
</body></html>`;
await Deno.writeTextFile(
  `${scratch}/index.html`,
  page.replace("INJECTED_PRESET", JSON.stringify(injected ?? null)),
);

const server = Deno.serve({ port: 8141, hostname: "127.0.0.1", onListen: () => {} }, async (request) => {
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

let result = "";
for (const binary of ["google-chrome", "chromium"]) {
  try {
    const run = new Deno.Command(binary, {
      args: [
        "--headless",
        "--no-sandbox",
        "--autoplay-policy=no-user-gesture-required",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--virtual-time-budget=300000",
        "--dump-dom",
        "http://127.0.0.1:8141/",
      ],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await run.output();
    const dom = new TextDecoder().decode(output.stdout);
    const marker = dom.indexOf("ABLATE:{");
    if (marker >= 0) {
      result = dom.slice(marker + "ABLATE:".length, dom.indexOf("</pre>", marker));
      break;
    }
  } catch {
    // try the next binary
  }
}
await server.shutdown();
if (!result) throw new Error("no ABLATE marker from any browser");
console.log(JSON.stringify(JSON.parse(result), null, 2));
