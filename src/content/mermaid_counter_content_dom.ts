// Copyright 2023 Im-Beast. MIT license.
import { projectCounterContentDeclarations } from "./mermaid_counter_content_css.ts";
import { generatedCounterName, type GeneratedCounterStyle, generatedCounterStyle } from "./mermaid_counter_styles.ts";
import { generatedCounterRequests } from "./mermaid_quotes.ts";
import { generatedContentText } from "./mermaid_generated_content.ts";

type Scope = Document | ShadowRoot;
type Request = ReturnType<typeof generatedCounterRequests>[number];
type Rule = CSSRule & {
  cssRules?: CSSRuleList;
  style?: CSSStyleDeclaration;
  selectorText?: string;
  conditionText?: string;
  name?: string;
  nameList?: readonly string[];
};
let sequence = 0;

/** Original counter function lists and tree-scoped inert counter-style descriptors. */
export interface GeneratedCounterContentMetadata {
  /** Original functions, only when their canonical CSSOM forms match the actual computed functions. */
  requests(owner: Element, side: "before" | "after", computed: string): readonly Request[] | undefined;
  /** Inert tree-scoped style descriptors, including explicit unsupported definitions. */
  styles(owner: Element): ReadonlyMap<string, GeneratedCounterStyle>;
}

/**
 * Let the original browser resolve content's cascade without its lossy content
 * serialization. Only private metadata declarations are adopted, never fonts,
 * images, imports, keyframes or source properties. Registration is stylesheet
 * owned, not permanent CSS.registerProperty(). No DOM nodes/attributes change.
 */
export function withGeneratedCounterContentMetadata<T>(
  svg: SVGSVGElement,
  owners: ReadonlySet<Element>,
  read: (metadata: GeneratedCounterContentMetadata) => T,
): T {
  if (owners.size > 1024) throw new RangeError("Mermaid counter metadata owners exceed their budget.");
  const document = svg.ownerDocument, view = document.defaultView!;
  const Sheet = (view as unknown as { CSSStyleSheet: typeof CSSStyleSheet }).CSSStyleSheet;
  const scopes: Scope[] = [document];
  for (let root = svg.getRootNode(); root.nodeType === 11 && "host" in root;) {
    if (scopes.length > 128) throw new RangeError("Mermaid counter stylesheet ancestry exceeds its budget.");
    scopes.splice(1, 0, root as ShadowRoot);
    root = (root as ShadowRoot).host.getRootNode();
  }
  const inputs = new Map<Scope, { sheet: CSSStyleSheet; source: string }[]>();
  let units = 0, sheets = 0;
  for (const scope of scopes) {
    const records: { sheet: CSSStyleSheet; source: string }[] = [];
    for (const sheet of [...scope.styleSheets, ...scope.adoptedStyleSheets]) {
      if (++sheets > 128) throw new RangeError("Mermaid counter stylesheet count exceeds its budget.");
      if (sheet.disabled) continue;
      const node = sheet.ownerNode;
      // CSSOM alone cannot distinguish counter(x) from counters(x, "").
      // Do not guess for source-less adopted/external stylesheets.
      if (!node || node.nodeType !== 1 || (node as Element).localName !== "style") {
        throw new TypeError("Mermaid counter metadata needs original stylesheet source.");
      }
      const source = node.textContent ?? "";
      if (source.length > 1_048_576) throw new RangeError("Mermaid counter stylesheet source exceeds its budget.");
      if ((units += source.length) > 4_194_304) {
        throw new RangeError("Mermaid counter stylesheet source exceeds its aggregate budget.");
      }
      records.push({ sheet, source });
    }
    inputs.set(scope, records);
  }
  let property: string, layerPrefix: string, collisions = 0;
  do {
    if (++collisions > 64) throw new RangeError("Mermaid counter metadata names exceed their collision budget.");
    property = `--exotui-counter-content-${++sequence}`;
    layerPrefix = `exotui-counter-layer-${sequence}-`;
  } while (
    [...inputs.values()].flat().some(({ source }) => {
      const decoded = source.replace(
        /\\(?:[\da-fA-F]{1,6}(?:\r\n|[\t\n\r\f ])?|[^\n\r\f])/g,
        (escape) => generatedContentText(`"${escape}"`) ?? escape,
      );
      return decoded.includes(property) || decoded.includes(layerPrefix);
    }) ||
    [...owners].some((owner) =>
      [undefined, "::before", "::after"].some((side) => view.getComputedStyle(owner, side).getPropertyValue(property))
    )
  );
  const parser = document.createElementNS("http://www.w3.org/1999/xhtml", "span").style;
  const accepts = (value: string) => {
    parser.cssText = `content:${value}`;
    return parser.getPropertyValue("content") !== "";
  };
  const descriptorNames = {
    system: "system",
    symbols: "symbols",
    "additive-symbols": "additiveSymbols",
    negative: "negative",
    pad: "pad",
    range: "range",
    fallback: "fallback",
  };
  const styles = new Map<Scope, Map<string, GeneratedCounterStyle>>();
  const owned = new Map<Scope, CSSStyleSheet>();
  let rules = 0, outputUnits = 0, layerCount = 0;
  const layerParts = (name: string): string[] => {
    // Dots inside escaped identifiers are not layer separators.
    const pieces = name.match(/(?:\\(?:[\da-fA-F]{1,6}(?:\r\n|[\t\n\r\f ])?|[^\n\r\f])|[^.])+/g) ?? [];
    return pieces.map((piece) => generatedContentText(`"${piece}"`) ?? piece);
  };
  const header = (text: string): string => {
    let quote = "", depth = 0;
    for (let at = 0; at < text.length; at++) {
      const char = text[at]!;
      if (char === "\\") at++;
      else if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") quote = char;
      else if (char === "(" || char === "[") depth++;
      else if (char === ")" || char === "]") depth--;
      else if (char === "{" && !depth) return text.slice(0, at);
    }
    throw new TypeError("Mermaid counter metadata has an unknown rule block.");
  };
  for (const [scope, records] of inputs) {
    const layerNames = new Map<string, Map<string, { name: string; order: number }>>();
    const styleRanks = new Map<string, number[]>(), styleMap = new Map<string, GeneratedCounterStyle>();
    styles.set(scope, styleMap);
    let anonymous = 0;
    const layer = (parts: readonly string[], parent: readonly string[]) => {
      const path = [...parent], names: string[] = [], rank: number[] = [];
      for (const part of parts) {
        const key = JSON.stringify(path);
        const siblings = layerNames.get(key) ?? new Map();
        layerNames.set(key, siblings);
        let entry = siblings.get(part);
        if (!entry) {
          if (++layerCount > 4096) throw new RangeError("Mermaid counter cascade layers exceed their budget.");
          siblings.set(part, entry = { name: layerPrefix + layerCount, order: siblings.size });
        }
        names.push(entry.name);
        rank.push(entry.order);
        path.push(part);
      }
      return { path, names, rank };
    };
    const project = (
      list: CSSRuleList,
      path: readonly string[] = [],
      rank: readonly number[] = [],
      depth = 0,
    ): string => {
      if (depth > 128) throw new RangeError("Mermaid counter rule nesting exceeds its budget.");
      let result = "";
      for (const native of list) {
        if (++rules > 16_384) throw new RangeError("Mermaid counter stylesheet rules exceed their budget.");
        const rule = native as Rule, kind = rule.constructor.name;
        if (kind === "CSSLayerStatementRule") {
          const names = (rule.nameList ?? []).map((name) => layer(layerParts(name), path).names.join("."));
          if (names.length) result += `@layer ${names.join(",")};`;
        } else if (kind === "CSSLayerBlockRule") {
          const next = layer(rule.name ? layerParts(rule.name) : [`#anonymous-${++anonymous}`], path);
          result += `@layer ${next.names.join(".")}{${
            project(rule.cssRules!, next.path, [...rank, ...next.rank], depth + 1)
          }}`;
        } else if (kind === "CSSCounterStyleRule") {
          const name = generatedCounterName(rule.name ?? "");
          if (!name) continue;
          const nextRank = [...rank, Infinity], previous = styleRanks.get(name);
          const difference = previous && nextRank.findIndex((value, index) => value !== previous[index]);
          if (
            previous && difference !== undefined && difference >= 0 && nextRank[difference]! < previous[difference]!
          ) {
            continue;
          }
          if (!styleMap.has(name) && styleMap.size >= 1024) {
            throw new RangeError("Mermaid counter style registry exceeds its budget.");
          }
          const descriptors = Object.fromEntries(
            Object.entries(descriptorNames).map((
              [name, key],
            ) => [name, (rule as unknown as Record<string, string>)[key]]),
          );
          styleMap.set(name, generatedCounterStyle(descriptors) ?? { system: "symbolic", unsupported: true });
          styleRanks.set(name, nextRank);
        } else if (kind === "CSSStyleRule" || kind === "CSSNestedDeclarations") {
          const value = rule.style?.getPropertyValue(property);
          const declaration = value
            ? `${property}:${value}${rule.style!.getPropertyPriority(property) ? "!important" : ""};`
            : "";
          const nested = rule.cssRules ? project(rule.cssRules, path, rank, depth + 1) : "";
          if (declaration || nested) {
            result += rule.selectorText === undefined
              ? declaration + nested
              : `${rule.selectorText}{${declaration}${nested}}`;
          }
        } else if (["CSSMediaRule", "CSSSupportsRule", "CSSContainerRule", "CSSScopeRule"].includes(kind)) {
          // Conditions remain browser-owned; no JS selector/cascade engine.
          // Counter-style collection below is not valid under inactive groups.
          const conditionalStyles = new Map(styleMap), conditionalRanks = new Map(styleRanks);
          const nested = project(rule.cssRules!, path, rank, depth + 1);
          const active = kind === "CSSMediaRule"
            ? view.matchMedia(rule.conditionText!).matches
            : kind === "CSSSupportsRule"
            ? (view as unknown as { CSS: typeof CSS }).CSS.supports(rule.conditionText!)
            : undefined;
          if (active !== true) {
            const ambiguous = active === undefined
              ? [...styleMap.keys()].filter((name) => styleMap.get(name) !== conditionalStyles.get(name))
              : [];
            styleMap.clear();
            for (const [key, value] of conditionalStyles) styleMap.set(key, value);
            for (const name of ambiguous) styleMap.set(name, { system: "symbolic", unsupported: true });
            styleRanks.clear();
            for (const [key, value] of conditionalRanks) styleRanks.set(key, value);
          }
          if (nested) result += `${header(rule.cssText)}{${nested}}`;
        } else if (kind === "CSSImportRule") {
          throw new TypeError("Mermaid counter metadata needs original imported stylesheet source.");
        }
      }
      return result;
    };
    let source = `@property ${property}{syntax:"*";inherits:false;initial-value:normal;}`;
    for (const { sheet, source: original } of records) {
      if (sheet.cssRules.length > 16_384) throw new RangeError("Mermaid counter original rules exceed their budget.");
      const parsed = new Sheet();
      parsed.replaceSync(original);
      if (
        [...parsed.cssRules].map((r) => r.cssText).join("\n") !== [...sheet.cssRules].map((r) => r.cssText).join("\n")
      ) {
        throw new TypeError("Mermaid counter metadata stylesheet source differs from its current CSSOM.");
      }
      parsed.replaceSync(projectCounterContentDeclarations(original, property, accepts));
      const saved = new Map(styleMap), savedRanks = new Map(styleRanks), projected = project(parsed.cssRules);
      if (sheet.media.mediaText && !view.matchMedia(sheet.media.mediaText).matches) {
        styleMap.clear();
        for (const [name, value] of saved) styleMap.set(name, value);
        styleRanks.clear();
        for (const [name, value] of savedRanks) styleRanks.set(name, value);
      }
      source += sheet.media.mediaText ? `@media ${sheet.media.mediaText}{${projected}}` : projected;
    }
    if ((outputUnits += source.length) > 2_097_152) {
      throw new RangeError("Mermaid counter metadata projection exceeds its aggregate budget.");
    }
    const sheet = new Sheet();
    sheet.replaceSync(source);
    if (sheet.cssRules[0]?.constructor.name !== "CSSPropertyRule") {
      throw new TypeError("Mermaid counter metadata requires stylesheet-owned property registration.");
    }
    owned.set(scope, sheet);
  }
  const originals = new Set<Element>([svg]);
  let ancestorWork = 0, styleUnits = 0;
  for (const owner of owners) {
    if (!svg.contains(owner)) throw new TypeError("Mermaid counter metadata owner is outside its source SVG.");
    let depth = 0;
    for (let node: Element | null = owner; node; node = node.parentElement) {
      if (++depth > 128 || ++ancestorWork > 128_000) {
        throw new RangeError("Mermaid counter metadata ancestors exceed their budget.");
      }
      originals.add(node);
      if (node === svg) break;
    }
  }
  const reference = [...originals].map((element) => {
    const css = view.getComputedStyle(element), box = element.getBoundingClientRect();
    const values = [...css].map((name) => {
      const value = css.getPropertyValue(name);
      if (value.length > 16_384 || (styleUnits += name.length + value.length) > 32_768_000) {
        throw new RangeError("Mermaid counter metadata fidelity styles exceed their budget.");
      }
      return [name, value] as const;
    });
    return { element, values, bounds: [box.x, box.y, box.width, box.height] };
  });
  const unchanged = () => {
    for (const { element, values, bounds } of reference) {
      const css = view.getComputedStyle(element), box = element.getBoundingClientRect();
      if (
        values.some(([name, value]) => css.getPropertyValue(name) !== value) ||
        [box.x, box.y, box.width, box.height].some((value, index) => value !== bounds[index])
      ) throw new TypeError("Mermaid counter metadata projection changed original styles/layout.");
    }
  };
  const resolvedStyles = new Map<string, GeneratedCounterStyle>();
  for (const scope of scopes) {
    // All scopes are the target SVG's actual shadow-ancestor chain.
    for (const [name, style] of styles.get(scope)!) resolvedStyles.set(name, style);
    if (resolvedStyles.size > 1024) throw new RangeError("Mermaid counter scoped styles exceed their budget.");
  }
  try {
    for (const [scope, sheet] of owned) scope.adoptedStyleSheets = [...scope.adoptedStyleSheets, sheet];
    unchanged();
    return read({
      requests(owner, side, computed) {
        if (!owners.has(owner)) throw new TypeError("Mermaid counter metadata request is not owned.");
        const original = view.getComputedStyle(owner, `::${side}`).getPropertyValue(property);
        const requests = generatedCounterRequests(original), expected = generatedCounterRequests(computed);
        if (requests.length !== expected.length) return;
        for (let index = 0; index < requests.length; index++) {
          const request = requests[index]!;
          parser.setProperty("content", `${request.name}(${request.arguments})`);
          const canonical = generatedCounterRequests(parser.getPropertyValue("content"))[0];
          if (
            !canonical || canonical.name !== expected[index]!.name || canonical.arguments !== expected[index]!.arguments
          ) {
            return;
          }
        }
        return requests;
      },
      styles(owner) {
        if (!owners.has(owner)) throw new TypeError("Mermaid counter metadata style request is not owned.");
        return resolvedStyles;
      },
    });
  } finally {
    // Preserve host additions/reordering made by the callback; remove only ours.
    for (const [scope, sheet] of owned) scope.adoptedStyleSheets = scope.adoptedStyleSheets.filter((s) => s !== sheet);
  }
}
