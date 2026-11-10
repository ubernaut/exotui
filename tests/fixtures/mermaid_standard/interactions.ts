// Copyright 2023 Im-Beast. MIT license.
import { FlexMarkdownSurface, type MarkdownInteraction, MarkdownSurface } from "../../../mod.document.ts";
import {
  extractMermaidScene,
  type MermaidStandardDiagram,
  type MermaidStandardRenderer,
  prepareMermaidMarkdown,
  renderMermaidNativeFrame,
} from "../../../mod.mermaid.ts";
import { stripStyles, textWidth } from "../../../src/utils/strings.ts";
import { padNativeRow } from "./lifecycle.ts";
import type { KeyPressEvent } from "../../../src/input_reader/types.ts";
import type { DocumentInteractionTarget } from "../../../mod.document.ts";

const nativeKey = (key: KeyPressEvent["key"]): KeyPressEvent => ({
  key,
  ctrl: false,
  meta: false,
  shift: false,
  buffer: new Uint8Array(),
});

function verifyNativeKeyboard(
  surface: MarkdownSurface | FlexMarkdownSurface,
  targets: readonly DocumentInteractionTarget[],
  id: string | undefined,
  title?: string,
): void {
  const state = surface instanceof MarkdownSurface ? surface.component.interactions : surface.interactions;
  let found = false;
  for (let i = 0; i <= targets.length; i++) {
    if (surface instanceof MarkdownSurface) surface.component.tui.emit("keyPress", nativeKey("right"));
    else surface.key(nativeKey("right"));
    const selected = state.selected(targets);
    if (selected?.interaction.callbacks?.length && (id === undefined || selected.interaction.id === id)) {
      found = true;
      break;
    }
  }
  if (!found) throw new Error("Native keyboard could not reach its callback action.");
  const rows = surface.render(240, 8).map(stripStyles);
  if (title && !rows.join("\n").includes(title)) throw new Error("Keyboard focus lost native tooltip presentation.");
  if (!surface.key(nativeKey("return"))) throw new Error("Native keyboard failed to activate its selected callback.");
  surface.key(nativeKey("escape"));
  if (surface.key(nativeKey("return"))) throw new Error("Dismissed keyboard focus still activated its callback.");
}

const examples = [
  {
    name: "flow",
    action: "B",
    fallback: "C",
    title: "Action tooltip",
    source:
      'flowchart LR\nA[Link] --> B[Action] --> C[Default]\nclick A href "https://example.test/flow" "Link tooltip" _blank\nclick B call host.run("one,two", three) "Action tooltip"\nclick C host.run "Default tooltip"',
  },
  {
    name: "class",
    action: "Action",
    fallback: "Default",
    title: "Class action",
    source:
      'classDiagram\nclass Link\nclass Action\nclass Default\nLink --> Action\nclick Link href "https://example.test/class" "Class link" _self\nclick Action call host.run("one,two", three) "Class action"\ncallback Default "host.run" "Class default"',
  },
  {
    name: "gantt",
    action: "B",
    fallback: "C",
    title: undefined,
    source:
      'gantt\ndateFormat YYYY-MM-DD\nsection Test\nLink :A, 2026-01-01, 2d\nAction :B, after A, 2d\nDefault :C, after B, 2d\nclick A href "https://example.test/gantt"\nclick B call host.run("one,two", three)\nclick C call host.run()',
  },
];

/** Actual upstream declarations survive JSON and drive the same mounted native hooks in both compiler hosts. */
export async function verifyMermaidInteractions(
  renderer: Pick<MermaidStandardRenderer, "compile">,
): Promise<
  {
    compiles: number;
    mounted: number;
    snapshots: number;
    activations: number;
    keyboardActivations: number;
    tooltipSnapshots: number;
    strict: boolean;
    recovery: boolean;
    retained: MermaidStandardDiagram[];
  }
> {
  let compiles = 0, mounted = 0, snapshots = 0, activations = 0;
  let keyboardActivations = 0, tooltipSnapshots = 0;
  const retained: MermaidStandardDiagram[] = [];
  const require = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  for (const example of examples) {
    for (const mode of ["strict", "loose", "classic"] as const) {
      const trusted = mode !== "strict";
      const diagram = await renderer.compile(example.source, {
        trusted,
        containerWidth: 900,
        config: {
          securityLevel: "loose",
          ...mode === "classic" ? { layout: "dagre", look: "classic", theme: "default" } : {},
        },
      });
      compiles++;
      const portable = JSON.parse(JSON.stringify(diagram));
      if (mode === "loose") retained.push(portable);
      const frame = renderMermaidNativeFrame(portable.scene);
      const cells = frame.cells.flat();
      require(
        cells.some((cell) => cell.href === `https://example.test/${example.name}`),
        `${example.name}/${mode} lost its link.`,
      );
      if (!trusted) {
        require(
          !cells.some((cell) => cell.interaction?.callbacks?.length),
          `${example.name} bypassed strict callback policy.`,
        );
        if (example.title) {
          require(
            cells.some((cell) => cell.interaction?.title === example.title),
            `${example.name} lost strict tooltip.`,
          );
        }
        continue;
      }
      require(
        cells.some((cell) =>
          cell.interaction?.id === example.action &&
          JSON.stringify(cell.interaction.callbacks) ===
            JSON.stringify([{ name: "host.run", args: ["one,two", "three"] }])
        ),
        `${example.name}/${mode} lost callback arguments.`,
      );
      require(
        cells.some((cell) =>
          cell.interaction?.id === example.fallback && cell.interaction.callbacks?.[0]?.args[0] === example.fallback
        ),
        `${example.name}/${mode} lost default arguments.`,
      );
      if (example.title) {
        require(
          cells.some((cell) => cell.interaction?.title === example.title),
          `${example.name}/${mode} lost tooltip.`,
        );
      }
      const target = example.name === "flow" ? "_blank" : "_self";
      require(
        cells.some((cell) =>
          cell.interaction?.href === `https://example.test/${example.name}` && cell.interaction.target === target
        ),
        `${example.name}/${mode} lost navigation target.`,
      );
      const markdown = `# Native interactions\n\n\`\`\`mermaid\n${example.source}\n\`\`\`\n\n` +
        Array.from({ length: 12 }, (_, index) => `After ${index}.`).join("\n\n");
      let pan = 0;
      const prepared = await prepareMermaidMarkdown(markdown, { compile: () => Promise.resolve(portable) }, {
        offset: () => pan,
      });
      const activated: MarkdownInteraction[] = [],
        hovered: (MarkdownInteraction | undefined)[] = [],
        legacy: string[] = [];
      const surface = new MarkdownSurface({
        source: markdown,
        render: prepared.render,
        onActivate: (value) => activated.push(value),
        onHover: (value) => hovered.push(value),
        onLink: (href) => legacy.push(href),
      });
      try {
        await surface.ready;
        for (const [width, offset] of [[240, 0], [120, 2], [72, 4], [240, 0]] as const) {
          pan = width === 72 ? Math.floor(frame.columns / 2) : 0;
          surface.component.controller.invalidate();
          surface.component.controller.scrollTo(offset, width, 8);
          const actual = surface.render(width, 8).map(stripStyles);
          const expected = surface.component.controller.visible(width, 8).map((line) => padNativeRow(line.text, width));
          while (expected.length < 8) expected.push(" ".repeat(width));
          require(
            JSON.stringify(actual) === JSON.stringify(expected),
            `${example.name}/${mode} interaction rows changed on scroll/pan/reflow.`,
          );
          snapshots++;
        }
        const lines = surface.component.controller.render(240);
        let found: { column: number; row: number } | undefined;
        for (const [row, line] of lines.entries()) {
          let column = 0;
          for (const span of line.segments) {
            if (span.interaction?.id === example.action && span.interaction.callbacks?.length) {
              found = { column, row };
              break;
            }
            column += textWidth(span.text);
          }
          if (found) break;
        }
        require(found, `${example.name}/${mode} has no native action hit.`);
        const offset = surface.component.controller.scrollTo(Math.max(0, found!.row - 2), 240, 8);
        surface.render(240, 8);
        const row = found!.row - offset;
        surface.hover(found!.column, row);
        surface.press(found!.column, row);
        require(
          activated.length === 1 && activated[0]!.callbacks?.[0]?.name === "host.run",
          `${example.name}/${mode} did not dispatch one host hook.`,
        );
        require(hovered.at(-1)?.id === example.action, `${example.name}/${mode} hover missed its native target.`);
        require(legacy.length === 0, "Rich activation also invoked legacy navigation.");
        if (example.title) {
          require(
            surface.render(240, 8).map(stripStyles).join("\n").includes(example.title),
            "Hover did not paint native tooltip chrome.",
          );
          tooltipSnapshots++;
        }
        surface.hover(-1, -1);
        require(hovered.at(-1) === undefined, "Pointer leave retained tooltip metadata.");
        activations++;
        verifyNativeKeyboard(
          surface,
          surface.component.controller.interactionTargets(240),
          example.action,
          example.title,
        );
        require(
          activated.length === 2 && activated[1]!.id === example.action,
          "Keyboard activation changed semantic node data.",
        );
        keyboardActivations++;
        if (example.title) tooltipSnapshots++;
        activated.splice(1);
        mounted++;
      } finally {
        surface.dispose();
      }
      const flex = new FlexMarkdownSurface({
        sections: [{
          id: "chapter",
          label: "",
          rows: [{ panels: [{ id: "diagram", source: markdown, href: "product:fallback" }] }],
        }],
        showFirstSectionHeader: false,
        render: prepared.render,
        onActivate: (value) => activated.push(value),
      });
      try {
        await flex.ready;
        flex.render(240, 8);
        const layout = flex.controller.layout(240);
        const box = layout.panels[0]!;
        const model = flex.controller.panelController("diagram")!;
        let found: { column: number; row: number } | undefined;
        for (const [row, line] of model.render(box.contentRect.width).entries()) {
          let column = 0;
          for (const span of line.segments) {
            if (span.interaction?.id === example.action && span.interaction.callbacks?.length) {
              found = { column: column + box.contentRect.column, row: row + box.contentRect.row };
              break;
            }
            column += textWidth(span.text);
          }
          if (found) break;
        }
        require(found, "Flex layout lost its semantic action.");
        const offset = flex.controller.scrollTo(Math.max(0, found!.row - 2), 240, 8);
        flex.render(240, 8);
        flex.press(found!.column, found!.row - offset);
        require(
          activated.length === 2 && activated[1]!.id === example.action,
          "A diagram callback was replaced by the whole-card link.",
        );
        activations++;
        verifyNativeKeyboard(flex, flex.controller.interactionTargets(240), example.action, example.title);
        require(
          activated.length === 3 && activated[2]!.id === example.action,
          "Flex keyboard used the whole-card link instead of its callback.",
        );
        keyboardActivations++;
        if (example.title) tooltipSnapshots++;
        mounted++;
      } finally {
        flex.dispose();
      }
    }
  }
  const hostile = await renderer.compile(
    '---\nconfig:\n  securityLevel: loose\n---\nflowchart LR\nA\nclick A host.run "Tooltip"',
    { config: { securityLevel: "loose" } },
  );
  compiles++;
  require(
    !renderMermaidNativeFrame(hostile.scene!).cells.flat().some((cell) => cell.interaction?.callbacks?.length),
    "Front matter bypassed strict host policy.",
  );
  for (const example of examples) {
    const unsafe = await renderer.compile(
      example.source.replace(`https://example.test/${example.name}`, "javascript:host.run()"),
      { trusted: true, config: { securityLevel: "loose" } },
    );
    compiles++;
    require(
      !renderMermaidNativeFrame(unsafe.scene!).cells.flat().some((cell) =>
        cell.href?.toLowerCase().startsWith("javascript:")
      ),
      "Trusted mode forwarded an executable link.",
    );
  }
  let bounded = false;
  try {
    await renderer.compile(`flowchart LR\nA\nclick A ${"x".repeat(4097)}`, {
      trusted: true,
      config: { securityLevel: "loose", suppressErrorRendering: true },
    });
  } catch (error) {
    // Private-page exceptions cross Playwright as Error objects, not the
    // browser's RangeError prototype. Require the actual bounded failure.
    bounded = error instanceof Error && error.message.includes("Mermaid interaction exceeds its metadata budget.");
  }
  compiles++;
  require(bounded, "The real parser/render callback path evaded its metadata bound.");
  let rejected = false;
  try {
    await renderer.compile("flowchart LR\nA -->", { trusted: true, config: { securityLevel: "loose" } });
  } catch {
    rejected = true;
  }
  compiles++;
  require(rejected, "Invalid upstream grammar was accepted.");
  const recovered = await renderer.compile(examples[0]!.source, { trusted: true, config: { securityLevel: "loose" } });
  compiles++;
  require(
    recovered.scene?.items.some((item) => item.interaction?.callbacks?.length),
    "A failed request poisoned callback capture.",
  );
  return {
    compiles,
    mounted,
    snapshots,
    activations,
    keyboardActivations,
    tooltipSnapshots,
    strict: true,
    recovery: true,
    retained,
  };
}

/** Run only after the caller has disposed its browser/headless compiler; no runtime/binder is available here. */
export async function verifyMermaidInteractionTransport(
  diagrams: readonly MermaidStandardDiagram[],
): Promise<{ diagrams: number; activations: number; keyboardActivations: number }> {
  let activations = 0;
  let keyboardActivations = 0;
  for (const diagram of diagrams) {
    const source = `\`\`\`mermaid\n${diagram.source}\n\`\`\``;
    const prepared = await prepareMermaidMarkdown(source, { compile: () => Promise.resolve(diagram) });
    const surface = new MarkdownSurface({
      source,
      render: prepared.render,
      onActivate: (value) => {
        if (value.callbacks?.length) activations++;
      },
    });
    try {
      await surface.ready;
      const width = 240;
      const lines = surface.component.controller.render(width);
      let done = false;
      for (const [row, line] of lines.entries()) {
        let column = 0;
        for (const span of line.segments) {
          if (span.interaction?.callbacks?.length) {
            const offset = surface.component.controller.scrollTo(row, width, 8);
            surface.render(width, 8);
            surface.press(column, row - offset);
            done = true;
            break;
          }
          column += textWidth(span.text);
        }
        if (done) break;
      }
      if (!done) throw new Error("A disposed compiler's portable scene lost its action.");
      verifyNativeKeyboard(surface, surface.component.controller.interactionTargets(width), undefined);
      keyboardActivations++;
    } finally {
      surface.dispose();
    }
  }
  if (activations !== diagrams.length * 2) {
    throw new Error("Portable mouse/keyboard actions required a live DOM/binder.");
  }
  return { diagrams: diagrams.length, activations, keyboardActivations };
}

/** Independent DOM metadata/limit probes preserve source markup and install no tooltip HTML. */
export function verifyMermaidInteractionDOM(
  document: Document,
): { tooltips: boolean; limits: boolean; cleanup: boolean } {
  const container = document.createElement("div");
  container.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><a href="https://example.test" target="_blank"><g><rect width="40" height="40" fill="red"/><text x="2" y="20">Tip</text></g></a></svg>';
  document.body.append(container);
  try {
    const svg = container.querySelector("svg")!;
    const group = svg.querySelector("g")!;
    group.setAttribute("data-title", "<b>Safe &amp; plain</b><br>second line");
    const markup = container.innerHTML;
    const scene = extractMermaidScene(svg);
    if (
      !scene.items.every((item) =>
        item.interaction?.title === "Safe & plain\nsecond line" && item.interaction.target === "_blank"
      )
    ) throw new Error("Tooltip markup or target did not reach native metadata.");
    if (container.innerHTML !== markup) throw new Error("Interaction extraction changed source DOM.");
    const reject = () => {
      const before = container.innerHTML;
      let rejected = false;
      try {
        extractMermaidScene(svg);
      } catch (error) {
        rejected = error instanceof RangeError;
      }
      if (!rejected || before !== container.innerHTML) throw new Error("Interaction metadata bounds/cleanup failed.");
    };
    group.setAttribute("data-title", "x".repeat(4097));
    reject();
    group.removeAttribute("data-title");
    const declared = new Map<Element, MarkdownInteraction>();
    for (let index = 0; index < 40; index++) {
      const shape = document.createElementNS(svg.namespaceURI, "rect");
      shape.setAttribute("width", "10");
      shape.setAttribute("height", "10");
      svg.append(shape);
      declared.set(shape, {
        href: `https://example.test/${"x".repeat(3900)}`,
        callbacks: [{ name: "host.run", args: ["B"] }],
      });
    }
    let declarationRejected = false;
    try {
      extractMermaidScene(svg, { interactions: declared });
    } catch (error) {
      declarationRejected = error instanceof RangeError;
    }
    if (!declarationRejected) throw new Error("Anchor-free declaration metadata evaded the aggregate budget.");
    svg.replaceChildren(group);
    for (let index = 0; index < 40; index++) {
      const node = group.cloneNode(true) as Element;
      node.setAttribute("data-title", "x".repeat(4000));
      svg.append(node);
    }
    reject();
    svg.innerHTML = '<defs><g id="tooltip-instance" data-title=""><rect width="10" height="10"/></g></defs>';
    svg.querySelector("g")!.setAttribute("data-title", "x".repeat(4000));
    for (let index = 0; index < 40; index++) {
      const instance = document.createElementNS(svg.namespaceURI, "use");
      instance.setAttribute("href", "#tooltip-instance");
      svg.append(instance);
    }
    reject();
    svg.replaceChildren();
    let parent: Element = svg;
    for (let index = 0; index < 128; index++) {
      const next = document.createElementNS(svg.namespaceURI, "g");
      parent.append(next);
      parent = next;
    }
    const shape = document.createElementNS(svg.namespaceURI, "rect");
    shape.setAttribute("width", "10");
    shape.setAttribute("height", "10");
    parent.append(shape);
    reject();
    return { tooltips: true, limits: true, cleanup: true };
  } finally {
    container.remove();
  }
}
