import { assert, assertEquals } from "./deps.ts";
import { ExomuxButterchurnGpu, sanitizeShaderBody } from "../butterchurn_gpu.ts";
import { EXOMUX_BUTTERCHURN_CATALOG } from "../butterchurn_catalog.ts";
import { ExomuxButterchurnPreset } from "../butterchurn_preset.ts";

/** Counts every GPU object the renderer asks for, so per-frame churn shows up. */
interface Counts {
  bindGroup: number;
  view: number;
  texture: number;
  buffer: number;
  pipeline: number;
  /** Textures and buffers explicitly released, so leaks can be told from churn. */
  destroyed: number;
  /** Bind groups whose entry count disagreed with their layout's. */
  mismatched: number;
  /** Texel counts of the textures still alive; the budget probe's are not. */
  sizes: number[];
}

function emptyCounts(): Counts {
  return { bindGroup: 0, view: 0, texture: 0, buffer: 0, pipeline: 0, destroyed: 0, mismatched: 0, sizes: [] };
}

/**
 * The smallest stand-in for a GPUDevice the render graph can be driven through.
 *
 * A real device is not available in CI, and the property under test — how many
 * GPU objects a frame creates — is observable without one.
 */
function stubDevice(counts: Counts, maxTexels = Infinity) {
  // One error-scope slot is enough: the budget probe never nests them.
  let scope: { message: string } | undefined;
  let scoped = false;
  const pass = {
    setPipeline: () => {},
    setBindGroup: () => {},
    setVertexBuffer: () => {},
    draw: () => {},
    end: () => {},
  };
  const encoder = {
    beginRenderPass: () => pass,
    copyTextureToBuffer: () => {},
    finish: () => ({}),
  };
  const makeTexture = (width: number, height: number) => {
    counts.texture += 1;
    const texels = width * height;
    counts.sizes.push(texels);
    if (texels > maxTexels && scoped) scope ??= { message: "not enough memory left" };
    return {
      width,
      height,
      destroy: () => {
        counts.destroyed += 1;
        const at = counts.sizes.indexOf(texels);
        if (at >= 0) counts.sizes.splice(at, 1);
      },
      createView: () => {
        counts.view += 1;
        return {};
      },
    };
  };
  return {
    limits: {},
    lost: new Promise(() => {}),
    queue: { writeBuffer: () => {}, writeTexture: () => {}, submit: () => {} },
    createTexture: (descriptor: { size: number[] }) => makeTexture(descriptor.size[0] ?? 1, descriptor.size[1] ?? 1),
    createBuffer: () => {
      counts.buffer += 1;
      return {
        size: 1 << 20,
        destroy: () => {
          counts.destroyed += 1;
        },
        mapAsync: () => new Promise(() => {}),
        getMappedRange: () => new ArrayBuffer(0),
        unmap: () => {},
      };
    },
    pushErrorScope: () => {
      scoped = true;
      scope = undefined;
    },
    popErrorScope: () => {
      scoped = false;
      const error = scope;
      scope = undefined;
      return Promise.resolve(error);
    },
    createSampler: () => ({}),
    createShaderModule: () => ({}),
    createBindGroupLayout: (descriptor: { entries: unknown[] }) => ({ entries: descriptor.entries.length }),
    createPipelineLayout: () => ({}),
    createRenderPipeline: () => {
      counts.pipeline += 1;
      return { getBindGroupLayout: () => ({ auto: true }) };
    },
    createRenderPipelineAsync: () => {
      counts.pipeline += 1;
      return Promise.resolve({ getBindGroupLayout: () => ({ auto: true }) });
    },
    createBindGroup: (descriptor: { layout: { entries?: number; auto?: boolean }; entries: unknown[] }) => {
      counts.bindGroup += 1;
      // What a real device checks, and what `layout: "auto"` used to get wrong:
      // a group must supply exactly the bindings its layout declares. A derived
      // layout counts as a mismatch outright — it prunes what the shader does
      // not reach, which is unknowable here and was the original bug.
      const derived = descriptor.layout.auto === true && descriptor.entries.length > 0;
      if (derived || (descriptor.layout.entries ?? descriptor.entries.length) !== descriptor.entries.length) {
        counts.mismatched += 1;
      }
      return {};
    },
    createCommandEncoder: () => encoder,
  } as unknown as GPUDevice;
}

Deno.test("butterchurn gpu: a steady frame creates no new GPU objects", async () => {
  // The render path once created roughly ten bind groups and twenty-five
  // texture views per frame. At 8 Hz that exhausted the driver's object budget
  // within minutes, after which every allocation failed, readback stopped, and
  // the background froze on its last frame — taking the GPU down for other
  // processes with it. Views and bind groups are cached now, and this is the
  // guard that keeps them that way.
  const counts = emptyCounts();
  const gpu = new ExomuxButterchurnGpu(stubDevice(counts), { width: 80, height: 24, random: () => 0.5 });
  const entry = EXOMUX_BUTTERCHURN_CATALOG[0]!;
  // Pipelines build off the main thread, so the measurement has to wait for
  // them — otherwise render() draws nothing and the counts stay at zero for
  // the wrong reason.
  assertEquals(gpu.prepare(entry), "pending");
  for (let attempt = 0; attempt < 50 && gpu.prepare(entry) === "pending"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assertEquals(gpu.prepare(entry), "ready", "the first preset should compile");

  const preset = new ExomuxButterchurnPreset(entry, { random: () => 0.5 });
  preset.setSize(80, 24);
  const waveform = new Float32Array(256);
  const q = new Float32Array(32);
  const frame = (index: number) => {
    preset.advance(
      { bass: 1, mid: 1, treb: 1, bassAttack: 1, midAttack: 1, trebleAttack: 1, waveform },
      index * 0.125,
      index,
      8,
    );
    gpu.render(entry.name, {
      mesh: preset.mesh,
      meshWidth: preset.meshWidth,
      meshHeight: preset.meshHeight,
      wave: preset.wave,
      waveCount: preset.waveCount,
      waveColor: [1, 1, 1, 1],
      q,
      time: index * 0.125,
      frame: index,
      fps: 8,
      decay: 0.95,
      bass: 1,
      mid: 1,
      treb: 1,
      bassAttack: 1,
      midAttack: 1,
      trebleAttack: 1,
      aspectX: 1,
      aspectY: 1,
    });
  };

  // Warm up: the first frames legitimately create the caches, and the main
  // targets ping-pong so each needs its own set.
  for (let index = 0; index < 8; index += 1) frame(index);
  const warm = { ...counts };
  assert(warm.bindGroup > 0, "the warm-up must actually have drawn, or this measures nothing");

  for (let index = 8; index < 48; index += 1) frame(index);
  assertEquals(counts.bindGroup, warm.bindGroup, "bind groups must be cached, not rebuilt per frame");
  assertEquals(counts.view, warm.view, "texture views must be cached, not rebuilt per frame");
  assertEquals(counts.texture, warm.texture, "a steady frame must not allocate textures");
  assertEquals(counts.buffer, warm.buffer, "a steady frame must not allocate buffers");
  gpu.destroy();
});

Deno.test("butterchurn gpu: resizing replaces its targets rather than accumulating them", () => {
  const counts = emptyCounts();
  const gpu = new ExomuxButterchurnGpu(stubDevice(counts), { width: 80, height: 24, random: () => 0.5 });
  const afterConstruction = counts.texture + counts.buffer - counts.destroyed;

  // Resizing necessarily rebuilds render targets and invalidates the caches
  // pointing at them. What matters is that each round releases what it
  // replaced, so a terminal being dragged about cannot exhaust the device.
  for (let step = 0; step < 20; step += 1) gpu.setSize(80 + (step % 7), 24 + (step % 5));
  const live = counts.texture + counts.buffer - counts.destroyed;
  assert(
    live <= afterConstruction + 4,
    `resizing left ${live} live GPU objects, up from ${afterConstruction} after construction`,
  );
  gpu.destroy();
});

Deno.test("butterchurn gpu: every bind group matches the layout its pipeline was built with", async () => {
  // `layout: "auto"` derives a layout from the bindings the shader is seen to
  // use, dropping any the preset declared but never reached. The graph binds
  // all of them, so those presets produced an invalid bind group — and because
  // groups are cached, every later frame for that preset failed too. Declaring
  // the layout is what keeps the two in step.
  const counts = emptyCounts();
  const gpu = new ExomuxButterchurnGpu(stubDevice(counts), { width: 80, height: 24, random: () => 0.5 });
  const waveform = new Float32Array(256);
  const q = new Float32Array(32);
  let drawn = 0;
  for (const entry of EXOMUX_BUTTERCHURN_CATALOG.slice(0, 24)) {
    for (let attempt = 0; attempt < 50 && gpu.prepare(entry) === "pending"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    if (gpu.prepare(entry) !== "ready") continue;
    const preset = new ExomuxButterchurnPreset(entry, { random: () => 0.5 });
    preset.setSize(80, 24);
    const audio = { bass: 1, mid: 1, treb: 1, bassAttack: 1, midAttack: 1, trebleAttack: 1, waveform };
    preset.advance(audio, 0, 0, 8);
    const rendered = gpu.render(entry.name, {
      mesh: preset.mesh,
      meshWidth: preset.meshWidth,
      meshHeight: preset.meshHeight,
      wave: preset.wave,
      waveCount: preset.waveCount,
      waveColor: [1, 1, 1, 1],
      q,
      time: 0,
      frame: 0,
      fps: 8,
      decay: 0.95,
      bass: 1,
      mid: 1,
      treb: 1,
      bassAttack: 1,
      midAttack: 1,
      trebleAttack: 1,
      aspectX: 1,
      aspectY: 1,
    });
    if (rendered) drawn += 1;
  }
  assert(drawn > 8, `only ${drawn} presets drew; this measures nothing`);
  assertEquals(counts.mismatched, 0, "a bind group disagreed with its layout");
  gpu.destroy();
});

Deno.test("butterchurn gpu: a device that refuses an allocation yields no renderer", async () => {
  // WebGPU reports a refused allocation through the error scope and returns a
  // texture object anyway. Rendering into those produced an invalid-texture
  // error every pass while readbacks kept completing, so the stall watchdog
  // never fired and the desktop sat black. Better no GPU renderer at all: the
  // field keeps its software path only while `create` admits defeat.
  const healthy = emptyCounts();
  const ok = await ExomuxButterchurnGpu.create(stubDevice(healthy), { width: 220, height: 55, random: () => 0.5 });
  assert(ok, "a device that allocates should yield a renderer");
  ok.destroy();

  const starved = emptyCounts();
  const none = await ExomuxButterchurnGpu.create(stubDevice(starved, 0), {
    width: 220,
    height: 55,
    random: () => 0.5,
  });
  assertEquals(none, undefined);
  // And it gave back what it had managed to take before finding out.
  assert(starved.destroyed > 0, "a refused renderer must still release its textures");
});

Deno.test("butterchurn gpu: cycling the whole rotation does not accumulate pipelines", async () => {
  // Pipelines and their bind groups were cached per preset and never dropped.
  // One entry is two render pipelines plus the shader modules behind them, and
  // the rotation visits 289 presets, so a long session eventually exhausted the
  // driver — the whole GPU, not just this process, leaving nothing able to get
  // a device until exomux was restarted.
  const counts = emptyCounts();
  const gpu = new ExomuxButterchurnGpu(stubDevice(counts), { width: 80, height: 24, random: () => 0.5 });
  const waveform = new Float32Array(256);
  const q = new Float32Array(32);
  const visited = EXOMUX_BUTTERCHURN_CATALOG.slice(0, 60);
  for (const entry of visited) {
    for (let attempt = 0; attempt < 50 && gpu.prepare(entry) === "pending"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    if (gpu.prepare(entry) !== "ready") continue;
    const preset = new ExomuxButterchurnPreset(entry, { random: () => 0.5 });
    preset.setSize(80, 24);
    preset.advance({ bass: 1, mid: 1, treb: 1, bassAttack: 1, midAttack: 1, trebleAttack: 1, waveform }, 0, 0, 8);
    gpu.render(entry.name, {
      mesh: preset.mesh,
      meshWidth: preset.meshWidth,
      meshHeight: preset.meshHeight,
      wave: preset.wave,
      waveCount: preset.waveCount,
      waveColor: [1, 1, 1, 1],
      q,
      time: 0,
      frame: 0,
      fps: 8,
      decay: 0.95,
      bass: 1,
      mid: 1,
      treb: 1,
      bassAttack: 1,
      midAttack: 1,
      trebleAttack: 1,
      aspectX: 1,
      aspectY: 1,
    });
  }
  assert(
    gpu.cachedPresets <= 8,
    `${gpu.cachedPresets} presets still cached after visiting ${visited.length}`,
  );
  // Eviction has to actually have happened, or the bound above proves nothing:
  // the first preset visited should need recompiling to come back.
  const first = visited[0]!;
  assertEquals(
    gpu.prepare(first),
    "pending",
    "the earliest preset should have been evicted, not still resident",
  );
  gpu.destroy();
});

Deno.test("sanitizeShaderBody neutralizes divide-by-literal-zero that naga rejects", () => {
  // The real regression: an author `x/0` const-folds to -inf, which naga refuses,
  // failing the whole module — so the preset renders black on strict drivers.
  assertEquals(
    sanitizeShaderBody("vec3<f32>(((-(1.0) / 0.0)), 0.0, 0.0)"),
    "vec3<f32>(((-(1.0) / 1e-6)), 0.0, 0.0)",
  );
  assertEquals(sanitizeShaderBody("a / 0"), "a / 1e-6");
  assertEquals(sanitizeShaderBody("a /0."), "a / 1e-6");
  assertEquals(sanitizeShaderBody("a / 0.00"), "a / 1e-6");
  // Legitimate small divisors must be left alone.
  assertEquals(sanitizeShaderBody("a / 0.5"), "a / 0.5");
  assertEquals(sanitizeShaderBody("a / 0.03"), "a / 0.03");
  assertEquals(sanitizeShaderBody("a / 0.0001"), "a / 0.0001");
  assertEquals(sanitizeShaderBody("a / 10.0"), "a / 10.0");
  // A shader with no zero divisor is untouched.
  const clean = "ret = textureSampleLevel(t_tex, t_smp, uv, 0.0).xyz * 2.0;";
  assertEquals(sanitizeShaderBody(clean), clean);
});
