// Copyright 2023 Im-Beast. MIT license.
import { MarkdownSurface, TITLE_HEADING_FONTS } from "../../../mod.document.ts";
import {
  MermaidFlexMarkdownSurface,
  type MermaidIconData,
  MermaidMarkdownCache,
  MermaidMarkdownController,
  type MermaidMarkdownSettings,
  type MermaidStandardRenderer,
} from "../../../mod.mermaid.ts";
import { getMultiCodePointCharacters, stripStyles, textWidth } from "../../../src/utils/strings.ts";
import { Signal } from "../../../src/signals/mod.ts";
import { MERMAID_STANDARD_FIXTURES } from "./catalogue.ts";

/** The oracle pads terminal columns, not UTF-16 code units; otherwise it silently asserts wide-label corruption. */
export function padNativeRow(text: string, width: number): string {
  const columns = textWidth(text);
  if (columns > width) throw new Error(`Native row exceeds ${width} columns: ${text}`);
  return text + " ".repeat(width - columns);
}

/** Actual-engine mounted lifecycle evidence shared by private browser and Deno compiler probes. */
export async function verifyMermaidDocumentLifecycle(
  renderer: Pick<MermaidStandardRenderer, "compile" | "registerIconPacks">,
): Promise<{
  calls: number;
  snapshots: number;
  widths: readonly number[];
  themeIsolation: boolean;
  recovery: boolean;
  disposal: boolean;
  sharedCancellation: boolean;
  lastLeaseRecovery: boolean;
}> {
  let calls = 0;
  let snapshots = 0;
  const widths: number[] = [];
  const cache = new MermaidMarkdownCache({
    compile: (source, options = {}) => {
      calls++;
      widths.push(options.containerWidth!);
      return renderer.compile(source, options);
    },
  });
  const source = (label: string) =>
    `# Stack\n\nOpening text.\n\n\`\`\`mermaid\nflowchart TD\nA[${label}] --> B[Output]\n\`\`\`\n\n## Details\n\nAfter diagram.`;
  const settings = (color: string): MermaidMarkdownSettings => ({
    compile: { config: { theme: "base", themeVariables: { primaryColor: color, lineColor: color } } },
    native: { background: "rgb(10,12,20)" },
  });
  const render = { headingFonts: TITLE_HEADING_FONTS, headingArt: "title" as const, wrapHeadingArt: false };
  const first = new MermaidMarkdownController(cache, {
    source: source("First"),
    settings: settings("#ff0000"),
    render,
  });
  const second = new MermaidMarkdownController(cache, {
    source: source("First"),
    settings: settings("#ff0000"),
    render,
  });
  const left = new MarkdownSurface({ controller: first });
  const right = new MarkdownSurface({ controller: second });
  const require = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const snapshot = (surface: MarkdownSurface, width: number, height: number) => {
    const actual = surface.render(width, height).map(stripStyles);
    const expected = surface.component.controller.visible(width, height).map((row) => padNativeRow(row.text, width));
    while (expected.length < height) expected.push(" ".repeat(width));
    require(
      JSON.stringify(actual) === JSON.stringify(expected),
      `Async mounted rows differ at ${width}x${height}: ${JSON.stringify({ actual, expected })}`,
    );
    require(actual.every((row) => textWidth(row) === width), "Async rows split a native glyph.");
    snapshots++;
  };
  try {
    left.render(80, 12);
    right.render(80, 12);
    await Promise.all([left.ready, right.ready, first.settled(), second.settled()]);
    require(first.state.peek().phase === "ready" && second.state.peek().phase === "ready", "Initial engine failed.");
    require(calls === 1, "Equal windows compiled twice.");
    require(first.text(80).includes("First") && first.text(80).includes("Output"), "Native graph labels disappeared.");
    snapshot(left, 80, 12);
    snapshot(right, 80, 12);
    const original = first.render(80).flatMap((row) => row.segments).map((span) => JSON.stringify(span.style));
    first.settings.value = settings("#0000ff");
    await first.settled();
    require(calls === 2, "Theme change did not recompile.");
    const changed = first.render(80).flatMap((row) => row.segments).map((span) => JSON.stringify(span.style));
    const untouched = second.render(80).flatMap((row) => row.segments).map((span) => JSON.stringify(span.style));
    require(JSON.stringify(original) !== JSON.stringify(changed), "Upstream theme changed but native colors did not.");
    require(JSON.stringify(original) === JSON.stringify(untouched), "Theme crossed into the other window.");
    for (const [width, height, offset] of [[40, 9, 3], [80, 7, 5], [12, 5, 0], [80, 12, 0]] as const) {
      left.render(width, height);
      await first.settled();
      require(first.state.peek().phase === "ready", `Resize compilation failed: ${first.state.peek().error}`);
      first.scrollTo(offset, width, height);
      snapshot(left, width, height);
      if (width === 12) require(first.render(width)[0]!.text === "Stack", "Narrow title did not fall back to plain.");
    }
    require(widths.includes(360) && widths.includes(108), "Actual measuring width was not sent to upstream.");
    first.source.value = source("Third");
    require(!first.text(80).includes("First"), "Stale source remained visible.");
    await first.settled();
    require(first.text(80).includes("Third"), "Changed source was not rendered.");
    snapshot(left, 80, 12);
    first.source.value = "# Stack\n\n```mermaid\nsequenceDiagram\nthis is invalid\n```";
    await first.settled();
    require(first.state.peek().phase === "error", "Invalid full grammar did not report an error.");
    require(first.text(80).includes("Mermaid error:"), "Native error cells disappeared.");
    first.source.value = source("Recovered");
    await first.settled();
    require(first.state.peek().phase === "ready" && first.text(80).includes("Recovered"), "Engine did not recover.");
    snapshot(left, 80, 12);
    const before = calls;
    cache.invalidate();
    await Promise.all([first.settled(), second.settled()]);
    require(calls === before + 2, "Host invalidation did not refresh both isolated themes/documents.");
    snapshot(left, 80, 12);
    snapshot(right, 80, 12);
    require(
      cache.inspect().pending === 0 && cache.inspect().entries === 2,
      "Completed lifecycle retained pending work.",
    );
    let loaded!: () => void;
    const loading = new Promise<void>((done) => loaded = done);
    let release!: (icons: MermaidIconData) => void;
    const icons = new Promise<MermaidIconData>((done) => release = done);
    let owned!: AbortSignal;
    await renderer.registerIconPacks([{
      name: "document-live",
      loader: ({ signal }) => {
        owned = signal;
        loaded();
        return icons;
      },
    }]);
    const waitingSource =
      '# Stack\n\n```mermaid\nflowchart TD\nA@{icon: "document-live:signal", h: 96, label: "Shared"}\n```';
    const cancelled = new MermaidMarkdownController(cache, { source: waitingSource });
    const survivor = new MermaidMarkdownController(cache, { source: waitingSource });
    try {
      await Promise.race([
        loading,
        survivor.settled().then((state) => {
          throw new Error(`Shared engine settled before its loader started: ${JSON.stringify(state)}`);
        }),
      ]);
      const previousCalls = calls;
      cancelled.dispose();
      await cancelled.settled();
      await Promise.resolve();
      await Promise.resolve();
      require(!owned.aborted, "Closing one actual window aborted its shared engine loader.");
      release({
        prefix: "document-live",
        icons: { signal: { body: '<path fill="#ff0000" d="M2 2H22V22H2Z"/>', width: 24, height: 24 } },
      });
      await survivor.settled();
      require(survivor.state.peek().phase === "ready", "Shared actual compilation did not survive window closure.");
      require(survivor.text(80).includes("Shared"), "Surviving actual window lost native icon labels.");
      require(calls === previousCalls, "Shared actual window restarted the engine job.");

      let blocked!: () => void;
      const blocking = new Promise<void>((done) => blocked = done);
      let lastSignal!: AbortSignal;
      await renderer.registerIconPacks([{
        name: "document-cancel",
        loader: ({ signal }) => {
          lastSignal = signal;
          blocked();
          return new Promise(() => {});
        },
      }]);
      survivor.source.value = '# Stack\n\n```mermaid\nflowchart TD\nA@{icon: "document-cancel:signal", h: 96}\n```';
      await Promise.race([
        blocking,
        survivor.settled().then((state) => {
          throw new Error(`Cancellable engine settled before its loader started: ${JSON.stringify(state)}`);
        }),
      ]);
      survivor.source.value = source("CancelRecovered");
      await survivor.settled();
      require(lastSignal.aborted, "The last actual lease did not cancel its loader.");
      require(
        survivor.state.peek().phase === "ready" && survivor.text(80).includes("CancelRecovered"),
        "Actual host did not recover after last-lease cancellation.",
      );
    } finally {
      cancelled.dispose();
      survivor.dispose();
    }
  } finally {
    left.dispose();
    right.dispose();
    first.dispose();
    second.dispose();
    cache.dispose();
  }
  require(cache.inspect().bytes === 0 && cache.inspect().pending === 0, "Cache disposal retained data/work.");
  return {
    calls,
    snapshots,
    widths,
    themeIsolation: true,
    recovery: true,
    disposal: true,
    sharedCancellation: true,
    lastLeaseRecovery: true,
  };
}

/** All catalogue families mounted together in responsive native flex cards, not merely parsed or prepared offscreen. */
export async function verifyMermaidFlexLifecycle(
  renderer: Pick<MermaidStandardRenderer, "compile">,
): Promise<{ families: number; diagramTypes: number; calls: number; snapshots: number; measuringWidths: number[] }> {
  let calls = 0, snapshots = 0;
  const types = new Set<string>();
  const widths = new Set<number>();
  const cache = new MermaidMarkdownCache({
    compile: async (source, options = {}) => {
      calls++;
      widths.add(options.containerWidth!);
      const result = await renderer.compile(source, options);
      types.add(result.diagramType);
      return result;
    },
  }, { maxEntries: 256, maxBytes: 64 * 1024 * 1024, timeoutMs: 120_000 });
  const sources = MERMAID_STANDARD_FIXTURES.map((fixture) =>
    new Signal(
      `# ${fixture.name}\n\n\`\`\`mermaid\n${fixture.source}\n\`\`\`\n\n[Details](product:${fixture.name})`,
    )
  );
  const panels = MERMAID_STANDARD_FIXTURES.map((fixture, index) => ({
    id: fixture.name,
    kind: "card" as const,
    source: sources[index]!,
    href: `card:${fixture.name}`,
  }));
  const settings = new Signal<MermaidMarkdownSettings>({ native: { background: "rgb(10,12,20)" } });
  const surface = new MermaidFlexMarkdownSurface(cache, {
    settings,
    showFirstSectionHeader: false,
    render: { headingFonts: TITLE_HEADING_FONTS, headingArt: "title", wrapHeadingArt: false },
    sections: [{
      id: "catalogue",
      label: "All diagram families",
      rows: [
        {
          fullWidth: true,
          panels: [{ id: "cover", source: "# Tsotchke Tech Stack\n\nFull Mermaid native flex catalogue." }],
        },
        ...Array.from(
          { length: Math.ceil(panels.length / 2) },
          (_, index) => ({ panels: panels.slice(index * 2, index * 2 + 2) }),
        ),
      ],
    }],
  });
  const require = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const cells = (text: string) =>
    getMultiCodePointCharacters(text).flatMap((char) => {
      const width = textWidth(char);
      return width === 2 ? [char, ""] : width ? [char] : [];
    });
  const snapshot = (width: number, offset: number) => {
    surface.controller.scrollTo(offset, width, 13);
    const rendered = surface.render(width, 13).map(stripStyles);
    const actual = rendered.map(cells);
    const layout = surface.controller.layout(width);
    const current = surface.controller.inspect(width, 13).offset;
    require(
      actual.every((row) => row.length === width),
      `Flex cells exceed width ${width} at ${offset}: ${
        JSON.stringify(
          rendered.map((text, index) => ({ text, cells: actual[index]!.length, width: textWidth(text) })).filter((
            row,
          ) => row.cells !== width),
        )
      }`,
    );
    for (const box of layout.panels) {
      const c = box.contentRect;
      const expected = surface.controller.panelController(box.panel.id)!.render(c.width);
      require(c.height === Math.max(1, expected.length), `Stale flex height for ${box.panel.id}.`);
      for (let y = Math.max(current, c.row); y < Math.min(current + 13, c.row + c.height); y++) {
        const row = cells(expected[y - c.row]?.text ?? "");
        while (row.length < c.width) row.push(" ");
        require(
          JSON.stringify(actual[y - current]!.slice(c.column, c.column + c.width)) === JSON.stringify(row),
          `Flex ${box.panel.id}: native cells differ at ${width} columns / offset ${current} / row ${y}.`,
        );
      }
    }
    snapshots++;
  };
  try {
    for (const width of [120, 48, 160]) {
      surface.render(width, 13);
      await surface.settled(width);
      const layout = surface.controller.layout(width);
      for (const box of layout.panels.slice(1)) {
        const controller = surface.controller.panelController(box.panel.id)!;
        const state = controller.state.peek();
        require(state.phase === "ready", `Flex ${box.panel.id} failed at ${width}: ${state.error}`);
        require(state.width === box.contentRect.width, "Flex compiler used panel border rather than content width.");
        require(controller.render(state.width)[0]!.text === box.panel.id, "A later panel repeated opening title art.");
        snapshot(width, box.contentRect.row);
        snapshot(width, box.contentRect.row + Math.max(0, box.contentRect.height - 5));
      }
      surface.controller.scrollTo(0, width, 13);
      snapshot(width, 0);
      const cover = surface.controller.panelController("cover")!.render(width);
      require(
        // The owner-selected Small preset is 82 cells; Standard was 123.
        width < 82 ? cover[0]!.text === "Tsotchke Tech Stack" : cover[0]!.text !== "Tsotchke Tech Stack",
        "Width-aware opening title policy changed.",
      );
    }
    require(
      calls === MERMAID_STANDARD_FIXTURES.length * 2,
      "Painting restarted compilation or changed measuring width.",
    );
    const anchor = surface.controller.layout(160).panels[3]!;
    surface.controller.scrollTo(anchor.rect.row + 1, 160, 13);
    sources[0]!.value =
      "# flowchart\n\n```mermaid\nflowchart TD\nsubgraph Compute\nA[SourceChanged] --> B[Recovered]\nend\n```";
    await surface.settled(160);
    const moved = surface.controller.layout(160).panels.find((box) => box.panel.id === anchor.panel.id)!;
    require(
      surface.controller.offset.peek() === moved.rect.row + 1,
      "Actual asynchronous growth moved the reading anchor.",
    );
    snapshot(160, surface.controller.offset.peek());
    const graph = surface.controller.panelController(panels[0]!.id)!;
    require(graph.text(53).includes("SourceChanged"), "Live flex source did not reach upstream.");
    const original = graph.render(53).flatMap((row) => row.segments).map((span) => span.style);
    settings.value = {
      compile: { config: { theme: "base", themeVariables: { primaryColor: "#0000ff", lineColor: "#0000ff" } } },
      native: { background: "rgb(10,12,20)" },
    };
    await surface.settled(160);
    const themed = graph.render(53).flatMap((row) => row.segments).map((span) => span.style);
    require(JSON.stringify(original) !== JSON.stringify(themed), "Flex upstream theme did not change native paint.");
    for (const box of surface.controller.layout(160).panels.slice(1)) {
      require(
        surface.controller.panelController(box.panel.id)!.state.peek().phase === "ready",
        `Themed flex ${box.panel.id} failed.`,
      );
    }
    snapshot(160, surface.controller.offset.peek());
    sources[0]!.value = "# flowchart\n\n```mermaid\nsequenceDiagram\nthis is invalid\n```";
    await surface.settled(160);
    require(
      graph.state.peek().phase === "error" && graph.text(53).includes("Mermaid error:"),
      "Flex grammar error was silently downgraded.",
    );
    sources[0]!.value = "# flowchart\n\n```mermaid\nflowchart TD\nA[Recovered] --> B[Output]\n```";
    await surface.settled(160);
    require(
      graph.state.peek().phase === "ready" && graph.text(53).includes("Recovered"),
      "Flex actual host did not recover.",
    );
    snapshot(160, surface.controller.layout(160).panels[1]!.contentRect.row);
    const removed = surface.controller.panelController(panels.at(-1)!.id)!;
    surface.setSections([{
      id: "finished",
      label: "Finished",
      rows: [{ panels: [{ id: "completion", source: "# Finished" }] }],
    }]);
    await surface.settled(160);
    require(removed.state.peek().phase === "disposed", "Removed actual panel model retained its lifecycle.");
    snapshot(160, 0);
    require(cache.inspect().pending === 0, "Flex panels left pending work.");
  } finally {
    surface.dispose();
    cache.dispose();
    for (const source of sources) {
      require(
        !source.disposed && source.inspect().subscriptions === 0,
        "Flex panel disposed or retained a borrowed source.",
      );
      source.dispose();
    }
    require(!settings.disposed && settings.inspect().subscriptions === 0, "Flex document retained borrowed settings.");
    settings.dispose();
  }
  return {
    families: MERMAID_STANDARD_FIXTURES.length,
    diagramTypes: types.size,
    calls,
    snapshots,
    measuringWidths: [...widths].sort((a, b) => a - b),
  };
}
