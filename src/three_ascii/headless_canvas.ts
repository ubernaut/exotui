export class HeadlessGPUCanvasContext {
  private configuration?: GPUCanvasConfiguration;
  private texture: GPUTexture | null = null;
  private readbackBuffer: GPUBuffer | null = null;

  constructor(private readonly canvas: HeadlessCanvas) {}

  configure(configuration: GPUCanvasConfiguration): void {
    this.configuration = configuration;
    this.invalidateTexture();
  }

  getCurrentTexture(): GPUTexture {
    if (!this.configuration) {
      throw new Error("HeadlessGPUCanvasContext is not configured.");
    }

    if (!this.texture) {
      this.texture = this.configuration.device.createTexture({
        size: {
          width: Math.max(1, this.canvas.width),
          height: Math.max(1, this.canvas.height),
          depthOrArrayLayers: 1,
        },
        format: this.configuration.format,
        usage: this.configuration.usage ?? (GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC),
      });
    }

    return this.texture;
  }

  resize(): void {
    this.invalidateTexture();
  }

  async readRGBA(): Promise<Uint8Array> {
    const texture = this.getCurrentTexture();
    const { device } = this.configuration!;
    const bytesPerRow = this.canvas.width * 4;
    const alignedBytesPerRow = Math.ceil(bytesPerRow / 256) * 256;
    const bufferSize = alignedBytesPerRow * this.canvas.height;

    if (!this.readbackBuffer || this.readbackBuffer.size !== bufferSize) {
      this.readbackBuffer?.destroy();
      this.readbackBuffer = device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
    }

    const encoder = device.createCommandEncoder({ label: "deno_tui.three_ascii.readback" });
    encoder.copyTextureToBuffer(
      { texture },
      {
        buffer: this.readbackBuffer,
        bytesPerRow: alignedBytesPerRow,
        rowsPerImage: this.canvas.height,
      },
      {
        width: this.canvas.width,
        height: this.canvas.height,
        depthOrArrayLayers: 1,
      },
    );
    device.queue.submit([encoder.finish()]);

    await this.readbackBuffer.mapAsync(GPUMapMode.READ);
    try {
      const source = new Uint8Array(this.readbackBuffer.getMappedRange());
      return compactMappedRgbaRows(source, this.canvas.width, this.canvas.height, alignedBytesPerRow);
    } finally {
      this.readbackBuffer.unmap();
    }
  }

  destroy(): void {
    this.readbackBuffer?.destroy();
    this.readbackBuffer = null;
    this.invalidateTexture();
  }

  private invalidateTexture(): void {
    this.texture?.destroy();
    this.texture = null;
  }
}

export class HeadlessCanvas {
  style = { width: "", height: "" };
  private _width: number;
  private _height: number;
  readonly context: HeadlessGPUCanvasContext;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    this.context = new HeadlessGPUCanvasContext(this);
  }

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    this._width = Math.max(1, Math.floor(value));
    this.context.resize();
  }

  get height(): number {
    return this._height;
  }

  set height(value: number) {
    this._height = Math.max(1, Math.floor(value));
    this.context.resize();
  }

  getContext(type: string): GPUCanvasContext | null {
    return type === "webgpu" ? this.context as unknown as GPUCanvasContext : null;
  }

  setAttribute(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return false;
  }
}

/** Copies mapped WebGPU RGBA rows into a tightly packed image buffer. */
export function compactMappedRgbaRows(
  source: Uint8Array,
  width: number,
  height: number,
  alignedBytesPerRow: number,
  target = new Uint8Array(Math.max(0, Math.floor(width)) * Math.max(0, Math.floor(height)) * 4),
): Uint8Array {
  const normalizedWidth = Math.max(0, Math.floor(width));
  const normalizedHeight = Math.max(0, Math.floor(height));
  const bytesPerRow = normalizedWidth * 4;
  const byteLength = bytesPerRow * normalizedHeight;

  if (byteLength === 0) return target;
  if (alignedBytesPerRow === bytesPerRow) {
    target.set(source.subarray(0, byteLength));
    return target;
  }

  for (let row = 0; row < normalizedHeight; row += 1) {
    const srcOffset = row * alignedBytesPerRow;
    const dstOffset = row * bytesPerRow;
    target.set(source.subarray(srcOffset, srcOffset + bytesPerRow), dstOffset);
  }

  return target;
}
