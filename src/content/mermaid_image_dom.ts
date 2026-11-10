// Copyright 2023 Im-Beast. MIT license.
import { encodeImageBytes, imageDimensions, imageLimits, type MermaidImageOptions } from "./mermaid_image.ts";
import type { MermaidSceneImageAsset } from "./mermaid_scene.ts";

/** Capture pixels while the measured SVG still owns a DOM; never implicitly fetch external URLs. */
export async function captureMermaidImages(
  svg: SVGSVGElement,
  options: MermaidImageOptions,
  signal?: AbortSignal,
): Promise<{ images: MermaidSceneImageAsset[]; diagnostics: string[] }> {
  const view = svg.ownerDocument.defaultView!;
  const limits = imageLimits(options.limits);
  const urls = new Set<string>();
  const elements = new Map<string, (SVGImageElement | HTMLImageElement)[]>();
  const imageElements = svg.querySelectorAll("image,img");
  if (imageElements.length > 16_384) throw new RangeError("Mermaid scene exceeds its image instance budget.");
  for (const element of imageElements) {
    const raw = element instanceof view.SVGImageElement
      ? element.href.baseVal
      : (element as HTMLImageElement).currentSrc || element.getAttribute("src");
    if (!raw) continue;
    const url = new URL(raw, svg.ownerDocument.baseURI).href;
    urls.add(url);
    const instances = elements.get(url) ?? [];
    instances.push(element as SVGImageElement | HTMLImageElement);
    elements.set(url, instances);
    if (urls.size > limits.maxImages) throw new RangeError("Mermaid scene exceeds its image count budget.");
  }
  const images: MermaidSceneImageAsset[] = [];
  const diagnostics: string[] = [];
  let bytes = 0;
  let sourcePixels = 0;
  let rasterPixels = 0;
  for (const href of urls) {
    signal?.throwIfAborted();
    if (!href.startsWith("data:") && !options.load) {
      diagnostics.push("External image pixels need an explicit host image loader.");
      continue;
    }
    const controller = new AbortController();
    const active = AbortSignal.any([controller.signal, ...signal ? [signal] : []]);
    const timer = setTimeout(
      () => controller.abort(new DOMException("Mermaid image capture timed out.", "TimeoutError")),
      limits.timeoutMs,
    );
    let image: HTMLImageElement | undefined;
    let objectURL: string | undefined;
    let canvas: HTMLCanvasElement | undefined;
    try {
      const resource = href.startsWith("data:")
        ? dataImage(href, limits.maxBytes)
        : await abortable(options.load!(new URL(href), { signal: active }), active);
      active.throwIfAborted();
      if (resource.body.length > limits.maxBytes || bytes + resource.body.length > limits.maxTotalBytes) {
        throw new RangeError("Mermaid image exceeds its encoded-byte budget.");
      }
      bytes += resource.body.length;
      const header = imageDimensions(resource.body);
      const checkPixels = (width: number, height: number) => {
        const count = width * height;
        if (
          !Number.isSafeInteger(count) || count < 1 || count > limits.maxSourcePixels ||
          count + sourcePixels > limits.maxTotalSourcePixels
        ) throw new RangeError("Mermaid image exceeds its source-pixel budget.");
        return count;
      };
      if (header) checkPixels(header.width, header.height);
      image = new view.Image();
      objectURL = view.URL.createObjectURL(new Blob([new Uint8Array(resource.body)], { type: resource.contentType }));
      image.src = objectURL;
      await abortable(image.decode(), active);
      sourcePixels += checkPixels(image.naturalWidth, image.naturalHeight);
      canvas = svg.ownerDocument.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Image capture requires a 2D canvas host.");
      const sizes = (sourceWidth: number, sourceHeight: number) => {
        const capacity = Math.min(limits.maxRasterPixels, limits.maxTotalRasterPixels - rasterPixels);
        if (capacity < 1) throw new RangeError("Mermaid scene exceeds its captured-raster budget.");
        const scale = Math.min(1, Math.sqrt(capacity / (sourceWidth * sourceHeight)));
        const width = Math.max(1, Math.floor(sourceWidth * scale));
        const height = Math.max(1, Math.floor(sourceHeight * scale));
        if (width * height > capacity) throw new RangeError("Mermaid scene exceeds its captured-raster budget.");
        return { width, height };
      };
      const save = (
        decoded: HTMLImageElement,
        sourceWidth: number,
        sourceHeight: number,
        viewport?: MermaidSceneImageAsset["viewport"],
        density = 1,
      ) => {
        if (images.length >= limits.maxImages) {
          throw new RangeError("Mermaid scene exceeds its captured image count budget.");
        }
        const { width, height } = sizes(sourceWidth * density, sourceHeight * density);
        canvas!.width = width;
        canvas!.height = height;
        context.drawImage(decoded, 0, 0, width, height);
        const rgba = encodeImageBytes(new Uint8Array(context.getImageData(0, 0, width, height).data));
        active.throwIfAborted();
        images.push({ href, width, height, sourceWidth, sourceHeight, rgba, viewport });
        rasterPixels += width * height;
      };
      const embeddedSVG = resource.contentType?.split(";")[0]?.trim() === "image/svg+xml";
      const instances = elements.get(href)!;
      if (!embeddedSVG || instances.some((element) => element instanceof view.HTMLImageElement)) {
        save(image, image.naturalWidth, image.naturalHeight);
      }
      if (embeddedSVG) {
        const variants = new Set<string>();
        const embedded = `data:image/svg+xml;base64,${encodeImageBytes(resource.body)}`;
        for (const element of instances) {
          if (!(element instanceof view.SVGImageElement)) continue;
          const box = element.getBBox();
          if (!(box.width > 0 && box.height > 0)) continue;
          const preserveAspectRatio = element.getAttribute("preserveAspectRatio") ?? "xMidYMid meet";
          const sampling = view.getComputedStyle(element).imageRendering;
          const viewport = { width: box.width, height: box.height, preserveAspectRatio, sampling };
          const key = JSON.stringify(viewport);
          if (variants.has(key)) continue;
          variants.add(key);
          if (images.length >= limits.maxImages) {
            throw new RangeError("Mermaid scene exceeds its captured image count budget.");
          }
          // A bounded supersampled viewport preserves SVG edge coverage under
          // subsequent rotation/skew; a one-pixel snapshot blurs those edges.
          const size = sizes(box.width * 4, box.height * 4);
          const wrapper = svg.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
          wrapper.setAttribute("width", String(size.width));
          wrapper.setAttribute("height", String(size.height));
          wrapper.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
          wrapper.setAttribute("preserveAspectRatio", "none");
          const placed = svg.ownerDocument.createElementNS(wrapper.namespaceURI, "image");
          placed.setAttribute("href", embedded);
          placed.setAttribute("width", String(box.width));
          placed.setAttribute("height", String(box.height));
          placed.setAttribute("preserveAspectRatio", preserveAspectRatio);
          placed.setAttribute("style", `image-rendering:${sampling}`);
          wrapper.append(placed);
          let placedURL: string | undefined;
          const placedImage = new view.Image();
          try {
            placedURL = view.URL.createObjectURL(
              new Blob([new view.XMLSerializer().serializeToString(wrapper)], { type: "image/svg+xml" }),
            );
            placedImage.src = placedURL;
            await abortable(placedImage.decode(), active);
            save(placedImage, box.width, box.height, viewport, 4);
          } finally {
            placedImage.src = "";
            if (placedURL) view.URL.revokeObjectURL(placedURL);
          }
          if (view.getComputedStyle(element).overflow === "visible") {
            diagnostics.push("SVG image visible overflow needs extended viewport raster capture.");
          }
        }
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof RangeError || active.aborted) throw error;
      diagnostics.push(`An image could not be captured: ${(error as Error).message.slice(0, 180)}`);
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (image) image.src = "";
      if (objectURL) view.URL.revokeObjectURL(objectURL);
      if (canvas) canvas.width = canvas.height = 0;
    }
  }
  return { images, diagnostics };
}

function dataImage(href: string, maximum: number): { body: Uint8Array; contentType: string } {
  const comma = href.indexOf(",");
  const metadata = href.slice(5, comma);
  if (comma < 0 || !/^image\//i.test(metadata) || href.length > maximum * 4 + 1024) {
    throw new RangeError("Invalid or excessive embedded Mermaid image.");
  }
  const payload = href.slice(comma + 1);
  let decoded: string;
  if (/;base64$/i.test(metadata)) {
    if (payload.length > Math.ceil(maximum / 3) * 4) throw new RangeError("Embedded image exceeds its byte budget.");
    decoded = atob(payload);
  } else {
    // Data URI escaping represents arbitrary bytes, not necessarily UTF-8.
    // decodeURIComponent would reject valid percent-encoded PNG/JPEG bodies.
    const body = new Uint8Array(Math.min(maximum + 1, payload.length * 3));
    let length = 0;
    const append = (byte: number) => {
      if (length >= maximum) throw new RangeError("Embedded image exceeds its byte budget.");
      body[length++] = byte;
    };
    for (let at = 0; at < payload.length; at++) {
      if (payload[at] === "%") {
        const escape = payload.slice(at + 1, at + 3);
        if (!/^[0-9a-f]{2}$/i.test(escape)) throw new URIError("Invalid image data URI escape.");
        append(Number.parseInt(escape, 16));
        at += 2;
      } else {
        const point = payload.codePointAt(at)!;
        if (point < 128) append(point);
        else {
          for (const byte of new TextEncoder().encode(String.fromCodePoint(point))) append(byte);
          if (point > 0xffff) at++;
        }
      }
    }
    return { body: body.subarray(0, length), contentType: metadata.split(";")[0]! };
  }
  if (decoded.length > maximum) throw new RangeError("Embedded image exceeds its byte budget.");
  return {
    body: Uint8Array.from(decoded, (char) => char.charCodeAt(0)),
    contentType: metadata.split(";")[0]!,
  };
}

async function abortable<T>(action: Promise<T>, signal: AbortSignal): Promise<T> {
  let interrupted!: () => void;
  try {
    return await Promise.race([
      action,
      new Promise<never>((_, reject) => {
        interrupted = () => reject(signal.reason);
        if (signal.aborted) interrupted();
        else signal.addEventListener("abort", interrupted, { once: true });
      }),
    ]);
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  } finally {
    signal.removeEventListener("abort", interrupted);
  }
}
