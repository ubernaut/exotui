// Copyright 2026 the ExotUI authors. MIT license.
import { createMermaidStandardRenderer, type MermaidStandardRenderer } from "../../../src/content/mermaid_standard.ts";
import {
  MermaidSvgDesktopLayer,
  MermaidSvgFlexSurface,
  MermaidSvgMarkdownController,
} from "../../../src/web/mermaid_svg.ts";
import { MERMAID_STANDARD_FIXTURES } from "./catalogue.ts";

/** Real upstream catalogue plus lifecycle/stacking/security probes for the optional SVG browser adapter. */
export async function verifyMermaidSvgBrowser(): Promise<Record<string, number>> {
  const check = (value: unknown, message: string) => {
    if (!value) throw new Error(message);
  };
  const root = document.createElement("div");
  root.style.cssText = "position:relative;width:900px;height:720px";
  document.body.appendChild(root);
  const compiler = await createMermaidStandardRenderer({ document });
  let families = 0, stages = 0;
  const layer = new MermaidSvgDesktopLayer(root);
  try {
    for (const fixture of MERMAID_STANDARD_FIXTURES) {
      const surface = new MermaidSvgFlexSurface(compiler, {
        sections: [{
          id: "body",
          label: "Diagram",
          rows: [{
            panels: [{
              id: "diagram",
              source: "Before\n\n```mermaid\n" + fixture.source + "\n```\n\nAfter",
            }],
          }],
        }],
      });
      try {
        await surface.settled(80);
        const targets = surface.svgTargets(80);
        check(
          targets.length === 1,
          fixture.name + " has no official SVG stage: " +
            surface.controller.panelController("diagram")!.render(80).map((line) => line.text).join("\n"),
        );
        const target = targets[0]!;
        check(target.svg.includes("<svg") && target.rect.height >= 2, fixture.name + " invalid SVG geometry");
        surface.controller.scrollTo(target.rect.row, 80, 32);
        layer.present({
          windows: [{
            id: "document",
            rect: { column: 0, row: 0, width: 100, height: 40 },
            clientRect: { column: 0, row: 0, width: 100, height: 40 },
          }],
          documents: new Map([["document", { surface, width: 80, height: 32 }]]),
          columns: 100,
          rows: 40,
        });
        const stage = root.querySelector<HTMLElement>("[data-mermaid-stage]")!;
        const svg = stage.shadowRoot!.querySelector<SVGSVGElement>("svg")!;
        check(svg && svg.getBoundingClientRect().width > 0, fixture.name + " SVG not mounted");
        check(svg.textContent!.trim().length > 0, fixture.name + " lost SVG content");
        check(
          !root.querySelector("iframe") && svg.getRootNode() === stage.shadowRoot,
          fixture.name + " SVG not shadow-isolated",
        );
        families++;
        stages++;
        const upper = {
          id: "upper",
          rect: { column: 20, row: 5, width: 30, height: 15 },
          clientRect: { column: 21, row: 7, width: 28, height: 12 },
        };
        layer.present({
          windows: [{
            id: "document",
            rect: { column: 0, row: 0, width: 100, height: 40 },
            clientRect: { column: 0, row: 0, width: 100, height: 40 },
          }, upper],
          documents: new Map([["document", { surface, width: 80, height: 32 }]]),
          columns: 100,
          rows: 40,
        });
        check(
          root.querySelector<HTMLElement>("[data-mermaid-stage]")!.style.clipPath.includes("path("),
          "Missing occlusion clip",
        );
        layer.present({ windows: [], documents: new Map(), columns: 100, rows: 40, blocked: true });
        check(layer.element.hidden, "Menu/animation did not hide SVG layer");
        layer.present({ windows: [], documents: new Map(), columns: 100, rows: 40 });
        check(!root.querySelector("[data-mermaid-stage]"), "Closed window retained SVG DOM");
      } finally {
        surface.dispose();
      }
    }
    const invalid = new MermaidSvgMarkdownController(compiler, { source: "```mermaid\ninvalid diagram 🧨\n```" });
    try {
      await invalid.settled(40);
      check(
        invalid.svgTargets(40).length === 0 &&
          invalid.render(40).some((line) => line.text.startsWith("Mermaid error:")),
        "Malformed Unicode source crashed or retained a diagram",
      );
    } finally {
      invalid.dispose();
    }
    let pending!: (value: Awaited<ReturnType<MermaidStandardRenderer["compile"]>>) => void;
    let calls = 0, aborted = 0;
    const model = new MermaidSvgMarkdownController({
      compile: (_source, options) => {
        check(
          options?.scene === false && options.trusted === false,
          "Browser path extracted native cells/enabled callbacks",
        );
        options?.signal?.addEventListener("abort", () => aborted++);
        calls++;
        return new Promise((resolve) => pending = resolve);
      },
    }, { source: "```mermaid\nflowchart LR\nA-->B\n```" });
    try {
      model.render(80);
      const stale = pending;
      model.render(40);
      stale({
        source: "old",
        diagramType: "flowchart",
        version: "test",
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text>STALE</text></svg>',
      });
      await Promise.resolve();
      check(model.svgTargets(40).length === 0 && aborted === 1, "Stale resized result committed");
      pending({
        source: "new",
        diagramType: "flowchart",
        version: "test",
        svg:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><script>parent.__svgExecuted=true</script><text onload="parent.__svgExecuted=true">SAFE</text></svg>',
      });
      await model.settled(40);
      check(
        !model.svgTargets(40)[0]!.svg.includes("<script") && !model.svgTargets(40)[0]!.svg.includes("onload"),
        "Active content survived mounting policy",
      );
      check(calls === 2, "Settled repaint recompiled unchanged source");
      model.configure({ config: { theme: "dark" } });
      model.render(40);
      check(calls === 3 && aborted === 2, "Theme did not own a new generation");
    } finally {
      model.dispose();
    }
    check(aborted === 3, "Dispose retained owned compiler work");
    const historyLength = history.length;
    const bodyGround = getComputedStyle(document.body).backgroundColor;
    const isolated = new MermaidSvgFlexSurface({
      compile: (source) =>
        Promise.resolve({
          source,
          diagramType: "test",
          version: "test",
          svg:
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><style>body{background:red}text{fill:cyan}</style><script>parent.__svgExecuted=true</script><image href="https://example.invalid/leak.png"/><text onload="parent.__svgExecuted=true">SAFE</text></svg>',
        }),
    }, {
      sections: [{
        id: "security",
        label: "Security",
        rows: [{ panels: [{ id: "security-panel", source: "```mermaid\nsecurity\n```" }] }],
      }],
    });
    try {
      await isolated.settled(80);
      layer.present({
        windows: [{
          id: "security",
          rect: { column: 0, row: 0, width: 100, height: 40 },
          clientRect: { column: 0, row: 0, width: 100, height: 40 },
        }],
        documents: new Map([["security", { surface: isolated, width: 80, height: 32 }]]),
        columns: 100,
        rows: 40,
      });
      const shadow = root.querySelector<HTMLElement>("[data-mermaid-stage]")!.shadowRoot!;
      check(!shadow.querySelector("script,[onload],image[href]"), "Active/external stage resources survived");
      check(getComputedStyle(document.body).backgroundColor === bodyGround, "Diagram CSS escaped into the desktop");
      check(history.length === historyLength && !root.querySelector("iframe"), "SVG mounting changed browser history");
      check(
        getComputedStyle(shadow.querySelector("text")!).fill === "rgb(0, 255, 255)",
        "Local diagram stylesheet was lost",
      );
    } finally {
      isolated.dispose();
    }
    return { catalogueExamples: families, stages, lifecycleChecks: 7, securityChecks: 4 };
  } finally {
    layer.dispose();
    compiler.dispose();
    root.remove();
  }
}
