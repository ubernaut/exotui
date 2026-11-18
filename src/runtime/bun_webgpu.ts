let initialization: Promise<void> | undefined;

/** Installs bun-webgpu lazily on Bun while leaving existing native/browser GPU implementations untouched. */
export async function ensureBunWebGpuInitialized(): Promise<void> {
  if (!("Bun" in globalThis) || (typeof navigator !== "undefined" && navigator.gpu !== undefined)) return;
  const pending = initialization ??= (async () => {
    // Keep the optional Bun FFI dependency out of Deno and browser dependency graphs.
    const moduleName = "bun-webgpu";
    const { setupGlobals } = await import(moduleName);
    await setupGlobals();
  })();
  try {
    await pending;
  } catch (error) {
    if (initialization === pending) initialization = undefined;
    throw new Error(
      "Bun WebGPU initialization failed; install the optional bun-webgpu dependency and its native binary.",
      {
        cause: error,
      },
    );
  }
}
