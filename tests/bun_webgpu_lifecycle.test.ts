import { assertEquals, assertRejects } from "./deps.ts";
import { HeadlessCanvas } from "../src/three_ascii/headless_canvas.ts";

Deno.test("headless GPU image readback releases its mapping when decoding fails", async () => {
  const installed: string[] = [];
  for (
    const [name, value] of Object.entries({
      GPUBufferUsage: { COPY_DST: 8, MAP_READ: 1 },
      GPUMapMode: { READ: 1 },
    })
  ) {
    if (name in globalThis) continue;
    Object.defineProperty(globalThis, name, { configurable: true, value });
    installed.push(name);
  }
  let unmapped = 0;
  let buffersDestroyed = 0;
  let texturesDestroyed = 0;
  const buffer = {
    size: 256,
    mapAsync: () => Promise.resolve(),
    getMappedRange: () => {
      throw new Error("mapped range unavailable");
    },
    unmap: () => {
      unmapped++;
    },
    destroy: () => {
      buffersDestroyed++;
    },
  };
  const canvas = new HeadlessCanvas(1, 1);
  canvas.context.configure({
    format: "rgba8unorm",
    usage: 16,
    device: {
      createTexture: () => ({
        destroy: () => {
          texturesDestroyed++;
        },
      }),
      createBuffer: () => buffer,
      createCommandEncoder: () => ({ copyTextureToBuffer() {}, finish() {} }),
      queue: { submit() {} },
    } as unknown as GPUDevice,
  });
  try {
    await assertRejects(() => canvas.context.readRGBA(), Error, "mapped range unavailable");
    assertEquals(unmapped, 1);
    canvas.context.destroy();
    canvas.context.destroy();
    assertEquals(buffersDestroyed, 1);
    assertEquals(texturesDestroyed, 1);
  } finally {
    for (const name of installed) Reflect.deleteProperty(globalThis, name);
  }
});
