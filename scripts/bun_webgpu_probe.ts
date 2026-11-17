import { ensureBunWebGpuInitialized } from "../src/runtime/bun_webgpu.ts";
import { runtimeHost } from "../src/runtime/host.ts";

if (runtimeHost.runtime !== "bun") throw new Error("Run this native binding probe with Bun.");

await ensureBunWebGpuInitialized();
const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
if (!adapter) throw new Error("Native GPU adapter unavailable");
const device = await adapter.requestDevice();
const validationErrors: string[] = [];
device.addEventListener("uncapturederror", (event) => {
  validationErrors.push((event as GPUUncapturedErrorEvent).error.message);
});
try {
  const storage = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readback = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  try {
    const pipeline = await device.createComputePipelineAsync({
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          code: `
          @group(0) @binding(0) var<storage, read_write> output: array<u32>;
          @compute @workgroup_size(4) fn main(@builtin(local_invocation_index) i: u32) {
            output[i] = (i + 1u) * 17u;
          }`,
        }),
        entryPoint: "main",
      },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: storage } }],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(1);
    pass.end();
    encoder.copyBufferToBuffer(storage, 0, readback, 0, 16);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const values = Array.from(new Uint32Array(readback.getMappedRange()));
    readback.unmap();
    if (values.join() !== "17,34,51,68") throw new Error(`Compute/readback mismatch: ${values}`);
    await device.queue.onSubmittedWorkDone();
    if (validationErrors.length) throw new Error(validationErrors.join("\n"));
    console.log(JSON.stringify({ adapter: adapter.info, compute: values, native: true }));
  } finally {
    storage.destroy();
    readback.destroy();
  }
} finally {
  const lost = device.lost;
  device.destroy();
  const info = await lost;
  if (info.reason !== "destroyed") throw new Error(`Unexpected device loss: ${info.reason}`);
}

if (!runtimeHost.args.includes("--compute-only")) {
  const { shellGpuDevice, destroyShellGpuDevice } = await import("../src/app/backgrounds/gpu_device.ts");
  const { ShellTurbulenceField } = await import("../src/app/backgrounds/turbulence_background.ts");
  const shared = await shellGpuDevice();
  if (!shared) throw new Error("Shared background GPU device unavailable");
  const errors: string[] = [];
  shared.addEventListener("uncapturederror", (event) => errors.push((event as GPUUncapturedErrorEvent).error.message));
  let dispatches = 0;
  let mappedSimulation = 0;
  const createEncoder = shared.createCommandEncoder.bind(shared);
  const createBuffer = shared.createBuffer.bind(shared);
  shared.createCommandEncoder = (descriptor) => {
    const encoder = createEncoder(descriptor);
    const begin = encoder.beginComputePass.bind(encoder);
    encoder.beginComputePass = (descriptor) => {
      const pass = begin(descriptor);
      const dispatch = pass.dispatchWorkgroups.bind(pass);
      pass.dispatchWorkgroups = (...args) => {
        dispatches++;
        dispatch(...args);
      };
      return pass;
    };
    return encoder;
  };
  shared.createBuffer = (descriptor) => {
    const buffer = createBuffer(descriptor);
    if (descriptor.usage & GPUBufferUsage.MAP_READ) {
      const getRange = buffer.getMappedRange.bind(buffer);
      buffer.getMappedRange = (...args) => {
        const range = getRange(...args);
        const values = new Float32Array(range);
        if (values.some((v) => Number.isFinite(v) && v !== 0)) mappedSimulation++;
        return range;
      };
    }
    return buffer;
  };
  try {
    const turbulence = new ShellTurbulenceField();
    for (let frame = 0; frame < 12; frame++) {
      turbulence.advance({ bounds: { column: 0, row: 0, width: 32, height: 16 }, now: frame * 34 });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await shared.queue.onSubmittedWorkDone();
    if (!dispatches || !mappedSimulation || errors.length) {
      throw new Error(
        `Turbulence GPU verification failed: ${JSON.stringify({ dispatches, mappedSimulation, errors })}`,
      );
    }
    console.log(JSON.stringify({ turbulence: { dispatches, mappedSimulation } }));
  } finally {
    shared.createCommandEncoder = createEncoder;
    shared.createBuffer = createBuffer;
  }
  try {
    const { EXOMUX_BUTTERCHURN_CATALOG } = await import("../packages/exomux/butterchurn_catalog.ts");
    const { ExomuxButterchurnField } = await import("../packages/exomux/butterchurn_background.ts");
    const { createScriptedExomuxAudio } = await import("../packages/exomux/audio_scripted.ts");
    const presetIndex = EXOMUX_BUTTERCHURN_CATALOG.findIndex((preset) =>
      preset.name.toLowerCase().includes("flexi - bouncing balls")
    );
    if (presetIndex < 0) throw new Error("Native butterchurn verification preset missing");
    const field = new ExomuxButterchurnField({
      gpu: true,
      errorWithoutGpu: true,
      autoCycle: false,
      presetIndex,
      audio: createScriptedExomuxAudio(),
    });
    try {
      for (let frame = 0; frame < 40; frame++) {
        field.advance({ bounds: { column: 0, row: 0, width: 32, height: 16 }, now: frame * 34 });
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
      const gpu = field.debugGpu();
      const stats = await gpu?.debugMainStats();
      if (!gpu || gpu.readbacks < 2 || !gpu.latest?.some((v, i) => i % 4 !== 3 && v !== 0) || errors.length) {
        throw new Error(
          `Butterchurn GPU verification failed: ${JSON.stringify({ readbacks: gpu?.readbacks, stats, errors })}`,
        );
      }
      console.log(
        JSON.stringify({
          butterchurn: { preset: EXOMUX_BUTTERCHURN_CATALOG[presetIndex]!.name, readbacks: gpu.readbacks, stats },
        }),
      );
    } finally {
      field.dispose();
    }
  } finally {
    destroyShellGpuDevice();
  }
}

if (!runtimeHost.args.includes("--compute-only")) {
  const { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } = await import("three");
  const { ThreeAsciiRenderer } = await import("../src/three_ascii/renderer.ts");
  const { getCompatibleWebGPUDevice, resetCompatibleWebGPUDeviceCache } = await import(
    "../src/three_ascii/webgpu_compat.ts"
  );
  const scene = new Scene();
  const geometry = new BoxGeometry();
  const material = new MeshBasicMaterial({ color: 0xff8844 });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  const camera = new PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.z = 3;
  try {
    for (const strategy of ["blocking", "deferred"] as const) {
      const renderer = new ThreeAsciiRenderer({ scene, camera, columns: 16, rows: 8, readbackStrategy: strategy });
      try {
        let visible = false;
        for (let frame = 0; frame < 8; frame++) {
          mesh.rotation.y += 0.15;
          const grid = await renderer.renderToAnsiGrid(1 / 60);
          if (
            grid.length && grid.flat().some((cell) =>
              [...cell.matchAll(/38;2;(\d+);(\d+);(\d+)/g)]
                .some((match) => Number(match[1]) + Number(match[2]) + Number(match[3]) > 0)
            )
          ) visible = true;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        if (!visible) throw new Error(`${strategy} produced no colored ASCII cells`);
        for (const style of ["glyphs", "mixed"] as const) {
          renderer.setTerminalGlyphStyle(style);
          for (let frame = 0; frame < 4; frame++) {
            const grid = await renderer.renderToAnsiGrid(1 / 60);
            if (grid.length !== 8 || grid.some((row) => row.length !== 16)) {
              throw new Error(`${strategy}/${style} produced an invalid grid`);
            }
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        }
        const firstImage = await renderer.renderToImageFrame(1 / 60);
        if (!firstImage.data.some((v, i) => i % 4 !== 3 && v !== 0)) {
          throw new Error(`${strategy} produced no image color after the ANSI-to-image switch`);
        }
        renderer.setSize(12, 6);
        const image = await renderer.renderToImageFrame(1 / 60);
        if (
          image.data.length !== image.pixelWidth * image.pixelHeight * 4 ||
          !image.data.some((v, i) => i % 4 !== 3 && v !== 0)
        ) {
          throw new Error(`${strategy} produced invalid/empty resized image`);
        }
        console.log(
          JSON.stringify({
            three: strategy,
            resizedImage: [image.pixelWidth, image.pixelHeight],
            performance: renderer.inspectPerformance(),
          }),
        );
      } finally {
        renderer.destroy();
      }
    }
  } finally {
    geometry.dispose();
    material.dispose();
    const previous = await getCompatibleWebGPUDevice();
    const lost = previous.lost;
    previous.destroy();
    await lost;
    await Promise.resolve();
    const recovered = await getCompatibleWebGPUDevice();
    if (previous === recovered) throw new Error("Compatible GPU cache retained a destroyed device");
    recovered.destroy();
    resetCompatibleWebGPUDeviceCache();
    console.log(JSON.stringify({ compatibleDeviceLossRecovery: true }));
  }
}
