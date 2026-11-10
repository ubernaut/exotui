// Copyright 2023 Im-Beast. MIT license.
import type {
  MermaidSceneClip,
  MermaidSceneImage,
  MermaidSceneImageAsset,
  MermaidScenePoint,
} from "./mermaid_scene.ts";

/** Image placement comes from the mounted DOM, never a second Mermaid layout implementation. */
export function extractSceneImage(
  svg: SVGSVGElement,
  element: SVGImageElement | HTMLImageElement,
  images: readonly MermaidSceneImageAsset[] | undefined,
  convert: (point: MermaidScenePoint, matrix: DOMMatrix) => MermaidScenePoint,
  inherited: MermaidSceneClip | undefined,
  link: string | undefined,
  diagnostics: Set<string>,
): MermaidSceneImage | undefined {
  const view = svg.ownerDocument.defaultView!;
  const css = view.getComputedStyle(element);
  const raw = element instanceof view.SVGImageElement ? element.href.baseVal : element.currentSrc || element.src;
  if (!raw) return;
  const href = new URL(raw, svg.ownerDocument.baseURI).href;
  let viewport: { x: number; y: number; width: number; height: number };
  let matrix: DOMMatrix;
  let alignX = 0.5;
  let alignY = 0.5;
  let fit = "fill";
  let clipViewport = true;
  if (element instanceof view.SVGImageElement) {
    const measured = element.getScreenCTM();
    if (!measured) return;
    matrix = view.DOMMatrix.fromMatrix(measured);
    viewport = element.getBBox();
    const preserve = element.preserveAspectRatio.baseVal;
    if (preserve.align !== 1) {
      fit = preserve.meetOrSlice === 2 ? "cover" : "contain";
      alignX = ((preserve.align - 2) % 3) / 2;
      alignY = Math.floor((preserve.align - 2) / 3) / 2;
    }
    clipViewport = css.overflow !== "visible";
  } else {
    // HTML replaced elements use their content box and resolved object-fit/position.
    // Axis-aligned foreignObject labels are the upstream common path. Do not
    // silently call an axis-aligned bounding box faithful to a rotated HTML box.
    for (let owner: Element | null = element; owner && owner !== svg; owner = owner.parentElement) {
      const style = view.getComputedStyle(owner);
      if (style.transform !== "none") {
        const transform = new view.DOMMatrix(style.transform);
        if (Math.abs(transform.b) > 0.0001 || Math.abs(transform.c) > 0.0001) {
          diagnostics.add("Rotated HTML image boxes need affine content-box measurement.");
        }
      }
    }
    const box = element.getBoundingClientRect();
    const left = Number.parseFloat(css.borderLeftWidth) + Number.parseFloat(css.paddingLeft);
    const right = Number.parseFloat(css.borderRightWidth) + Number.parseFloat(css.paddingRight);
    const top = Number.parseFloat(css.borderTopWidth) + Number.parseFloat(css.paddingTop);
    const bottom = Number.parseFloat(css.borderBottomWidth) + Number.parseFloat(css.paddingBottom);
    viewport = { x: box.x + left, y: box.y + top, width: box.width - left - right, height: box.height - top - bottom };
    matrix = new view.DOMMatrix();
    fit = css.objectFit;
    const position = css.objectPosition.split(/\s+/);
    if (position.length !== 2 || !position.every((value) => /^-?[\d.]+%$/.test(value))) {
      diagnostics.add("HTML image object-position needs resolved length/calc placement.");
    } else {
      alignX = Number.parseFloat(position[0]!) / 100;
      alignY = Number.parseFloat(position[1]!) / 100;
    }
  }
  if (!(viewport.width > 0 && viewport.height > 0)) return;
  let image = element instanceof view.SVGImageElement
    ? images?.findIndex((asset) =>
      asset.href === href && asset.viewport && asset.viewport.width === viewport.width &&
      asset.viewport.height === viewport.height &&
      asset.viewport.preserveAspectRatio === (element.getAttribute("preserveAspectRatio") ?? "xMidYMid meet") &&
      asset.viewport.sampling === css.imageRendering
    ) ?? -1
    : -1;
  if (image < 0) image = images?.findIndex((asset) => asset.href === href && !asset.viewport) ?? -1;
  const asset = images?.[image];
  if (asset?.viewport) fit = "fill"; // SVG's internal layout/letterboxing is already captured.
  let { x, y, width, height } = viewport;
  if (asset && fit !== "fill") {
    const contain = Math.min(width / asset.sourceWidth, height / asset.sourceHeight);
    const scale = fit === "none"
      ? 1
      : fit === "cover"
      ? Math.max(width / asset.sourceWidth, height / asset.sourceHeight)
      : fit === "scale-down"
      ? Math.min(1, contain)
      : contain;
    width = asset.sourceWidth * scale;
    height = asset.sourceHeight * scale;
    x += (viewport.width - width) * alignX;
    y += (viewport.height - height) * alignY;
  }
  const origin = convert({ x, y }, matrix);
  const alongX = convert({ x: x + width, y }, matrix);
  const alongY = convert({ x, y: y + height }, matrix);
  const far = convert({ x: x + width, y: y + height }, matrix);
  const imageMatrix = new view.DOMMatrix([
    alongX.x - origin.x,
    alongX.y - origin.y,
    alongY.x - origin.x,
    alongY.y - origin.y,
    origin.x,
    origin.y,
  ]).inverse();
  if (
    ![imageMatrix.a, imageMatrix.b, imageMatrix.c, imageMatrix.d, imageMatrix.e, imageMatrix.f].every(Number.isFinite)
  ) {
    return;
  }
  const silhouette: MermaidSceneClip = {
    kind: "path",
    rule: "nonzero",
    contours: [[
      convert({ x: viewport.x, y: viewport.y }, matrix),
      convert({ x: viewport.x + viewport.width, y: viewport.y }, matrix),
      convert({ x: viewport.x + viewport.width, y: viewport.y + viewport.height }, matrix),
      convert({ x: viewport.x, y: viewport.y + viewport.height }, matrix),
    ]],
  };
  const points = [origin, alongX, alongY, far];
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  return {
    kind: "image",
    href,
    x: minX,
    y: minY,
    width: Math.max(...points.map((point) => point.x)) - minX,
    height: Math.max(...points.map((point) => point.y)) - minY,
    image: image < 0 ? undefined : image,
    inverse: [imageMatrix.a, imageMatrix.b, imageMatrix.c, imageMatrix.d, imageMatrix.e, imageMatrix.f],
    sampling: css.imageRendering === "pixelated" || css.imageRendering === "crisp-edges" ? "pixelated" : "smooth",
    link,
    clip: clipViewport
      ? inherited ? { kind: "intersection", children: [inherited, silhouette] } : silhouette
      : inherited,
  };
}
