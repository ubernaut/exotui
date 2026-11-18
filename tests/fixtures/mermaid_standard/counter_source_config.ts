// Copyright 2023 Im-Beast. MIT license.
import type { MermaidStandardConfig, MermaidStandardDiagram, MermaidStandardRenderer } from "../../../mod.mermaid.ts";
import type { DiagramSemanticNode } from "../../../mod.document.ts";
import { MERMAID_COUNTER_CONTENT_FIXTURES } from "./counter_content.ts";

const base = MERMAID_COUNTER_CONTENT_FIXTURES[1]!;
const body = `flowchart LR\nA["${base.body.replaceAll('"', "'")}"]`;
const block = (css: string, extra = "") =>
  `---\nconfig:\n${extra}  themeCSS: |\n${css.split("\n").map((line) => "    " + line).join("\n")}\n---\n${body}`;
const directive = (css: string, type = "init", extra: Record<string, unknown> = {}) =>
  `%%{${type}:${JSON.stringify({ ...extra, themeCSS: css }).replace(/'/g, "\\u0027")}}%%`;
const decimal = base.css.replace(/counters\(probe,\s*""\)/, "counter(probe)");

/** Independently authored source configurations, not snapshots of the preservation implementation. */
export const MERMAID_COUNTER_SOURCE_CONFIG_FIXTURES: readonly {
  name: string;
  source: string;
  expected: string;
  painted?: string;
  config?: MermaidStandardConfig;
  trusted?: boolean;
  title?: string;
  filtered?: boolean;
}[] = [
  { name: "yaml-block", source: block(base.css), expected: "249:inside" },
  {
    name: "yaml-folded",
    source: block(base.css).replace("themeCSS: |", "themeCSS: >-"),
    expected: "249:inside",
  },
  {
    name: "yaml-quoted-key-value",
    source: `---\nconfig:\n  "theme\\u0043SS": ${JSON.stringify(base.css)}\n---\n${body}`,
    expected: "249:inside",
  },
  {
    name: "yaml-alias",
    source: `---\nshared: &style ${JSON.stringify(base.css)}\nconfig:\n  themeCSS: *style\n---\n${body}`,
    expected: "249:inside",
  },
  { name: "init", source: `${directive(base.css)}\n${body}`, expected: "249:inside" },
  { name: "initialize", source: `${directive(base.css, "initialize")}\n${body}`, expected: "249:inside" },
  {
    name: "escaped-directive-key",
    source: `${directive(base.css).replace('"themeCSS"', '"theme\\u0043SS"')}\n${body}`,
    expected: "249:inside",
  },
  {
    name: "frontmatter-overrides-host",
    source: block(base.css),
    config: { themeCSS: decimal },
    expected: "249:inside",
  },
  {
    name: "directive-overrides-frontmatter",
    source: `${block(decimal)}\n${directive(base.css)}`,
    expected: "249:inside",
  },
  {
    name: "last-directive-wins",
    source: `${directive(decimal)}\n${body}\n${directive(base.css)}`,
    expected: "249:inside",
  },
  {
    name: "metadata-retained",
    source: block(base.css).replace("---\nconfig:", "---\ntitle: Literal map\nconfig:")
      .replace("flowchart LR", "flowchart LR\naccTitle: Literal counter map\naccDescr: Original description"),
    expected: "249:insideLiteral map",
    title: "Literal counter map",
  },
  {
    name: "apostrophes-percent-terminator",
    source: block(base.css.replace(' ":"', ' "it\'s 99% {}%%:"')),
    expected: "249it's 99% {}%%:inside",
  },
  ...["multiple", "alternative", "important-layers", "variable", "nesting", "escaped"].map((name) => {
    const fixture = MERMAID_COUNTER_CONTENT_FIXTURES.find((candidate) =>
      candidate.name === `generated-counter-${name}`
    )!;
    return {
      name: `source-${name}`,
      source: block(fixture.css),
      expected: fixture.semanticText ?? fixture.text,
      painted: fixture.text,
    };
  }),
  {
    name: "host-locked-css",
    source: block(base.css, "  secure: []\n  securityLevel: loose\n"),
    config: { themeCSS: decimal, secure: ["themeCSS", "securityLevel", "secure"], securityLevel: "strict" },
    expected: "9:inside",
  },
  {
    name: "untrusted-locked-css",
    source: `${directive(base.css, "init", { secure: [], securityLevel: "loose" })}\n${body}`,
    config: { themeCSS: decimal, secure: ["themeCSS"] },
    trusted: false,
    expected: "9:inside",
  },
  {
    name: "host-locked-plural-css",
    source: `${directive(decimal, "init", { secure: [], securityLevel: "loose" })}\n${body}`,
    config: { themeCSS: base.css, secure: ["themeCSS"] },
    trusted: false,
    expected: "249:inside",
  },
  {
    name: "strict-allowed-css",
    source: block(base.css, "  secure: []\n  securityLevel: loose\n"),
    trusted: false,
    expected: "249:inside",
  },
  {
    name: "filtered-css-not-restored",
    source: block(base.css + ".generated > span{color:red}"),
    expected: "inside",
    filtered: true,
  },
];

function plain(nodes: readonly DiagramSemanticNode[]): string {
  return nodes.map((node): string => (node.text ?? "") + plain(node.children ?? [])).join("");
}

/** Compile original configurations in both real hosts; retain source/native/companion data for independent AX checks. */
export async function verifyMermaidCounterSourceConfig(renderer: Pick<MermaidStandardRenderer, "compile">) {
  const retained: MermaidStandardDiagram[] = [];
  for (const fixture of MERMAID_COUNTER_SOURCE_CONFIG_FIXTURES) {
    const diagram = await renderer.compile(fixture.source, {
      trusted: fixture.trusted ?? true,
      config: {
        securityLevel: "loose",
        htmlLabels: true,
        flowchart: { htmlLabels: true },
        ...fixture.config,
      },
    });
    const scene = diagram.scene!;
    const painted = scene.items.filter((item) => item.kind === "text").map((item) => item.text).join("");
    if (
      diagram.source !== fixture.source || scene.diagnostics.length ||
      plain(scene.accessibility!.content!) !== fixture.expected ||
      painted !== (fixture.painted ?? fixture.expected) ||
      fixture.title && scene.accessibility?.title !== fixture.title ||
      fixture.filtered && diagram.svg.includes("--exotui-preserved-counter-")
    ) {
      throw new Error(`Source counter configuration differs: ${JSON.stringify({ fixture, painted, scene })}`);
    }
    retained.push(JSON.parse(JSON.stringify(diagram)));
  }
  const svgOnly = await renderer.compile(block(base.css), { scene: false, config: { htmlLabels: true } });
  if (svgOnly.source !== block(base.css) || svgOnly.scene || !svgOnly.svg.includes("--exotui-preserved-counter-")) {
    throw new Error("SVG-only source configuration lost preserved counter metadata.");
  }
  return { retained, sourceConfigCases: retained.length, sourceConfigSVGOnly: 1 };
}
