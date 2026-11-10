// Copyright 2026 ExotUI contributors. MIT license.
type SVGReference = { kind: "local"; target: Element | null } | { kind: "empty" | "external" | "invalid" };

/** Resolve CSS URL contents in the original browser tree; callers enforce element type and owned-root containment. */
export function resolveSVGReference(root: SVGSVGElement, body: string): SVGReference {
  const reference = cssURL(body);
  if (!reference) return { kind: "empty" };
  try {
    const url = new URL(reference, root.ownerDocument.baseURI);
    // A fragment-only URL keeps its local flag even with an unrelated page base.
    if (!reference.startsWith("#") && url.href.split("#")[0] !== root.ownerDocument.URL.split("#")[0]) {
      return { kind: "external" };
    }
    const scope = root.getRootNode() as Document | ShadowRoot;
    return { kind: "local", target: scope.getElementById(decodeFragment(url.hash.slice(1))) };
  } catch {
    return { kind: "invalid" };
  }
}

function cssURL(value: string): string {
  const trimmed = value.trim();
  const body = (trimmed[0] === '"' || trimmed[0] === "'") && trimmed.at(-1) === trimmed[0]
    ? trimmed.slice(1, -1)
    : trimmed;
  return body.replace(/\\([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?|\\([^\n\r\f])/gi, (_, hex: string, char: string) => {
    if (!hex) return char;
    const code = parseInt(hex, 16);
    return String.fromCodePoint(code === 0 || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff ? 0xfffd : code);
  });
}

function decodeFragment(fragment: string): string {
  // Preserve malformed literal '%' while decoding valid UTF-8 runs and BOM IDs.
  const bytes: number[] = [];
  for (let index = 0; index < fragment.length; index++) {
    if (fragment[index] === "%" && /^[0-9a-f]{2}$/i.test(fragment.slice(index + 1, index + 3))) {
      bytes.push(parseInt(fragment.slice(index + 1, index + 3), 16));
      index += 2;
    } else bytes.push(fragment.charCodeAt(index));
  }
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(bytes));
}
