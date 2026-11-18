// Copyright 2023 Im-Beast. MIT license.

const namespace = "http://www.w3.org/1998/Math/MathML";
const fontProperties = [
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-stretch",
  "font-feature-settings",
  "font-variation-settings",
  "font-optical-sizing",
  "font-kerning",
  "font-size-adjust",
  "font-variant",
  "line-height",
  "math-style",
  "math-depth",
  "math-shift",
];

/** A bounded, inert measuring tree; it borrows ready host fonts and never clones diagram CSS or callbacks. */
export function mathFractionRules(
  document: Document,
  budget: { nodes: number; comparisons?: number },
  diagnostics: Set<string>,
): { measure(element: Element): { thickness: number; axis: number }; dispose(): void } {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  host.style.cssText = "all:initial!important;position:fixed!important;left:0!important;top:0!important;" +
    "width:0!important;height:0!important;overflow:hidden!important;visibility:hidden!important;" +
    "pointer-events:none!important;contain:strict!important";
  const shadow = host.attachShadow({ mode: "closed" });
  const math = document.createElementNS(namespace, "math");
  const fraction = document.createElementNS(namespace, "mfrac");
  const numerator = document.createElementNS(namespace, "mspace");
  const denominator = document.createElementNS(namespace, "mspace");
  const operator = document.createElementNS(namespace, "mo");
  operator.textContent = "|";
  operator.setAttribute("stretchy", "true");
  operator.setAttribute("symmetric", "true");
  const strut = document.createElementNS(namespace, "mspace");
  const marker = document.createElementNS(namespace, "mspace");
  for (const space of [numerator, denominator, strut, marker]) {
    for (const name of ["width", "height", "depth"]) space.setAttribute(name, "0px");
  }
  fraction.append(numerator, denominator);
  math.append(fraction, operator, strut, marker);
  shadow.append(math);
  budget.nodes += 8;
  if (budget.nodes > 16_384) throw new RangeError("Mermaid MathML exceeds its node budget.");
  document.body.append(host);
  const cache = new Map<string, { thickness: number; axis: number }>();
  const measure = (element: Element) => {
    const css = document.defaultView!.getComputedStyle(element);
    const font = fontProperties.map((property) => css.getPropertyValue(property));
    const attribute = element.getAttribute("linethickness");
    if ((attribute?.length ?? 0) > 4096) throw new RangeError("Mermaid MathML rule exceeds its attribute budget.");
    const key = JSON.stringify([font, attribute]);
    const cached = cache.get(key);
    if (cached) return cached;
    budget.comparisons = (budget.comparisons ?? 0) + 5;
    if (budget.comparisons > 1_000_000) throw new RangeError("Mermaid MathML exceeds its layout-work budget.");
    const size = Number.parseFloat(css.fontSize);
    if (!Number.isFinite(size) || size <= 0 || size > 16_384) throw new RangeError("Invalid MathML rule font size.");
    math.setAttribute("style", "all:initial!important;display:inline math!important;direction:ltr!important");
    for (let index = 0; index < fontProperties.length; index++) {
      (math as MathMLElement).style.setProperty(fontProperties[index]!, font[index]!, "important");
    }
    // Tall, empty children force the positive-rule layout's gap constraints.
    // Its height is linear in thickness, independent of numerator glyphs or
    // the font's shift constants. A second known rule normalizes host zoom.
    for (const space of [numerator, denominator, strut]) {
      for (const name of ["height", "depth"]) space.setAttribute(name, `${size * 4}px`);
    }
    const sample = (value: string | null) => {
      if (value === null) fraction.removeAttribute("linethickness");
      else fraction.setAttribute("linethickness", value);
      const box = fraction.getBoundingClientRect();
      const baseline = marker.getBoundingClientRect().top;
      return { height: box.height, ascent: baseline - box.top };
    };
    const one = sample("1px"), two = sample("2px"), zero = sample("0px"), value = sample(attribute);
    const scale = two.height - one.height;
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Invalid measured MathML rule scale.");
    // A zero-rule stack has different baseline shifts even when its total
    // height coincides with a positive default rule. Let the browser decide
    // whether negatives, zero units, percentages and invalid attributes use it.
    const noRule = Math.abs(value.height - zero.height) < scale / 256 &&
      Math.abs(value.ascent - zero.ascent) < scale / 256;
    const thickness = noRule ? 0 : 1 + (value.height - one.height) / scale;
    if (!noRule && thickness === 0) diagnostics.add("MathML rule thickness is below host layout resolution.");
    // A symmetric vertical operator exposes the actual math axis, including
    // fallback faces. A plus/minus ink midpoint is NOT the same font metric.
    const axisBox = operator.getBoundingClientRect();
    const axis = (marker.getBoundingClientRect().top - (axisBox.top + axisBox.bottom) / 2) / scale;
    if (!Number.isFinite(thickness) || thickness < 0 || !Number.isFinite(axis)) {
      throw new RangeError("Invalid measured MathML rule metrics.");
    }
    const result = { thickness, axis };
    cache.set(key, result);
    return result;
  };
  return { measure, dispose: () => host.remove() };
}
