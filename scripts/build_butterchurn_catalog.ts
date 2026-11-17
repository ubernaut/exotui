import { runtimeHost } from "../src/runtime/host.ts";
// Copyright 2023 Im-Beast. MIT license.

/**
 * Regenerates `packages/exomux/butterchurn_catalog.ts` from the upstream
 * `butterchurn-presets` npm package.
 *
 * The catalog is vendored rather than fetched at runtime: Exomux ships as a
 * single compiled binary with no npm dependencies, and the presets are static
 * data. Only what the terminal renderer can actually use is carried over —
 * each preset's base values, its three EEL equation blocks, and its warp and
 * composite shaders. Custom waves and custom shapes are still dropped.
 *
 * Every pack the package ships is merged, not just `base` and `extra`: 472
 * distinct presets, against the 293 the parent ButterchurnXR demo shows.
 *
 * **Shaders are translated here, not at runtime.** Upstream already converted
 * them from MilkDrop's HLSL to GLSL; this script runs `glsl_wgsl.ts` over them
 * and stores the WGSL, along with the samplers each body turned out to need.
 * That keeps translation off the frame path entirely, and — more usefully —
 * turns "this preset silently fell back to the CPU" into a number printed at
 * build time. The one thing that cannot be done ahead is building the GPU
 * pipelines: those belong to a device that does not exist yet.
 *
 * Usage, pointed at a checkout that has the package installed:
 *
 *   deno run -A scripts/build_butterchurn_catalog.ts \
 *     --presets ~/projects/butterchurnxr/node_modules/butterchurn-presets
 *
 * `butterchurn-presets` is MIT licensed, Copyright (c) 2013-2018 Jordan Berg.
 */

import { SAMPLERS, translateShaderBody } from "../packages/exomux/glsl_wgsl.ts";

const OUTPUT = new URL("../packages/exomux/butterchurn_catalog.ts", import.meta.url);

/** Every pack in the package. `all.js` is just these spread together. */
const PACKS = ["base.js", "extra.js", "image.js", "md1.js", "minimal.js", "nonMinimal.js"];

const SAMPLER_SET = new Set(SAMPLERS);

interface WaveSource {
  readonly baseVals: Record<string, number>;
  readonly init: string;
  readonly frame: string;
  readonly point: string;
}

interface ShapeSource {
  readonly baseVals: Record<string, number>;
  readonly init: string;
  readonly frame: string;
}

interface PresetSource {
  readonly name: string;
  readonly baseVals: Record<string, number>;
  readonly init: string;
  readonly frame: string;
  readonly pixel: string;
  /** WGSL body of the warp shader; empty when the preset has none. */
  readonly warp: string;
  readonly warpSamplers: readonly string[];
  readonly comp: string;
  readonly compSamplers: readonly string[];
  /** Enabled custom waves only; disabled ones are dead weight. */
  readonly waves: readonly WaveSource[];
  readonly shapes: readonly ShapeSource[];
}

/**
 * Translates one GLSL body, resolving the samplers it needs.
 *
 * A preset may declare a texture from an image pack this build does not ship.
 * Those read the noise table instead, which is what Butterchurn falls back to
 * without the pack — done here so the runtime has nothing left to patch.
 */
function translate(source: string): { body: string; samplers: string[] } | undefined {
  if (!source.trim()) return undefined;
  let translated;
  try {
    translated = translateShaderBody(source);
  } catch {
    return undefined;
  }
  const samplers = [...new Set([...translated.samplers, "sampler_main"])].filter((name) => SAMPLER_SET.has(name));
  const body = translated.custom.reduce(
    (text, name) =>
      text.replaceAll(`${name}_tex`, "sampler_noise_lq_tex").replaceAll(`${name}_smp`, "sampler_noise_lq_smp"),
    translated.body,
  );
  if (translated.custom.length > 0 && !samplers.includes("sampler_noise_lq")) samplers.push("sampler_noise_lq");
  return { body, samplers };
}

/** Reads `presets["name"] = require("./path")` pairs out of a pack index. */
async function readPack(root: string, pack: string): Promise<Map<string, string>> {
  const source = await runtimeHost.readTextFile(`${root}/${pack}`);
  const entries = new Map<string, string>();
  const pattern = /presets\[("(?:[^"\\]|\\.)*")\]\s*=\s*require\("((?:[^"\\]|\\.)*)"\)/g;
  for (const match of source.matchAll(pattern)) {
    entries.set(JSON.parse(match[1]!) as string, JSON.parse(`"${match[2]!}"`) as string);
  }
  return entries;
}

if (import.meta.main) {
  // Parsed by hand rather than with `@std/cli`: this is a build-time script for
  // a checked-in artifact, and it should not put a dependency in the root
  // lockfile that nothing in the library or the app ever imports.
  const flag = runtimeHost.args.indexOf("--presets");
  const root = flag === -1 ? undefined : runtimeHost.args[flag + 1];
  if (!root) {
    console.error("Pass --presets <path to butterchurn-presets package>");
    runtimeHost.exit(2);
  }

  const entries = new Map<string, string>();
  for (const pack of PACKS) {
    for (const [name, path] of await readPack(root, pack)) entries.set(name, path);
  }

  const presets: PresetSource[] = [];
  let authored = 0;
  const untranslatable: string[] = [];
  for (const [name, path] of entries) {
    const resolved = `${root}/${path.replace(/^\.\//, "")}`;
    const preset = JSON.parse(await runtimeHost.readTextFile(resolved)) as Record<string, unknown>;
    const warpSource = (preset.warp as string | undefined) ?? "";
    const compSource = (preset.comp as string | undefined) ?? "";
    for (const source of [warpSource, compSource]) if (source.trim()) authored += 1;
    const warp = translate(warpSource);
    const comp = translate(compSource);
    const waves: WaveSource[] = [];
    for (const raw of Array.isArray(preset.waves) ? preset.waves as Record<string, unknown>[] : []) {
      const baseVals = (raw.baseVals ?? {}) as Record<string, number>;
      if (!baseVals.enabled) continue;
      waves.push({
        baseVals,
        init: (raw.init_eqs_eel as string | undefined) ?? "",
        frame: (raw.frame_eqs_eel as string | undefined) ?? "",
        point: (raw.point_eqs_eel as string | undefined) ?? "",
      });
    }
    const shapes: ShapeSource[] = [];
    for (const raw of Array.isArray(preset.shapes) ? preset.shapes as Record<string, unknown>[] : []) {
      const baseVals = (raw.baseVals ?? {}) as Record<string, number>;
      if (!baseVals.enabled) continue;
      shapes.push({
        baseVals,
        init: (raw.init_eqs_eel as string | undefined) ?? "",
        frame: (raw.frame_eqs_eel as string | undefined) ?? "",
      });
    }
    if (warpSource.trim() && !warp) untranslatable.push(`${name} (warp)`);
    if (compSource.trim() && !comp) untranslatable.push(`${name} (comp)`);
    presets.push({
      name,
      baseVals: (preset.baseVals ?? {}) as Record<string, number>,
      init: (preset.init_eqs_eel as string | undefined) ?? "",
      frame: (preset.frame_eqs_eel as string | undefined) ?? "",
      pixel: (preset.pixel_eqs_eel as string | undefined) ?? "",
      warp: warp?.body ?? "",
      warpSamplers: warp?.samplers ?? [],
      comp: comp?.body ?? "",
      compSamplers: comp?.samplers ?? [],
      waves,
      shapes,
    });
  }

  // The parent demo sorts case-insensitively before indexing, so preset order —
  // and therefore what "next preset" means — matches upstream.
  presets.sort((left, right) => {
    const a = left.name.toLowerCase();
    const b = right.name.toLowerCase();
    return a < b ? -1 : a > b ? 1 : 0;
  });

  // Emitted as one JSON string rather than a TypeScript literal. A 293-entry
  // object literal is half a megabyte of syntax for `deno check` to walk on
  // every typecheck; `JSON.parse` of the same data costs a few milliseconds
  // once at module load and nothing at all at typecheck time.
  const payload = JSON.stringify(presets);
  const module = `// Copyright 2023 Im-Beast. MIT license.

// GENERATED FILE — do not edit by hand.
// Regenerate with: deno run -A scripts/build_butterchurn_catalog.ts --presets <path>
//
// The MilkDrop preset catalog used by the butterchurn desktop background,
// vendored from the \`butterchurn-presets\` npm package (MIT, Copyright (c)
// 2013-2018 Jordan Berg), merging every pack it ships. Each entry carries a
// preset's base values, its three EEL equation blocks, and its warp and
// composite shaders already translated to WGSL. Custom waves and custom shapes
// are omitted.

/** One preset as authored: base values plus unparsed EEL equation blocks. */
export interface ExomuxButterchurnPresetSource {
  readonly name: string;
  readonly baseVals: Readonly<Record<string, number>>;
  /** Equations run once when the preset is selected. */
  readonly init: string;
  /** Equations run once per frame. */
  readonly frame: string;
  /** Equations run once per warp-mesh vertex per frame. */
  readonly pixel: string;
  /**
   * WGSL body of the warp shader, run per fragment of the feedback pass.
   *
   * Empty when the preset has no warp shader, or when its GLSL could not be
   * translated — in both cases the graph substitutes MilkDrop's default.
   */
  readonly warp: string;
  /** Samplers the warp body binds, in binding order. */
  readonly warpSamplers: readonly string[];
  /** WGSL body of the composite shader, run per fragment of the output pass. */
  readonly comp: string;
  /** Samplers the composite body binds, in binding order. */
  readonly compSamplers: readonly string[];
  /** The preset's enabled custom waves, in draw order. */
  readonly waves: readonly ExomuxButterchurnWaveSource[];
  /** The preset's enabled custom shapes, in draw order. */
  readonly shapes: readonly ExomuxButterchurnShapeSource[];
}

/** One custom wave as authored: base values plus its three EEL blocks. */
export interface ExomuxButterchurnWaveSource {
  readonly baseVals: Readonly<Record<string, number>>;
  readonly init: string;
  readonly frame: string;
  /** Equations run per sample point. */
  readonly point: string;
}

/** One custom shape as authored: base values plus its two EEL blocks. */
export interface ExomuxButterchurnShapeSource {
  readonly baseVals: Readonly<Record<string, number>>;
  readonly init: string;
  /** Equations run once per instance per frame. */
  readonly frame: string;
}

// Parsed rather than written as a literal so typechecking stays cheap; see
// scripts/build_butterchurn_catalog.ts for why.
export const EXOMUX_BUTTERCHURN_CATALOG: readonly ExomuxButterchurnPresetSource[] = JSON.parse(
  ${JSON.stringify(payload)},
);
`;
  await runtimeHost.writeTextFile(OUTPUT, module);
  // Formatted here so regenerating never leaves the tree failing `deno fmt`.
  await new runtimeHost.Command("Bun" in globalThis ? "deno" : runtimeHost.execPath(), {
    args: ["fmt", OUTPUT.pathname],
    stdout: "null",
    stderr: "null",
  }).output();
  const bytes = new TextEncoder().encode(module).length;
  const translated = presets.reduce(
    (total, preset) => total + (preset.warp ? 1 : 0) + (preset.comp ? 1 : 0),
    0,
  );
  console.log(`wrote ${presets.length} presets to ${OUTPUT.pathname} (${(bytes / 1024).toFixed(0)} KB)`);
  console.log(`shaders: ${translated}/${authored} translated to WGSL`);
  if (untranslatable.length > 0) {
    console.log(`untranslatable (${untranslatable.length}):`);
    for (const entry of untranslatable) console.log(`  ${entry}`);
  }
}
