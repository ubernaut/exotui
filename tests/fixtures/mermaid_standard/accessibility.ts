// Copyright 2023 Im-Beast. MIT license.
/** Pinned accessibility specification, actual-engine preamble gaps and native transport.
 * https://github.com/mermaid-js/mermaid/blob/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/docs/config/accessibility.md
 * Root metadata is not proof of structured diagram/interaction AT parity.
 */
import {
  extractMermaidScene,
  MermaidFlexMarkdownSurface,
  MermaidMarkdownCache,
  MermaidMarkdownController,
  type MermaidStandardDiagram,
  type MermaidStandardRenderer,
  renderMermaidNativeFrame,
} from "../../../mod.mermaid.ts";
import { DocumentAccessibilityDOM, MarkdownController, MarkdownSurface } from "../../../mod.document.ts";
import { mermaidSVGAccessibility } from "../../../src/content/mermaid_accessibility_dom.ts";
import { MERMAID_STANDARD_FIXTURES } from "./catalogue.ts";
import { padNativeRow } from "./lifecycle.ts";
import { stripStyles } from "../../../src/utils/strings.ts";
import { createAnsiStyle } from "../../../src/theme.ts";
import { mergeSgrStyle } from "../../../src/utils/sgr_style.ts";

function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  require(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);
}
export function accessibilitySource(source: string): string {
  const lines = source.split("\n");
  let header = lines.findIndex((line) => line.trim() && !line.trim().startsWith("%%"));
  if (lines[header]?.trim() === "---") {
    header = lines.findIndex((line, index) => index > header && line.trim() === "---") + 1;
  }
  while (!lines[header]?.trim() || lines[header]!.trim().startsWith("%%")) header++;
  lines.splice(header + 1, 0, "accTitle: Family accessible title", "accDescr: Family accessible description");
  return lines.join("\n");
}

export async function verifyMermaidAccessibility(renderer: Pick<MermaidStandardRenderer, "compile" | "parse">) {
  const retained: MermaidStandardDiagram[] = [];
  const gaps = new Set([
    "mindmap",
    "timeline",
    "sankey",
    "block",
    "kanban",
    "eventmodeling",
    "venn",
    "ishikawa",
    "info",
  ]);
  let compared = 0;
  for (const fixture of MERMAID_STANDARD_FIXTURES) {
    const source = accessibilitySource(fixture.source);
    const type = await renderer.parse(source);
    const diagram = await renderer.compile(source);
    require(diagram.scene, `${fixture.name}: missing scene`);
    equal(diagram.source, source, `${fixture.name}: original author source changed`);
    equal(diagram.diagramType, type, `${fixture.name}: parse/render disagree`);
    const override = fixture.name === "flowchart-features";
    equal(diagram.scene.title, override ? "Stack relationships" : "Family accessible title", `${fixture.name}: title`);
    equal(
      diagram.scene.description,
      override ? "A nested subsystem with styled nodes and multiple connections." : "Family accessible description",
      `${fixture.name}: description`,
    );
    equal(diagram.scene.accessibility?.role, "graphics-document document", `${fixture.name}: role`);
    require(diagram.scene.accessibility?.roleDescription, `${fixture.name}: role description missing`);
    const native = renderMermaidNativeFrame(diagram.scene);
    equal(native.accessibility, diagram.scene.accessibility, `${fixture.name}: native metadata lost`);
    if (gaps.has(fixture.name) || type === "zenuml") {
      const original = await renderer.compile(fixture.source);
      require(original.scene, `${fixture.name}: baseline scene missing`);
      equal(
        native.cells.map((row) => row.map((cell) => cell.char)),
        renderMermaidNativeFrame(original.scene).cells.map((row) => row.map((cell) => cell.char)),
        `${fixture.name}: accessibility changed native visuals`,
      );
      compared++;
    }
    retained.push(JSON.parse(JSON.stringify(diagram)));
  }
  const multi = await renderer.compile(
    "mindmap\naccTitle: Multiline map\naccDescr {\n  First line.\n  Second line.\n}\n  Root\n    Child",
  );
  equal(multi.scene?.description, "First line.\nSecond line.", "multiline description lost");
  retained.push(JSON.parse(JSON.stringify(multi)));
  const onlySVG = await renderer.compile("block\naccTitle: SVG-only title\naccDescr: SVG-only description\nA", {
    scene: false,
  });
  require(
    !onlySVG.scene && onlySVG.svg.includes("SVG-only title") && onlySVG.svg.includes("SVG-only description"),
    "SVG-only metadata lost",
  );
  let invalid = 0;
  for (
    const bad of [
      "mindmap\naccDescr {unterminated\n  Root",
      "block\naccTitle: bad\x1b]52;c;payload\x07\nA",
      `flowchart LR\naccTitle: ${"x".repeat(4097)}\nA-->B`,
      `mindmap\naccDescr: ${"x".repeat(32769)}\n  Root`,
      "block\naccTitle: Failed diagram\nA -->",
    ]
  ) {
    let rejected = false;
    try {
      await renderer.compile(bad);
    } catch {
      rejected = true;
    }
    require(rejected, "Invalid metadata/body did not reject");
    const recovered = await renderer.compile("flowchart LR\naccTitle: Recovered\nA-->B");
    equal(recovered.scene?.title, "Recovered", "failed accessibility request poisoned recovery");
    invalid++;
  }
  return { cases: MERMAID_STANDARD_FIXTURES.length, compared, invalid, multiline: 1, svgOnly: 1, retained };
}

/** Drive actual native wheel/reflow using portable scenes after compiler disposal. */
export async function verifyMermaidAccessibilityTransport(retained: readonly MermaidStandardDiagram[]) {
  let markdownSnapshots = 0, flexSnapshots = 0, decoratedMarkdownSnapshots = 0, decoratedFlexSnapshots = 0;
  let decoratedMarkdownPans = 0, decoratedFlexPans = 0;
  const markedRow = (rows: ReturnType<MarkdownController["render"]>) =>
    rows.findIndex((row) => row.segments.some((span) => span.style?.underline || span.style?.strikethrough));
  const verifyPaintedStyle = (rows: ReturnType<MarkdownController["render"]>, mounted: string[]) => {
    let marked = 0;
    for (const span of rows.flatMap((row) => row.segments)) {
      if (!span.style?.underline && !span.style?.strikethrough) continue;
      const encoded = createAnsiStyle(span.style)(span.text), prefix = encoded.slice(0, encoded.indexOf("m") + 1);
      require(
        mounted.join("\n").includes(`${mergeSgrStyle("", prefix)}${span.text}\x1b[0m`),
        `Mounted native decoration style lost: ${JSON.stringify({ span, prefix, mounted })}`,
      );
      marked++;
    }
    require(marked > 0, "Decoration style check saw no painted marked glyphs");
  };
  for (const diagram of retained) {
    const decorated = diagram.scene!.items.some((item) =>
      item.kind === "text" && item.decorations?.some((value) => ["underline", "line-through"].includes(value.line))
    );
    // Full Kanban has ticket links beyond both narrow viewports. Locate actual
    // painted native runs, not guessed source coordinates or a wider test frame.
    const markedColumns = decorated
      ? [
        ...new Set(
          renderMermaidNativeFrame(diagram.scene!).cells.flatMap((row) =>
            row.flatMap((cell, column) =>
              cell.char.trim() && (cell.underline || cell.strikethrough) &&
                !(column && (row[column - 1]!.underline || row[column - 1]!.strikethrough))
                ? [column]
                : []
            )
          ),
        ),
      ]
      : [];
    let markdownPan = 0, flexPan = 0;
    const source = `# Diagram\n\n\`\`\`mermaid\n${diagram.source}\n\`\`\`\n\nAfter diagram.`;
    const cache = new MermaidMarkdownCache({ compile: () => Promise.resolve(diagram) });
    const controller = new MermaidMarkdownController(cache, { source, diagramOffset: () => markdownPan });
    const surface = new MarkdownSurface({ controller, initialSize: { columns: 80, rows: 9 } });
    const flex = new MermaidFlexMarkdownSurface(cache, {
      diagramOffset: () => flexPan,
      showFirstSectionHeader: false,
      sections: [{ id: "chapter", label: "Diagram", rows: [{ panels: [{ id: "diagram", source }] }] }],
    });
    try {
      await surface.ready;
      for (const width of [80, 35]) {
        surface.render(width, 9);
        await controller.settled();
        const full = controller.accessibilityTargets(width);
        equal(full.length, 1, "Markdown lost diagram target");
        equal(full[0]!.node.label, diagram.scene!.title, "Markdown title changed");
        equal(full[0]!.node.description, diagram.scene!.description, "Markdown description changed");
        equal(full[0]!.node.role, "graphics-document", "Markdown role changed");
        equal(full[0]!.content, diagram.scene!.accessibility?.content, "Markdown semantic content changed");
        if (decorated) {
          const left = controller.render(width);
          const pans = markedRow(left) >= 0
            ? [0]
            : [...new Set(markedColumns.map((column) => Math.max(0, column - Math.floor(width / 3))))];
          require(pans.length, "Original marked text has no native painted runs");
          for (const pan of pans) {
            markdownPan = pan;
            controller.invalidate();
            const row = markedRow(controller.render(width));
            require(row >= 0, "Original marked text lost its Markdown decoration palette");
            controller.scrollTo(row, width, 9);
            verifyPaintedStyle(controller.visible(width, 9), surface.render(width, 9));
            decoratedMarkdownSnapshots++;
            if (pan) decoratedMarkdownPans++;
          }
          markdownPan = 0;
          controller.invalidate();
          equal(controller.render(width), left, "Markdown pan reset changed the narrow left viewport");
        }
        for (const offset of [full[0]!.row, full[0]!.row + Math.floor(full[0]!.height / 2)]) {
          controller.scrollTo(offset, width, 9);
          surface.scroll(1);
          surface.render(width, 9);
          await controller.settled();
          const actual = surface.render(width, 9).map(stripStyles);
          const expected = controller.visible(width, 9).map((row) => padNativeRow(row.text, width));
          while (expected.length < 9) expected.push(" ".repeat(width));
          equal(actual, expected, "Semantic transport changed mounted native rows");
          const view = controller.inspect(width, 9);
          equal(
            controller.accessibilityTargets(width, 9).map((target) => target.key),
            controller.accessibilityTargets(width).filter((target) =>
              target.row < view.offset + 9 && target.row + target.height > view.offset
            ).map((target) => target.key),
            "Markdown viewport semantics mismatch",
          );
          markdownSnapshots++;
        }
        await flex.settled(width);
        const targets = flex.controller.accessibilityTargets(width);
        equal(targets.length, 1, "Flex lost diagram target");
        equal(targets[0]!.scope, "diagram", "Flex scope lost");
        equal(targets[0]!.node, full[0]!.node, "Flex diagram semantics changed");
        equal(targets[0]!.content, full[0]!.content, "Flex semantic content changed");
        if (decorated) {
          const box = flex.controller.layout(width).panels[0]!;
          const panel = flex.controller.panelController("diagram")!;
          const left = panel.render(box.contentRect.width);
          const pans = markedRow(left) >= 0
            ? [0]
            : [...new Set(markedColumns.map((column) => Math.max(0, column - Math.floor(box.contentRect.width / 3))))];
          require(pans.length, "Original marked text has no native painted flex runs");
          for (const pan of pans) {
            flexPan = pan;
            panel.invalidate();
            const rows = panel.render(box.contentRect.width);
            const row = markedRow(rows);
            require(row >= 0, "Original marked text lost its flex decoration palette");
            flex.controller.scrollTo(box.contentRect.row + row, width, 9);
            verifyPaintedStyle(rows.slice(row, row + 9), flex.render(width, 9));
            decoratedFlexSnapshots++;
            if (pan) decoratedFlexPans++;
          }
          flexPan = 0;
          panel.invalidate();
          equal(panel.render(box.contentRect.width), left, "Flex pan reset changed the narrow left viewport");
        }
        for (const offset of [targets[0]!.row, targets[0]!.row + Math.floor(targets[0]!.height / 2)]) {
          flex.controller.scrollTo(offset, width, 9);
          flex.scroll(1);
          flex.render(width, 9);
          await flex.settled(width);
          const view = flex.controller.inspect(width, 9);
          equal(
            flex.controller.accessibilityTargets(width, 9).map((target) => target.key),
            flex.controller.accessibilityTargets(width).filter((target) =>
              target.row < view.offset + 9 && target.row + target.height > view.offset
            ).map((target) => target.key),
            "Flex viewport semantics mismatch",
          );
          flexSnapshots++;
        }
      }
      controller.setSource("No diagram now.");
      await controller.settled();
      equal(controller.accessibilityTargets(35), [], "Stale metadata after source replacement");
    } finally {
      flex.dispose();
      surface.dispose();
      controller.dispose();
      cache.dispose();
    }
    equal(controller.accessibilityTargets(35), [], "Stale disposed document semantics");
    equal(flex.controller.accessibilityTargets(35), [], "Stale disposed flex semantics");
  }
  return {
    diagrams: retained.length,
    markdownSnapshots,
    flexSnapshots,
    decoratedMarkdownSnapshots,
    decoratedFlexSnapshots,
    decoratedMarkdownPans,
    decoratedFlexPans,
  };
}

let browserCleanup: (() => void) | undefined;

/** Leave an owned companion mounted only until the external Chromium AX-tree oracle reads it. */
export async function mountMermaidAccessibilityDOM(diagram: MermaidStandardDiagram) {
  disposeMermaidAccessibilityDOM();
  require(diagram.scene, "DOM fixture scene missing");
  const root = document.createElement("div");
  root.id = "exotui-accessibility-fixture";
  document.body.append(root);
  browserCleanup = () => {
    root.remove();
    browserCleanup = undefined;
  };
  try {
    const foreign = document.createElement("span");
    foreign.id = "foreign-accessibility-text";
    foreign.textContent = "Borrowed host text must not label the diagram";
    root.append(foreign);
    const nested = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    nested.innerHTML = "<defs><marker><title>Marker title</title><desc>Marker description</desc></marker></defs>";
    const localMetadata = mermaidSVGAccessibility(nested);
    equal(localMetadata.title, undefined, "Nested marker title became the diagram name");
    equal(localMetadata.description, undefined, "Nested marker description became the diagram description");
    nested.setAttribute("aria-labelledby", foreign.id);
    equal(mermaidSVGAccessibility(nested).title, undefined, "Read borrowed host text through an external reference");
    nested.innerHTML += '<text id="owned-label">Root label</text><desc id="owned-description">Root description</desc>';
    nested.setAttribute("aria-labelledby", "owned-label");
    nested.setAttribute("aria-describedby", "owned-description");
    equal(mermaidSVGAccessibility(nested).title, "Root label", "Owned label reference lost");
    equal(mermaidSVGAccessibility(nested).description, "Root description", "Owned description reference lost");
    nested.setAttribute("aria-labelledby", Array(65).fill("owned-label").join(" "));
    let rejected = false;
    try {
      mermaidSVGAccessibility(nested);
    } catch (error) {
      rejected = error instanceof RangeError;
    }
    require(rejected, "Reference-count budget not enforced");
    const reused = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    reused.setAttribute("width", "60");
    reused.setAttribute("height", "40");
    reused.setAttribute("viewBox", "0 0 60 40");
    reused.innerHTML =
      '<title>Root only</title><defs><g id="accessible-local-shape"><path d="M0 0L12 0L12 12Z" stroke="black" fill="none"/></g></defs><use href="#accessible-local-shape" x="4" y="4"/><use href="#accessible-local-shape" x="28" y="4"/>';
    root.append(reused);
    const query = reused.querySelectorAll.bind(reused);
    let metadataScans = 0;
    Object.defineProperty(reused, "querySelectorAll", {
      configurable: true,
      value(selector: string) {
        if (selector === "[id]") metadataScans++;
        return query(selector);
      },
    });
    try {
      const scene = extractMermaidScene(reused);
      require(scene.items.length >= 2 && scene.title === "Root only", "Reused geometry/metadata lost");
      equal(metadataScans, 1, "Expanded instances multiplied root metadata scans");
    } finally {
      Reflect.deleteProperty(reused, "querySelectorAll");
      reused.remove();
    }
    const frame = renderMermaidNativeFrame(diagram.scene);
    const source = "```mermaid\nfixture\n```";
    // This is the same ordinary Markdown model used by the native canvas view, not an SVG overlay.
    const controller = new MarkdownController({ source, render: { diagram: () => frame } });
    const companion = new DocumentAccessibilityDOM(root, controller, { label: "Native diagram window" });
    const surface = new MarkdownSurface({ controller, initialSize: { columns: 80, rows: 9 } });
    browserCleanup = () => {
      companion.dispose();
      require(root.contains(foreign), "Projection disposed a borrowed root child");
      surface.dispose();
      controller.dispose();
      root.remove();
      browserCleanup = undefined;
    };
    await surface.ready;
    companion.update(80);
    require(surface.render(80, 9).some((line) => stripStyles(line).trim()), "Native diagram view rendered no cells");
    const before = root.lastElementChild;
    companion.update(80);
    require(root.lastElementChild === before, "Unchanged semantics rebuilt DOM");
    require(root.querySelectorAll("[aria-describedby]").length === 1, "Duplicate diagram semantics");
    require(root.querySelector("[role='graphics-document document']"), "Upstream role/fallback tokens lost in DOM");
    controller.setSource("No diagram.");
    companion.update(80);
    require(!root.querySelector("[aria-describedby]"), "Removed diagram retained DOM semantics");
    controller.setSource(source);
    companion.update(35, 3);
    const anchor = controller.accessibilityTargets(35)[0]!;
    controller.scrollTo(anchor.row + 2, 35, 3);
    companion.update(35, 3);
    require(root.querySelectorAll("[aria-describedby]").length === 1, "Partial viewport lost diagram semantics");
    // Inert descriptions cannot execute source HTML, and duplicate host IDs
    // must not cause descriptions to bind to unrelated DOM content.
    const hostile = new DocumentAccessibilityDOM(root, {
      accessibilityTargets: () => [{
        ...anchor,
        node: { ...anchor.node, label: "Literal metadata", description: "<img src=x onerror=alert(1)>" },
      }],
    });
    try {
      hostile.update(35);
      require(!root.querySelector("img"), "Metadata parsed as HTML");
    } finally {
      hostile.dispose();
    }
    let fail = false;
    const retry = new DocumentAccessibilityDOM(root, {
      accessibilityTargets: () => {
        if (fail) throw new Error("Rejected current source");
        return [anchor];
      },
    });
    try {
      retry.update(35);
      fail = true;
      let rejected = false;
      try {
        retry.update(35);
      } catch {
        rejected = true;
      }
      require(rejected, "Projection failure did not propagate");
      require(root.querySelectorAll("[aria-describedby]").length === 1, "Failed projection left stale semantics");
      fail = false;
      retry.update(35);
    } finally {
      retry.dispose();
    }
    return {
      title: diagram.scene.title,
      description: diagram.scene.description,
      roleDescription: diagram.scene.accessibility?.roleDescription,
    };
  } catch (error) {
    disposeMermaidAccessibilityDOM();
    throw error;
  }
}

export function disposeMermaidAccessibilityDOM() {
  browserCleanup?.();
}
